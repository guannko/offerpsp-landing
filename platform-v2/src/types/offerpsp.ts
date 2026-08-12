import type { User } from "@supabase/supabase-js";

export type StaffMember = {
  id?: string;
  user_id: string;
  display_name?: string | null;
  role?: string | null;
  active?: boolean;
};

export type Lead = {
  lead_id: string;
  company?: string | null;
  name?: string | null;
  work_email?: string | null;
  telegram?: string | null;
  company_url?: string | null;
  vertical?: string | null;
  risk_segment?: "low" | "high" | "unknown" | null;
  risk_segment_source?: "auto" | "staff" | null;
  status?: string | null;
  record_state?: string | null;
  geos?: string | string[] | null;
  methods?: string | string[] | null;
  currencies?: string | string[] | null;
  expected_monthly_volume?: number | null;
  monthly_volume?: string | null;
  assigned_to?: string | null;
  submitted_at?: string | null;
  updated_at?: string | null;
  next_action_at?: string | null;
  quality_score?: number | null;
  quality_grade?: string | null;
  registration_geo?: string | null;
  target_geos?: string[] | null;
  requested_currencies?: string[] | null;
  requested_flows?: string[] | null;
  requested_methods?: string[] | null;
  traffic_types?: string[] | null;
  volume_currency?: string | null;
  min_transaction_amount?: number | null;
  max_transaction_amount?: number | null;
  transaction_currency?: string | null;
  business_model?: string | null;
  license_status?: string | null;
  license_jurisdiction?: string | null;
  license_number?: string | null;
  license_evidence_url?: string | null;
  launch_timeline?: string | null;
  current_processing_setup?: string | null;
  qualification_notes?: string | null;
  details?: string | null;
  utm_source?: string | null;
  utm_campaign?: string | null;
  merchant_organization_id?: string | null;
  agent_organization_id?: string | null;
};

export type CasinoLead = {
  id: number; internal_id?: string | null; name?: string | null; website?: string | null;
  description?: string | null;
  geo?: string | null; license?: string | null; sphere?: string | null; email?: string | null;
  software?: string | null; affiliate_program?: string | null;
  contact_name?: string | null; contact_title?: string | null; telegram?: string | null;
  phone?: string | null; linkedin?: string | null; city?: string | null;
  contact_status?: string | null; score?: number | null; source?: string | null;
  reply_status?: string | null; next_follow_up?: string | null; tags?: string[] | null;
  notes?: string | null; record_state?: string | null; archived_at?: string | null;
  created_at?: string | null; updated_at?: string | null;
};

export type AgentPspProvider = {
  id: number; name?: string | null; website?: string | null; geo?: string | null;
  cluster?: string | null; specialization?: string | null; methods?: string | null;
  email?: string | null; contact_name?: string | null; phone?: string | null;
  telegram?: string | null; linkedin?: string | null; contact_status?: string | null;
  other_contacts?: string | null; commission_terms?: string | null;
  provider_status?: string | null; risk_appetite?: string | null;
  supported_countries?: string[] | null; supported_currencies?: string[] | null;
  payment_methods?: string[] | null; supported_verticals?: string[] | null;
  restricted_countries?: string[] | null; integration_types?: string[] | null;
  min_monthly_volume?: number | null; max_monthly_volume?: number | null;
  capabilities_source?: string | null; capabilities_verified_at?: string | null;
  notes?: string | null; record_state?: string | null; archived_at?: string | null;
  created_at?: string | null; updated_at?: string | null;
};

export type EmailDraft = {
  id: number; lead_internal_id?: string | null; to_email?: string | null; subject?: string | null;
  body?: string | null; status?: string | null; created_at?: string | null;
};

export type EmailThread = {
  id: string;
  subject: string;
  participant_email: string;
  counterparty_type: "merchant" | "provider" | "casino" | "research_psp" | "subagent" | "general";
  counterparty_id?: string | null;
  lead_id?: string | null;
  status: "open" | "awaiting_reply" | "follow_up" | "closed" | "archived";
  unread_count: number;
  assigned_to?: string | null;
  last_message_at: string;
  tags?: string[];
  created_at?: string;
  updated_at?: string;
};

export type EmailMessage = {
  id: string;
  thread_id: string;
  direction: "inbound" | "outbound";
  sender_email: string;
  recipient_emails: string[];
  cc_emails?: string[];
  subject: string;
  text_body?: string | null;
  html_body?: string | null;
  provider: string;
  delivery_status: string;
  is_read: boolean;
  sent_at?: string | null;
  received_at?: string | null;
  created_at: string;
};

export type EmailAttachment = {
  id: string;
  message_id: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  storage_bucket: string;
  storage_path: string;
  extraction_method?: string | null;
  extraction_error?: string | null;
  has_extracted_text: boolean;
  provider_id?: string | null;
  provider_name?: string | null;
  document_type?: "offer" | "contract" | null;
  document_id?: string | null;
  target_entity_type?: "provider" | "merchant" | null;
  target_entity_id?: string | null;
  target_entity_name?: string | null;
  ingestion_job_id?: string | null;
  status: "stored" | "extracted" | "needs_ocr" | "needs_review" | "queued" | "saved_document" | "failed";
  created_at: string;
};

export type MailCenterSnapshot = {
  metrics: { threads: number; unread: number; awaiting_reply: number; follow_up: number; attachments_to_review?: number };
  threads: EmailThread[];
  messages: EmailMessage[];
  attachments: EmailAttachment[];
};

export type TelegramLog = {
  id: number; chat_id?: string | null; role?: string | null; message?: string | null; created_at?: string | null;
};

export type WorkTask = {
  id: string | number; lead_id?: string | null; title?: string | null; details?: string | null;
  task_type?: string | null; status?: string | null; priority?: string | number | null;
  due_at?: string | null; scheduled_for?: string | null; created_at?: string | null; updated_at?: string | null;
  completed_at?: string | null; assigned_to?: string | null; created_by?: string | null; source?: string | null;
  automation_ref?: string | null; metadata?: Record<string, unknown> | null; payload?: unknown;
  merchant_name?: string | null; assignee_name?: string | null;
};

export type OperationsStaff = {
  user_id: string;
  display_name: string;
  email?: string | null;
  role?: string | null;
};

export type OperationsWorkspaceSnapshot = {
  tasks: WorkTask[];
  aibot_tasks: WorkTask[];
  staff: OperationsStaff[];
  generated_at?: string | null;
};

export type IntegrationSetting = {
  key: "supabase" | "n8n" | "email" | "telegram";
  display_name: string;
  enabled: boolean;
  configuration: Record<string, string | boolean | number | null>;
  last_tested_at?: string | null;
  last_test_status?: "success" | "failed" | null;
  last_error?: string | null;
  updated_at?: string | null;
};

export type TelegramDelivery = {
  id: string;
  chat_id: string;
  message_text: string;
  status: "sent" | "failed";
  external_message_id?: string | null;
  lead_id?: string | null;
  merchant_name?: string | null;
  error_message?: string | null;
  created_at: string;
  sent_at?: string | null;
};

export type CaptainsBridgeSnapshot = {
  casino_leads: CasinoLead[];
  psp_providers: AgentPspProvider[];
  email_drafts: EmailDraft[];
  telegram_log: TelegramLog[];
  bot_tasks: WorkTask[];
  offerpsp_tasks: WorkTask[];
};

export type Provider = {
  id: string;
  internal_code?: string | null;
  brand_name: string;
  legal_name?: string | null;
  website?: string | null;
  relationship_status?: string | null;
  relationship_tier?: string | null;
  strategic_priority?: number | null;
  margin_included_default?: boolean | null;
  last_verified_at?: string | null;
  route_count?: number | null;
  published_route_count?: number | null;
  batch_count?: number | null;
};

export type RouteCoverage = {
  route_id: string;
  provider_id: string;
  provider_name?: string | null;
  provider_code?: string | null;
  route_code?: string | null;
  client_title?: string | null;
  status?: string | null;
  batch_version?: number | null;
  geos?: string[] | null;
  currencies?: string[] | null;
  methods?: string[] | null;
  verticals?: string[] | null;
  risk_segments?: Array<"low" | "high"> | null;
  traffic_types?: string[] | null;
  flow?: string | null;
  is_stale?: boolean | null;
  open_error_count?: number | null;
  open_warning_count?: number | null;
  margin_ready?: boolean | null;
};

export type Organization = {
  id: string;
  internal_code?: string | null;
  organization_type?: "agent" | "merchant" | string | null;
  name: string;
  legal_name?: string | null;
  status?: string | null;
  relationship_tier?: string | null;
  relationship_notes?: string | null;
  member_count?: number | null;
  merchant_count?: number | null;
  updated_at?: string | null;
};

export type AgentAssignment = {
  id: string;
  agent_organization_id: string;
  agent_name?: string | null;
  merchant_organization_id: string;
  merchant_name?: string | null;
  status: string;
  updated_at?: string | null;
};

export type AgentMarginPolicy = {
  id: string;
  agent_organization_id: string;
  merchant_organization_id?: string | null;
  flow: string;
  mode: string;
  percent_value?: number | null;
  fixed_value?: number | null;
  fixed_currency?: string | null;
  notes?: string | null;
  active?: boolean | null;
};

export type OfferIngestionJob = {
  id: string;
  provider_id?: string | null;
  provider_name: string;
  provider_code?: string | null;
  source_type: string;
  source_reference?: string | null;
  source_text: string;
  status: string;
  batch_id?: string | null;
  route_count: number;
  blocking_anomaly_count: number;
  error_message?: string | null;
  received_at: string;
  processed_at?: string | null;
  batch_version?: number | null;
};

export type FreshnessReminder = {
  provider_id: string;
  provider_code?: string | null;
  provider_name: string;
  due_at: string;
  days_overdue: number;
  active_route_count: number;
  stale_route_count: number;
  nearest_expiry?: string | null;
  status: "pending" | "snoozed" | string;
  snoozed_until?: string | null;
  last_notified_at?: string | null;
  notification_count: number;
  contact_name?: string | null;
  contact_channel?: string | null;
  contact_value?: string | null;
  message_ru: string;
  message_en: string;
};

export type ModuleEntitlement = {
  module_key: string;
  name: string;
  description?: string | null;
  minimum_plan: "core" | "pro" | "enterprise";
  version: string;
  enabled: boolean;
  plan?: string | null;
  status?: string | null;
  valid_until?: string | null;
  configuration?: Record<string, unknown>;
};

export type ComplianceCaseSummary = {
  case_id: string;
  lead_id: string;
  company: string;
  contact_name?: string | null;
  work_email?: string | null;
  company_url?: string | null;
  vertical?: string | null;
  geos?: string | null;
  target_geos?: string[] | null;
  lead_status?: string | null;
  assigned_to?: string | null;
  case_status: "pending" | "screening" | "manual_review" | "needs_info" | "cleared" | "hold" | "rejected" | "spam";
  classification: "merchant" | "subagent" | "psp" | "consultant" | "other" | "unknown";
  authenticity_score?: number | null;
  compliance_readiness_score?: number | null;
  commercial_value_score?: number | null;
  completeness_score?: number | null;
  risk_level: "low" | "medium" | "high" | "critical" | "unknown";
  summary?: string | null;
  missing_information?: string[] | null;
  red_flag_count?: number;
  yellow_flag_count?: number;
  last_screened_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type ControlBridgeData = {
  user: User | null;
  staff: StaffMember | null;
  leads: Lead[];
  providers: Provider[];
  routes: RouteCoverage[];
  organizations: Organization[];
  assignments: AgentAssignment[];
  agentMarginPolicies: AgentMarginPolicy[];
  ingestionJobs: OfferIngestionJob[];
  freshnessReminders: FreshnessReminder[];
  moduleEntitlements: ModuleEntitlement[];
  complianceCases: ComplianceCaseSummary[];
  commissionSummary: Record<string, number>;
  captainsBridge: CaptainsBridgeSnapshot;
  mailCenter: MailCenterSnapshot;
  loading: boolean;
  refreshing: boolean;
  ready: boolean;
  accessDenied: boolean;
  error: string | null;
  lastUpdatedAt: Date | null;
};
