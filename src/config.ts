import dotenv from 'dotenv';

dotenv.config();

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

function optional(name: string): string | undefined {
  const value = process.env[name];
  if (value === undefined || value === '') return undefined;
  return value;
}

function requiredGooglePrivateKey(): string {
  const raw = required('GOOGLE_PRIVATE_KEY').trim();
  // dotenv strips surrounding quotes in most cases, but keep this robust for copied values
  // pasted from JSON snippets (e.g. leading quote + trailing ",).
  let cleaned = raw;
  if (cleaned.startsWith('"') || cleaned.startsWith("'")) cleaned = cleaned.slice(1);
  if (cleaned.endsWith('",') || cleaned.endsWith("',")) cleaned = cleaned.slice(0, -2);
  else if (cleaned.endsWith('"') || cleaned.endsWith("'")) cleaned = cleaned.slice(0, -1);

  const key = cleaned.replace(/\\n/g, '\n').replace(/\r/g, '');
  const looksPem =
    key.includes('-----BEGIN PRIVATE KEY-----') && key.includes('-----END PRIVATE KEY-----');
  const isPlaceholder = /\.\.\./.test(key) || /-----END\s*$/.test(key);
  if (!looksPem || isPlaceholder) {
    throw new Error(
      'Invalid GOOGLE_PRIVATE_KEY. Use the full service-account PEM private key (including BEGIN/END lines), not a placeholder.'
    );
  }
  return key;
}

/** Lazy so routes that only need Sheets / optional env (e.g. GET /api/escalation-webhook-demo) can load without it. */
function getElevenLabsSecret(): string {
  const value =
    process.env.X_ELEVENLABS_SECRET_DENTALPRO ??
    process.env.X_ELEVENLABS_SECRET_PLUMBINGPRO ??
    process.env.X_ELEVENLABS_SECRET;
  if (!value) {
    throw new Error(
      'Missing environment variable: X_ELEVENLABS_SECRET_DENTALPRO (or legacy X_ELEVENLABS_SECRET_PLUMBINGPRO / X_ELEVENLABS_SECRET)'
    );
  }
  return value;
}

export const config = {
  port: Number(process.env.PORT || 3000),
  get elevenSecret(): string {
    return getElevenLabsSecret();
  },
  googleSheetId: required('GOOGLE_SHEET_ID'),
  googleServiceAccountEmail: required('GOOGLE_SERVICE_ACCOUNT_EMAIL'),
  googlePrivateKey: requiredGooglePrivateKey(),
  twilioAccountSid: optional('TWILIO_ACCOUNT_SID'),
  twilioAuthToken: optional('TWILIO_AUTH_TOKEN'),
  twilioFromNumber: optional('TWILIO_FROM_NUMBER'),
  escalationWebhookUrl: optional('ESCALATION_WEBHOOK_URL'),
  escalationWebhookSecret: optional('ESCALATION_WEBHOOK_SECRET'),
  escalationTransferNumber: optional('ESCALATION_TRANSFER_NUMBER'),
  sheetDataCacheTtlSeconds: Math.max(0, Number(process.env.SHEET_DATA_CACHE_TTL_SECONDS || 0)),
  /** Shared calendar ID (Settings → Integrate calendar). Calendar must be shared with the service account as Editor. */
  googleCalendarId: optional('GOOGLE_CALENDAR_ID'),
  /** IANA tz for timed events from `preferredDate` + `preferredTimeWindow` (default Europe/London). */
  googleCalendarTimezone: optional('GOOGLE_CALENDAR_TIMEZONE') ?? 'Europe/London'
};
