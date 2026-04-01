import {
  ELEVENLABS_DENTALPRO_SECRET_HEADER,
  ELEVENLABS_SECRET_HEADER_LEGACY_PLUMBING
} from '../elevenlabs-secret-header.js';

export function isPlumbingAuthDebugEnabled(): boolean {
  return process.env.DEBUG_PLUMBING_AUTH === '1';
}

/** Same resolution order as `config.elevenSecret`. */
export function getExpectedSecretFromEnv(): {
  value: string | undefined;
  source:
    | 'X_ELEVENLABS_SECRET_DENTALPRO'
    | 'X_ELEVENLABS_SECRET_PLUMBINGPRO'
    | 'X_ELEVENLABS_SECRET'
    | null;
} {
  const d = process.env.X_ELEVENLABS_SECRET_DENTALPRO;
  if (d !== undefined && d !== '') {
    return { value: d, source: 'X_ELEVENLABS_SECRET_DENTALPRO' };
  }
  const p = process.env.X_ELEVENLABS_SECRET_PLUMBINGPRO;
  if (p !== undefined && p !== '') {
    return { value: p, source: 'X_ELEVENLABS_SECRET_PLUMBINGPRO' };
  }
  const l = process.env.X_ELEVENLABS_SECRET;
  if (l !== undefined && l !== '') {
    return { value: l, source: 'X_ELEVENLABS_SECRET' };
  }
  return { value: undefined, source: null };
}

export type PlumbingAuthDiagnostics = {
  hasHeader: boolean;
  hasEnv: boolean;
  headerLength: number | null;
  envLength: number | null;
  matches: boolean;
  expectedEnvKey:
    | 'X_ELEVENLABS_SECRET_DENTALPRO'
    | 'X_ELEVENLABS_SECRET_PLUMBINGPRO'
    | 'X_ELEVENLABS_SECRET'
    | null;
  looksLikeUnresolvedPlaceholder: boolean;
  primaryHeader: typeof ELEVENLABS_DENTALPRO_SECRET_HEADER;
  legacyHeaderAlsoAccepted: typeof ELEVENLABS_SECRET_HEADER_LEGACY_PLUMBING;
};

export function buildPlumbingAuthDiagnostics(
  incomingHeader: string | null,
  expectedSecret: string
): PlumbingAuthDiagnostics {
  const hasHeader = incomingHeader != null && incomingHeader.length > 0;
  const hasEnv = expectedSecret.length > 0;
  const headerLength = hasHeader ? incomingHeader!.length : null;
  const envLength = hasEnv ? expectedSecret.length : null;
  const matches = hasHeader && hasEnv && incomingHeader === expectedSecret;
  const looksLikeUnresolvedPlaceholder =
    incomingHeader != null &&
    (incomingHeader.includes('{{secret:') || incomingHeader.includes('{{SECRET:'));
  const { source } = getExpectedSecretFromEnv();
  return {
    hasHeader,
    hasEnv,
    headerLength,
    envLength,
    matches,
    expectedEnvKey: source,
    looksLikeUnresolvedPlaceholder,
    primaryHeader: ELEVENLABS_DENTALPRO_SECRET_HEADER,
    legacyHeaderAlsoAccepted: ELEVENLABS_SECRET_HEADER_LEGACY_PLUMBING
  };
}

export function logPlumbingAuthDebug(
  label: string,
  incomingHeader: string | null,
  expectedSecret: string
): void {
  if (!isPlumbingAuthDebugEnabled()) return;
  const d = buildPlumbingAuthDiagnostics(incomingHeader, expectedSecret);
  console.log(`[plumbing-auth:${label}]`, JSON.stringify(d));
}
