import type { Request, Response, NextFunction } from 'express';
import { config } from './config.js';
import {
  ELEVENLABS_DENTALPRO_SECRET_HEADER,
  ELEVENLABS_SECRET_HEADER_LEGACY_PLUMBING
} from './elevenlabs-secret-header.js';
import {
  buildPlumbingAuthDiagnostics,
  isPlumbingAuthDebugEnabled,
  logPlumbingAuthDebug
} from './lib/plumbing-auth-debug.js';

function incomingSecret(req: Request): string | undefined {
  return (
    req.header(ELEVENLABS_DENTALPRO_SECRET_HEADER) ??
    req.header(ELEVENLABS_SECRET_HEADER_LEGACY_PLUMBING)
  );
}

export function requireElevenSecret(req: Request, res: Response, next: NextFunction) {
  const secret = incomingSecret(req);
  logPlumbingAuthDebug('express', secret ?? null, config.elevenSecret);

  if (!secret || secret !== config.elevenSecret) {
    const body: Record<string, unknown> = {
      error: 'Unauthorized',
      reason: 'missing_or_invalid_secret_header',
      header: ELEVENLABS_DENTALPRO_SECRET_HEADER,
      legacyHeaderAlsoAccepted: ELEVENLABS_SECRET_HEADER_LEGACY_PLUMBING
    };
    if (isPlumbingAuthDebugEnabled()) {
      body.debug = buildPlumbingAuthDiagnostics(secret ?? null, config.elevenSecret);
    }
    return res.status(401).json(body);
  }
  next();
}
