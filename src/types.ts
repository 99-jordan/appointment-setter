export type YesNoMaybe = 'Yes' | 'No' | 'Maybe';

export interface CompanyRow {
  company_id: string;
  company_name: string;
  brand_name: string;
  phone_number: string;
  emergency_hours_text: string;
  standard_hours_text: string;
  service_area_text: string;
  booking_link: string;
  payment_methods: string;
  emergency_callout_fee_text: string;
  estimate_policy: string;
  warranty_policy: string;
  gas_policy_text: string;
  safety_disclaimer: string;
  /** Optional dental / clinic columns (present when added to the Company tab header row). */
  consultation_fee_text?: string;
  deposit_policy_text?: string;
  cancellation_policy?: string;
  finance_wording?: string;
  guarantee_aftercare_text?: string;
  medical_emergency_policy_text?: string;
}

export interface ServiceAreaRow {
  company_id: string;
  area_id: string;
  area_name: string;
  postcode_prefixes: string;
  emergency_coverage: YesNoMaybe;
  standard_coverage: YesNoMaybe;
  notes: string;
}

export interface ServiceRow {
  company_id: string;
  service_id: string;
  service_name: string;
  category: string;
  emergency_eligible: YesNoMaybe;
  common_customer_words: string;
  what_it_means: string;
  default_priority: string;
  default_next_step: string;
  /** Optional columns from the Services tab (header-defined). */
  indicative_price?: string;
  procedure_summary?: string;
  timeline_text?: string;
  encourage_consultation?: string;
}

export interface RuleRow {
  company_id: string;
  rule_id: string;
  scenario: string;
  trigger_keywords: string;
  priority: string;
  emergency_flag: 'Yes' | 'No';
  immediate_instruction: string;
  agent_action: string;
  transfer_now: 'Yes' | 'No';
  sms_template_id: string;
}

export interface IntakeFlowRow {
  company_id: string;
  step_no: string | number;
  field_key: string;
  ask_text: string;
  ask_when: string;
  required: 'Yes' | 'No';
  example_answer: string;
  notes: string;
}

export interface FaqRow {
  company_id: string;
  faq_id: string;
  topic: string;
  customer_question: string;
  approved_answer: string;
  escalate_if_needed: 'Yes' | 'No';
}

export interface SmsRow {
  company_id: string;
  template_id: string;
  use_case: string;
  template_text: string;
}

export interface CallLogRow {
  timestamp: string;
  company_id: string;
  call_id: string;
  intent: string;
  priority: string;
  emergency_flag: string;
  name: string;
  phone: string;
  postcode: string;
  issue_summary: string;
  action_taken: string;
  sms_sent: string;
  escalated_to: string;
  status: string;
}

/** Optional tab: one row per company for generic appointment / lead agent context. */
export interface ServiceContextRow {
  company_id: string;
  service_categories: string;
  service_types: string;
  appointment_policies: string;
  consultation_rules: string;
  cancellation_policy: string;
  same_day_appointments: string;
  estimates_offered: string;
  site_visits_offered: string;
  coverage_notes: string;
}

export interface SheetData {
  company: CompanyRow[];
  serviceAreas: ServiceAreaRow[];
  services: ServiceRow[];
  emergencyRules: RuleRow[];
  intakeFlow: IntakeFlowRow[];
  faqs: FaqRow[];
  sms: SmsRow[];
  serviceContext: ServiceContextRow[];
}
