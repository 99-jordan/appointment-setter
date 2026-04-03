/**
 * Google Calendar operations: freebusy availability check + event creation.
 * Reuses the service-account JWT from config.
 */
import { google } from 'googleapis';
import { config } from '../config.js';
import { TIMEZONE, formatSlotIso, formatSlotLabel } from './date-parse.js';

const auth = new google.auth.JWT({
  email: config.googleServiceAccountEmail,
  key: config.googlePrivateKey,
  scopes: [
    'https://www.googleapis.com/auth/calendar.events',
    'https://www.googleapis.com/auth/calendar.readonly'
  ]
});

const calendar = google.calendar({ version: 'v3', auth });

function calendarId(): string {
  return config.googleCalendarId?.trim() || 'primary';
}

// ── availability ─────────────────────────────────────────────────────────────

export type AvailabilitySlot = {
  slotStart: string;
  slotEnd: string;
  label: string;
};

export type AvailabilityResult =
  | { status: 'available' }
  | { status: 'unavailable'; alternatives: AvailabilitySlot[] }
  | { status: 'calendar_not_configured' };

export async function checkAvailability(
  start: Date,
  end: Date,
  durationMinutes: number
): Promise<AvailabilityResult> {
  const cid = calendarId();
  if (cid === 'primary' && !config.googleCalendarId?.trim()) {
    return { status: 'calendar_not_configured' };
  }

  const res = await calendar.freebusy.query({
    requestBody: {
      timeMin: start.toISOString(),
      timeMax: end.toISOString(),
      timeZone: TIMEZONE,
      items: [{ id: cid }]
    }
  });

  const busy = res.data.calendars?.[cid]?.busy ?? [];
  const isSlotFree = busy.length === 0;

  if (isSlotFree) {
    return { status: 'available' };
  }

  const alternatives = findAlternatives(start, busy, durationMinutes);
  return { status: 'unavailable', alternatives };
}

/**
 * Suggest up to 3 alternatives on the same day that don't overlap busy periods.
 * Scans 08:00–18:00 London time on the same date.
 */
function findAlternatives(
  original: Date,
  busy: Array<{ start?: string | null; end?: string | null }>,
  durationMin: number
): AvailabilitySlot[] {
  const dayStart = new Date(original);
  dayStart.setUTCHours(dayStart.getUTCHours() - (dayStart.getUTCHours() % 24));

  // Build London 08:00 and 18:00 for the same date
  const refParts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  })
    .formatToParts(original)
    .reduce<Record<string, string>>((acc, p) => {
      if (p.type !== 'literal') acc[p.type] = p.value;
      return acc;
    }, {});

  const dateStr = `${refParts.year}-${refParts.month}-${refParts.day}`;
  const scanStart = new Date(`${dateStr}T08:00:00Z`);
  const scanEnd = new Date(`${dateStr}T18:00:00Z`);

  // Adjust for London offset
  const offsetMs = londonOffsetMsForDate(original);
  scanStart.setTime(scanStart.getTime() - offsetMs);
  scanEnd.setTime(scanEnd.getTime() - offsetMs);

  const busyIntervals = busy
    .filter((b): b is { start: string; end: string } => Boolean(b.start && b.end))
    .map((b) => ({ start: new Date(b.start).getTime(), end: new Date(b.end).getTime() }))
    .sort((a, b) => a.start - b.start);

  const durationMs = durationMin * 60_000;
  const stepMs = 30 * 60_000; // 30-minute increments
  const alternatives: AvailabilitySlot[] = [];
  const now = Date.now();

  for (
    let cursor = scanStart.getTime();
    cursor + durationMs <= scanEnd.getTime() && alternatives.length < 3;
    cursor += stepMs
  ) {
    if (cursor < now) continue;
    const cEnd = cursor + durationMs;
    const overlaps = busyIntervals.some((b) => cursor < b.end && cEnd > b.start);
    // skip the original slot
    if (
      cursor === original.getTime() ||
      (cursor >= original.getTime() && cursor < original.getTime() + durationMs)
    ) {
      continue;
    }
    if (!overlaps) {
      const d = new Date(cursor);
      alternatives.push({
        slotStart: formatSlotIso(d),
        slotEnd: formatSlotIso(new Date(cEnd)),
        label: formatSlotLabel(d)
      });
    }
  }

  return alternatives;
}

function londonOffsetMsForDate(d: Date): number {
  const utcStr = d.toLocaleString('en-US', { timeZone: 'UTC' });
  const lonStr = d.toLocaleString('en-US', { timeZone: TIMEZONE });
  return new Date(lonStr).getTime() - new Date(utcStr).getTime();
}

// ── booking ──────────────────────────────────────────────────────────────────

export type BookingInput = {
  slotStart: Date;
  slotEnd: Date;
  patientName: string;
  phone: string;
  email?: string;
  service: string;
  notes?: string;
  companyId: string;
  callId: string;
  source?: string;
};

export type BookingResult = {
  status: 'confirmed';
  calendarEventId: string;
  calendarId: string;
  slotStart: string;
  slotEnd: string;
  htmlLink: string | null;
};

export async function createBooking(input: BookingInput): Promise<BookingResult> {
  const cid = calendarId();

  const summary = `${input.service || 'Appointment'} — ${input.patientName || input.phone}`;
  const descLines = [
    `Patient: ${input.patientName}`,
    `Phone: ${input.phone}`,
    input.email ? `Email: ${input.email}` : null,
    `Service: ${input.service}`,
    input.notes ? `Notes: ${input.notes}` : null,
    `Company: ${input.companyId}`,
    `Call ID: ${input.callId}`,
    `Source: ${input.source ?? 'voice_agent'}`
  ].filter(Boolean).join('\n');

  const attendees = input.email?.trim()
    ? [{ email: input.email.trim() }]
    : undefined;

  const res = await calendar.events.insert({
    calendarId: cid,
    requestBody: {
      summary: summary.slice(0, 100),
      description: descLines,
      start: { dateTime: input.slotStart.toISOString(), timeZone: TIMEZONE },
      end: { dateTime: input.slotEnd.toISOString(), timeZone: TIMEZONE },
      attendees,
      extendedProperties: {
        private: {
          callId: input.callId,
          companyId: input.companyId,
          source: input.source ?? 'voice_agent'
        }
      }
    },
    sendUpdates: 'none'
  });

  const eventId = res.data.id;
  if (!eventId) throw new Error('Calendar API returned no event id');

  return {
    status: 'confirmed',
    calendarEventId: eventId,
    calendarId: cid,
    slotStart: formatSlotIso(input.slotStart),
    slotEnd: formatSlotIso(input.slotEnd),
    htmlLink: res.data.htmlLink ?? null
  };
}

export function isCalendarConfigured(): boolean {
  return Boolean(config.googleCalendarId?.trim());
}
