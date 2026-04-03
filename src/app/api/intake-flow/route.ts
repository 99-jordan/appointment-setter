import { NextRequest, NextResponse } from 'next/server';
import { handleIntakeFlow } from '../../../api-handlers.js';
import { requireElevenSecret } from '../../../lib/elevenlabs-secret.js';
import { jsonError } from '../../../lib/route-error.js';

function parseIntakeArgs(req: NextRequest, body: Record<string, unknown> | null) {
  const raw = req.nextUrl.searchParams.get('companyId');
  let companyId = raw !== null && raw !== '' ? raw : undefined;
  let askWhen: string | undefined =
    req.nextUrl.searchParams.get('askWhen') !== null
      ? String(req.nextUrl.searchParams.get('askWhen'))
      : undefined;
  if (body) {
    const cid = body.companyId;
    if (typeof cid === 'string' && cid.trim() !== '') companyId = cid;
    const aw = body.askWhen;
    if (aw !== undefined && aw !== null && String(aw).trim() !== '') askWhen = String(aw);
  }
  return { companyId, askWhen };
}

export async function GET(req: NextRequest) {
  const denied = requireElevenSecret(req);
  if (denied) return denied;

  try {
    const { companyId, askWhen } = parseIntakeArgs(req, null);
    return NextResponse.json(await handleIntakeFlow(companyId, askWhen));
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
    const { companyId, askWhen } = parseIntakeArgs(req, body);
    return NextResponse.json(await handleIntakeFlow(companyId, askWhen));
  } catch (error) {
    return jsonError(error, 500);
  }
}
