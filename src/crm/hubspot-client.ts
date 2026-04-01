import type { HubSpotErrorBody } from './hubspot-types.js';

const HUBSPOT_API_BASE = 'https://api.hubapi.com';

const DEFAULT_TIMEOUT_MS = 25_000;
const MAX_RETRIES = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function parseRetryAfterMs(res: Response): number | null {
  const raw = res.headers.get('retry-after');
  if (!raw) return null;
  const sec = Number(raw);
  if (Number.isFinite(sec)) return Math.min(Math.max(0, sec) * 1000, 60_000);
  return null;
}

function redactLogPath(path: string): string {
  return path.replace(/\/objects\/contacts\/\d+/g, '/objects/contacts/[id]').replace(/\/objects\/tickets\/\d+/g, '/objects/tickets/[id]');
}

/**
 * Authenticated JSON request to HubSpot with timeout, 429/5xx retries, and redacted logs.
 */
export async function hubspotRequest<T>(
  accessToken: string,
  method: string,
  path: string,
  options?: { body?: unknown }
): Promise<T> {
  const url = `${HUBSPOT_API_BASE}${path}`;
  let attempt = 0;

  while (true) {
    attempt += 1;
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: options?.body !== undefined ? JSON.stringify(options.body) : undefined,
        signal: controller.signal
      });
    } catch (e) {
      clearTimeout(t);
      const msg = e instanceof Error ? e.message : String(e);
      if (attempt < MAX_RETRIES && /abort|network|fetch/i.test(msg)) {
        await sleep(300 * attempt);
        continue;
      }
      throw new Error(`HubSpot request failed: ${method} ${redactLogPath(path)} — ${msg}`);
    } finally {
      clearTimeout(t);
    }

    const correlationId = res.headers.get('x-hubspot-correlation-id') ?? undefined;

    if (res.status === 429 || (res.status >= 500 && res.status < 600)) {
      const retryMs = parseRetryAfterMs(res) ?? 500 * attempt;
      if (attempt < MAX_RETRIES) {
        console.warn(
          `[hubspot] ${method} ${redactLogPath(path)} status=${res.status} retry in ${retryMs}ms correlationId=${correlationId ?? 'n/a'}`
        );
        await sleep(retryMs);
        continue;
      }
    }

    const text = await res.text();
    let json: unknown;
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = { message: text.slice(0, 200) };
    }

    if (!res.ok) {
      const err = json as HubSpotErrorBody;
      const detail = err.message ?? err.errors?.[0]?.message ?? text.slice(0, 300);
      console.warn(
        `[hubspot] ${method} ${redactLogPath(path)} status=${res.status} correlationId=${correlationId ?? 'n/a'} message=${detail.slice(0, 200)}`
      );
      throw new Error(`HubSpot ${res.status}: ${detail}`);
    }

    return json as T;
  }
}
