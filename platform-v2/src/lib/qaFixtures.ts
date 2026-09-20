import type { Lead, Provider, RouteCoverage } from "../types/offerpsp";

export const QA_GOLDEN_MERCHANT_ID = "ad724d57-e894-4d16-b7b0-948165aef4bf";
export const QA_GOLDEN_PROVIDER_ID = "6e531900-901c-4d5d-8887-0679db9b335d";
export const QA_PAYSISKI_MERCHANT_ID = "60e61542-7070-43ef-937b-7f919e9abdb0";

const QA_FIXTURE_LEAD_IDS = new Set([QA_GOLDEN_MERCHANT_ID, QA_PAYSISKI_MERCHANT_ID]);
const QA_FIXTURE_PROVIDER_IDS = new Set([QA_GOLDEN_PROVIDER_ID]);
const QA_FIXTURE_MARKERS = ["paysiski", "winpiski"];

const containsQaFixtureMarker = (values: Array<string | null | undefined>) => {
  const haystack = values.filter(Boolean).join(" ").toLowerCase();
  return QA_FIXTURE_MARKERS.some((marker) => haystack.includes(marker));
};

export const isQaFixtureLeadId = (leadId?: string | null) => Boolean(leadId && QA_FIXTURE_LEAD_IDS.has(leadId));
export const isQaFixtureProviderId = (providerId?: string | null) => Boolean(providerId && QA_FIXTURE_PROVIDER_IDS.has(providerId));

export const isQaFixtureLead = (lead: Pick<Lead, "lead_id" | "company" | "name" | "work_email" | "company_url">) => (
  isQaFixtureLeadId(lead.lead_id)
  || containsQaFixtureMarker([lead.company, lead.name, lead.work_email, lead.company_url])
);
export const isQaFixtureProvider = (provider: Pick<Provider, "id" | "brand_name" | "legal_name" | "internal_code" | "website">) => (
  isQaFixtureProviderId(provider.id)
  || containsQaFixtureMarker([provider.brand_name, provider.legal_name, provider.internal_code, provider.website])
);
export const isQaFixtureRoute = (route: Pick<RouteCoverage, "provider_id" | "provider_name" | "provider_code" | "client_title">) => (
  isQaFixtureProviderId(route.provider_id)
  || containsQaFixtureMarker([route.provider_name, route.provider_code, route.client_title])
);

export const isQaFixturePath = (path?: string | null) => {
  if (!path) return false;
  return [...QA_FIXTURE_LEAD_IDS].some((id) => path.startsWith(`/merchants/${id}`))
    || [...QA_FIXTURE_PROVIDER_IDS].some((id) => path.startsWith(`/psps/${id}`));
};
