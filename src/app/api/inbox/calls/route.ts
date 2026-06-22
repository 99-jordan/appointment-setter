import { NextRequest, NextResponse } from 'next/server';
import { handleInboxCallsList } from '../../../../api-handlers.js';
import { requireClinicPortalSecret } from '../../../../lib/clinic-portal-secret.js';
import { jsonError } from '../../../../lib/route-error.js';

export async function GET(req: NextRequest) {
  const denied = requireClinicPortalSecret(req);
  if (denied) return denied;

  try {
    const q = req.nextUrl.searchParams;
    const companyId = q.get('companyId') ?? undefined;
    const callId = q.get('callId') ?? undefined;
    const limitRaw = q.get('limit');
    const limit = limitRaw ? Number(limitRaw) : undefined;

    return NextResponse.json(
      await handleInboxCallsList({
        companyId,
        callId,
        limit: Number.isFinite(limit) ? limit : undefined
      })
    );
  } catch (error) {
    return jsonError(error, 500);
  }
}
