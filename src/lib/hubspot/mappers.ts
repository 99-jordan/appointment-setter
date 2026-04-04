/*
 * Dental contact property mappers — name splitting, patient status,
 * service normalisation, and HubSpot property building.
 */

import type { ValidatedUpsertInput } from './schemas.js';
import type { DentalPatientStatus } from './types.js';

// ── Name helpers ─────────────────────────────────────────────────────

export function splitFullName(
  name: string | undefined
): { firstname: string; lastname: string } {
  const trimmed = (name ?? '').trim();
  if (!trimmed) return { firstname: '', lastname: '' };
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return { firstname: parts[0], lastname: '' };
  return { firstname: parts[0], lastname: parts.slice(1).join(' ') };
}

// ── Patient status ───────────────────────────────────────────────────

export function mapExistingPatientToDentalStatus(
  value: 'yes' | 'no' | 'unknown'
): DentalPatientStatus {
  switch (value) {
    case 'no':
      return 'new_patient';
    case 'yes':
      return 'existing_patient';
    default:
      return 'unknown';
  }
}

// ── Service normalisation ────────────────────────────────────────────

const SERVICE_MAP: Record<string, string> = {
  'porcelain veneers': 'veneers',
  'veneers consultation': 'veneers',
  veneers: 'veneers',
  'implant consultation': 'implants',
  implants: 'implants',
  'dental implants': 'implants',
  'invisalign consultation': 'invisalign',
  invisalign: 'invisalign',
  'whitening consultation': 'whitening',
  whitening: 'whitening',
  'teeth whitening': 'whitening',
  'cosmetic consultation': 'cosmetic_consultation',
  cosmetic: 'cosmetic_consultation',
  'emergency appointment': 'emergency',
  emergency: 'emergency',
  hygiene: 'hygiene',
  'hygiene appointment': 'hygiene',
  'general dental consultation': 'general_consultation',
  'general consultation': 'general_consultation',
  general: 'general_consultation',
};

const CANONICAL_VALUES = new Set(Object.values(SERVICE_MAP));

export function normaliseServiceInterest(
  serviceCategory?: string,
  serviceInterest?: string
): string | undefined {
  if (serviceCategory) {
    const key = serviceCategory.toLowerCase().trim();
    if (CANONICAL_VALUES.has(key)) return key;
    const mapped = SERVICE_MAP[key];
    if (mapped) return mapped;
  }

  if (serviceInterest) {
    const key = serviceInterest.toLowerCase().trim();
    if (CANONICAL_VALUES.has(key)) return key;
    const mapped = SERVICE_MAP[key];
    if (mapped) return mapped;
  }

  return undefined;
}

// ── Phone normalisation (minimal for milestone one) ──────────────────

export function normalisePhone(phone: string | undefined): string | undefined {
  return phone?.trim() || undefined;
}

// ── Property builder ─────────────────────────────────────────────────

/**
 * Builds the flat property map for a HubSpot contact create or update.
 * Returns only properties with defined, non-empty values so partial
 * updates are safe.
 */
export function buildHubSpotContactProperties(
  input: ValidatedUpsertInput,
  isCreate: boolean
): { properties: Record<string, string>; keys: string[] } {
  const props: Record<string, string> = {};

  const { firstname, lastname } = splitFullName(input.patientName);
  if (firstname) props.firstname = firstname;
  if (lastname) props.lastname = lastname;

  if (input.email) props.email = input.email;
  if (input.phone) props.phone = normalisePhone(input.phone) ?? input.phone;

  if (isCreate) {
    props.lifecyclestage = 'lead';
    props.hs_lead_status = 'new_enquiry';
  }

  props.dental_patient_status = mapExistingPatientToDentalStatus(
    input.existingPatient
  );

  const service = normaliseServiceInterest(
    input.serviceCategory,
    input.serviceInterest
  );
  if (service) props.dental_primary_service_interest = service;

  props.dental_booking_status = input.bookingStatus;
  props.dental_follow_up_status = input.followUpStatus;

  if (input.lastCallSummary) {
    props.dental_last_call_summary = input.lastCallSummary;
  }

  return { properties: props, keys: Object.keys(props) };
}
