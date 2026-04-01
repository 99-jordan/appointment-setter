import { config } from './config.js';

export type EscalationPayload = {
  companyId: string;
  callId: string;
  reason: string;
  priority: string;
  callerPhone: string;
  issueSummary: string;
  name: string;
  timestamp: string;
  postcode?: string;
  address?: string;
};

export async function postEscalationWebhook(payload: EscalationPayload): Promise<{
  ok: boolean;
  status?: number;
  /** First ~600 chars of response body when status is not ok (debug webhook failures). */
  responsePreview?: string;
}> {
  const url = config.escalationWebhookUrl;
  if (!url) {
    return { ok: false };
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  if (config.escalationWebhookSecret) {
    headers['x-escalation-secret'] = config.escalationWebhookSecret;
  }

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });

  let responsePreview: string | undefined;
  if (!res.ok) {
    const text = await res.text();
    responsePreview = text.slice(0, 600);
  }

  return { ok: res.ok, status: res.status, responsePreview };
}
