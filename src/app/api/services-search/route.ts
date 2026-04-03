import { NextRequest, NextResponse } from 'next/server';
import { handleServicesSearch } from '../../../api-handlers.js';
import { requireElevenSecret } from '../../../lib/elevenlabs-secret.js';
import { jsonError } from '../../../lib/route-error.js';

function parseSearchArgs(req: NextRequest, body: Record<string, unknown> | null) {
  const raw = req.nextUrl.searchParams.get('companyId');
  let companyId = raw !== null && raw !== '' ? raw : undefined;
  let query = String(req.nextUrl.searchParams.get('query') || '');
  if (body) {
    const cid = body.companyId;
    if (typeof cid === 'string' && cid.trim() !== '') companyId = cid;
    const q = body.query;
    if (q !== undefined && q !== null && String(q).trim() !== '') query = String(q);
  }
  return { companyId, query };
}

export async function GET(req: NextRequest) {
  const denied = requireElevenSecret(req);
  if (denied) return denied;

  try {
    const { companyId, query } = parseSearchArgs(req, null);
    return NextResponse.json(await handleServicesSearch(companyId, query));
  } catch (error) {
    return jsonError(error, 500);
  }
}

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
    const { companyId, query } = parseSearchArgs(req, body);
    return NextResponse.json(await handleServicesSearch(companyId, query));
  } catch (error) {
    return jsonError(error, 500);
  }
}
