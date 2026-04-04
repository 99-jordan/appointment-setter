/*
 * HubSpot contact create / update / upsert orchestration.
 * Uses search-then-patch-or-create to avoid duplicates.
 */

import { hubspotFetch } from './client.js';
import { buildHubSpotContactProperties } from './mappers.js';
import { resolveExistingContact } from './search.js';
import type { ValidatedUpsertInput } from './schemas.js';
import type { HubSpotContactResponse, UpsertAction } from './types.js';

const CONTACTS_PATH = '/crm/v3/objects/contacts';

export type UpsertResult = {
  action: UpsertAction;
  contactId: string;
  email?: string;
  phone?: string;
  updatedProperties: string[];
};

export async function createContact(
  properties: Record<string, string>
): Promise<HubSpotContactResponse> {
  return hubspotFetch<HubSpotContactResponse>('POST', CONTACTS_PATH, {
    properties,
  });
}

export async function updateContact(
  contactId: string,
  properties: Record<string, string>
): Promise<HubSpotContactResponse> {
  return hubspotFetch<HubSpotContactResponse>(
    'PATCH',
    `${CONTACTS_PATH}/${contactId}`,
    { properties }
  );
}

/**
 * Search → patch or create.
 *
 * 1. Search by email (if present)
 * 2. Fall back to search by phone (if email miss or absent)
 * 3. Patch existing contact, or create a new one
 * 4. Return resolved contact ID and whether it was created or updated
 */
export async function upsertContact(
  input: ValidatedUpsertInput
): Promise<UpsertResult> {
  const existing = await resolveExistingContact(input.email, input.phone);
  const isCreate = !existing;
  const { properties, keys } = buildHubSpotContactProperties(input, isCreate);

  if (isCreate) {
    const created = await createContact(properties);
    return {
      action: 'created',
      contactId: created.id,
      email: input.email,
      phone: input.phone,
      updatedProperties: keys,
    };
  }

  // Preserve existing lifecycle stage — never downgrade
  if (existing.properties?.lifecyclestage) {
    delete properties.lifecyclestage;
    const idx = keys.indexOf('lifecyclestage');
    if (idx !== -1) keys.splice(idx, 1);
  }

  // hs_lead_status is only set on create
  delete properties.hs_lead_status;
  const leadIdx = keys.indexOf('hs_lead_status');
  if (leadIdx !== -1) keys.splice(leadIdx, 1);

  const updated = await updateContact(existing.id, properties);

  return {
    action: 'updated',
    contactId: updated.id,
    email: input.email ?? existing.properties?.email ?? undefined,
    phone: input.phone ?? existing.properties?.phone ?? undefined,
    updatedProperties: keys,
  };
}
