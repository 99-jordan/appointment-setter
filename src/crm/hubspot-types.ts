/** Normalized call payload for CRM sync (HubSpot emergency_call). */
export type EmergencyCallPayload = {
  companyId: string;
  callId: string;
  name?: string;
  phone?: string;
  address?: string;
  postcode?: string;
  issueSummary: string;
  priority?: 'P1' | 'P2' | 'P3' | 'P4' | 'Redirect';
  emergencyFlag?: 'Yes' | 'No';
  actionTaken?: string;
  smsSent?: string;
  escalatedTo?: string;
  status?: string;
};

export type HubspotEmergencySyncResult = {
  ok: true;
  contactId: string;
  ticketId: string;
  noteId: string;
  taskId: string | null;
};

export type HubSpotObjectCreateResponse = {
  id: string;
  properties?: Record<string, string | null>;
};

export type HubSpotSearchResponse = {
  total?: number;
  results?: Array<{ id: string; properties?: Record<string, string | null> }>;
};

export type HubSpotErrorBody = {
  message?: string;
  category?: string;
  correlationId?: string;
  errors?: Array<{ message?: string }>;
};

export type HubspotContactInput = {
  firstname: string;
  lastname: string;
  phone?: string;
  address?: string;
  zip?: string;
};

export type HubspotTicketInput = {
  subject: string;
  hs_pipeline: string;
  hs_pipeline_stage: string;
  hs_ticket_priority: 'LOW' | 'MEDIUM' | 'HIGH';
};

export type HubspotNoteInput = {
  hs_timestamp: string;
  hs_note_body: string;
};

export type HubspotTaskInput = {
  hs_task_subject: string;
  hs_task_body: string;
  /** HubSpot expects ms since epoch for scheduling */
  hs_timestamp: string;
  hubspot_owner_id?: string;
};

export type AssociationSpec = {
  associationCategory: 'HUBSPOT_DEFINED';
  associationTypeId: number;
};
