import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { config } from '../../../config.js';
import {
  appendEscalationDemoRow,
  ensureEscalationsSheet,
  googleSheetsApiErrorText,
  readEscalationsRecent
} from '../../../googleSheets.js';

/** Matches demo manual posts and production `postEscalationWebhook` payloads (+ optional postcode/address). */
const bodySchema = z.object({
  companyId: z.string().min(1),
  callId: z.string().min(1),
  name: z.string().optional().default(''),
  callerPhone: z.string().optional().default(''),
  postcode: z.string().optional().default(''),
  address: z.string().optional().default(''),
  issueSummary: z.string().optional().default(''),
  priority: z.string().optional().default(''),
  reason: z.string().optional().default(''),
  timestamp: z.string().optional()
});

function checkEscalationSecret(req: NextRequest): NextResponse | null {
  const want = config.escalationWebhookSecret;
  if (!want) return null;
  if (req.headers.get('x-escalation-secret') !== want) {
    return NextResponse.json(
      { error: 'Unauthorized', reason: 'invalid_or_missing_x_escalation_secret' },
      { status: 401 }
    );
  }
  return null;
}

export async function POST(req: NextRequest) {
  const denied = checkEscalationSecret(req);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', message: parsed.error.message },
      { status: 400 }
    );
  }

  const p = parsed.data;
  const receivedAt = new Date().toISOString();

  try {
    await ensureEscalationsSheet();
    await appendEscalationDemoRow([
      receivedAt,
      p.companyId,
      p.callId,
      p.name,
      p.callerPhone,
      p.postcode,
      p.address,
      p.issueSummary,
      p.priority,
      p.reason
    ]);
  } catch (e) {
    return NextResponse.json({ error: 'Sheets error', message: googleSheetsApiErrorText(e) }, { status: 500 });
  }

  return NextResponse.json({ ok: true, received: true });
}

export async function GET() {
  try {
    await ensureEscalationsSheet();
    const escalations = await readEscalationsRecent(50);
    return NextResponse.json({
      ok: true,
      count: escalations.length,
      escalations
    });
  } catch (e) {
    return NextResponse.json({ error: 'Failed to read Escalations', message: googleSheetsApiErrorText(e) }, { status: 500 });
  }
}
