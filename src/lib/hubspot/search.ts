/*
 * HubSpot contact search helpers — email-first, then phone fallback.
 */

import { hubspotFetch } from './client.js';
import type { HubSpotSearchResponse } from './types.js';

const SEARCH_PATH = '/crm/v3/objects/contacts/search';

const CONTACT_PROPERTIES = [
  'email',
  'phone',
  'firstname',
  'lastname',
  'lifecyclestage',
];

type SearchHit = {
  id: string;
  properties?: Record<string, string | null>;
};

export async function searchContactByEmail(
  email: string
): Promise<SearchHit | null> {
  const res = await hubspotFetch<HubSpotSearchResponse>('POST', SEARCH_PATH, {
    filterGroups: [
      {
        filters: [
          {
            propertyName: 'email',
            operator: 'EQ',
            value: email.toLowerCase().trim(),
          },
        ],
      },
    ],
    properties: CONTACT_PROPERTIES,
    limit: 1,
  });

  return res.results?.[0] ?? null;
}

export async function searchContactByPhone(
  phone: string
): Promise<SearchHit | null> {
  const res = await hubspotFetch<HubSpotSearchResponse>('POST', SEARCH_PATH, {
    filterGroups: [
      {
        filters: [
          { propertyName: 'phone', operator: 'EQ', value: phone.trim() },
        ],
      },
    ],
    properties: CONTACT_PROPERTIES,
    limit: 1,
  });

  return res.results?.[0] ?? null;
}

/**
 * Resolve an existing HubSpot contact using email first, then phone.
 * Returns `null` when neither identifier matches.
 */
export async function resolveExistingContact(
  email?: string,
  phone?: string
): Promise<SearchHit | null> {
  if (email) {
    const byEmail = await searchContactByEmail(email);
    if (byEmail) return byEmail;
  }
  if (phone) {
    const byPhone = await searchContactByPhone(phone);
    if (byPhone) return byPhone;
  }
  return null;
}
