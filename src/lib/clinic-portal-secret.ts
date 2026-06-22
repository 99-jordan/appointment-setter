import { NextRequest, NextResponse } from 'next/server';
import { CLINIC_PORTAL_SECRET_HEADER } from '../clinic-portal-secret-header.js';

function getClinicPortalSecret(): string | undefined {
  const v = process.env['CLINIC_PORTAL_SECRET']?.trim();
  return v || undefined;
}

export function isClinicPortalConfigured(): boolean {
  return Boolean(getClinicPortalSecret());
}

export function requireClinicPortalSecret(req: NextRequest): NextResponse | null {
  const expected = getClinicPortalSecret();
  if (!expected) {
    return NextResponse.json(
      {
        ok: false,
        error: 'inbox_not_configured',
        message: 'Clinic portal is not configured. Set CLINIC_PORTAL_SECRET.',
      },
      { status: 503 }
    );
  }

  const incoming = req.headers.get(CLINIC_PORTAL_SECRET_HEADER);
  if (!incoming || incoming !== expected) {
    return NextResponse.json(
      {
        ok: false,
        error: 'unauthorised',
        message: 'Missing or invalid clinic portal secret.',
        header: CLINIC_PORTAL_SECRET_HEADER,
      },
      { status: 401 }
    );
  }
  return null;
}
