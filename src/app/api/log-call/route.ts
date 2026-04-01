import { NextRequest, NextResponse } from 'next/server';
import { handleLogCall } from '../../../api-handlers.js';
import { requireElevenSecret } from '../../../lib/elevenlabs-secret.js';
import { jsonError } from '../../../lib/route-error.js';

export async function POST(req: NextRequest) {
  const denied = requireElevenSecret(req);
  if (denied) return denied;

  try {
    const body = await req.json();
    return NextResponse.json(await handleLogCall(body));
  } catch (error) {
    return jsonError(error, 400);
  }
}
