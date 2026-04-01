import type { SheetData } from './types.js';

/**
 * Single-clinic mode: use the first Company tab row that has a `company_id`.
 * Callers still pass an explicit `companyId` for legacy multi-tenant sheets.
 */
export function getDefaultCompanyId(data: SheetData): string {
  const row = data.company.find((r) => String(r.company_id ?? '').trim() !== '');
  if (!row) {
    throw new Error(
      'Company sheet has no row with company_id. Add your clinic row to the Company tab.'
    );
  }
  return String(row.company_id).trim();
}

/** If `normalized.companyId` is missing or blank, set it from the first Company row. */
export function mergeDefaultCompanyId(
  data: SheetData,
  normalized: Record<string, unknown>
): Record<string, unknown> {
  const raw = normalized.companyId;
  const s = raw === undefined || raw === null ? '' : String(raw).trim();
  if (s !== '') return normalized;
  return { ...normalized, companyId: getDefaultCompanyId(data) };
}
