/* Zod schemas for the dental HubSpot contact upsert route. */

import { z } from 'zod';

const emptyToUndefined = (v: unknown) =>
  typeof v === 'string' && v.trim() === '' ? undefined : v;

export const bookingStatusSchema = z.enum([
  'enquiry_only',
  'booking_requested',
  'booked',
  'booking_failed',
  'callback_requested',
  'transferred',
  'no_action',
]);

export const followUpStatusSchema = z.enum([
  'none',
  'sms_sent',
  'front_desk_follow_up',
  'patient_to_confirm',
  'unreachable',
]);

export const existingPatientSchema = z.enum(['yes', 'no', 'unknown']);

export const upsertContactInputSchema = z
  .object({
    patientName: z.preprocess(
      emptyToUndefined,
      z.string().trim().optional()
    ),
    email: z.preprocess(
      emptyToUndefined,
      z.string().email('Must be a valid email address').trim().toLowerCase().optional()
    ),
    phone: z.preprocess(
      emptyToUndefined,
      z.string().trim().min(1).optional()
    ),
    existingPatient: existingPatientSchema.default('unknown'),
    serviceInterest: z.preprocess(emptyToUndefined, z.string().trim().optional()),
    serviceCategory: z.preprocess(emptyToUndefined, z.string().trim().optional()),
    bookingStatus: bookingStatusSchema.default('enquiry_only'),
    followUpStatus: followUpStatusSchema.default('none'),
    lastCallSummary: z.preprocess(emptyToUndefined, z.string().trim().optional()),
    slotStart: z.preprocess(emptyToUndefined, z.string().optional()),
    slotEnd: z.preprocess(emptyToUndefined, z.string().optional()),
    calendarEventId: z.preprocess(emptyToUndefined, z.string().optional()),
  })
  .refine((d) => Boolean(d.email) || Boolean(d.phone), {
    message: 'At least one of email or phone must be provided',
    path: ['email'],
  });

export type ValidatedUpsertInput = z.infer<typeof upsertContactInputSchema>;
