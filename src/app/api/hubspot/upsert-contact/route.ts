import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { requireElevenSecret } from '../../../../lib/elevenlabs-secret.js';
import { upsertContact } from '../../../../lib/hubspot/contacts.js';
import { HubSpotApiError } from '../../../../lib/hubspot/errors.js';
import { upsertContactInputSchema } from '../../../../lib/hubspot/schemas.js';
import type {
  UpsertContactErrorResponse,
  UpsertContactSuccessResponse,
} from '../../../../lib/hubspot/types.js';

/**
 * Reads at runtime via bracket notation so Next.js does not inline a stale
 * value from `next build` (common cause of "always skipped" on Vercel).
 */
function isSyncEnabled(): boolean {
  const raw = process.env['HUBSPOT_SYNC_ENABLED'];
  if (raw === undefined) return false;
  const v = raw
    .trim()
    .replace(/^['"]|['"]$/g, '')
    .trim()
    .toLowerCase();
  if (v === '') return false;
  return (
    v === '1' ||
    v === 'true' ||
    v === 'yes' ||
    v === 'on' ||
    v === 'enabled'
  );
}

function errorResponse(
  error: UpsertContactErrorResponse['error'],
  message: string,
  status: number
): NextResponse<UpsertContactErrorResponse> {
  return NextResponse.json({ ok: false as const, error, message }, { status });
}

export async function POST(req: NextRequest) {
  const denied = requireElevenSecret(req);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse('validation_error', 'Invalid JSON body', 400);
  }

  let input;
  try {
    input = upsertContactInputSchema.parse(body);
  } catch (err) {
    if (err instanceof ZodError) {
      const messages = err.errors.map(
        (e) => `${e.path.join('.') || '_root'}: ${e.message}`
      );
      return errorResponse(
        'validation_error',
        messages.join('; '),
        400
      );
    }
    return errorResponse('validation_error', 'Request validation failed', 400);
  }

  console.log(
    '[hubspot/upsert-contact] sync toggle debug: HUBSPOT_SYNC_ENABLED=%s hasAccessToken=%s',
    JSON.stringify(process.env['HUBSPOT_SYNC_ENABLED']),
    String(Boolean(process.env['HUBSPOT_ACCESS_TOKEN']?.trim()))
  );

  if (!isSyncEnabled()) {
    return NextResponse.json({
      ok: true,
      action: 'skipped',
      message: 'HubSpot sync is currently disabled',
    });
  }

  try {
    const result = await upsertContact(input);

    const response: UpsertContactSuccessResponse = {
      ok: true,
      action: result.action,
      contact: {
        id: result.contactId,
        ...(result.email ? { email: result.email } : {}),
        ...(result.phone ? { phone: result.phone } : {}),
      },
      updatedProperties: result.updatedProperties,
    };

    return NextResponse.json(response, {
      status: result.action === 'created' ? 201 : 200,
    });
  } catch (err) {
    if (err instanceof HubSpotApiError) {
      console.error('[hubspot/upsert-contact] HubSpot error:', err.toSafeLog());
      return errorResponse(
        'hubspot_error',
        'HubSpot request failed — see server logs for details',
        502
      );
    }

    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[hubspot/upsert-contact] Internal error:', message);
    return errorResponse('internal_error', 'An unexpected error occurred', 500);
  }
}
