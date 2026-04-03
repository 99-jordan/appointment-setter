import { NextRequest, NextResponse } from 'next/server';
import { config } from '../config.js';
import {
  ELEVENLABS_DENTALPRO_SECRET_HEADER,
  ELEVENLABS_SECRET_HEADER_LEGACY_PLUMBING
} from '../elevenlabs-secret-header.js';
import {
  buildAuthDiagnostics,
  isAuthDebugEnabled,
  logAuthDebug
} from './auth-debug.js';

function incomingSecret(req: NextRequest): string | null {
  return (
    req.headers.get(ELEVENLABS_DENTALPRO_SECRET_HEADER) ??
    req.headers.get(ELEVENLABS_SECRET_HEADER_LEGACY_PLUMBING)
  );
}

export function requireElevenSecret(req: NextRequest): NextResponse | null {
  const secret = incomingSecret(req);
  logAuthDebug('next', secret, config.elevenSecret);

  if (!secret || secret !== config.elevenSecret) {
    const body: Record<string, unknown> = {
      error: 'Unauthorized',
      reason: 'missing_or_invalid_secret_header',
      header: ELEVENLABS_DENTALPRO_SECRET_HEADER,
      legacyHeaderAlsoAccepted: ELEVENLABS_SECRET_HEADER_LEGACY_PLUMBING
    };
    if (isAuthDebugEnabled()) {
      body.debug = buildAuthDiagnostics(secret, config.elevenSecret);
    }
    return NextResponse.json(body, { status: 401 });
  }
  return null;
}
