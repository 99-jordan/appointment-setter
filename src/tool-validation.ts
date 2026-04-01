/**
 * Standard validation step after `tool-payload-normalize`: throws HttpValidationError → 400 + `{ error, fields }`.
 * See README "Convention: POST tool routes".
 */
import { z } from 'zod';
import { HttpValidationError } from './http-validation-error.js';

export function parseCanonical<T>(schema: z.ZodType<T>, input: unknown): T {
  const r = schema.safeParse(input);
  if (r.success) return r.data;
  const fields: Record<string, string> = {};
  for (const iss of r.error.errors) {
    const key = iss.path.length ? iss.path.map(String).join('.') : '_root';
    fields[key] = iss.message;
  }
  throw new HttpValidationError(fields);
}
