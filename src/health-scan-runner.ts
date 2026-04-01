/**
 * Read-safe probes for GET /api/health-scan (no CallLogs/Appointments/CRM writes; no SMS when Twilio on).
 */
import { config } from './config.js';
import { HubspotNotConfiguredError } from './crm/crm-errors.js';
import {
  handleCompanyContext,
  handleEscalateHuman,
  handleIntakeFlow,
  handleRulesApplicable,
  handleSendSms,
  handleServicesSearch
} from './api-handlers.js';
import { isTwilioConfigured } from './sms.js';

export type ScanEndpointStatus = 'up' | 'degraded' | 'down' | 'skipped';

export type ScanEndpointResult = {
  id: string;
  method: string;
  path: string;
  status: ScanEndpointStatus;
  ms: number;
  detail?: string;
};

export type ProtectedHealthScanResponse = {
  scannedAt: string;
  summary: {
    up: number;
    degraded: number;
    down: number;
    skipped: number;
    allOperational: boolean;
    allGreen: boolean;
  };
  endpoints: ScanEndpointResult[];
  notes: string[];
};

const EXPECT_OK_503 = /SMS is not configured|Escalation is not configured/;

function classifyError(e: unknown): { status: Exclude<ScanEndpointStatus, 'skipped'>; detail: string } {
  if (e instanceof HubspotNotConfiguredError) {
    return { status: 'degraded', detail: 'HubSpot not configured' };
  }
  const sc = (e as Error & { statusCode?: number }).statusCode;
  const msg = e instanceof Error ? e.message : String(e);
  if (sc === 503) {
    return { status: 'degraded', detail: msg };
  }
  if (/SMS template not found/i.test(msg)) {
    return { status: 'degraded', detail: msg };
  }
  return { status: 'down', detail: msg };
}

async function runCheck(
  id: string,
  method: string,
  path: string,
  fn: () => Promise<unknown>
): Promise<ScanEndpointResult> {
  const t0 = Date.now();
  try {
    await fn();
    return { id, method, path, status: 'up', ms: Date.now() - t0 };
  } catch (e) {
    const c = classifyError(e);
    return { id, method, path, status: c.status, ms: Date.now() - t0, detail: c.detail };
  }
}

/** 503 for missing Twilio / escalation means the handler is healthy; dependency is off. */
async function runProbe(
  id: string,
  method: string,
  path: string,
  fn: () => Promise<unknown>
): Promise<ScanEndpointResult> {
  const t0 = Date.now();
  try {
    await fn();
    return { id, method, path, status: 'up', ms: Date.now() - t0 };
  } catch (e) {
    const sc = (e as Error & { statusCode?: number }).statusCode;
    const msg = e instanceof Error ? e.message : String(e);
    if (sc === 503 && EXPECT_OK_503.test(msg)) {
      return { id, method, path, status: 'up', ms: Date.now() - t0, detail: msg };
    }
    const c = classifyError(e);
    return { id, method, path, status: c.status, ms: Date.now() - t0, detail: c.detail };
  }
}

function skipped(
  id: string,
  method: string,
  path: string,
  detail: string
): ScanEndpointResult {
  return { id, method, path, status: 'skipped', ms: 0, detail };
}

export async function runProtectedHealthScan(): Promise<ProtectedHealthScanResponse> {
  const notes = [
    'Write routes (log-call, book_appointment, crm-sync) are not probed to avoid sheet/CRM side effects.',
    isTwilioConfigured()
      ? 'send-sms skipped while Twilio is configured (would send a real SMS).'
      : 'send-sms probed with Twilio off — 503 means the route is wired correctly.',
    Boolean(config.escalationWebhookUrl || config.escalationTransferNumber)
      ? 'escalate-human skipped while escalation URL or transfer number is set (would notify or expose transfer).'
      : 'escalate-human probed with escalation unset — 503 means the route is wired correctly.'
  ];

  const endpoints: ScanEndpointResult[] = [];

  endpoints.push(
    await runCheck('company-context', 'GET', '/api/company-context', () =>
      handleCompanyContext(undefined)
    )
  );
  endpoints.push(
    await runCheck('services-search', 'GET', '/api/services-search', () =>
      handleServicesSearch(undefined, 'implant')
    )
  );
  endpoints.push(
    await runCheck('intake-flow', 'GET', '/api/intake-flow', () => handleIntakeFlow(undefined, undefined))
  );
  endpoints.push(
    await runCheck('rules-applicable', 'POST', '/api/rules-applicable', () =>
      handleRulesApplicable({
        issueSummary: 'Sensitivity after whitening',
        postcode: ''
      })
    )
  );

  if (isTwilioConfigured()) {
    endpoints.push(
      skipped(
        'send-sms',
        'POST',
        '/api/send-sms',
        'Skipped — Twilio configured (would send SMS). Toggle off in env to probe.'
      )
    );
  } else {
    endpoints.push(
      await runProbe('send-sms', 'POST', '/api/send-sms', () =>
        handleSendSms({
          phone: '+15005550006',
          messageText: 'Health scan (Twilio off).',
          templateId: 'SMS01',
          name: '',
          issueSummary: '',
          postcode: ''
        })
      )
    );
  }

  const hasEscalation = Boolean(config.escalationWebhookUrl || config.escalationTransferNumber);
  if (hasEscalation) {
    endpoints.push(
      skipped(
        'escalate-human',
        'POST',
        '/api/escalate-human',
        'Skipped — escalation webhook or transfer number is configured.'
      )
    );
  } else {
    endpoints.push(
      await runProbe('escalate-human', 'POST', '/api/escalate-human', () =>
        handleEscalateHuman({
          name: 'Health scan',
          phone: '+440000000000',
          address: '1 Scan Street',
          issueSummary: 'Health scan probe',
          priority: 'P3',
          reason: 'automated_scan'
        })
      )
    );
  }

  const up = endpoints.filter((e) => e.status === 'up').length;
  const degraded = endpoints.filter((e) => e.status === 'degraded').length;
  const down = endpoints.filter((e) => e.status === 'down').length;
  const skippedN = endpoints.filter((e) => e.status === 'skipped').length;

  return {
    scannedAt: new Date().toISOString(),
    summary: {
      up,
      degraded,
      down,
      skipped: skippedN,
      allOperational: down === 0,
      allGreen: down === 0 && degraded === 0 && skippedN === 0
    },
    endpoints,
    notes
  };
}
