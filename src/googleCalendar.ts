/**
 * Optional Google Calendar writes for service appointments.
 * Share the target calendar with the service account email (Editor) and set GOOGLE_CALENDAR_ID.
 */
import { google } from 'googleapis';
import { config } from './config.js';

const calendarAuth = new google.auth.JWT({
  email: config.googleServiceAccountEmail,
  key: config.googlePrivateKey,
  scopes: [
    'https://www.googleapis.com/auth/calendar.events',
    'https://www.googleapis.com/auth/calendar.readonly'
  ]
});

const calendar = google.calendar({ version: 'v3', auth: calendarAuth });

export type ServiceAppointmentCalendarInput = {
  callId: string;
  companyId: string;
  name: string;
  phone: string;
  email: string;
  postcode: string;
  serviceCategory: string;
  serviceType: string;
  preferredDate: string;
  preferredTimeWindow: string;
  notes: string;
  source: string;
};

export function isGoogleCalendarConfigured(): boolean {
  return Boolean(config.googleCalendarId?.trim());
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseYmd(dateStr: string): { y: number; m: number; d: number } | null {
  const m = dateStr.trim().match(DATE_RE);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) {
    return null;
  }
  return { y, m: mo, d };
}

/** Add one calendar day in UTC (for all-day exclusive end). */
function addOneDayYmd(y: number, m: number, d: number): string {
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + 1);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function normalizeWindow(w: string): string {
  return w.trim().toLowerCase().replace(/\s+/g, '_');
}

/**
 * Map voice-agent time hints to a single placeholder block in `timeZone`.
 * Empty / unknown window + valid date → all-day event.
 */
function windowToSchedule(
  preferredDate: string,
  preferredTimeWindow: string,
  timeZone: string
):
  | { allDay: true; startDate: string; endDateExclusive: string }
  | { allDay: false; start: string; end: string; timeZone: string }
  | null {
  const parsed = parseYmd(preferredDate);
  if (!parsed) return null;

  const { y, m, d } = parsed;
  const ymd = preferredDate.trim();

  const win = normalizeWindow(preferredTimeWindow);
  const useAllDay =
    !win ||
    win === 'any' ||
    win === 'flexible' ||
    win === 'tbc' ||
    win === 'all_day' ||
    win === 'allday' ||
    win === 'full_day';

  if (useAllDay) {
    return {
      allDay: true,
      startDate: ymd,
      endDateExclusive: addOneDayYmd(y, m, d)
    };
  }

  let startH = 9;
  let startM = 0;
  let endH = 10;
  let endM = 0;

  if (win === 'morning' || win === 'am') {
    startH = 9;
    startM = 0;
    endH = 12;
    endM = 0;
  } else if (win === 'afternoon' || win === 'pm') {
    startH = 13;
    startM = 0;
    endH = 17;
    endM = 0;
  } else if (win === 'evening') {
    startH = 17;
    startM = 0;
    endH = 20;
    endM = 0;
  } else {
    // Unknown token: still create an all-day anchor so something appears on the calendar
    return {
      allDay: true,
      startDate: ymd,
      endDateExclusive: addOneDayYmd(y, m, d)
    };
  }

  const pad = (n: number) => String(n).padStart(2, '0');
  const start = `${ymd}T${pad(startH)}:${pad(startM)}:00`;
  const end = `${ymd}T${pad(endH)}:${pad(endM)}:00`;

  return { allDay: false, start, end, timeZone };
}

function buildDescription(p: ServiceAppointmentCalendarInput): string {
  const lines = [
    `Call ID: ${p.callId}`,
    `Company: ${p.companyId}`,
    `Phone: ${p.phone}`,
    p.email ? `Email: ${p.email}` : null,
    p.postcode ? `Postcode: ${p.postcode}` : null,
    p.serviceCategory ? `Category: ${p.serviceCategory}` : null,
    p.serviceType ? `Type: ${p.serviceType}` : null,
    p.preferredTimeWindow ? `Preferred window: ${p.preferredTimeWindow}` : null,
    `Source: ${p.source}`,
    '',
    p.notes || '(no notes)'
  ].filter((x): x is string => x !== null);
  return lines.join('\n');
}

function buildSummary(p: ServiceAppointmentCalendarInput): string {
  const part = p.serviceType?.trim() || p.serviceCategory?.trim() || 'Appointment request';
  const who = p.name?.trim() || p.phone;
  const base = `${part} — ${who}`;
  const max = 100;
  const s = `${base} [${p.callId}]`;
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

/**
 * Creates a calendar event on `GOOGLE_CALENDAR_ID`. Returns null if calendar is not configured
 * or `preferredDate` is missing / invalid (caller should still persist the booking elsewhere).
 */
export async function createServiceAppointmentEvent(
  p: ServiceAppointmentCalendarInput
): Promise<{ eventId: string; htmlLink: string | null } | null> {
  if (!isGoogleCalendarConfigured()) {
    return null;
  }

  const dateStr = p.preferredDate?.trim();
  if (!dateStr) {
    return null;
  }

  const schedule = windowToSchedule(dateStr, p.preferredTimeWindow, config.googleCalendarTimezone);
  if (!schedule) {
    return null;
  }

  const base = {
    summary: buildSummary(p),
    description: buildDescription(p),
    extendedProperties: {
      private: {
        callId: p.callId,
        companyId: p.companyId,
        source: p.source
      }
    }
  };

  const requestBody =
    schedule.allDay
      ? {
          ...base,
          start: { date: schedule.startDate },
          end: { date: schedule.endDateExclusive }
        }
      : {
          ...base,
          start: { dateTime: schedule.start, timeZone: schedule.timeZone },
          end: { dateTime: schedule.end, timeZone: schedule.timeZone }
        };

  const res = await calendar.events.insert({
    calendarId: config.googleCalendarId!,
    requestBody,
    // Service accounts often cannot send real invites; keep 'none' unless you use domain-wide delegation.
    sendUpdates: 'none'
  });

  const id = res.data.id;
  if (!id) {
    throw new Error('Calendar API returned no event id');
  }

  return { eventId: id, htmlLink: res.data.htmlLink ?? null };
}
