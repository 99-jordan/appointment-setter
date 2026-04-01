import { NextRequest, NextResponse } from 'next/server';
import { runProtectedHealthScan } from '../../../health-scan-runner.js';
import { requireElevenSecret } from '../../../lib/elevenlabs-secret.js';
import { jsonError } from '../../../lib/route-error.js';

/** Same auth as tool routes; read-safe sheet probes only (see health-scan-runner). */
export async function GET(req: NextRequest) {
  const denied = requireElevenSecret(req);
  if (denied) return denied;

  try {
    return NextResponse.json(await runProtectedHealthScan());
  } catch (error) {
    return jsonError(error, 500);
  }
}
