/**
 * Agent tool POST bodies: normalise here first, then Zod in `logic.ts` via `parseCanonical` from `tool-validation.ts`.
 * Project standard for new POST /api/* tool routes — see README "Convention: POST tool routes".
 */
import { randomBytes } from 'crypto';
import { HttpValidationError } from './http-validation-error.js';

export function generateCallId(): string {
  return `call_${Date.now()}_${randomBytes(4).toString('hex')}`;
}

export function trimToUndef(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined;
  const s = String(v).trim();
  return s === '' ? undefined : s;
}

export function asRecord(body: unknown): Record<string, unknown> {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return {};
  return body as Record<string, unknown>;
}

export function pickStr(r: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = trimToUndef(r[k]);
    if (v !== undefined) return v;
  }
  return undefined;
}

/** Maps agent-facing messageType to sheet template_id (SMS tab). */
export const MESSAGE_TYPE_TO_TEMPLATE_ID: Record<string, string> = {
  emergency_confirmation: 'SMS01',
  callback_confirmation: 'SMS02',
  booking_link: 'SMS03',
  redirect_notice: 'SMS04'
};

/** Generic service SMS: map agent `messageType` to SMS tab `template_id`. */
export const SERVICE_MESSAGE_TYPE_TO_TEMPLATE_ID: Record<string, string> = {
  appointment_confirmation: 'SVC01',
  consultation_confirmation: 'SVC02',
  callback_confirmation: 'SVC03',
  booking_link: 'SVC04',
  follow_up: 'SVC05'
};

export function normalizeEscalateHumanInput(raw: unknown): Record<string, unknown> {
  const r = asRecord(raw);
  let callId = pickStr(r, 'callId');
  if (!callId) callId = generateCallId();

  return {
    companyId: pickStr(r, 'companyId'),
    callId,
    name: pickStr(r, 'name'),
    callerPhone: pickStr(r, 'callerPhone', 'phone'),
    postcode: pickStr(r, 'postcode'),
    address: pickStr(r, 'address'),
    issueSummary: pickStr(r, 'issueSummary'),
    priority: pickStr(r, 'priority') ?? 'P2',
    reason: pickStr(r, 'reason')
  };
}

export function normalizeSendSmsInput(raw: unknown): Record<string, unknown> {
  const r = asRecord(raw);
  let callId = pickStr(r, 'callId');
  if (!callId) callId = generateCallId();

  const to = pickStr(r, 'to', 'phone');
  const templateIdDirect = pickStr(r, 'templateId');
  const messageType = pickStr(r, 'messageType');

  let templateId = templateIdDirect;
  if (!templateId && messageType) {
    const mapped = MESSAGE_TYPE_TO_TEMPLATE_ID[messageType];
    if (!mapped) {
      throw new HttpValidationError({
        messageType: `Unknown messageType "${messageType}". Use templateId or one of: ${Object.keys(MESSAGE_TYPE_TO_TEMPLATE_ID).join(', ')}.`
      });
    }
    templateId = mapped;
  }

  return {
    companyId: pickStr(r, 'companyId'),
    callId,
    to,
    templateId,
    name: pickStr(r, 'name') ?? '',
    issueSummary: pickStr(r, 'issueSummary') ?? '',
    postcode: pickStr(r, 'postcode') ?? '',
    bookingLink: pickStr(r, 'bookingLink') ?? '',
    messageText: pickStr(r, 'messageText') ?? ''
  };
}

export function normalizeLogCallInput(raw: unknown): Record<string, unknown> {
  const r = asRecord(raw);
  let callId = pickStr(r, 'callId');
  if (!callId) callId = generateCallId();

  const ef = pickStr(r, 'emergencyFlag');
  const emergencyFlag = ef === 'Yes' ? 'Yes' : 'No';

  return {
    companyId: pickStr(r, 'companyId'),
    callId,
    intent: pickStr(r, 'intent') ?? 'dental_enquiry',
    priority: pickStr(r, 'priority') ?? 'P3',
    emergencyFlag,
    name: pickStr(r, 'name') ?? '',
    phone: pickStr(r, 'phone', 'callerPhone') ?? '',
    postcode: pickStr(r, 'postcode') ?? '',
    issueSummary: pickStr(r, 'issueSummary'),
    actionTaken: pickStr(r, 'actionTaken'),
    smsSent: pickStr(r, 'smsSent'),
    escalatedTo: pickStr(r, 'escalatedTo'),
    status: pickStr(r, 'status')
  };
}

function smsSentToString(v: unknown): string | undefined {
  if (v === true) return 'true';
  if (v === false) return 'false';
  if (v === null || v === undefined) return undefined;
  const s = String(v).trim();
  return s === '' ? undefined : s;
}

export function normalizeBookAppointmentInput(raw: unknown): Record<string, unknown> {
  const r = asRecord(raw);
  let callId = pickStr(r, 'callId');
  if (!callId) callId = generateCallId();

  const preferredDate = pickStr(r, 'preferredDate', 'appointmentDate');
  const preferredTimeWindow = pickStr(r, 'preferredTimeWindow', 'timeWindow');
  const phone = pickStr(r, 'phone', 'callerPhone');
  const serviceType = pickStr(r, 'serviceType', 'appointmentType');

  return {
    companyId: pickStr(r, 'companyId'),
    callId,
    name: pickStr(r, 'name') ?? '',
    phone,
    email: pickStr(r, 'email') ?? '',
    postcode: pickStr(r, 'postcode') ?? '',
    serviceCategory: pickStr(r, 'serviceCategory') ?? '',
    serviceType: serviceType ?? '',
    preferredDate: preferredDate ?? '',
    preferredTimeWindow: preferredTimeWindow ?? '',
    notes: pickStr(r, 'notes') ?? '',
    source: pickStr(r, 'source') ?? 'voice_agent'
  };
}

export function normalizeLogServiceCallInput(raw: unknown): Record<string, unknown> {
  const r = asRecord(raw);
  let callId = pickStr(r, 'callId');
  if (!callId) callId = generateCallId();

  const preferredDate = pickStr(r, 'preferredDate', 'appointmentDate');
  const preferredTimeWindow = pickStr(r, 'preferredTimeWindow', 'timeWindow');
  const serviceType = pickStr(r, 'serviceType', 'appointmentType');

  return {
    companyId: pickStr(r, 'companyId'),
    callId,
    intent: pickStr(r, 'intent'),
    name: pickStr(r, 'name') ?? '',
    phone: pickStr(r, 'phone', 'callerPhone') ?? '',
    email: pickStr(r, 'email') ?? '',
    postcode: pickStr(r, 'postcode') ?? '',
    serviceCategory: pickStr(r, 'serviceCategory') ?? '',
    serviceType: serviceType ?? '',
    preferredDate: preferredDate ?? '',
    preferredTimeWindow: preferredTimeWindow ?? '',
    notes: pickStr(r, 'notes'),
    actionTaken: pickStr(r, 'actionTaken'),
    smsSent: smsSentToString(r.smsSent) ?? pickStr(r, 'smsSent'),
    status: pickStr(r, 'status')
  };
}

export function normalizeSendServiceSmsInput(raw: unknown): Record<string, unknown> {
  const r = asRecord(raw);
  let callId = pickStr(r, 'callId');
  if (!callId) callId = generateCallId();

  const to = pickStr(r, 'to', 'phone');
  const templateIdDirect = pickStr(r, 'templateId');
  const messageType = pickStr(r, 'messageType');

  let templateId = templateIdDirect;
  if (!templateId && messageType) {
    const mapped = SERVICE_MESSAGE_TYPE_TO_TEMPLATE_ID[messageType];
    if (!mapped) {
      throw new HttpValidationError({
        messageType: `Unknown messageType "${messageType}". Use templateId or one of: ${Object.keys(SERVICE_MESSAGE_TYPE_TO_TEMPLATE_ID).join(', ')}.`
      });
    }
    templateId = mapped;
  }

  return {
    companyId: pickStr(r, 'companyId'),
    callId,
    to,
    templateId,
    name: pickStr(r, 'name') ?? '',
    issueSummary: pickStr(r, 'issueSummary') ?? '',
    postcode: pickStr(r, 'postcode') ?? '',
    bookingLink: pickStr(r, 'bookingLink') ?? '',
    messageText: pickStr(r, 'messageText') ?? '',
    serviceCategory: pickStr(r, 'serviceCategory') ?? '',
    serviceType: pickStr(r, 'serviceType', 'appointmentType') ?? '',
    preferredDate: pickStr(r, 'preferredDate', 'appointmentDate') ?? '',
    preferredTimeWindow: pickStr(r, 'preferredTimeWindow', 'timeWindow') ?? '',
    email: pickStr(r, 'email') ?? ''
  };
}
