/* HubSpot API error class with safe serialisation for logging. */

import type { HubSpotErrorBody } from './types.js';

export class HubSpotApiError extends Error {
  readonly statusCode: number;
  readonly category?: string;
  readonly correlationId?: string;

  constructor(
    statusCode: number,
    message: string,
    opts?: { category?: string; correlationId?: string }
  ) {
    super(message);
    this.name = 'HubSpotApiError';
    this.statusCode = statusCode;
    this.category = opts?.category;
    this.correlationId = opts?.correlationId;
  }

  /** Safe representation for server-side diagnostics — never leak to callers. */
  toSafeLog(): Record<string, unknown> {
    return {
      error: this.name,
      statusCode: this.statusCode,
      message: this.message,
      category: this.category,
      correlationId: this.correlationId,
    };
  }

  static fromResponseBody(
    statusCode: number,
    body: HubSpotErrorBody
  ): HubSpotApiError {
    const message =
      body.message ?? body.errors?.[0]?.message ?? 'Unknown HubSpot error';
    return new HubSpotApiError(statusCode, message, {
      category: body.category,
      correlationId: body.correlationId,
    });
  }
}
