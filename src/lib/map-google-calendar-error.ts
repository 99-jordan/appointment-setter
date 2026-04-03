/**
 * Map Google Calendar / gaxios failures to StructuredApiError (no secrets in message).
 * Uses duck-typing (not instanceof) so it works regardless of which gaxios version threw.
 */
import { StructuredApiError } from './api-errors.js';

type GoogleErrBody = {
  error?:
    | {
        message?: string;
        code?: number;
        status?: string;
        errors?: Array<{ reason?: string; domain?: string; message?: string }>;
      }
    | string;
};

function extractGoogleMessage(data: unknown): string | undefined {
  if (!data || typeof data !== 'object') return undefined;
  const body = data as GoogleErrBody;
  if (typeof body.error === 'string') return body.error;
  return body.error?.message?.trim() || undefined;
}

function extractReasons(data: unknown): string | undefined {
  if (!data || typeof data !== 'object') return undefined;
  const body = data as GoogleErrBody;
  if (typeof body.error === 'string') return undefined;
  return (
    (body.error?.errors ?? [])
      .map((x) => x.reason)
      .filter(Boolean)
      .join(', ') || undefined
  );
}

function gaxiosLike(
  err: unknown
): { status?: number; data?: unknown; message: string } | null {
  if (err !== null && typeof err === 'object' && 'response' in err) {
    const r = err as { response?: { status?: number; data?: unknown }; message?: string };
    if (r.response && typeof r.response.status === 'number') {
      return {
        status: r.response.status,
        data: r.response.data,
        message: typeof r.message === 'string' ? r.message : 'Request failed'
      };
    }
  }
  return null;
}

export function mapGoogleCalendarError(
  err: unknown,
  context: { operation: string; calendarId: string }
): never {
  const gx = gaxiosLike(err);

  if (gx) {
    const status = gx.status ?? 0;
    const googleMsg =
      extractGoogleMessage(gx.data) || gx.message || 'Google Calendar request failed';
    const reasons = extractReasons(gx.data);

    console.error(
      '[calendar-service]',
      context.operation,
      `HTTP ${status}`,
      JSON.stringify(gx.data, null, 2)
    );

    if (status === 404) {
      throw new StructuredApiError({
        code: 'calendar_not_found',
        httpStatus: 404,
        message:
          'Google Calendar returned not found for this calendar id. Confirm GOOGLE_CALENDAR_ID matches the shared calendar and that the service account email has "Make changes to events" access.',
        details: {
          operation: context.operation,
          calendarId: context.calendarId,
          googleMessage: googleMsg,
          reasons
        }
      });
    }
    if (status === 403) {
      throw new StructuredApiError({
        code: 'calendar_permission_denied',
        httpStatus: 403,
        message:
          'Google Calendar denied access. Ensure the Calendar API is enabled and the calendar is shared with the service account with edit permission.',
        details: {
          operation: context.operation,
          calendarId: context.calendarId,
          googleMessage: googleMsg,
          reasons
        }
      });
    }
    if (status === 401) {
      throw new StructuredApiError({
        code: 'calendar_auth_failed',
        httpStatus: 502,
        message:
          'Google Calendar authentication failed. Check GOOGLE_PRIVATE_KEY and GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_CLIENT_EMAIL.',
        details: { operation: context.operation, googleMessage: googleMsg }
      });
    }
    if (status === 400) {
      throw new StructuredApiError({
        code: 'calendar_bad_request',
        httpStatus: 400,
        message: googleMsg,
        details: {
          operation: context.operation,
          calendarId: context.calendarId,
          reasons
        }
      });
    }
    if (status >= 500) {
      throw new StructuredApiError({
        code: 'calendar_upstream_error',
        httpStatus: 502,
        message: 'Google Calendar temporarily returned an error. Try again shortly.',
        details: {
          operation: context.operation,
          httpStatus: status,
          googleMessage: googleMsg
        }
      });
    }
    if (status === 0) {
      throw new StructuredApiError({
        code: 'calendar_network_error',
        httpStatus: 502,
        message: 'Could not reach Google Calendar. Check network and try again.',
        details: { operation: context.operation, googleMessage: googleMsg }
      });
    }
    throw new StructuredApiError({
      code: 'calendar_request_failed',
      httpStatus: 502,
      message: googleMsg,
      details: {
        operation: context.operation,
        calendarId: context.calendarId,
        httpStatus: status,
        reasons
      }
    });
  }

  console.error('[calendar-service]', context.operation, 'non-HTTP error:', err);

  if (err instanceof Error) {
    throw new StructuredApiError({
      code: 'internal_error',
      httpStatus: 500,
      message: err.message || 'Unexpected error during calendar operation',
      details: { operation: context.operation }
    });
  }

  throw new StructuredApiError({
    code: 'internal_error',
    httpStatus: 500,
    message: 'Unknown error during calendar operation',
    details: { operation: context.operation }
  });
}
