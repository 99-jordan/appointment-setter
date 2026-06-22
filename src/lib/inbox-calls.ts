import type { CallLogRow } from '../types.js';

export type InboxCall = {
  timestamp: string;
  companyId: string;
  callId: string;
  intent: string;
  priority: string;
  emergencyFlag: string;
  name: string;
  phone: string;
  postcode: string;
  issueSummary: string;
  actionTaken: string;
  smsSent: string;
  escalatedTo: string;
  status: string;
};

export function callLogRowToInboxCall(row: CallLogRow): InboxCall {
  return {
    timestamp: row.timestamp,
    companyId: row.company_id,
    callId: row.call_id,
    intent: row.intent,
    priority: row.priority,
    emergencyFlag: row.emergency_flag,
    name: row.name,
    phone: row.phone,
    postcode: row.postcode,
    issueSummary: row.issue_summary,
    actionTaken: row.action_taken,
    smsSent: row.sms_sent,
    escalatedTo: row.escalated_to,
    status: row.status
  };
}

export function sortCallsNewestFirst(calls: InboxCall[]): InboxCall[] {
  return [...calls].sort((a, b) => {
    const ta = Date.parse(a.timestamp) || 0;
    const tb = Date.parse(b.timestamp) || 0;
    return tb - ta;
  });
}
