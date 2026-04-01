import { hubspotRequest } from './hubspot-client.js';
import { splitFullName } from './name-split.js';
import type {
  AssociationSpec,
  HubSpotObjectCreateResponse,
  HubSpotSearchResponse,
  HubspotContactInput,
  HubspotNoteInput,
  HubspotTaskInput,
  HubspotTicketInput
} from './hubspot-types.js';

export type HubspotAssociationIds = {
  ticketToContact: number;
  noteToContact: number;
  noteToTicket: number;
  taskToContact: number;
  taskToTicket: number;
};

function contactProps(c: HubspotContactInput): Record<string, string> {
  const p: Record<string, string> = {
    firstname: c.firstname,
    lastname: c.lastname
  };
  if (c.phone) p.phone = c.phone;
  if (c.address) p.address = c.address;
  if (c.zip) p.zip = c.zip;
  return p;
}

export async function searchContactByPhone(
  token: string,
  phone: string
): Promise<{ id: string } | null> {
  const body = {
    filterGroups: [
      {
        filters: [
          {
            propertyName: 'phone',
            operator: 'EQ',
            value: phone.trim()
          }
        ]
      }
    ],
    properties: ['phone', 'firstname', 'lastname'],
    limit: 1
  };

  const res = await hubspotRequest<HubSpotSearchResponse>(token, 'POST', '/crm/v3/objects/contacts/search', {
    body
  });

  const id = res.results?.[0]?.id;
  return id ? { id } : null;
}

export async function createContact(
  token: string,
  input: HubspotContactInput
): Promise<HubSpotObjectCreateResponse> {
  return hubspotRequest<HubSpotObjectCreateResponse>(token, 'POST', '/crm/v3/objects/contacts', {
    body: { properties: contactProps(input) }
  });
}

export async function updateContact(
  token: string,
  contactId: string,
  input: Partial<HubspotContactInput>
): Promise<HubSpotObjectCreateResponse> {
  const { firstname, lastname, phone, address, zip } = input;
  const props: Record<string, string> = {};
  if (firstname !== undefined) props.firstname = firstname;
  if (lastname !== undefined) props.lastname = lastname;
  if (phone !== undefined) props.phone = phone;
  if (address !== undefined) props.address = address;
  if (zip !== undefined) props.zip = zip;

  return hubspotRequest<HubSpotObjectCreateResponse>(token, 'PATCH', `/crm/v3/objects/contacts/${contactId}`, {
    body: { properties: props }
  });
}

export async function upsertContact(
  token: string,
  name: string | undefined,
  phone: string | undefined,
  address: string | undefined,
  postcode: string | undefined
): Promise<{ id: string; created: boolean }> {
  const { firstname, lastname } = splitFullName(name);
  const base: HubspotContactInput = {
    firstname,
    lastname,
    phone: phone?.trim(),
    address: address?.trim(),
    zip: postcode?.trim()
  };

  if (phone && phone.trim()) {
    const found = await searchContactByPhone(token, phone.trim());
    if (found) {
      await updateContact(token, found.id, base);
      return { id: found.id, created: false };
    }
  }

  const created = await createContact(token, base);
  return { id: created.id, created: true };
}

export async function createTicket(
  token: string,
  input: HubspotTicketInput
): Promise<HubSpotObjectCreateResponse> {
  return hubspotRequest<HubSpotObjectCreateResponse>(token, 'POST', '/crm/v3/objects/tickets', {
    body: {
      properties: {
        subject: input.subject,
        hs_pipeline: input.hs_pipeline,
        hs_pipeline_stage: input.hs_pipeline_stage,
        hs_ticket_priority: input.hs_ticket_priority
      }
    }
  });
}

export async function createNote(
  token: string,
  input: HubspotNoteInput
): Promise<HubSpotObjectCreateResponse> {
  return hubspotRequest<HubSpotObjectCreateResponse>(token, 'POST', '/crm/v3/objects/notes', {
    body: {
      properties: {
        hs_timestamp: input.hs_timestamp,
        hs_note_body: input.hs_note_body
      }
    }
  });
}

export async function createCallbackTask(
  token: string,
  input: HubspotTaskInput
): Promise<HubSpotObjectCreateResponse> {
  const props: Record<string, string> = {
    hs_task_subject: input.hs_task_subject,
    hs_task_body: input.hs_task_body,
    hs_timestamp: input.hs_timestamp,
    hs_task_status: 'NOT_STARTED',
    hs_task_priority: 'HIGH'
  };
  if (input.hubspot_owner_id) {
    props.hubspot_owner_id = input.hubspot_owner_id;
  }

  return hubspotRequest<HubSpotObjectCreateResponse>(token, 'POST', '/crm/v3/objects/tasks', {
    body: { properties: props }
  });
}

/**
 * PUT /crm/v4/objects/{fromType}/{fromId}/associations/{toType}/{toId}
 * @see https://developers.hubspot.com/docs/guides/api/crm/associations/associations-v4
 */
export async function putAssociationV4(
  token: string,
  fromObjectType: string,
  fromId: string,
  toObjectType: string,
  toId: string,
  specs: AssociationSpec[]
): Promise<void> {
  const path = `/crm/v4/objects/${fromObjectType}/${fromId}/associations/${toObjectType}/${toId}`;
  await hubspotRequest<unknown>(token, 'PUT', path, { body: specs });
}

export async function associateTicketToContact(
  token: string,
  ticketId: string,
  contactId: string,
  assoc: HubspotAssociationIds
): Promise<void> {
  await putAssociationV4(token, 'tickets', ticketId, 'contacts', contactId, [
    { associationCategory: 'HUBSPOT_DEFINED', associationTypeId: assoc.ticketToContact }
  ]);
}

export async function associateNoteToContact(
  token: string,
  noteId: string,
  contactId: string,
  assoc: HubspotAssociationIds
): Promise<void> {
  await putAssociationV4(token, 'notes', noteId, 'contacts', contactId, [
    { associationCategory: 'HUBSPOT_DEFINED', associationTypeId: assoc.noteToContact }
  ]);
}

export async function associateNoteToTicket(
  token: string,
  noteId: string,
  ticketId: string,
  assoc: HubspotAssociationIds
): Promise<void> {
  await putAssociationV4(token, 'notes', noteId, 'tickets', ticketId, [
    { associationCategory: 'HUBSPOT_DEFINED', associationTypeId: assoc.noteToTicket }
  ]);
}

export async function associateTaskToContact(
  token: string,
  taskId: string,
  contactId: string,
  assoc: HubspotAssociationIds
): Promise<void> {
  await putAssociationV4(token, 'tasks', taskId, 'contacts', contactId, [
    { associationCategory: 'HUBSPOT_DEFINED', associationTypeId: assoc.taskToContact }
  ]);
}

export async function associateTaskToTicket(
  token: string,
  taskId: string,
  ticketId: string,
  assoc: HubspotAssociationIds
): Promise<void> {
  await putAssociationV4(token, 'tasks', taskId, 'tickets', ticketId, [
    { associationCategory: 'HUBSPOT_DEFINED', associationTypeId: assoc.taskToTicket }
  ]);
}
