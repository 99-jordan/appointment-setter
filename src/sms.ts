import twilio from 'twilio';
import { config } from './config.js';

export function renderSmsTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? '');
}

export function isTwilioConfigured(): boolean {
  return Boolean(config.twilioAccountSid && config.twilioAuthToken && config.twilioFromNumber);
}

export async function sendSmsViaTwilio(to: string, body: string): Promise<{ messageSid: string }> {
  if (!isTwilioConfigured()) {
    throw new Error('SMS provider is not configured');
  }
  const client = twilio(config.twilioAccountSid!, config.twilioAuthToken!);
  const msg = await client.messages.create({
    body,
    from: config.twilioFromNumber!,
    to
  });
  return { messageSid: msg.sid };
}
