/* HubSpot dental contact upsert — shared types. */

export type BookingStatus =
  | 'enquiry_only'
  | 'booking_requested'
  | 'booked'
  | 'booking_failed'
  | 'callback_requested'
  | 'transferred'
  | 'no_action';

export type FollowUpStatus =
  | 'none'
  | 'sms_sent'
  | 'front_desk_follow_up'
  | 'patient_to_confirm'
  | 'unreachable';

export type ExistingPatient = 'yes' | 'no' | 'unknown';

export type DentalPatientStatus = 'new_patient' | 'existing_patient' | 'unknown';

export type UpsertAction = 'created' | 'updated';

// ── Route response shapes ────────────────────────────────────────────

export type UpsertContactSuccessResponse = {
  ok: true;
  action: UpsertAction;
  contact: { id: string; email?: string; phone?: string };
  updatedProperties: string[];
};

export type UpsertContactErrorResponse = {
  ok: false;
  error: 'validation_error' | 'unauthorised' | 'hubspot_error' | 'internal_error';
  message: string;
};

// ── HubSpot API shapes ──────────────────────────────────────────────

export type HubSpotSearchResponse = {
  total?: number;
  results?: Array<{
    id: string;
    properties?: Record<string, string | null>;
  }>;
};

export type HubSpotContactResponse = {
  id: string;
  properties?: Record<string, string | null>;
};

export type HubSpotErrorBody = {
  message?: string;
  category?: string;
  correlationId?: string;
  errors?: Array<{ message?: string }>;
};
