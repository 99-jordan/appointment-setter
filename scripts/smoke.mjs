/**
 * Hits all API routes (expects a running server and valid .env).
 * Usage: npm run dev (Next.js, default port 3000) && npm run smoke
 */
import 'dotenv/config';

/** Keep in sync with src/elevenlabs-secret-header.ts */
const SECRET_HEADER = 'x-elevenlabs-secret-dentalpro';

const base = process.env.SMOKE_BASE_URL || `http://127.0.0.1:${process.env.PORT || 3000}`;
const secret =
  process.env.X_ELEVENLABS_SECRET_DENTALPRO ??
  process.env.X_ELEVENLABS_SECRET_PLUMBINGPRO ??
  process.env.X_ELEVENLABS_SECRET;
if (!secret) {
  console.error(
    'Missing X_ELEVENLABS_SECRET_DENTALPRO (or legacy PLUMBINGPRO / X_ELEVENLABS_SECRET) — load .env or export it'
  );
  process.exit(1);
}

const jsonHeaders = {
  [SECRET_HEADER]: secret,
  'Content-Type': 'application/json'
};

const getHeaders = { [SECRET_HEADER]: secret };

async function assertOk(res, label) {
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${label} failed: ${res.status} ${text}`);
  }
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`${label}: invalid JSON ${text.slice(0, 200)}`);
  }
}

const companyId = process.env.SMOKE_COMPANY_ID?.trim() || '';

const ccQs = companyId ? `?companyId=${encodeURIComponent(companyId)}` : '';
const ssQs = companyId
  ? `?companyId=${encodeURIComponent(companyId)}&query=${encodeURIComponent('implant')}`
  : `?query=${encodeURIComponent('implant')}`;
const intakeQs = companyId ? `?companyId=${encodeURIComponent(companyId)}` : '';

console.log(`Smoke: ${base}${companyId ? ` companyId=${companyId}` : ' (single-clinic, no companyId)'}`);

const a = await assertOk(
  await fetch(`${base}/api/company-context${ccQs}`, { headers: getHeaders }),
  'GET /api/company-context'
);
if (!a.companyName && !a.companyId) throw new Error('company-context: unexpected shape');

const b = await assertOk(
  await fetch(`${base}/api/services-search${ssQs}`, { headers: getHeaders }),
  'GET /api/services-search'
);
if (!Array.isArray(b.results)) throw new Error('services-search: missing results');

const intake = await assertOk(
  await fetch(`${base}/api/intake-flow${intakeQs}`, { headers: getHeaders }),
  'GET /api/intake-flow'
);
if (!Array.isArray(intake.steps)) throw new Error('intake-flow: missing steps');

const rulesBody = {
  issueSummary: 'Severe tooth pain and facial swelling after implant',
  postcode: ''
};
if (companyId) rulesBody.companyId = companyId;

const rules = await assertOk(
  await fetch(`${base}/api/rules-applicable`, {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify(rulesBody)
  }),
  'POST /api/rules-applicable'
);
if (rules.emergencyFlag === undefined) throw new Error('rules-applicable: missing emergencyFlag');

if (process.env.SMOKE_SKIP_SEND_SMS === '1') {
  console.warn('Skipping POST /api/send-sms (SMOKE_SKIP_SEND_SMS=1)');
} else {
  const smsPayload = {
    to: process.env.SMOKE_SMS_TO || '+15005550006',
    templateId: process.env.SMOKE_SMS_TEMPLATE_ID || 'SMS01',
    name: 'Smoke',
    issueSummary: 'Test',
    postcode: '',
    callId: 'smoke'
  };
  if (companyId) smsPayload.companyId = companyId;
  const smsRes = await fetch(`${base}/api/send-sms`, {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify(smsPayload)
  });
  const allowedSms = new Set([200, 400, 404, 503]);
  if (!allowedSms.has(smsRes.status)) {
    const t = await smsRes.text();
    throw new Error(`POST /api/send-sms unexpected ${smsRes.status} ${t}`);
  }
  if (smsRes.status !== 200) {
    console.warn(
      `POST /api/send-sms returned ${smsRes.status} (OK if Twilio/template not configured or invalid test number)`
    );
  }
}

const escPayload = {
  callId: `smoke_${Date.now()}`,
  reason: 'smoke_test',
  priority: 'P3',
  phone: '+440000000000',
  issueSummary: 'Smoke test',
  name: 'Smoke',
  address: '1 Smoke Street, Testville',
  postcode: 'TE1 1ST'
};
if (companyId) escPayload.companyId = companyId;
const escRes = await fetch(`${base}/api/escalate-human`, {
  method: 'POST',
  headers: jsonHeaders,
  body: JSON.stringify(escPayload)
});
if (escRes.status !== 200 && escRes.status !== 503) {
  const t = await escRes.text();
  throw new Error(`POST /api/escalate-human unexpected ${escRes.status} ${t}`);
}

if (process.env.SMOKE_SKIP_LOG_CALL !== '1') {
  await assertOk(
    await fetch(`${base}/api/log-call`, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify(
        Object.assign(
          {
            callId: `smoke_${Date.now()}`,
            intent: 'smoke_test',
            priority: 'P3',
            emergencyFlag: 'No',
            name: 'Smoke Test',
            phone: '+440000000000',
            postcode: '',
            issueSummary: 'Automated smoke test row',
            actionTaken: 'none',
            smsSent: '',
            escalatedTo: '',
            status: 'closed'
          },
          companyId ? { companyId } : {}
        )
      )
    }),
    'POST /api/log-call'
  );
}

console.log('Smoke OK');
