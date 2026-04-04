/*
 * Thin typed fetch wrapper for HubSpot CRM API.
 * Centralises auth, base URL, retry logic, and error parsing.
 */

import { HubSpotApiError } from './errors.js';
import type { HubSpotErrorBody } from './types.js';

const DEFAULT_TIMEOUT_MS = 25_000;
const MAX_RETRIES = 3;

function getApiBase(): string {
  return (process.env.HUBSPOT_API_BASE ?? 'https://api.hubapi.com').replace(
    /\/+$/,
    ''
  );
}

function getAccessToken(): string {
  const token = process.env.HUBSPOT_ACCESS_TOKEN?.trim();
  if (!token) throw new Error('Missing HUBSPOT_ACCESS_TOKEN');
  return token;
}

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

function redactPath(path: string): string {
  return path.replace(/\/objects\/contacts\/\d+/g, '/objects/contacts/[id]');
}

/**
 * Authenticated JSON request to HubSpot with timeout and 429/5xx retries.
 * All HubSpot API paths are versioned inside caller modules so they can be
 * upgraded without touching the transport layer.
 */
export async function hubspotFetch<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const url = `${getApiBase()}${path}`;
  const token = getAccessToken();
  let attempt = 0;

  while (true) {
    attempt += 1;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } catch (e) {
      clearTimeout(timer);
      const msg = e instanceof Error ? e.message : String(e);
      if (attempt < MAX_RETRIES && /abort|network|fetch/i.test(msg)) {
        await sleep(300 * attempt);
        continue;
      }
      throw new Error(
        `HubSpot request failed: ${method} ${redactPath(path)} — ${msg}`
      );
    } finally {
      clearTimeout(timer);
    }

    const correlationId =
      res.headers.get('x-hubspot-correlation-id') ?? undefined;

    if (res.status === 429 || (res.status >= 500 && res.status < 600)) {
      const retryMs = parseRetryAfterMs(res) ?? 500 * attempt;
      if (attempt < MAX_RETRIES) {
        console.warn(
          `[hubspot] ${method} ${redactPath(path)} status=${res.status} retry=${attempt} correlationId=${correlationId ?? 'n/a'}`
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
      const errBody = json as HubSpotErrorBody;
      console.warn(
        `[hubspot] ${method} ${redactPath(path)} status=${res.status} correlationId=${correlationId ?? 'n/a'} category=${errBody.category ?? 'n/a'}`
      );
      throw HubSpotApiError.fromResponseBody(res.status, errBody);
    }

    return json as T;
  }
}
