'use client';

import { useCallback, useEffect, useState } from 'react';

const ELEVEN_HEADER = 'x-elevenlabs-secret-dentalpro';
const STORAGE_KEY = 'appointment_setter_health_scan_secret';

type PublicState = 'loading' | 'ok' | 'error';

type ScanStatus = 'up' | 'degraded' | 'down' | 'skipped';

type ScanResponse = {
  scannedAt: string;
  summary: {
    up: number;
    degraded: number;
    down: number;
    skipped: number;
    allOperational: boolean;
    allGreen: boolean;
  };
  endpoints: Array<{
    id: string;
    method: string;
    path: string;
    status: ScanStatus;
    ms: number;
    detail?: string;
  }>;
  notes: string[];
};

type DemoPublicState = 'idle' | 'loading' | 'ok' | 'error';

export function HealthStatus() {
  const [publicState, setPublicState] = useState<PublicState>('loading');
  const [publicDetail, setPublicDetail] = useState('');
  const [monitorOpen, setMonitorOpen] = useState(false);
  const [secret, setSecret] = useState('');
  const [scanLoading, setScanLoading] = useState(false);
  const [scanError, setScanError] = useState('');
  const [scan, setScan] = useState<ScanResponse | null>(null);
  const [demoState, setDemoState] = useState<DemoPublicState>('idle');
  const [demoDetail, setDemoDetail] = useState('');

  const pingPublic = useCallback(async () => {
    setPublicState('loading');
    setPublicDetail('');
    try {
      const res = await fetch('/api/health', { cache: 'no-store' });
      const data = (await res.json()) as { ok?: boolean; service?: string };
      if (res.ok && data.ok) {
        setPublicState('ok');
        setPublicDetail(data.service ?? 'ok');
      } else {
        setPublicState('error');
        setPublicDetail(String(res.status));
      }
    } catch {
      setPublicState('error');
      setPublicDetail('network');
    }
  }, []);

  useEffect(() => {
    void pingPublic();
  }, [pingPublic]);

  useEffect(() => {
    try {
      const s = sessionStorage.getItem(STORAGE_KEY);
      if (s) setSecret(s);
    } catch {
      /* ignore */
    }
  }, []);

  const runDemoRead = useCallback(async () => {
    setDemoState('loading');
    setDemoDetail('');
    try {
      const res = await fetch('/api/escalation-webhook-demo', { cache: 'no-store' });
      const data = (await res.json()) as { ok?: boolean; count?: number; error?: string };
      if (res.ok && data.ok) {
        setDemoState('ok');
        setDemoDetail(`${data.count ?? 0} rows`);
      } else {
        setDemoState('error');
        setDemoDetail(data.error ?? String(res.status));
      }
    } catch {
      setDemoState('error');
      setDemoDetail('network');
    }
  }, []);

  useEffect(() => {
    if (monitorOpen && demoState === 'idle') {
      void runDemoRead();
    }
  }, [monitorOpen, demoState, runDemoRead]);

  const runScan = useCallback(async () => {
    const trimmed = secret.trim();
    if (!trimmed) {
      setScanError('Paste the same secret as ElevenLabs uses (header x-elevenlabs-secret-dentalpro).');
      return;
    }
    setScanLoading(true);
    setScanError('');
    try {
      try {
        sessionStorage.setItem(STORAGE_KEY, trimmed);
      } catch {
        /* ignore */
      }
      const res = await fetch('/api/health-scan', {
        cache: 'no-store',
        headers: { [ELEVEN_HEADER]: trimmed }
      });
      const data = (await res.json()) as ScanResponse & { error?: string; reason?: string };
      if (!res.ok) {
        setScan(null);
        setScanError(data.error ?? data.reason ?? `HTTP ${res.status}`);
        return;
      }
      setScan(data);
    } catch {
      setScan(null);
      setScanError('Network error');
    } finally {
      setScanLoading(false);
    }
  }, [secret]);

  const summaryDotClass = (() => {
    if (scan) {
      if (scan.summary.allGreen) return 'ok';
      if (scan.summary.allOperational) return 'warn';
      return 'err';
    }
    return publicState === 'ok' ? 'ok' : publicState === 'error' ? 'err' : '';
  })();

  const summaryLabel = (() => {
    if (scan) {
      if (scan.summary.allGreen) return 'All active';
      if (scan.summary.allOperational) return 'Operational';
      return 'Some endpoints down';
    }
    if (publicState === 'loading') return 'Checking…';
    if (publicState === 'ok') return 'API up — open for full scan';
    return 'Health issue';
  })();

  const segments = scan?.endpoints ?? [];
  const segCount = segments.length;

  return (
    <details
      className="health-monitor"
      open={monitorOpen}
      onToggle={(e) => setMonitorOpen((e.target as HTMLDetailsElement).open)}
    >
      <summary className="health-monitor-summary">
        <span
          className={`status-dot ${summaryDotClass === 'ok' ? 'ok' : ''} ${summaryDotClass === 'err' ? 'err' : ''} ${summaryDotClass === 'warn' ? 'warn' : ''}`}
          aria-hidden
        />
        <span className="health-monitor-summary-text">
          <strong>API health</strong>
          <span className="health-monitor-summary-sub">{summaryLabel}</span>
        </span>
        {segCount > 0 && (
          <span className="health-bar health-bar--inline" aria-hidden>
            {segments.map((s) => (
              <span
                key={s.id}
                className={`health-seg health-seg--${s.status}`}
                style={{ flex: 1 }}
                title={`${s.id}: ${s.status}`}
              />
            ))}
          </span>
        )}
      </summary>

      <div className="health-monitor-body">
        <div className="status-row health-monitor-row">
          <span
            className={`status-dot ${publicState === 'ok' ? 'ok' : ''} ${publicState === 'error' ? 'err' : ''}`}
            aria-hidden
          />
          <span>
            {publicState === 'loading' && 'Checking /api/health…'}
            {publicState === 'ok' && (
              <>
                Public health <span style={{ color: 'var(--muted)' }}>({publicDetail})</span>
              </>
            )}
            {publicState === 'error' && (
              <>
                /api/health failed <span style={{ color: 'var(--muted)' }}>({publicDetail})</span>
              </>
            )}
          </span>
          <button type="button" className="refresh" onClick={() => void pingPublic()}>
            Refresh
          </button>
        </div>

        <div className="status-row health-monitor-row">
          <span
            className={`status-dot ${demoState === 'ok' ? 'ok' : ''} ${demoState === 'error' ? 'err' : ''}`}
            aria-hidden
          />
          <span>
            {demoState === 'idle' || demoState === 'loading'
              ? 'Loading demo escalations sheet (GET)…'
              : demoState === 'ok'
                ? (
                    <>
                      Escalations demo read OK <span style={{ color: 'var(--muted)' }}>({demoDetail})</span>
                    </>
                  )
                : (
                    <>
                      Escalations demo failed <span style={{ color: 'var(--muted)' }}>({demoDetail})</span>
                    </>
                  )}
          </span>
          <button type="button" className="refresh" onClick={() => void runDemoRead()} disabled={demoState === 'loading'}>
            Retry
          </button>
        </div>

        <p className="health-scan-intro">
          Protected routes: paste your tool secret, then run a read-safe scan (no call logs, bookings, or CRM writes).
        </p>
        <form
          className="health-scan-actions"
          autoComplete="off"
          onSubmit={(e) => {
            e.preventDefault();
            void runScan();
          }}
        >
          <input
            type="password"
            name="elevenlabs-tool-secret"
            className="health-scan-secret"
            placeholder="ElevenLabs secret (same as env)"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            autoComplete="new-password"
          />
          <button type="submit" className="refresh health-scan-run" disabled={scanLoading}>
            {scanLoading ? 'Scanning…' : 'Scan protected APIs'}
          </button>
        </form>
        {scanError !== '' && <p className="health-scan-error">{scanError}</p>}

        {scan && (
          <>
            <div className="health-bar" role="img" aria-label="Per-endpoint status bar">
              {scan.endpoints.map((s) => (
                <span
                  key={s.id}
                  className={`health-seg health-seg--${s.status}`}
                  style={{ flex: 1 }}
                  title={`${s.method} ${s.path} — ${s.status} (${s.ms}ms)`}
                />
              ))}
            </div>
            <p className="health-scan-meta">
              {scan.summary.up} up
              {scan.summary.degraded > 0 ? ` · ${scan.summary.degraded} degraded` : ''}
              {scan.summary.down > 0 ? ` · ${scan.summary.down} down` : ''}
              {scan.summary.skipped > 0 ? ` · ${scan.summary.skipped} skipped` : ''}
              <span style={{ color: 'var(--muted)' }}> · {new Date(scan.scannedAt).toLocaleString()}</span>
            </p>
            <ul className="health-scan-list">
              {scan.endpoints.map((s) => (
                <li key={s.id}>
                  <span className={`health-seg-label health-seg--${s.status}`}>{s.status}</span>
                  <span className="health-scan-path">
                    <span className={`method ${s.method.toLowerCase()}`}>{s.method}</span>
                    {s.path}
                  </span>
                  <span className="health-scan-ms">{s.ms}ms</span>
                  {s.detail && <span className="health-scan-detail">{s.detail}</span>}
                </li>
              ))}
            </ul>
            <ul className="health-scan-notes note">
              {scan.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </>
        )}
      </div>
    </details>
  );
}
