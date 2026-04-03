/**
 * Typed API errors for route handlers (Next + Express jsonError / sendApiError).
 */
export class StructuredApiError extends Error {
  readonly code: string;
  readonly httpStatus: number;
  readonly details?: Record<string, unknown>;

  constructor(opts: {
    message: string;
    code: string;
    httpStatus: number;
    details?: Record<string, unknown>;
  }) {
    super(opts.message);
    this.name = 'StructuredApiError';
    this.code = opts.code;
    this.httpStatus = opts.httpStatus;
    this.details = opts.details;
  }
}
