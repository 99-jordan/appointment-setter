import { NextResponse } from 'next/server';
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
