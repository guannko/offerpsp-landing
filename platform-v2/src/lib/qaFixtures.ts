import type { Lead, Provider, RouteCoverage } from "../types/offerpsp";

export const QA_GOLDEN_MERCHANT_ID = "ad724d57-e894-4d16-b7b0-948165aef4bf";
export const QA_GOLDEN_PROVIDER_ID = "6e531900-901c-4d5d-8887-0679db9b335d";
export const QA_PAYSISKI_MERCHANT_ID = "60e61542-7070-43ef-937b-7f919e9abdb0";
export const QA_PAYOK_E2E_PROVIDER_ID = "1e584fde-67d7-42d1-be52-83c014218c09";

const QA_FIXTURE_LEAD_IDS = new Set([QA_GOLDEN_MERCHANT_ID, QA_PAYSISKI_MERCHANT_ID]);
const QA_FIXTURE_PROVIDER_IDS = new Set([QA_GOLDEN_PROVIDER_ID, QA_PAYOK_E2E_PROVIDER_ID]);
const QA_FIXTURE_MARKERS = [
  "paysiski",
  "winpiski",
  "payok e2e test 20260826",
  "autopilot e2e",
  "autopilot test",
  "screening canary",
  "bix instant intake e2e",
  "workspace-role-e2e",
  "portal regression",
];

export const isQaAttributionMarker = (...values: Array<string | null | undefined>) => {
  const haystack = values.filter(Boolean).join(" ").toLowerCase();
  return haystack.includes(".invalid") || QA_FIXTURE_MARKERS.some((marker) => haystack.includes(marker));
};

export const isQaFixtureLeadId = (leadId?: string | null) => Boolean(leadId && QA_FIXTURE_LEAD_IDS.has(leadId));
export const isQaFixtureProviderId = (providerId?: string | null) => Boolean(providerId && QA_FIXTURE_PROVIDER_IDS.has(providerId));

export const isQaFixtureLead = (lead: Pick<Lead,
  "lead_id" | "company" | "name" | "work_email" | "company_url" | "source_category" |
  "source_platform" | "source_referrer" | "utm_source" | "utm_campaign" | "details"
>) => (
  isQaFixtureLeadId(lead.lead_id)
  || isQaAttributionMarker(
    lead.company,
    lead.name,
    lead.work_email,
    lead.company_url,
    lead.source_category,
    lead.source_platform,
    lead.source_referrer,
    lead.utm_source,
    lead.utm_campaign,
    lead.details,
  )
);
export const isQaFixtureProvider = (provider: Pick<Provider, "id" | "brand_name" | "legal_name" | "internal_code" | "website">) => (
  isQaFixtureProviderId(provider.id)
  || isQaAttributionMarker(provider.brand_name, provider.legal_name, provider.internal_code, provider.website)
);

export const isQaFixtureEntitySummary = (entity: {
  entity_type: "organization" | "provider";
  id: string;
  name?: string | null;
  legal_name?: string | null;
  internal_code?: string | null;
  website?: string | null;
}) => (
  entity.entity_type === "provider"
    ? isQaFixtureProviderId(entity.id)
    : isQaFixtureLeadId(entity.id)
) || isQaAttributionMarker(entity.name, entity.legal_name, entity.internal_code, entity.website);
export const isQaFixtureRoute = (route: Pick<RouteCoverage, "provider_id" | "provider_name" | "provider_code" | "client_title">) => (
  isQaFixtureProviderId(route.provider_id)
  || isQaAttributionMarker(route.provider_name, route.provider_code, route.client_title)
);

export const isQaFixtureTask = (task: {
  lead_id?: string | null;
  title?: string | null;
  details?: string | null;
  automation_ref?: string | null;
  metadata?: Record<string, unknown> | null;
}) => (
  isQaFixtureLeadId(task.lead_id)
  || task.metadata?.qa_fixture_suppressed === true
  || isQaAttributionMarker(task.title, task.details, task.automation_ref)
);

export const isQaFixturePath = (path?: string | null) => {
  if (!path) return false;
  return [...QA_FIXTURE_LEAD_IDS].some((id) => path.startsWith(`/merchants/${id}`))
    || [...QA_FIXTURE_PROVIDER_IDS].some((id) => path.startsWith(`/psps/${id}`));
};
