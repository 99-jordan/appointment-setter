export function normalisePostcodePrefix(postcode: string): string {
  return postcode.trim().toUpperCase().replace(/\s+/g, '');
}

export function areaMatchesPrefix(postcode: string, prefixes: string): boolean {
  const cleaned = normalisePostcodePrefix(postcode);
  return prefixes
    .split(',')
    .map((p) => p.trim().toUpperCase().replace(/\s+/g, ''))
    .some((prefix) => prefix && cleaned.startsWith(prefix));
}

export function scoreKeywordMatch(input: string, keywordBlob: string): number {
  const haystack = input.toLowerCase();
  return keywordBlob
    .split(',')
    .map((keyword) => keyword.trim().toLowerCase())
    .filter(Boolean)
    .reduce((score, keyword) => (haystack.includes(keyword) ? score + 1 : score), 0);
}

export function uniqueBy<T>(items: T[], keyFn: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = keyFn(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
