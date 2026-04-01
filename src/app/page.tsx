import { HealthStatus } from '../components/HealthStatus';

const ENDPOINTS = [
  { method: 'GET' as const, path: '/api/health (public)' },
  { method: 'GET' as const, path: '/api/health-scan (tool secret; read-safe probes)' },
  { method: 'GET' as const, path: '/api/company-context (optional ?companyId=)' },
  { method: 'GET' as const, path: '/api/services-search?query=… (optional &companyId=)' },
  { method: 'GET' as const, path: '/api/intake-flow (optional ?companyId=&askWhen=)' },
  { method: 'POST' as const, path: '/api/rules-applicable' },
  { method: 'POST' as const, path: '/api/send-sms' },
  { method: 'POST' as const, path: '/api/escalate-human' },
  { method: 'POST' as const, path: '/api/log-call' },
  { method: 'POST' as const, path: '/api/book_appointment' },
  { method: 'POST' as const, path: '/api/escalation-webhook-demo' },
  { method: 'GET' as const, path: '/api/escalation-webhook-demo' },
  { method: 'POST' as const, path: '/api/crm-sync' }
];

const REQUIRED_ENV = [
  {
    name: 'X_ELEVENLABS_SECRET_DENTALPRO',
    note: 'Must match tool header x-elevenlabs-secret-dentalpro (legacy: X_ELEVENLABS_SECRET_PLUMBINGPRO / x-elevenlabs-secret-plumbingpro / X_ELEVENLABS_SECRET)'
  },
  { name: 'GOOGLE_SHEET_ID', note: 'Spreadsheet ID' },
  { name: 'GOOGLE_SERVICE_ACCOUNT_EMAIL', note: 'Service account client email' },
  { name: 'GOOGLE_PRIVATE_KEY', note: 'PEM private key; use \\n for newlines in Vercel' }
];

const OPTIONAL_ENV = [
  { name: 'SHEET_DATA_CACHE_TTL_SECONDS', note: 'Cache sheet reads (seconds)' },
  { name: 'TWILIO_ACCOUNT_SID', note: 'For POST /api/send-sms' },
  { name: 'TWILIO_AUTH_TOKEN', note: '' },
  { name: 'TWILIO_FROM_NUMBER', note: '' },
  {
    name: 'ESCALATION_WEBHOOK_URL',
    note: 'For POST /api/escalate-human — demo: https://plumbing-tools-api.vercel.app/api/escalation-webhook-demo'
  },
  { name: 'ESCALATION_WEBHOOK_SECRET', note: 'Optional webhook header' },
  { name: 'ESCALATION_TRANSFER_NUMBER', note: 'Optional PSTN hint' },
  { name: 'GOOGLE_CALENDAR_ID', note: 'Optional — POST /api/book_appointment writes events here' },
  { name: 'GOOGLE_CALENDAR_TIMEZONE', note: 'Optional IANA tz (default Europe/London)' },
  { name: 'HUBSPOT_ACCESS_TOKEN', note: 'Private app — POST /api/crm-sync' },
  { name: 'HUBSPOT_DEFAULT_TICKET_PIPELINE', note: 'Ticket pipeline internal ID' },
  { name: 'HUBSPOT_DEFAULT_TICKET_STAGE_OPEN', note: 'Open stage internal ID' },
  { name: 'HUBSPOT_DEFAULT_TICKET_STAGE_CLOSED', note: 'Optional closed stage ID' },
  { name: 'HUBSPOT_CREATE_TASKS', note: 'true for callback_pending tasks' },
  { name: 'HUBSPOT_CALLBACK_TASK_OWNER_ID', note: 'Optional task owner' },
  { name: 'HUBSPOT_ASSOC_*_TYPE_ID', note: 'Optional association v4 type ID overrides (see README)' }
];

/* ── Tiny SVG icons mimicking Win2K title-bar icons ── */
function AppIcon() {
  return (
    <svg
      className="win-titlebar-icon"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <rect x="1" y="1" width="14" height="14" fill="#3366cc" />
      <rect x="3" y="4" width="10" height="2" fill="#ffffff" />
      <rect x="3" y="7" width="7"  height="1" fill="#aaccff" />
      <rect x="3" y="9" width="8"  height="1" fill="#aaccff" />
      <rect x="3" y="11" width="5" height="1" fill="#aaccff" />
    </svg>
  );
}

export default function HomePage() {
  return (
    <main>
      {/* ── Main application window ── */}
      <div className="win-window" role="region" aria-label="Dental Clinic Tools API">

        {/* Title bar */}
        <div className="win-titlebar">
          <AppIcon />
          <span className="win-titlebar-title">Dental / Clinic Tools API — Microsoft Internet Explorer</span>
          <div className="win-titlebar-btns" aria-hidden="true">
            <div className="win-btn-chrome" title="Minimize">_</div>
            <div className="win-btn-chrome" title="Restore">❐</div>
            <div className="win-btn-chrome" title="Close" style={{ fontWeight: 900 }}>✕</div>
          </div>
        </div>

        {/* Window body */}
        <div className="win-window-body">

          {/* Hero / intro */}
          <header className="hero">
            <h1>Dental / clinic tools API</h1>
            <p>
              Google Sheet–backed ElevenLabs tools for a single implant / cosmetic dental clinic (single-clinic
              mode: <code>companyId</code> optional). Deploy on Vercel; secrets only in environment variables.
            </p>
          </header>

          {/* Status group box */}
          <section className="panel">
            <h2>Status</h2>
            <HealthStatus />
            <p className="note">
              <code>/api/health</code> is public. Open <strong>API health</strong> above for a segmented scan of
              protected routes (<code>GET /api/health-scan</code>) — it does not write call logs, bookings, or CRM
              data. All other <code>/api/*</code> routes require <code>x-elevenlabs-secret-dentalpro</code>.
            </p>
          </section>

          {/* Endpoints group box */}
          <section className="panel">
            <h2>Endpoints</h2>
            <ul className="endpoints">
              {ENDPOINTS.map((e) => (
                <li key={`${e.method}:${e.path}`}>
                  <span className={`method ${e.method === 'GET' ? 'get' : 'post'}`}>{e.method}</span>
                  <span>{e.path}</span>
                </li>
              ))}
            </ul>
          </section>

          {/* Env vars group box */}
          <section className="panel">
            <h2>Vercel environment variables</h2>
            <p className="note" style={{ marginTop: 0 }}>
              Add these in the Vercel project → Settings → Environment Variables. Do not commit secrets to git;
              production values live only in Vercel (and your local <code>.env</code> for dev).
            </p>
            <table className="env-table">
              <tbody>
                {REQUIRED_ENV.map((row) => (
                  <tr key={row.name}>
                    <th>
                      <code>{row.name}</code>
                    </th>
                    <td>{row.note}</td>
                  </tr>
                ))}
                {OPTIONAL_ENV.map((row) => (
                  <tr key={row.name}>
                    <th>
                      <code>{row.name}</code>{' '}
                      <span style={{ color: 'var(--win-muted)', fontWeight: 'normal' }}>(optional)</span>
                    </th>
                    <td>{row.note || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {/* ElevenLabs group box */}
          <section className="panel">
            <h2>ElevenLabs</h2>
            <p className="note" style={{ marginTop: 0 }}>
              Use your deployment URL as the tool base, e.g.{' '}
              <code>{'https://<project>.vercel.app/api/rules-applicable'}</code>. Set the same secret in Vercel
              and in the ElevenLabs tool header <code>x-elevenlabs-secret-dentalpro</code>.
            </p>
          </section>

          {/* Footer / status bar */}
          <footer>
            Sheet tabs: Company, ServiceAreas, Services, EmergencyRules, IntakeFlow, FAQs, SMS, CallLogs,
            Appointments. See <code>README.md</code> for full tool payloads and smoke tests.
          </footer>

          {/* Win2K-style status bar */}
          <div className="win-statusbar" aria-label="Status bar">
            <div className="win-statusbar-pane" style={{ flex: 1 }}>Ready</div>
            <div className="win-statusbar-pane">Local intranet</div>
          </div>

        </div>{/* end win-window-body */}
      </div>{/* end win-window */}
    </main>
  );
}
