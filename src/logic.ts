import { z } from 'zod';
import type {
  CompanyRow,
  FaqRow,
  IntakeFlowRow,
  RuleRow,
  ServiceAreaRow,
  ServiceContextRow,
  ServiceRow,
  SheetData,
  SmsRow
} from './types.js';
import { getDefaultCompanyId } from './clinic-default.js';
import { areaMatchesPrefix, scoreKeywordMatch, uniqueBy } from './helpers.js';

function rowStr(row: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (v === undefined || v === null) continue;
    const s = String(v).trim();
    if (s !== '') return s;
  }
  return '';
}

export const rulesApplicableSchema = z.object({
  companyId: z.string().optional(),
  issueSummary: z.string().min(2),
  postcode: z.string().optional().default(''),
  waterActive: z.boolean().optional(),
  electricsRisk: z.boolean().optional(),
  sewageRisk: z.boolean().optional(),
  onlyToiletUnusable: z.boolean().optional(),
  noWater: z.boolean().optional(),
  vulnerablePerson: z.boolean().optional()
});

/** Canonical shape after `normalizeLogCallInput` (agent: phone; legacy: callerPhone). */
export const logCallCanonicalSchema = z.object({
  companyId: z.string().min(1, 'Required'),
  callId: z.string().min(1),
  intent: z.string().default('dental_enquiry'),
  priority: z.string().default('P3'),
  emergencyFlag: z.enum(['Yes', 'No']),
  name: z.string().default(''),
  phone: z.string().default(''),
  postcode: z.string().default(''),
  issueSummary: z.string().min(1, 'Required'),
  actionTaken: z.string().min(1, 'Required'),
  smsSent: z.string().default(''),
  escalatedTo: z.string().default(''),
  status: z.string().min(1, 'Required')
});

/** @deprecated use logCallCanonicalSchema — alias for transition */
export const logCallSchema = logCallCanonicalSchema;

/** Canonical shape after `normalizeSendSmsInput` (agent: phone + messageType; legacy: to + templateId). */
export const sendSmsCanonicalSchema = z.object({
  companyId: z.string().min(1),
  callId: z.string().min(1),
  to: z.string().min(5, 'Required (phone or to)'),
  templateId: z.string().min(1, 'Required (templateId or messageType)'),
  name: z.string().default(''),
  issueSummary: z.string().default(''),
  postcode: z.string().default(''),
  bookingLink: z.string().default(''),
  messageText: z.string().default('')
});

/** @deprecated use sendSmsCanonicalSchema */
export const sendSmsSchema = sendSmsCanonicalSchema;

/** Canonical shape after `normalizeEscalateHumanInput` (agent: phone; legacy: callerPhone). */
export const escalateHumanCanonicalSchema = z.object({
  companyId: z.string().min(1, 'Required'),
  callId: z.string().min(1),
  name: z.string().min(1, 'Required'),
  callerPhone: z.string().min(5, 'Required (phone or callerPhone)'),
  postcode: z.string().optional(),
  address: z.string().min(1, 'Required for emergency escalation'),
  issueSummary: z.string().min(1, 'Required'),
  priority: z.string().min(1),
  reason: z.string().min(1, 'Required')
});

/** @deprecated use escalateHumanCanonicalSchema */
export const escalateHumanSchema = escalateHumanCanonicalSchema;

/** Generic appointment / consultation booking (after `normalizeBookAppointmentInput`). */
export const bookAppointmentCanonicalSchema = z.object({
  companyId: z.string().min(1, 'Required'),
  callId: z.string().min(1),
  name: z.string().default(''),
  phone: z.string().min(5, 'Required (phone)'),
  email: z.string().default(''),
  postcode: z.string().default(''),
  serviceCategory: z.string().default(''),
  serviceType: z.string().default(''),
  preferredDate: z.string().default(''),
  preferredTimeWindow: z.string().default(''),
  notes: z.string().default(''),
  source: z.string().default('voice_agent')
});

/** Service-business call log (after `normalizeLogServiceCallInput`). */
export const logServiceCallCanonicalSchema = z.object({
  companyId: z.string().min(1, 'Required'),
  callId: z.string().min(1),
  intent: z.string().min(1, 'Required'),
  name: z.string().default(''),
  phone: z.string().default(''),
  email: z.string().default(''),
  postcode: z.string().default(''),
  serviceCategory: z.string().default(''),
  serviceType: z.string().default(''),
  preferredDate: z.string().default(''),
  preferredTimeWindow: z.string().default(''),
  notes: z.string().min(1, 'Required'),
  actionTaken: z.string().min(1, 'Required'),
  smsSent: z.string().default(''),
  status: z.string().min(1, 'Required')
});

/** Service SMS (after `normalizeSendServiceSmsInput`). */
export const sendServiceSmsCanonicalSchema = z.object({
  companyId: z.string().min(1),
  callId: z.string().min(1),
  to: z.string().min(5, 'Required (phone or to)'),
  templateId: z.string().min(1, 'Required (templateId or messageType)'),
  name: z.string().default(''),
  issueSummary: z.string().default(''),
  postcode: z.string().default(''),
  bookingLink: z.string().default(''),
  messageText: z.string().default(''),
  serviceCategory: z.string().default(''),
  serviceType: z.string().default(''),
  preferredDate: z.string().default(''),
  preferredTimeWindow: z.string().default(''),
  email: z.string().default('')
});

export const serviceContextQuerySchema = z.object({
  companyId: z.string().optional()
});

export const serviceCrmSyncPayloadSchema = z.object({
  companyId: z.string().min(1),
  callId: z.string().optional(),
  name: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  postcode: z.string().optional(),
  serviceCategory: z.string().optional(),
  serviceType: z.string().optional(),
  preferredDate: z.string().optional(),
  preferredTimeWindow: z.string().optional(),
  notes: z.string().optional(),
  source: z.string().optional(),
  status: z.string().optional()
});

export const serviceCrmSyncEnvelopeSchema = z.object({
  provider: z.literal('hubspot'),
  action: z.literal('appointment_request'),
  payload: serviceCrmSyncPayloadSchema
});

function splitDelimitedList(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function intakeStepOrder(step: string | number): number {
  const n = Number(step);
  return Number.isFinite(n) ? n : 999;
}

function intakeMatchesAskWhen(row: IntakeFlowRow, askWhenFilter: string | undefined): boolean {
  if (!askWhenFilter?.trim()) return true;
  const w = String(row.ask_when || '').trim().toLowerCase();
  if (!w || w === 'always' || w === 'all') return true;
  const f = askWhenFilter.trim().toLowerCase();
  return w === f || w.includes(f);
}

function getCompany(data: SheetData, companyId: string): CompanyRow {
  const company = data.company.find((row) => row.company_id === companyId);
  if (!company) throw new Error(`Company not found: ${companyId}`);
  return company;
}

export function assertCompanyExists(data: SheetData, companyId: string): void {
  getCompany(data, companyId);
}

function getSmsById(data: SheetData, companyId: string, templateId: string): SmsRow | undefined {
  return data.sms.find((row) => row.company_id === companyId && row.template_id === templateId);
}

export function resolveSmsTemplate(data: SheetData, companyId: string, templateId: string): SmsRow {
  const row = getSmsById(data, companyId, templateId);
  if (!row) throw new Error(`SMS template not found: ${templateId}`);
  return row;
}

function detectCoverage(serviceAreas: ServiceAreaRow[], postcode?: string) {
  if (!postcode) {
    return {
      inArea: null,
      areaName: null,
      emergencyCoverage: 'Unknown',
      standardCoverage: 'Unknown'
    };
  }

  const area = serviceAreas.find((row) => areaMatchesPrefix(postcode, row.postcode_prefixes));
  if (!area) {
    return {
      inArea: false,
      areaName: null,
      emergencyCoverage: 'Unknown',
      standardCoverage: 'Unknown'
    };
  }

  return {
    inArea: area.standard_coverage === 'Yes' || area.emergency_coverage === 'Yes',
    areaName: area.area_name,
    emergencyCoverage: area.emergency_coverage,
    standardCoverage: area.standard_coverage,
    notes: area.notes
  };
}

function detectServices(services: ServiceRow[], companyId: string, issueSummary: string): ServiceRow[] {
  const scored = services
    .filter((row) => row.company_id === companyId)
    .map((row) => ({ row, score: scoreKeywordMatch(issueSummary, `${row.service_name}, ${row.common_customer_words}, ${row.what_it_means}`) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((item) => item.row);

  return uniqueBy(scored, (row) => row.service_id).slice(0, 3);
}

function detectRule(data: SheetData, input: z.infer<typeof rulesApplicableSchema>): RuleRow | undefined {
  const base = data.emergencyRules
    .filter((row) => row.company_id === input.companyId)
    .map((row) => ({ row, score: scoreKeywordMatch(input.issueSummary, `${row.scenario}, ${row.trigger_keywords}`) }))
    .sort((a, b) => b.score - a.score);

  const bestKeywordMatch = base.find((item) => item.score > 0)?.row;

  if (input.electricsRisk) {
    return data.emergencyRules.find((row) => row.company_id === input.companyId && row.rule_id === 'R03') ?? bestKeywordMatch;
  }
  if (input.sewageRisk) {
    return data.emergencyRules.find((row) => row.company_id === input.companyId && row.rule_id === 'R04') ?? bestKeywordMatch;
  }
  if (input.onlyToiletUnusable) {
    return data.emergencyRules.find((row) => row.company_id === input.companyId && row.rule_id === 'R06') ?? bestKeywordMatch;
  }
  if (input.noWater) {
    return data.emergencyRules.find((row) => row.company_id === input.companyId && row.rule_id === 'R07') ?? bestKeywordMatch;
  }

  return bestKeywordMatch;
}

function findRelevantFaqs(faqs: FaqRow[], companyId: string, issueSummary: string): FaqRow[] {
  return faqs
    .filter((row) => row.company_id === companyId)
    .map((row) => ({ row, score: scoreKeywordMatch(issueSummary, `${row.topic}, ${row.customer_question}, ${row.approved_answer}`) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((item) => item.row)
    .slice(0, 3);
}

export function buildIntakeFlow(data: SheetData, companyId: string, askWhen?: string) {
  getCompany(data, companyId);
  const steps = data.intakeFlow
    .filter((row) => row.company_id === companyId)
    .filter((row) => intakeMatchesAskWhen(row, askWhen))
    .sort((a, b) => intakeStepOrder(a.step_no) - intakeStepOrder(b.step_no))
    .map((row) => ({
      stepNo: row.step_no,
      fieldKey: row.field_key,
      askText: row.ask_text,
      askWhen: row.ask_when,
      required: row.required,
      exampleAnswer: row.example_answer,
      notes: row.notes
    }));

  return { companyId, askWhen: askWhen ?? null, steps };
}

export function buildCompanyContext(data: SheetData, companyId: string) {
  const company = getCompany(data, companyId);
  const ext = company as unknown as Record<string, unknown>;
  return {
    companyId: company.company_id,
    companyName: company.company_name,
    brandName: company.brand_name,
    phoneNumber: company.phone_number,
    emergencyHours: company.emergency_hours_text,
    standardHours: company.standard_hours_text,
    serviceArea: company.service_area_text,
    bookingLink: company.booking_link,
    paymentMethods: company.payment_methods,
    emergencyCalloutFee: company.emergency_callout_fee_text,
    estimatePolicy: company.estimate_policy,
    warrantyPolicy: company.warranty_policy,
    gasPolicy: company.gas_policy_text,
    safetyDisclaimer: company.safety_disclaimer,
    consultationFeeWording:
      rowStr(ext, 'consultation_fee_text', 'consultation_fee') || company.estimate_policy || '',
    depositPolicyWording: rowStr(ext, 'deposit_policy_text', 'deposit_policy'),
    cancellationPolicyWording: rowStr(ext, 'cancellation_policy_text', 'cancellation_policy'),
    financeWording: rowStr(ext, 'finance_wording', 'finance_policy'),
    guaranteeAftercareWording:
      rowStr(ext, 'guarantee_aftercare_text', 'aftercare_text') || company.warranty_policy || '',
    medicalEmergencyPolicyWording: rowStr(
      ext,
      'medical_emergency_policy_text',
      'medical_emergency_policy'
    )
  };
}

function getServiceContextRow(data: SheetData, companyId: string): ServiceContextRow | undefined {
  return data.serviceContext.find((row) => row.company_id === companyId);
}

/** Merges `Company` sheet row with optional `ServiceContext` tab for generic appointment agents. */
export function buildServiceContext(data: SheetData, companyId: string) {
  const base = buildCompanyContext(data, companyId);
  const row = getServiceContextRow(data, companyId);

  const openingHours = {
    standard: base.standardHours,
    afterHours: base.emergencyHours
  };

  return {
    ...base,
    openingHours,
    appointmentPolicies: row?.appointment_policies?.trim() ?? '',
    serviceCategories: splitDelimitedList(row?.service_categories),
    serviceTypes: splitDelimitedList(row?.service_types),
    coverageArea: row?.coverage_notes?.trim() || base.serviceArea,
    consultationRules: row?.consultation_rules?.trim() ?? '',
    cancellationPolicy: row?.cancellation_policy?.trim() ?? '',
    sameDayAppointmentsAllowed: (row?.same_day_appointments ?? '').trim().toLowerCase() === 'yes',
    estimatesOffered: (row?.estimates_offered ?? '').trim().toLowerCase() === 'yes',
    siteVisitsOffered: (row?.site_visits_offered ?? '').trim().toLowerCase() === 'yes'
  };
}

export function buildServicesSearch(data: SheetData, companyId: string, query: string) {
  return detectServices(data.services, companyId, query).map((service) => {
    const ext = service as unknown as Record<string, unknown>;
    const encourage =
      rowStr(ext, 'encourage_consultation') ||
      (String(service.default_next_step || '')
        .toLowerCase()
        .includes('consult')
        ? 'Yes'
        : '');
    return {
      serviceId: service.service_id,
      serviceName: service.service_name,
      category: service.category,
      emergencyEligible: service.emergency_eligible,
      whatItMeans: service.what_it_means,
      defaultPriority: service.default_priority,
      defaultNextStep: service.default_next_step,
      indicativePriceGuidance: rowStr(ext, 'indicative_price', 'price_guidance', 'from_price'),
      procedureSummary: rowStr(ext, 'procedure_summary', 'treatment_summary'),
      timeline: rowStr(ext, 'timeline_text', 'timeline', 'typical_timeline'),
      encourageConsultation: encourage
    };
  });
}

export function buildRulesApplicable(data: SheetData, rawInput: unknown) {
  const base = rulesApplicableSchema.parse(rawInput);
  const companyId = base.companyId?.trim() || getDefaultCompanyId(data);
  const input = { ...base, companyId };
  const company = getCompany(data, input.companyId);
  const serviceAreas = data.serviceAreas.filter((row) => row.company_id === input.companyId);
  const services = detectServices(data.services, input.companyId, input.issueSummary);
  const rule = detectRule(data, input);
  const coverage = detectCoverage(serviceAreas, input.postcode);
  const faqs = findRelevantFaqs(data.faqs, input.companyId, input.issueSummary);
  const sms = rule ? getSmsById(data, input.companyId, rule.sms_template_id) : undefined;

  let priority = services[0]?.default_priority ?? 'P3';
  let nextStep = services[0]?.default_next_step ?? 'Standard callback';
  let emergency = services[0]?.emergency_eligible === 'Yes';
  let transferNow = false;
  let immediateInstruction = 'Collect the caller details and route to the appropriate next step.';

  if (rule) {
    priority = rule.priority;
    nextStep = rule.agent_action;
    emergency = rule.emergency_flag === 'Yes';
    transferNow = rule.transfer_now === 'Yes';
    immediateInstruction = rule.immediate_instruction;
  }

  if (input.vulnerablePerson && (input.noWater || input.issueSummary.toLowerCase().includes('no hot water'))) {
    priority = priority === 'P3' ? 'P2' : priority;
    emergency = true;
  }

  const gasPolicy = company.gas_policy_text?.trim() ?? '';
  const gasDetected =
    gasPolicy.length > 0 && /gas leak|gas smell|carbon monoxide|co alarm/i.test(input.issueSummary);
  if (gasDetected) {
    priority = 'Redirect';
    nextStep = company.gas_policy_text;
    emergency = true;
    transferNow = false;
    immediateInstruction =
      'Tell the caller to contact the National Gas Emergency Service immediately on 0800 111 999.';
  }

  return {
    companyId: input.companyId,
    issueSummary: input.issueSummary,
    postcode: input.postcode,
    matchedServices: services.map((service) => ({
      serviceId: service.service_id,
      serviceName: service.service_name,
      defaultPriority: service.default_priority,
      defaultNextStep: service.default_next_step
    })),
    priority,
    emergencyFlag: emergency ? 'Yes' : 'No',
    transferNow,
    immediateInstruction,
    recommendedAction: nextStep,
    serviceAreaCheck: coverage,
    smsTemplateId: sms?.template_id ?? '',
    smsTemplateText: sms?.template_text ?? '',
    approvedFaqs: faqs.map((faq) => ({ topic: faq.topic, question: faq.customer_question, answer: faq.approved_answer })),
    safetyDisclaimer: company.safety_disclaimer
  };
}
