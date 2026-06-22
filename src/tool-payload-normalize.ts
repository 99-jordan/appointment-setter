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

/** UK mobiles often arrive as 7xxxxxxxxx or JSON numbers — restore leading 0 for storage/display. */
export function normalizeUkPhone(phone: unknown): string {
  if (phone === null || phone === undefined) return '';
  let s =
    typeof phone === 'number' && Number.isFinite(phone)
      ? String(Math.trunc(phone))
      : String(phone).trim();
  if (!s) return '';

  s = s.replace(/[\s()-]/g, '');
  if (s.startsWith('+44')) s = `0${s.slice(3)}`;
  else if (/^44\d{10}$/.test(s)) s = `0${s.slice(2)}`;

  if (/^7\d{9}$/.test(s)) s = `0${s}`;

  return s;
}

function pickPhone(r: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    if (!(k in r)) continue;
    const raw = r[k];
    if (raw === null || raw === undefined) continue;
    const normalized = normalizeUkPhone(raw);
    if (normalized) return normalized;
  }
  return '';
}

/** Maps agent-facing messageType to sheet template_id (SMS tab). */
export const MESSAGE_TYPE_TO_TEMPLATE_ID: Record<string, string> = {
  emergency_confirmation: 'SMS01',
  callback_confirmation: 'SMS02',
  booking_link: 'SMS03',
  redirect_notice: 'SMS04'
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

function buildLogCallIssueSummary(r: Record<string, unknown>): string | undefined {
  const direct = pickStr(r, 'issueSummary', 'conversationSummary');
  if (direct) return direct;

  const intent = pickStr(r, 'intent');
  const service = pickStr(r, 'capturedService');
  const notes = pickStr(r, 'notes');
  const parts = [intent, service, notes].filter(Boolean);
  return parts.length > 0 ? parts.join(' — ') : undefined;
}

function buildLogCallActionTaken(r: Record<string, unknown>): string | undefined {
  const direct = pickStr(r, 'actionTaken');
  if (direct) return direct;

  const parts: string[] = [];
  const service = pickStr(r, 'capturedService');
  const date = pickStr(r, 'desiredDate');
  const time = pickStr(r, 'desiredTime');
  const email = pickStr(r, 'capturedEmail');
  const existing = pickStr(r, 'existingPatient');
  const notes = pickStr(r, 'notes');

  if (service) parts.push(`Service: ${service}`);
  if (date || time) parts.push(`Preferred slot: ${[date, time].filter(Boolean).join(' ')}`);
  if (email) parts.push(`Email: ${email}`);
  if (existing) parts.push(`Existing patient: ${existing}`);
  if (notes) parts.push(`Notes: ${notes}`);

  return parts.length > 0 ? parts.join('. ') : 'Intake captured at end of call';
}

export function normalizeLogCallInput(raw: unknown): Record<string, unknown> {
  const r = asRecord(raw);
  let callId = pickStr(r, 'callId');
  if (!callId) callId = generateCallId();

  const ef = pickStr(r, 'emergencyFlag');
  const intent = pickStr(r, 'intent') ?? 'dental_enquiry';
  const emergencyFlag =
    ef === 'Yes' || /emergency/i.test(intent) || /emergency/i.test(pickStr(r, 'notes') ?? '')
      ? 'Yes'
      : 'No';

  return {
    companyId: pickStr(r, 'companyId'),
    callId,
    intent,
    priority: pickStr(r, 'priority') ?? 'P3',
    emergencyFlag,
    name: pickStr(r, 'name', 'capturedName') ?? '',
    phone: pickPhone(r, 'phone', 'callerPhone', 'capturedPhone'),
    postcode: pickStr(r, 'postcode') ?? '',
    issueSummary: buildLogCallIssueSummary(r),
    actionTaken: buildLogCallActionTaken(r),
    smsSent: pickStr(r, 'smsSent'),
    escalatedTo: pickStr(r, 'escalatedTo'),
    status: pickStr(r, 'status') ?? 'open'
  };
}


