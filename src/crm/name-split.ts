/** Split a display name into HubSpot firstname / lastname (first token vs remainder). */
export function splitFullName(name: string | undefined): { firstname: string; lastname: string } {
  const t = (name ?? '').trim();
  if (!t) {
    return { firstname: 'Unknown', lastname: 'Caller' };
  }
  const parts = t.split(/\s+/);
  if (parts.length === 1) {
    return { firstname: parts[0], lastname: '.' };
  }
  return { firstname: parts[0], lastname: parts.slice(1).join(' ') };
}
