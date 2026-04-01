import { z } from 'zod';
import { getDefaultCompanyId, mergeDefaultCompanyId } from './clinic-default.js';
import { appendAppointmentRow, appendCallLog, loadSheetData } from './googleSheets.js';
import { createServiceAppointmentEvent, isGoogleCalendarConfigured } from './googleCalendar.js';
import { config } from './config.js';
import type { EmergencyCallPayload } from './crm/hubspot-types.js';
import { postEscalationWebhook } from './escalation.js';
import { runHubspotEmergencyCallSync } from './routes/crm-sync.js';
import { isTwilioConfigured, renderSmsTemplate, sendSmsViaTwilio } from './sms.js';
import {
  assertCompanyExists,
  bookAppointmentCanonicalSchema,
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
  normalizeBookAppointmentInput,
  normalizeEscalateHumanInput,
  normalizeLogCallInput,
  normalizeSendSmsInput
} from './tool-payload-normalize.js';
import { parseCanonical } from './tool-validation.js';

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
    parsed.intent ?? 'plumbing_enquiry',
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

export async function handleBookAppointment(body: unknown) {
  const data = await loadSheetData();
  const normalized = mergeDefaultCompanyId(data, normalizeBookAppointmentInput(body));
  const parsed = parseCanonical(bookAppointmentCanonicalSchema, normalized);

  const row: string[] = [
    new Date().toISOString(),
    parsed.companyId,
    parsed.callId,
    parsed.name ?? '',
    parsed.phone,
    parsed.email ?? '',
    parsed.postcode ?? '',
    parsed.serviceCategory ?? '',
    parsed.serviceType ?? '',
    parsed.preferredDate ?? '',
    parsed.preferredTimeWindow ?? '',
    parsed.notes ?? '',
    parsed.source ?? ''
  ];

  await appendAppointmentRow(row);

  type CalendarPayload =
    | { status: 'created'; eventId: string; htmlLink: string | null }
    | { status: 'skipped'; reason: string }
    | { status: 'error'; message: string };

  let calendar: CalendarPayload;

  try {
    if (!isGoogleCalendarConfigured()) {
      calendar = { status: 'skipped', reason: 'calendar_not_configured' };
    } else if (!parsed.preferredDate?.trim()) {
      calendar = { status: 'skipped', reason: 'no_preferred_date' };
    } else {
      const ev = await createServiceAppointmentEvent({
        callId: parsed.callId,
        companyId: parsed.companyId,
        name: parsed.name ?? '',
        phone: parsed.phone,
        email: parsed.email ?? '',
        postcode: parsed.postcode ?? '',
        serviceCategory: parsed.serviceCategory ?? '',
        serviceType: parsed.serviceType ?? '',
        preferredDate: parsed.preferredDate ?? '',
        preferredTimeWindow: parsed.preferredTimeWindow ?? '',
        notes: parsed.notes ?? '',
        source: parsed.source ?? ''
      });
      if (ev) {
        calendar = { status: 'created', eventId: ev.eventId, htmlLink: ev.htmlLink };
      } else {
        calendar = { status: 'skipped', reason: 'invalid_preferred_date' };
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    calendar = { status: 'error', message };
  }

  return { ok: true, callId: parsed.callId, calendar };
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
