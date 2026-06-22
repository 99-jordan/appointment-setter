import { google } from 'googleapis';
import { config } from './config.js';
import type { SheetData } from './types.js';

const auth = new google.auth.JWT({
  email: config.googleServiceAccountEmail,
  key: config.googlePrivateKey,
  scopes: ['https://www.googleapis.com/auth/spreadsheets']
});

const sheets = google.sheets({ version: 'v4', auth });

let sheetCache: { data: SheetData; loadedAt: number } | null = null;

/**
 * Google puts the real message in response.data (e.g. duplicate sheet name). `Error.message` is often only
 * "Request failed with status code 400", which broke our duplicate-tab handling.
 */
export function googleSheetsApiErrorText(err: unknown): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const data = (err as { response?: { data?: unknown } }).response?.data;
    if (data && typeof data === 'object' && data !== null && 'error' in data) {
      const ge = (data as {
        error?: { message?: string; errors?: Array<{ message?: string; reason?: string }> };
      }).error;
      const parts: string[] = [];
      if (ge?.message) parts.push(ge.message);
      for (const item of ge?.errors ?? []) {
        if (item.message) parts.push(item.message);
        if (item.reason && item.reason !== item.message) parts.push(item.reason);
      }
      if (parts.length > 0) return parts.join(' — ');
    }
  }
  if (err instanceof Error && err.message) return err.message;
  return String(err);
}

function isLikelyExistingSheetNameError(err: unknown): boolean {
  const t = googleSheetsApiErrorText(err).toLowerCase();
  return /already exists|duplicate|same name|must be unique|sheet.*exists|another.*sheet|named.*exists/i.test(
    t
  );
}

function rowsToObjects<T>(rows: string[][]): T[] {
  if (!rows.length) return [];
  const [header, ...body] = rows;
  return body
    .filter((row) => row.some((cell) => String(cell || '').trim() !== ''))
    .map((row) => Object.fromEntries(header.map((key, i) => [key, row[i] ?? ''])) as T);
}

async function readTab(tab: string): Promise<string[][]> {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.googleSheetId,
    range: `${tab}!A:Z`
  });
  return (res.data.values ?? []) as string[][];
}

/** Missing or invalid sheet name → empty grid (spreadsheet may not have tab yet). */
async function readTabOptional(tab: string): Promise<string[][]> {
  try {
    return await readTab(tab);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/not found|unable to parse|does not exist|400|404/i.test(msg)) {
      return [];
    }
    throw err;
  }
}

async function loadSheetDataUncached(): Promise<SheetData> {
  const [company, serviceAreas, services, emergencyRules, intakeFlow, faqs, sms, serviceContext] =
    await Promise.all([
      readTab('Company'),
      readTab('ServiceAreas'),
      readTab('Services'),
      readTab('EmergencyRules'),
      readTab('IntakeFlow'),
      readTab('FAQs'),
      readTab('SMS'),
      readTabOptional('ServiceContext')
    ]);

  return {
    company: rowsToObjects(company),
    serviceAreas: rowsToObjects(serviceAreas),
    services: rowsToObjects(services),
    emergencyRules: rowsToObjects(emergencyRules),
    intakeFlow: rowsToObjects(intakeFlow),
    faqs: rowsToObjects(faqs),
    sms: rowsToObjects(sms),
    serviceContext: rowsToObjects(serviceContext)
  };
}

export async function loadSheetData(): Promise<SheetData> {
  const ttlMs = config.sheetDataCacheTtlSeconds * 1000;
  if (ttlMs <= 0) {
    return loadSheetDataUncached();
  }
  const now = Date.now();
  if (sheetCache && now - sheetCache.loadedAt < ttlMs) {
    return sheetCache.data;
  }
  const data = await loadSheetDataUncached();
  sheetCache = { data, loadedAt: now };
  return data;
}


export async function appendCallLog(row: string[]): Promise<void> {
  await sheets.spreadsheets.values.append({
    spreadsheetId: config.googleSheetId,
    range: 'CallLogs!A:N',
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [row] }
  });
}

/** Positional columns for CallLogs (matches append order in handleLogCall). */

function normalizeCallLogHeaderKey(h: string): string {
  return String(h ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

function parseCallLogHeader(row: string[]): {
  mode: 'header' | 'legacy_header' | 'none';
  indexByKey?: Map<string, number>;
} {
  const keys = row.map(normalizeCallLogHeaderKey);
  if ((keys[0] ?? '') !== 'timestamp' || !keys.includes('call_id')) {
    return { mode: 'none' };
  }

  const indexByKey = new Map<string, number>();
  keys.forEach((k, i) => {
    if (k) indexByKey.set(k, i);
  });

  return { mode: indexByKey.has('company_id') ? 'header' : 'legacy_header', indexByKey };
}

function headerRowToCallLog(
  row: string[],
  indexByKey: Map<string, number>
): import('./types.js').CallLogRow {
  const get = (key: string) => {
    const idx = indexByKey.get(key);
    if (idx === undefined) return '';
    return String(row[idx] ?? '').trim();
  };
  return {
    timestamp: get('timestamp'),
    company_id: get('company_id'),
    call_id: get('call_id'),
    intent: get('intent'),
    priority: get('priority'),
    emergency_flag: get('emergency_flag'),
    name: get('name'),
    phone: get('phone'),
    postcode: get('postcode'),
    issue_summary: get('issue_summary'),
    action_taken: get('action_taken'),
    sms_sent: get('sms_sent'),
    escalated_to: get('escalated_to'),
    status: get('status')
  };
}

function positionalRowToCallLog(row: string[]): import('./types.js').CallLogRow {
  const get = (i: number) => String(row[i] ?? '').trim();
  return {
    timestamp: get(0),
    company_id: get(1),
    call_id: get(2),
    intent: get(3),
    priority: get(4),
    emergency_flag: get(5),
    name: get(6),
    phone: get(7),
    postcode: get(8),
    issue_summary: get(9),
    action_taken: get(10),
    sms_sent: get(11),
    escalated_to: get(12),
    status: get(13)
  };
}

/** Read all rows from the active sheet CallLogs tab. */
export async function readCallLogs(): Promise<import('./types.js').CallLogRow[]> {
  const rows = await readTabOptional('CallLogs');
  if (!rows.length) return [];

  const headerParse = parseCallLogHeader(rows[0]);
  const start = headerParse.mode !== 'none' ? 1 : 0;
  const out: import('./types.js').CallLogRow[] = [];

  for (let i = start; i < rows.length; i += 1) {
    const row = rows[i];
    if (!row.some((cell) => String(cell ?? '').trim() !== '')) continue;
    if (headerParse.indexByKey) {
      out.push(headerRowToCallLog(row, headerParse.indexByKey));
    } else {
      out.push(positionalRowToCallLog(row));
    }
  }

  return out;
}

const APPOINTMENTS_TAB = 'Appointments';
const APPOINTMENTS_HEADER = [
  'timestamp',
  'companyId',
  'callId',
  'name',
  'phone',
  'email',
  'postcode',
  'serviceCategory',
  'serviceType',
  'preferredDate',
  'preferredTimeWindow',
  'notes',
  'source'
] as const;

const SERVICE_CALL_LOGS_TAB = 'ServiceCallLogs';
const SERVICE_CALL_LOGS_HEADER = [
  'timestamp',
  'companyId',
  'callId',
  'intent',
  'name',
  'phone',
  'email',
  'postcode',
  'serviceCategory',
  'serviceType',
  'preferredDate',
  'preferredTimeWindow',
  'notes',
  'actionTaken',
  'smsSent',
  'status'
] as const;

async function ensureSheetWithHeader(
  tab: string,
  header: readonly string[],
  headerRange: string
): Promise<void> {
  const { data } = await sheets.spreadsheets.get({
    spreadsheetId: config.googleSheetId,
    fields: 'sheets.properties.title'
  });
  const titles = (data.sheets ?? [])
    .map((s) => s.properties?.title)
    .filter((t): t is string => Boolean(t));
  if (!titles.includes(tab)) {
    try {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: config.googleSheetId,
        requestBody: {
          requests: [{ addSheet: { properties: { title: tab } } }]
        }
      });
    } catch (err: unknown) {
      if (!isLikelyExistingSheetNameError(err)) {
        throw err;
      }
    }
  }

  const first = await readTab(tab);
  const r0 = first[0] ?? [];
  const a1 = String(r0[0] ?? '').trim();
  if (a1 === header[0]) {
    return;
  }

  const row1AllBlank =
    first.length === 0 || r0.every((c) => String(c ?? '').trim() === '');
  const noDataRows =
    first.length <= 1 ||
    first.slice(1).every((row) => (row ?? []).every((c) => String(c ?? '').trim() === ''));

  if (row1AllBlank || noDataRows) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: config.googleSheetId,
      range: headerRange,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [[...header]] }
    });
    return;
  }

  throw new Error(
    `${tab} row 1 must have "${header[0]}" in column A, or sheet must be empty below headers.`
  );
}

export async function ensureAppointmentsSheet(): Promise<void> {
  const lastCol = String.fromCharCode('A'.charCodeAt(0) + APPOINTMENTS_HEADER.length - 1);
  await ensureSheetWithHeader(APPOINTMENTS_TAB, APPOINTMENTS_HEADER, `${APPOINTMENTS_TAB}!A1:${lastCol}1`);
}

export async function ensureServiceCallLogsSheet(): Promise<void> {
  const lastCol = String.fromCharCode('A'.charCodeAt(0) + SERVICE_CALL_LOGS_HEADER.length - 1);
  await ensureSheetWithHeader(
    SERVICE_CALL_LOGS_TAB,
    SERVICE_CALL_LOGS_HEADER,
    `${SERVICE_CALL_LOGS_TAB}!A1:${lastCol}1`
  );
}

export async function appendAppointmentRow(row: string[]): Promise<void> {
  if (row.length !== APPOINTMENTS_HEADER.length) {
    throw new Error(`Appointment row must have ${APPOINTMENTS_HEADER.length} columns`);
  }
  await ensureAppointmentsSheet();
  await sheets.spreadsheets.values.append({
    spreadsheetId: config.googleSheetId,
    range: `${APPOINTMENTS_TAB}!A:M`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [row] }
  });
}

export async function appendServiceCallLog(row: string[]): Promise<void> {
  if (row.length !== SERVICE_CALL_LOGS_HEADER.length) {
    throw new Error(`Service call log row must have ${SERVICE_CALL_LOGS_HEADER.length} columns`);
  }
  await ensureServiceCallLogsSheet();
  await sheets.spreadsheets.values.append({
    spreadsheetId: config.googleSheetId,
    range: `${SERVICE_CALL_LOGS_TAB}!A:P`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [row] }
  });
}

const ESCALATIONS_TAB = 'Escalations';
const ESCALATIONS_HEADER = [
  'receivedAt',
  'companyId',
  'callId',
  'name',
  'callerPhone',
  'postcode',
  'address',
  'issueSummary',
  'priority',
  'reason'
] as const;

export async function ensureEscalationsSheet(): Promise<void> {
  const { data } = await sheets.spreadsheets.get({
    spreadsheetId: config.googleSheetId,
    fields: 'sheets.properties.title'
  });
  const titles = (data.sheets ?? [])
    .map((s) => s.properties?.title)
    .filter((t): t is string => Boolean(t));
  if (!titles.includes(ESCALATIONS_TAB)) {
    try {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: config.googleSheetId,
        requestBody: {
          requests: [{ addSheet: { properties: { title: ESCALATIONS_TAB } } }]
        }
      });
    } catch (err: unknown) {
      if (!isLikelyExistingSheetNameError(err)) {
        throw err;
      }
    }
  }

  const first = await readTab(ESCALATIONS_TAB);
  const r0 = first[0] ?? [];
  const a1 = String(r0[0] ?? '').trim();
  if (a1 === 'receivedAt') {
    return;
  }

  const row1AllBlank =
    first.length === 0 || r0.every((c) => String(c ?? '').trim() === '');
  const noDataRows =
    first.length <= 1 ||
    first.slice(1).every((row) =>
      (row ?? []).every((c) => String(c ?? '').trim() === '')
    );

  if (row1AllBlank || noDataRows) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: config.googleSheetId,
      range: `${ESCALATIONS_TAB}!A1:J1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [[...ESCALATIONS_HEADER]] }
    });
    return;
  }

  throw new Error(
    'Escalations tab: cell A1 must be exactly "receivedAt" (header row), or the sheet must be empty / only blank rows below row 1 so we can write headers. ' +
      'If you see a Google error about a duplicate or non-unique sheet name, remove or rename extra tabs that copy "Escalations". ' +
      'Otherwise fix row 1 or clear stray data rows under a wrong header.'
  );
}

export async function appendEscalationDemoRow(row: string[]): Promise<void> {
  if (row.length !== ESCALATIONS_HEADER.length) {
    throw new Error(`Escalation row must have ${ESCALATIONS_HEADER.length} columns`);
  }
  await sheets.spreadsheets.values.append({
    spreadsheetId: config.googleSheetId,
    range: `${ESCALATIONS_TAB}!A:J`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [row] }
  });
}

export async function readEscalationsRecent(limit = 50): Promise<Record<string, string>[]> {
  const rows = await readTab(ESCALATIONS_TAB);
  if (rows.length < 2) return [];
  const objects = rowsToObjects<Record<string, string>>(rows);
  return objects.slice(-limit).reverse();
}
