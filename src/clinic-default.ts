import type { SheetData } from './types.js';

/**
 * When the sheet has no `company_id` values, we resolve a single synthetic id so joins still work.
 * Rows with blank `company_id` match this id (single-clinic mode).
 */
export const SINGLE_CLINIC_COMPANY_ID = 'default';

export function matchesCompanyRow(rowCompanyId: string | undefined, resolvedCompanyId: string): boolean {
  const cid = String(rowCompanyId ?? '').trim();
  const rid = String(resolvedCompanyId ?? '').trim();
  if (cid === rid) return true;
  if (rid === SINGLE_CLINIC_COMPANY_ID && cid === '') return true;
  return false;
}

/**
 * Single-clinic mode: prefer the first Company row with a non-empty `company_id`.
 * If none, use {@link SINGLE_CLINIC_COMPANY_ID} when at least one data row exists (company_id column optional).
 */
export function getDefaultCompanyId(data: SheetData): string {
  const withId = data.company.find((r) => String(r.company_id ?? '').trim() !== '');
  if (withId) return String(withId.company_id).trim();
  const anyRow = data.company.find((r) =>
    Object.values(r as unknown as Record<string, unknown>).some((v) => String(v ?? '').trim() !== '')
  );
  if (anyRow) return SINGLE_CLINIC_COMPANY_ID;
  throw new Error(
    'Company sheet has no data rows. Add at least one clinic row (company_id is optional in single-clinic mode).'
  );
}

/** If `normalized.companyId` is missing or blank, set it from the sheet default. */
export function mergeDefaultCompanyId(
  data: SheetData,
  normalized: Record<string, unknown>
): Record<string, unknown> {
  const raw = normalized.companyId;
  const s = raw === undefined || raw === null ? '' : String(raw).trim();
  if (s !== '') return normalized;
  return { ...normalized, companyId: getDefaultCompanyId(data) };
}
