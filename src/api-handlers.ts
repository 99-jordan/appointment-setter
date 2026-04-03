import { z } from 'zod';
import { getDefaultCompanyId, mergeDefaultCompanyId } from './clinic-default.js';
import { appendAppointmentRow, appendCallLog, loadSheetData } from './googleSheets.js';
import { config } from './config.js';
import type { EmergencyCallPayload } from './crm/hubspot-types.js';
import { postEscalationWebhook } from './escalation.js';
import { runHubspotEmergencyCallSync } from './routes/crm-sync.js';
import { isTwilioConfigured, renderSmsTemplate, sendSmsViaTwilio } from './sms.js';
import {
  assertCompanyExists,
  buildCompanyContext,
  buildIntakeFlow,
  buildRulesApplicable,
  buildServicesSearch,
  escalateHumanCanonicalSchema,
  logCallCanonicalSchema,
  resolveSmsTemplate,
  sendSmsCanonicalSchema
} from './logic.js';
import {
  generateCallId,
  normalizeEscalateHumanInput,
  normalizeLogCallInput,
  normalizeSendSmsInput
} from './tool-payload-normalize.js';
import { parseCanonical } from './tool-validation.js';
import { resolveSlot, parseIsoSlot, TIMEZONE } from './lib/date-parse.js';
import { checkAvailability, createBooking, isCalendarConfigured } from './lib/calendar-service.js';
import { HttpValidationError } from './http-validation-error.js';

const crmSyncPayloadSchema = z.object({
  companyId: z.string().optional(),
  callId: z.string().optional(),
  name: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  postcode: z.string().optional(),
  issueSummary: z.string().min(1),
  priority: z.enum(['P1', 'P2', 'P3', 'P4', 'Redirect']).optional(),
  emergencyFlag: z.enum(['Yes', 'No']).optional(),
  actionTaken: z.string().optional(),
  smsSent: z.string().optional(),
  escalatedTo: z.string().optional(),
  status: z.string().optional()
});

const crmSyncEnvelopeSchema = z.object({
  provider: z.literal('hubspot'),
  action: z.literal('emergency_call'),
  payload: crmSyncPayloadSchema
});

function trimOpt(s: string | undefined): string | undefined {
  if (s === undefined) return undefined;
  const t = s.trim();
  return t === '' ? undefined : t;
}

export async function handleCompanyContext(companyId: string | undefined) {
  const data = await loadSheetData();
  const id = companyId?.trim() || getDefaultCompanyId(data);
  return buildCompanyContext(data, id);
}

export async function handleIntakeFlow(companyId: string | undefined, askWhen: string | undefined) {
  const data = await loadSheetData();
  const id = companyId?.trim() || getDefaultCompanyId(data);
  return buildIntakeFlow(data, id, askWhen);
}

export async function handleServicesSearch(companyId: string | undefined, query: string) {
  const data = await loadSheetData();
  const id = companyId?.trim() || getDefaultCompanyId(data);
  const clinic = buildCompanyContext(data, id);
  const results = buildServicesSearch(data, id, query);
  return {
    companyId: id,
    query,
    results,
    clinicPolicies: {
      bookingLink: clinic.bookingLink,
      consultationFeeWording: clinic.consultationFeeWording,
      depositPolicyWording: clinic.depositPolicyWording,
      cancellationPolicyWording: clinic.cancellationPolicyWording,
      financeWording: clinic.financeWording,
      guaranteeAftercareWording: clinic.guaranteeAftercareWording,
      medicalEmergencyPolicyWording: clinic.medicalEmergencyPolicyWording,
      paymentMethods: clinic.paymentMethods,
      estimatePolicy: clinic.estimatePolicy,
      serviceArea: clinic.serviceArea
    }
  };
}

export async function handleRulesApplicable(body: unknown) {
  const data = await loadSheetData();
  return buildRulesApplicable(data, body);
}

export async function handleSendSms(body: unknown) {
  if (!isTwilioConfigured()) {
    const err = new Error(
      'SMS is not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER.'
    );
    (err as Error & { statusCode?: number }).statusCode = 503;
    throw err;
  }

  const data = await loadSheetData();
  const normalized = mergeDefaultCompanyId(data, normalizeSendSmsInput(body));
  const parsed = parseCanonical(sendSmsCanonicalSchema, normalized);
  const company = buildCompanyContext(data, parsed.companyId);

  const bl = parsed.bookingLink ?? '';
  const bookingLink = bl.trim() !== '' ? bl : company.bookingLink;

  const vars: Record<string, string> = {
    name: parsed.name ?? '',
    issueSummary: parsed.issueSummary ?? '',
    issue: parsed.issueSummary ?? '',
    postcode: parsed.postcode ?? '',
    callId: parsed.callId,
    companyName: company.companyName,
    bookingLink
  };

  const customText = parsed.messageText ?? '';
  let bodyText: string;
  if (customText.trim() !== '') {
    bodyText = renderSmsTemplate(customText, vars);
  } else {
    const template = resolveSmsTemplate(data, parsed.companyId, parsed.templateId);
    bodyText = renderSmsTemplate(template.template_text, vars);
  }

  const { messageSid } = await sendSmsViaTwilio(parsed.to, bodyText);

  return {
    ok: true,
    templateId: parsed.templateId,
    messageSid,
    bodyLength: bodyText.length
  };
}

export async function handleEscalateHuman(body: unknown) {
  const data = await loadSheetData();
  const normalized = mergeDefaultCompanyId(data, normalizeEscalateHumanInput(body));
  const parsed = parseCanonical(escalateHumanCanonicalSchema, normalized);
  assertCompanyExists(data, parsed.companyId);

  const hasWebhook = Boolean(config.escalationWebhookUrl);
  const transferNumber = config.escalationTransferNumber ?? '';

  if (!hasWebhook && !transferNumber) {
    const err = new Error(
      'Escalation is not configured. Set ESCALATION_WEBHOOK_URL and/or ESCALATION_TRANSFER_NUMBER.'
    );
    (err as Error & { statusCode?: number }).statusCode = 503;
    throw err;
  }

  const timestamp = new Date().toISOString();
  let webhookDelivered = false;
  let webhookStatus: number | undefined;
  let webhookResponsePreview: string | undefined;

  if (hasWebhook) {
    const result = await postEscalationWebhook({
      companyId: parsed.companyId,
      callId: parsed.callId,
      reason: parsed.reason,
      priority: parsed.priority,
      callerPhone: parsed.callerPhone,
      issueSummary: parsed.issueSummary,
      name: parsed.name,
      timestamp,
      postcode: parsed.postcode,
      address: parsed.address
    });
    webhookDelivered = result.ok;
    webhookStatus = result.status;
    webhookResponsePreview = result.responsePreview;
  }

  return {
    ok: true,
    webhookDelivered,
    webhookStatus,
    webhookResponsePreview,
    transferNumber
  };
}

export async function handleLogCall(body: unknown) {
  const data = await loadSheetData();
  const normalized = mergeDefaultCompanyId(data, normalizeLogCallInput(body));
  const parsed = parseCanonical(logCallCanonicalSchema, normalized);
  const row: string[] = [
    new Date().toISOString(),
    parsed.companyId,
    parsed.callId,
    parsed.intent ?? 'dental_enquiry',
    parsed.priority ?? 'P3',
    parsed.emergencyFlag,
    parsed.name ?? '',
    parsed.phone ?? '',
    parsed.postcode ?? '',
    parsed.issueSummary,
    parsed.actionTaken,
    parsed.smsSent ?? '',
    parsed.escalatedTo ?? '',
    parsed.status
  ];

  await appendCallLog(row);
  return { ok: true, callId: parsed.callId };
}

// ── check-availability ───────────────────────────────────────────────────────

const checkAvailabilitySchema = z.object({
  preferredDate: z.string().optional(),
  preferredTime: z.string().optional(),
  service: z.string().optional(),
  callerName: z.string().optional(),
  notes: z.string().optional(),
  companyId: z.string().optional(),
  durationMinutes: z.coerce.number().int().min(10).max(480).optional()
});

const DEFAULT_DURATION_MINUTES = 60;

export async function handleCheckAvailability(body: unknown) {
  const parsed = checkAvailabilitySchema.parse(body);
  const duration = parsed.durationMinutes ?? DEFAULT_DURATION_MINUTES;

  if (!isCalendarConfigured()) {
    throw Object.assign(
      new Error('Google Calendar is not configured. Set GOOGLE_CALENDAR_ID.'),
      { statusCode: 503 }
    );
  }

  const resolved = resolveSlot(parsed.preferredDate, parsed.preferredTime, duration);

  if (!resolved.ok) {
    return {
      ok: false,
      reason: resolved.reason,
      message: resolved.message
    };
  }

  const { slot } = resolved;
  const availability = await checkAvailability(slot.startDate, slot.endDate, duration);

  if (availability.status === 'calendar_not_configured') {
    throw Object.assign(
      new Error('Google Calendar is not configured. Set GOOGLE_CALENDAR_ID.'),
      { statusCode: 503 }
    );
  }

  return {
    ok: true,
    request: {
      preferredDate: parsed.preferredDate ?? null,
      preferredTime: parsed.preferredTime ?? null,
      service: parsed.service ?? null,
      timezone: TIMEZONE
    },
    resolved: {
      slotStart: slot.slotStart,
      slotEnd: slot.slotEnd,
      label: slot.label,
      durationMinutes: duration
    },
    availability: {
      status: availability.status
    },
    alternatives: availability.status === 'unavailable' ? availability.alternatives : []
  };
}

// ── book-appointment ─────────────────────────────────────────────────────────

const bookAppointmentSchema = z.object({
  patientName: z.string().min(1, 'patientName is required'),
  phone: z.string().min(5, 'phone is required (min 5 chars)'),
  email: z.string().optional(),
  service: z.string().optional(),
  slotStart: z.string().optional(),
  slotEnd: z.string().optional(),
  preferredDate: z.string().optional(),
  preferredTime: z.string().optional(),
  existingPatient: z.union([z.boolean(), z.string()]).optional(),
  notes: z.string().optional(),
  consentToSms: z.union([z.boolean(), z.string()]).optional(),
  companyId: z.string().optional(),
  durationMinutes: z.coerce.number().int().min(10).max(480).optional()
});

function sanitiseBoolField(v: unknown): boolean | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v === 'boolean') return v;
  const s = String(v).trim().toLowerCase();
  if (s === 'true' || s === 'yes' || s === '1') return true;
  if (s === 'false' || s === 'no' || s === '0') return false;
  return undefined;
}

export async function handleBookAppointment(body: unknown) {
  const raw = bookAppointmentSchema.parse(body);
  const duration = raw.durationMinutes ?? DEFAULT_DURATION_MINUTES;

  if (!isCalendarConfigured()) {
    throw Object.assign(
      new Error('Google Calendar is not configured. Set GOOGLE_CALENDAR_ID.'),
      { statusCode: 503 }
    );
  }

  // Resolve the slot: trust explicit slotStart/slotEnd if provided
  let slotStartDate: Date;
  let slotEndDate: Date;

  if (raw.slotStart && raw.slotEnd) {
    const parsed = parseIsoSlot(raw.slotStart, raw.slotEnd);
    if (!parsed.ok) {
      throw new HttpValidationError({ slotStart: parsed.message });
    }
    slotStartDate = parsed.slot.startDate;
    slotEndDate = parsed.slot.endDate;
  } else {
    const resolved = resolveSlot(raw.preferredDate, raw.preferredTime, duration);
    if (!resolved.ok) {
      throw new HttpValidationError({
        preferredDate: resolved.message
      });
    }
    slotStartDate = resolved.slot.startDate;
    slotEndDate = resolved.slot.endDate;
  }

  // Resolve companyId
  const data = await loadSheetData();
  const companyId = raw.companyId?.trim() || getDefaultCompanyId(data);

  const callId = generateCallId();

  // Sanitise fields that may receive garbage from LLM tool mapping
  const existingPatient = sanitiseBoolField(raw.existingPatient);
  const consentToSms = sanitiseBoolField(raw.consentToSms);

  // Book the calendar event
  const booking = await createBooking({
    slotStart: slotStartDate,
    slotEnd: slotEndDate,
    patientName: raw.patientName,
    phone: raw.phone,
    email: raw.email?.trim() || undefined,
    service: raw.service?.trim() || 'Appointment',
    notes: [
      raw.notes ?? '',
      existingPatient !== undefined ? `Existing patient: ${existingPatient ? 'yes' : 'no'}` : '',
      consentToSms !== undefined ? `SMS consent: ${consentToSms ? 'yes' : 'no'}` : ''
    ].filter(Boolean).join('\n'),
    companyId,
    callId
  });

  // Also persist to Sheets as backup
  try {
    await appendAppointmentRow([
      new Date().toISOString(),
      companyId,
      callId,
      raw.patientName,
      raw.phone,
      raw.email ?? '',
      '',
      '',
      raw.service ?? '',
      booking.slotStart,
      booking.slotEnd,
      raw.notes ?? '',
      'voice_agent'
    ]);
  } catch {
    // Sheet write is best-effort; calendar event is the source of truth
  }

  return {
    ok: true,
    callId,
    booking
  };
}

export async function handleCrmSync(body: unknown) {
  const data = await loadSheetData();
  const e = crmSyncEnvelopeSchema.parse(body);
  const p = e.payload;
  const companyId = p.companyId?.trim() || getDefaultCompanyId(data);
  let callId = trimOpt(p.callId);
  if (!callId) callId = generateCallId();

  const payload: EmergencyCallPayload = {
    companyId,
    callId,
    name: trimOpt(p.name),
    phone: trimOpt(p.phone),
    address: trimOpt(p.address),
    postcode: trimOpt(p.postcode),
    issueSummary: p.issueSummary.trim(),
    priority: p.priority,
    emergencyFlag: p.emergencyFlag,
    actionTaken: trimOpt(p.actionTaken),
    smsSent: trimOpt(p.smsSent),
    escalatedTo: trimOpt(p.escalatedTo),
    status: trimOpt(p.status)
  };

  return runHubspotEmergencyCallSync(payload);
}
