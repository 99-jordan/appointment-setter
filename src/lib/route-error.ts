import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { HubspotNotConfiguredError } from '../crm/crm-errors.js';
import { HttpValidationError } from '../http-validation-error.js';

export function jsonError(error: unknown, defaultStatus: number) {
  if (error instanceof ZodError) {
    const fields: Record<string, string> = {};
    for (const iss of error.errors) {
      fields[iss.path.length ? iss.path.join('.') : '_root'] = iss.message;
    }
    return NextResponse.json({ error: 'Validation failed', fields }, { status: 400 });
  }
  if (error instanceof HubspotNotConfiguredError) {
    return NextResponse.json(
      { error: 'HubSpot not configured', missing: error.missing },
      { status: 503 }
    );
  }
  if (error instanceof HttpValidationError) {
    return NextResponse.json({ error: 'Validation failed', fields: error.fields }, { status: 400 });
  }
  const message = error instanceof Error ? error.message : 'Unknown error';
  const statusCode = (error as Error & { statusCode?: number }).statusCode;
  if (statusCode === 503) {
    return NextResponse.json({ error: message }, { status: 503 });
  }
  if (message.startsWith('SMS template not found')) {
    return NextResponse.json({ error: message }, { status: 404 });
  }
  return NextResponse.json({ error: message }, { status: defaultStatus });
}

/** Safely parse POST body as a plain object (tolerates missing/invalid JSON). */
export async function safeJsonBody(req: NextRequest): Promise<Record<string, unknown> | null> {
  try {
    const j = (await req.json()) as unknown;
    return j && typeof j === 'object' && !Array.isArray(j) ? (j as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Extract a string field from query params, falling back to body. */
export function paramFromReq(
  req: NextRequest,
  body: Record<string, unknown> | null,
  key: string
): string | undefined {
  const q = req.nextUrl.searchParams.get(key);
  if (q !== null && q.trim() !== '') return q;
  if (!body) return undefined;
  const raw = body[key];
  if (typeof raw === 'string' && raw.trim() !== '') return raw;
  return undefined;
}
