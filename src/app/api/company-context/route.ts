import { NextRequest, NextResponse } from 'next/server';
import { handleCompanyContext } from '../../../api-handlers.js';
import { requireElevenSecret } from '../../../lib/elevenlabs-secret.js';
import { jsonError, paramFromReq, safeJsonBody } from '../../../lib/route-error.js';

export async function GET(req: NextRequest) {
  const denied = requireElevenSecret(req);
  if (denied) return denied;

  try {
    return NextResponse.json(await handleCompanyContext(paramFromReq(req, null, 'companyId')));
  } catch (error) {
    return jsonError(error, 500);
  }
}

export async function POST(req: NextRequest) {
  const denied = requireElevenSecret(req);
  if (denied) return denied;

  try {
    const body = await safeJsonBody(req);
    return NextResponse.json(await handleCompanyContext(paramFromReq(req, body, 'companyId')));
  } catch (error) {
    return jsonError(error, 500);
  }
}
