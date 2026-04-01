/** Missing HubSpot env vars when calling CRM sync — maps to 503 + `{ error, missing }`. */
export class HubspotNotConfiguredError extends Error {
  readonly missing: string[];
  readonly statusCode = 503;

  constructor(missing: string[]) {
    super('HubSpot not configured');
    this.name = 'HubspotNotConfiguredError';
    this.missing = missing;
  }
}
