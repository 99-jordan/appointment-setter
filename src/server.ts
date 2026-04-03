import express, { type Request, type Response } from 'express';
import cors from 'cors';
import { ZodError } from 'zod';
import { requireElevenSecret } from './auth.js';
import { config } from './config.js';
import {
  handleBookAppointment,
  handleCheckAvailability,
  handleCompanyContext,
  handleCrmSync,
  handleEscalateHuman,
  handleIntakeFlow,
  handleLogCall,
  handleRulesApplicable,
  handleSendSms,
  handleServicesSearch
} from './api-handlers.js';
import { runProtectedHealthScan } from './health-scan-runner.js';
import { HubspotNotConfiguredError } from './crm/crm-errors.js';
import { HttpValidationError } from './http-validation-error.js';
import { StructuredApiError } from './lib/api-errors.js';

const app = express();
app.use(cors());
app.use(express.json());

const rootLines = [
  'Dental / clinic tools API',
  '',
  'API Online',
  '',
  'GET|POST /api/company-context',
  'GET|POST /api/services-search',
  'GET|POST /api/intake-flow',
  'POST /api/rules-applicable',
  'POST /api/send-sms',
  'POST /api/escalate-human',
  'POST /api/log-call',
  'POST /api/check-availability',
  'POST /api/book-appointment',
  'POST /api/book_appointment (legacy)',
  'POST /api/crm-sync',
  'GET /api/health-scan',
  '',
  'All /api/* routes require the x-elevenlabs-secret-dentalpro header (legacy: x-elevenlabs-secret-plumbingpro).'
];

app.get('/', (_req, res) => {
  res.type('text/plain').send(rootLines.join('\n'));
});

app.use('/api', requireElevenSecret);

function sendApiError(res: Response, error: unknown, defaultStatus = 400): void {
  if (error instanceof StructuredApiError) {
    res.status(error.httpStatus).json({
      ...(error.details ?? {}),
      error: error.message,
      code: error.code
    });
    return;
  }
  if (error instanceof HubspotNotConfiguredError) {
    res.status(503).json({ error: 'HubSpot not configured', missing: error.missing });
    return;
  }
  if (error instanceof HttpValidationError) {
    res.status(400).json({ error: 'Validation failed', fields: error.fields });
    return;
  }
  if (error instanceof ZodError) {
    const fields: Record<string, string> = {};
    for (const iss of error.errors) {
      fields[iss.path.length ? iss.path.join('.') : '_root'] = iss.message;
    }
    res.status(400).json({ error: 'Validation failed', fields });
    return;
  }
  const message = error instanceof Error ? error.message : 'Unknown error';
  const statusCode = (error as Error & { statusCode?: number }).statusCode;
  if (statusCode === 503) {
    res.status(503).json({ error: message });
    return;
  }
  if (message.startsWith('SMS template not found')) {
    res.status(404).json({ error: message });
    return;
  }
  res.status(defaultStatus).json({ error: message });
}

app.get('/api/health-scan', async (_req, res) => {
  try {
    res.json(await runProtectedHealthScan());
  } catch (error) {
    sendApiError(res, error, 500);
  }
});

function queryCompanyId(req: Request): string | undefined {
  const q = req.query.companyId;
  if (typeof q === 'string' && q.trim() !== '') return q;
  if (Array.isArray(q) && typeof q[0] === 'string' && q[0].trim() !== '') return q[0];
  return undefined;
}

function bodyString(req: Request, key: string): string | undefined {
  const b = req.body as Record<string, unknown> | undefined;
  if (!b || !(key in b)) return undefined;
  const v = b[key];
  if (v === undefined || v === null) return undefined;
  const s = String(v).trim();
  return s === '' ? undefined : s;
}

function companyIdFromReq(req: Request): string | undefined {
  return bodyString(req, 'companyId') ?? queryCompanyId(req);
}

app.get('/api/company-context', async (req, res) => {
  try { res.json(await handleCompanyContext(queryCompanyId(req))); }
  catch (error) { sendApiError(res, error, 500); }
});

app.post('/api/company-context', async (req, res) => {
  try { res.json(await handleCompanyContext(companyIdFromReq(req))); }
  catch (error) { sendApiError(res, error, 500); }
});

app.get('/api/intake-flow', async (req, res) => {
  try {
    const askWhen = req.query.askWhen !== undefined ? String(req.query.askWhen) : undefined;
    res.json(await handleIntakeFlow(queryCompanyId(req), askWhen));
  } catch (error) { sendApiError(res, error, 500); }
});

app.post('/api/intake-flow', async (req, res) => {
  try {
    const askWhen = bodyString(req, 'askWhen') ?? (req.query.askWhen !== undefined ? String(req.query.askWhen) : undefined);
    res.json(await handleIntakeFlow(companyIdFromReq(req), askWhen));
  } catch (error) { sendApiError(res, error, 500); }
});

app.get('/api/services-search', async (req, res) => {
  try { res.json(await handleServicesSearch(queryCompanyId(req), String(req.query.query || ''))); }
  catch (error) { sendApiError(res, error, 500); }
});

app.post('/api/services-search', async (req, res) => {
  try { res.json(await handleServicesSearch(companyIdFromReq(req), bodyString(req, 'query') ?? String(req.query.query || ''))); }
  catch (error) { sendApiError(res, error, 500); }
});

app.post('/api/rules-applicable', async (req, res) => {
  try { res.json(await handleRulesApplicable(req.body)); }
  catch (error) { sendApiError(res, error); }
});

app.post('/api/send-sms', async (req, res) => {
  try { res.json(await handleSendSms(req.body)); }
  catch (error) { sendApiError(res, error); }
});

app.post('/api/escalate-human', async (req, res) => {
  try { res.json(await handleEscalateHuman(req.body)); }
  catch (error) { sendApiError(res, error); }
});

app.post('/api/log-call', async (req, res) => {
  try { res.json(await handleLogCall(req.body)); }
  catch (error) { sendApiError(res, error); }
});

app.post('/api/check-availability', async (req, res) => {
  try { res.json(await handleCheckAvailability(req.body)); }
  catch (error) { sendApiError(res, error); }
});

app.post('/api/book-appointment', async (req, res) => {
  try { res.json(await handleBookAppointment(req.body)); }
  catch (error) { sendApiError(res, error); }
});

app.post('/api/book_appointment', async (req, res) => {
  try { res.json(await handleBookAppointment(req.body)); }
  catch (error) { sendApiError(res, error); }
});

app.post('/api/crm-sync', async (req, res) => {
  try { res.json(await handleCrmSync(req.body)); }
  catch (error) { sendApiError(res, error); }
});

app.listen(config.port, () => {
  console.log(`Dental Tools API listening on port ${config.port}`);
});
