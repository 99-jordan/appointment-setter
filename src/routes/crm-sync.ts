/**
 * CRM sync orchestration (no Next/Express). Called from api-handlers.
 */
import type { HubspotAssociationIds } from '../crm/hubspot.js';
import {
  associateNoteToContact,
  associateNoteToTicket,
  associateTaskToContact,
  associateTaskToTicket,
  associateTicketToContact,
  createCallbackTask,
  createNote,
  createTicket,
  upsertContact
} from '../crm/hubspot.js';
import type { EmergencyCallPayload, HubspotEmergencySyncResult } from '../crm/hubspot-types.js';
import { HubspotNotConfiguredError } from '../crm/crm-errors.js';

function envTrim(name: string): string | undefined {
  const v = process.env[name];
  if (v === undefined || v === '') return undefined;
  return v.trim();
}

function envInt(name: string, fallback: number): number {
  const v = envTrim(name);
  if (!v) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function truthyEnv(name: string): boolean {
  const v = envTrim(name)?.toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

export type HubspotRuntimeConfig = {
  token: string;
  pipeline: string;
  stageOpen: string;
  stageClosed?: string;
  ownerId?: string;
  createTasks: boolean;
  assoc: HubspotAssociationIds;
};

export function loadHubspotRuntimeConfig(): HubspotRuntimeConfig {
  const missing: string[] = [];
  const token = envTrim('HUBSPOT_ACCESS_TOKEN');
  const pipeline = envTrim('HUBSPOT_DEFAULT_TICKET_PIPELINE');
  const stageOpen = envTrim('HUBSPOT_DEFAULT_TICKET_STAGE_OPEN');
  if (!token) missing.push('HUBSPOT_ACCESS_TOKEN');
  if (!pipeline) missing.push('HUBSPOT_DEFAULT_TICKET_PIPELINE');
  if (!stageOpen) missing.push('HUBSPOT_DEFAULT_TICKET_STAGE_OPEN');
  if (missing.length) {
    throw new HubspotNotConfiguredError(missing);
  }

  const t = token!;
  const pl = pipeline!;
  const st = stageOpen!;

  const assoc: HubspotAssociationIds = {
    ticketToContact: envInt('HUBSPOT_ASSOC_TICKET_CONTACT_TYPE_ID', 16),
    noteToContact: envInt('HUBSPOT_ASSOC_NOTE_CONTACT_TYPE_ID', 190),
    noteToTicket: envInt('HUBSPOT_ASSOC_NOTE_TICKET_TYPE_ID', 228),
    taskToContact: envInt('HUBSPOT_ASSOC_TASK_CONTACT_TYPE_ID', 204),
    taskToTicket: envInt('HUBSPOT_ASSOC_TASK_TICKET_TYPE_ID', 216)
  };

  return {
    token: t,
    pipeline: pl,
    stageOpen: st,
    stageClosed: envTrim('HUBSPOT_DEFAULT_TICKET_STAGE_CLOSED'),
    ownerId: envTrim('HUBSPOT_CALLBACK_TASK_OWNER_ID'),
    createTasks: truthyEnv('HUBSPOT_CREATE_TASKS'),
    assoc
  };
}

function mapTicketPriority(priority: EmergencyCallPayload['priority']): 'LOW' | 'MEDIUM' | 'HIGH' {
  switch (priority) {
    case 'P1':
    case 'P2':
      return 'HIGH';
    case 'P3':
      return 'MEDIUM';
    case 'P4':
    case 'Redirect':
    default:
      return 'LOW';
  }
}

function resolvePipelineStage(cfg: HubspotRuntimeConfig, status: string | undefined): string {
  const s = (status ?? 'open').trim().toLowerCase();
  if (s === 'closed' && cfg.stageClosed) {
    return cfg.stageClosed;
  }
  return cfg.stageOpen;
}

function buildNoteBody(p: EmergencyCallPayload): string {
  const lines = [
    `Call ID: ${p.callId}`,
    `Company ID: ${p.companyId}`,
    `Issue summary: ${p.issueSummary}`,
    `Priority: ${p.priority ?? 'n/a'}`,
    `Address: ${p.address ?? 'n/a'}`,
    `Postcode: ${p.postcode ?? 'n/a'}`,
    `Emergency flag: ${p.emergencyFlag ?? 'n/a'}`,
    `Escalated to: ${p.escalatedTo ?? 'n/a'}`,
    `SMS sent: ${p.smsSent ?? 'n/a'}`,
    `Recommended action / action taken: ${p.actionTaken ?? 'n/a'}`,
    `Status: ${p.status ?? 'n/a'}`
  ];
  return lines.join('\n');
}

function ticketSubject(p: EmergencyCallPayload): string {
  const base = p.issueSummary.trim().slice(0, 100);
  return `${base}${base.length >= 100 ? '…' : ''} [${p.callId}]`;
}

export async function runHubspotEmergencyCallSync(
  payload: EmergencyCallPayload
): Promise<HubspotEmergencySyncResult> {
  const cfg = loadHubspotRuntimeConfig();

  const { id: contactId } = await upsertContact(
    cfg.token,
    payload.name,
    payload.phone,
    payload.address,
    payload.postcode
  );

  const stage = resolvePipelineStage(cfg, payload.status);
  const ticket = await createTicket(cfg.token, {
    subject: ticketSubject(payload),
    hs_pipeline: cfg.pipeline,
    hs_pipeline_stage: stage,
    hs_ticket_priority: mapTicketPriority(payload.priority)
  });
  const ticketId = ticket.id;

  await associateTicketToContact(cfg.token, ticketId, contactId, cfg.assoc);

  const now = Date.now();
  const note = await createNote(cfg.token, {
    hs_timestamp: String(now),
    hs_note_body: buildNoteBody(payload)
  });
  const noteId = note.id;

  await associateNoteToContact(cfg.token, noteId, contactId, cfg.assoc);
  await associateNoteToTicket(cfg.token, noteId, ticketId, cfg.assoc);

  let taskId: string | null = null;
  const wantsCallback = (payload.status ?? '').trim().toLowerCase() === 'callback_pending';
  if (cfg.createTasks && wantsCallback) {
    const due = now + 24 * 60 * 60 * 1000;
    const task = await createCallbackTask(cfg.token, {
      hs_task_subject: `Callback: ${payload.callId}`,
      hs_task_body: `Plumbing callback pending.\nCaller: ${payload.name ?? 'unknown'}\nPhone: ${payload.phone ?? 'n/a'}\nIssue: ${payload.issueSummary}`,
      hs_timestamp: String(due),
      hubspot_owner_id: cfg.ownerId
    });
    taskId = task.id;
    await associateTaskToContact(cfg.token, taskId, contactId, cfg.assoc);
    await associateTaskToTicket(cfg.token, taskId, ticketId, cfg.assoc);
  }

  return {
    ok: true,
    contactId,
    ticketId,
    noteId,
    taskId
  };
}
