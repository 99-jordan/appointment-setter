/**
 * Thrown when canonical Zod validation fails after normalisation.
 * Standard for POST tool routes — see README "Convention: POST tool routes".
 */
export class HttpValidationError extends Error {
  readonly fields: Record<string, string>;

  constructor(fields: Record<string, string>) {
    super('Validation failed');
    this.name = 'HttpValidationError';
    this.fields = fields;
  }
}
