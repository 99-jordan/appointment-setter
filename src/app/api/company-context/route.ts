import { NextRequest, NextResponse } from 'next/server';
import { handleCompanyContext } from '../../../api-handlers.js';
import { requireElevenSecret } from '../../../lib/elevenlabs-secret.js';
import { jsonError } from '../../../lib/route-error.js';

function companyIdFromSearchOrBody(
  req: NextRequest,
  body: Record<string, unknown> | null
): string | undefined {
  const q = req.nextUrl.searchParams.get('companyId');
  if (q !== null && q.trim() !== '') return q;
  if (!body) return undefined;
  const raw = body.companyId;
  if (typeof raw === 'string' && raw.trim() !== '') return raw;
  return undefined;
}

export async function GET(req: NextRequest) {
  const denied = requireElevenSecret(req);
  if (denied) return denied;

  try {
    return NextResponse.json(await handleCompanyContext(companyIdFromSearchOrBody(req, null)));
  } catch (error) {
    return jsonError(error, 500);
  }
}

/** ElevenLabs tools often POST JSON; same behavior as GET. */
export async function POST(req: NextRequest) {
  const denied = requireElevenSecret(req);
  if (denied) return denied;

  try {
    let body: Record<string, unknown> | null = null;
    try {
      const j = (await req.json()) as unknown;
      body = j && typeof j === 'object' && !Array.isArray(j) ? (j as Record<string, unknown>) : null;
    } catch {
      body = null;
    }
    return NextResponse.json(await handleCompanyContext(companyIdFromSearchOrBody(req, body)));
  } catch (error) {
    return jsonError(error, 500);
  }
}
