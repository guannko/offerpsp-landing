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
  status?: string | null;
  record_state?: string | null;
  geos?: string | string[] | null;
  methods?: string | string[] | null;
  currencies?: string | string[] | null;
  expected_monthly_volume?: number | null;
  monthly_volume?: string | null;
  owner_user_id?: string | null;
  submitted_at?: string | null;
  updated_at?: string | null;
  next_action_at?: string | null;
  quality_score?: number | null;
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

export type ControlBridgeData = {
  user: User | null;
  staff: StaffMember | null;
  leads: Lead[];
  providers: Provider[];
  routes: RouteCoverage[];
  organizations: Organization[];
  assignments: AgentAssignment[];
  agentMarginPolicies: AgentMarginPolicy[];
  commissionSummary: Record<string, number>;
  loading: boolean;
  refreshing: boolean;
  ready: boolean;
  accessDenied: boolean;
  error: string | null;
  lastUpdatedAt: Date | null;
};
