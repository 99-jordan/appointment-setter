/**
 * Natural-language date/time → concrete Europe/London ISO-8601 datetimes.
 * Zero external deps beyond Intl (Node 18+).
 */

const TZ = 'Europe/London';

// ── helpers ──────────────────────────────────────────────────────────────────

/** Return the current wall-clock date parts in Europe/London. */
function nowInLondon(): { year: number; month: number; day: number; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  })
    .formatToParts(new Date())
    .reduce<Record<string, string>>((acc, p) => {
      if (p.type !== 'literal') acc[p.type] = p.value;
      return acc;
    }, {});
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute)
  };
}

/** Build a Date from London wall-clock values, returning the UTC instant. */
function londonDate(y: number, m: number, d: number, h = 0, min = 0): Date {
  const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}T${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}:00`;
  const guessUtc = new Date(`${iso}Z`);
  const offsetMs = londonOffsetMs(guessUtc);
  return new Date(guessUtc.getTime() - offsetMs);
}

/** UTC offset in ms for Europe/London at a given instant. */
function londonOffsetMs(d: Date): number {
  const utcStr = d.toLocaleString('en-US', { timeZone: 'UTC' });
  const lonStr = d.toLocaleString('en-US', { timeZone: TZ });
  return new Date(lonStr).getTime() - new Date(utcStr).getTime();
}

function formatIso(d: Date): string {
  const off = londonOffsetMs(d);
  const local = new Date(d.getTime() + off);
  const yyyy = local.getUTCFullYear();
  const mm = String(local.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(local.getUTCDate()).padStart(2, '0');
  const hh = String(local.getUTCHours()).padStart(2, '0');
  const mi = String(local.getUTCMinutes()).padStart(2, '0');
  const ss = '00';
  const sign = off >= 0 ? '+' : '-';
  const absH = String(Math.floor(Math.abs(off) / 3_600_000)).padStart(2, '0');
  const absM = String(Math.floor((Math.abs(off) % 3_600_000) / 60_000)).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}${sign}${absH}:${absM}`;
}

function formatLabel(d: Date): string {
  return d.toLocaleString('en-GB', {
    timeZone: TZ,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
}

// ── month lookup ─────────────────────────────────────────────────────────────

const MONTHS: Record<string, number> = {
  january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3,
  april: 4, apr: 4, may: 5, june: 6, jun: 6,
  july: 7, jul: 7, august: 8, aug: 8, september: 9, sep: 9, sept: 9,
  october: 10, oct: 10, november: 11, nov: 11, december: 12, dec: 12
};

const WEEKDAYS: Record<string, number> = {
  sunday: 0, sun: 0, monday: 1, mon: 1, tuesday: 2, tue: 2, tues: 2,
  wednesday: 3, wed: 3, thursday: 4, thu: 4, thur: 4, thurs: 4,
  friday: 5, fri: 5, saturday: 6, sat: 6
};

// ── public types ─────────────────────────────────────────────────────────────

export type ResolvedSlot = {
  slotStart: string;
  slotEnd: string;
  startDate: Date;
  endDate: Date;
  label: string;
};

export type DateParseResult =
  | { ok: true; slot: ResolvedSlot }
  | { ok: false; reason: 'missing_date' | 'missing_time' | 'invalid_date' | 'past_date'; message: string };

// ── time parsing ─────────────────────────────────────────────────────────────

type TimeSpec = { hour: number; minute: number } | null;

function parseTimeText(raw: string): TimeSpec {
  const t = raw.trim().toLowerCase();
  if (!t) return null;

  if (t === 'morning' || t === 'am') return { hour: 9, minute: 0 };
  if (t === 'afternoon' || t === 'pm') return { hour: 14, minute: 0 };
  if (t === 'evening') return { hour: 17, minute: 0 };
  if (t === 'lunchtime' || t === 'lunch' || t === 'midday' || t === 'noon') return { hour: 12, minute: 0 };

  // "3pm", "3:30pm", "15:00", "3:30 pm", "3 pm"
  const m = t.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (m) {
    let h = Number(m[1]);
    const mi = m[2] ? Number(m[2]) : 0;
    const ampm = m[3];
    if (ampm === 'pm' && h < 12) h += 12;
    if (ampm === 'am' && h === 12) h = 0;
    if (h >= 0 && h < 24 && mi >= 0 && mi < 60) return { hour: h, minute: mi };
  }
  return null;
}

// ── date parsing ─────────────────────────────────────────────────────────────

type DateSpec = { year: number; month: number; day: number } | null;

function parseDateText(raw: string): DateSpec {
  const t = raw.trim().toLowerCase().replace(/,/g, '').replace(/\s+/g, ' ');
  if (!t) return null;

  const now = nowInLondon();

  // "today"
  if (t === 'today') return { year: now.year, month: now.month, day: now.day };

  // "tomorrow"
  if (t === 'tomorrow') {
    const d = londonDate(now.year, now.month, now.day);
    d.setTime(d.getTime() + 86_400_000);
    const parts = nowPartsFromDate(d);
    return { year: parts.year, month: parts.month, day: parts.day };
  }

  // "next tuesday", "this friday"
  const nextDayMatch = t.match(/^(?:next|this)\s+(\w+)$/);
  if (nextDayMatch) {
    const dow = WEEKDAYS[nextDayMatch[1]];
    if (dow !== undefined) {
      return nextWeekday(now, dow);
    }
  }

  // bare weekday: "tuesday", "friday"
  const bareDow = WEEKDAYS[t];
  if (bareDow !== undefined) {
    return nextWeekday(now, bareDow);
  }

  // "YYYY-MM-DD"
  const isoMatch = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return validateDate(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));
  }

  // "14 april", "14 april 2026", "april 14", "april 14 2026", "14th april"
  const dmy = t.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+(\w+)(?:\s+(\d{4}))?$/);
  if (dmy) {
    const m = MONTHS[dmy[2]];
    if (m) {
      const y = dmy[3] ? Number(dmy[3]) : resolveYear(now, m, Number(dmy[1]));
      return validateDate(y, m, Number(dmy[1]));
    }
  }
  const mdy = t.match(/^(\w+)\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s+(\d{4}))?$/);
  if (mdy) {
    const m = MONTHS[mdy[1]];
    if (m) {
      const y = mdy[3] ? Number(mdy[3]) : resolveYear(now, m, Number(mdy[2]));
      return validateDate(y, m, Number(mdy[2]));
    }
  }

  // "DD/MM/YYYY" or "DD/MM"
  const slashMatch = t.match(/^(\d{1,2})[/.](\d{1,2})(?:[/.](\d{2,4}))?$/);
  if (slashMatch) {
    const day = Number(slashMatch[1]);
    const month = Number(slashMatch[2]);
    let year = slashMatch[3] ? Number(slashMatch[3]) : resolveYear(now, month, day);
    if (year < 100) year += 2000;
    return validateDate(year, month, day);
  }

  return null;
}

function resolveYear(now: ReturnType<typeof nowInLondon>, month: number, day: number): number {
  if (month > now.month || (month === now.month && day >= now.day)) return now.year;
  return now.year + 1;
}

function nextWeekday(now: ReturnType<typeof nowInLondon>, targetDow: number): DateSpec {
  const todayDate = londonDate(now.year, now.month, now.day);
  const currentDow = Number(
    new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' })
      .format(todayDate)
      .toLowerCase() === 'sun'
      ? 0
      : undefined
  );
  // more reliable: use getDay on the london-midnight Date
  const base = londonDate(now.year, now.month, now.day, 12);
  const curDow = base.getUTCDay(); // approximate but fine for weekday calc
  let diff = targetDow - curDow;
  if (diff <= 0) diff += 7;
  const target = new Date(base.getTime() + diff * 86_400_000);
  const parts = nowPartsFromDate(target);
  return { year: parts.year, month: parts.month, day: parts.day };
}

function nowPartsFromDate(d: Date): { year: number; month: number; day: number } {
  const p = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  })
    .formatToParts(d)
    .reduce<Record<string, string>>((acc, part) => {
      if (part.type !== 'literal') acc[part.type] = part.value;
      return acc;
    }, {});
  return { year: Number(p.year), month: Number(p.month), day: Number(p.day) };
}

function validateDate(y: number, m: number, d: number): DateSpec {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return { year: y, month: m, day: d };
}

// ── main entry ───────────────────────────────────────────────────────────────

const DEFAULT_DURATION_MINUTES = 60;

export function resolveSlot(
  preferredDate: string | undefined,
  preferredTime: string | undefined,
  durationMinutes = DEFAULT_DURATION_MINUTES
): DateParseResult {
  const dateText = (preferredDate ?? '').trim();
  const timeText = (preferredTime ?? '').trim();

  if (!dateText && !timeText) {
    return { ok: false, reason: 'missing_date', message: 'A preferred date is needed to check availability.' };
  }

  // time might be embedded in date text (e.g. "tomorrow at 3pm")
  let datePart = dateText;
  let timePart = timeText;
  const atSplit = dateText.match(/^(.+?)\s+(?:at|@)\s+(.+)$/i);
  if (atSplit && !timePart) {
    datePart = atSplit[1];
    timePart = atSplit[2];
  }

  const dateSpec = parseDateText(datePart || 'today');
  if (!dateSpec) {
    return { ok: false, reason: 'invalid_date', message: `Could not understand the date "${datePart}".` };
  }

  const timeSpec = parseTimeText(timePart);
  if (!timeSpec) {
    if (!timePart) {
      return { ok: false, reason: 'missing_time', message: 'A specific time is needed to check availability. For example: "3pm" or "morning".' };
    }
    return { ok: false, reason: 'missing_time', message: `Could not understand the time "${timePart}". Try something like "3pm", "morning", or "14:30".` };
  }

  const start = londonDate(dateSpec.year, dateSpec.month, dateSpec.day, timeSpec.hour, timeSpec.minute);
  const end = new Date(start.getTime() + durationMinutes * 60_000);

  const now = new Date();
  if (start.getTime() < now.getTime() - 60_000) {
    return { ok: false, reason: 'past_date', message: 'That time has already passed. Please choose a future time.' };
  }

  return {
    ok: true,
    slot: {
      slotStart: formatIso(start),
      slotEnd: formatIso(end),
      startDate: start,
      endDate: end,
      label: formatLabel(start)
    }
  };
}

/** Parse an ISO-8601 datetime (with offset) into a Date + formatted outputs. */
export function parseIsoSlot(
  slotStart: string,
  slotEnd: string
): { ok: true; slot: ResolvedSlot } | { ok: false; message: string } {
  const s = new Date(slotStart);
  const e = new Date(slotEnd);
  if (isNaN(s.getTime()) || isNaN(e.getTime())) {
    return { ok: false, message: 'slotStart / slotEnd must be valid ISO-8601 datetimes.' };
  }
  if (e.getTime() <= s.getTime()) {
    return { ok: false, message: 'slotEnd must be after slotStart.' };
  }
  return {
    ok: true,
    slot: {
      slotStart: formatIso(s),
      slotEnd: formatIso(e),
      startDate: s,
      endDate: e,
      label: formatLabel(s)
    }
  };
}

export function formatSlotLabel(d: Date): string {
  return formatLabel(d);
}

export function formatSlotIso(d: Date): string {
  return formatIso(d);
}

export { TZ as TIMEZONE };
