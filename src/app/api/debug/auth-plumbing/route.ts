import { NextRequest, NextResponse } from 'next/server';
import {
  ELEVENLABS_DENTALPRO_SECRET_HEADER,
  ELEVENLABS_SECRET_HEADER_LEGACY_PLUMBING
} from '../../../../elevenlabs-secret-header.js';
import {
  buildPlumbingAuthDiagnostics,
  getExpectedSecretFromEnv,
  isPlumbingAuthDebugEnabled
} from '../../../../lib/plumbing-auth-debug.js';

/**
 * Temporary diagnostics: set DEBUG_PLUMBING_AUTH=1 on Vercel, GET without auth.
 * Remove or disable after debugging. Does not expose secret values.
 */
export function GET(req: NextRequest) {
  if (!isPlumbingAuthDebugEnabled()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const incoming =
    req.headers.get(ELEVENLABS_DENTALPRO_SECRET_HEADER) ??
    req.headers.get(ELEVENLABS_SECRET_HEADER_LEGACY_PLUMBING);
  const { value: expected = '' } = getExpectedSecretFromEnv();

  return NextResponse.json(
    buildPlumbingAuthDiagnostics(incoming, expected),
    { status: 200 }
  );
}
