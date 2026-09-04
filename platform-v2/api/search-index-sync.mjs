import { timingSafeEqual } from "node:crypto";
import { HttpError, requireOfferPspStaff, sendError, sendJson, serviceSupabaseRequest } from "./_lib/staff-auth.mjs";
import { getSearchConfig, syncSearchDocuments } from "./_lib/modules/meilisearch.mjs";

const values = (value) => (Array.isArray(value) ? value : []);
const text = (...parts) => parts.flat(Infinity).filter(Boolean).join(" ");
const normalizeName = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
const normalizeDomain = (value) => String(value || "").toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
const regionNamesEn = new Intl.DisplayNames(["en"], { type: "region" });
const regionNamesRu = new Intl.DisplayNames(["ru"], { type: "region" });
const geoAliases = new Map([
  ["EU", ["Europe", "European Union", "Европа", "Евросоюз"]],
  ["CIS", ["Commonwealth of Independent States", "СНГ", "Содружество Независимых Государств"]],
  ["WW", ["Worldwide", "World Wide", "Global", "Весь мир", "Глобальный"]],
  ["WORLDWIDE", ["WW", "World Wide", "Global", "Весь мир", "Глобальный"]],
]);
const cisCountryCodes = new Set(["AM", "AZ", "BY", "KG", "KZ", "MD", "RU", "TJ", "TM", "UZ"]);

function geoSearchTerms(value) {
  return values(value).flatMap((rawValue) => String(rawValue || "").split(/[,;/|]+/)).flatMap((rawValue) => {
    const token = rawValue.trim();
    if (!token) return [];
    const code = token.toUpperCase();
    const aliases = [...(geoAliases.get(code) || [])];
    if (cisCountryCodes.has(code)) {
      aliases.push("CIS", ...(geoAliases.get("CIS") || []));
    }
    if (/^[A-Z]{2}$/.test(code)) {
      aliases.push(regionNamesEn.of(code), regionNamesRu.of(code));
    }
    return [token, ...aliases].filter(Boolean);
  });
}

function merchantDocument(item) {
  return {
    id: `merchant_${item.lead_id}`,
    kind: "merchant",
    label: item.company || item.name || "Без названия",
    meta: `Мерч · ${item.status || "без статуса"}`,
    path: `/merchants/${item.lead_id}`,
    status: item.status || "unknown",
    record_state: item.record_state || "active",
    updated_at: item.updated_at || item.submitted_at || null,
    search_text: text(item.company, item.name, item.work_email, item.telegram, item.company_url, item.vertical, geoSearchTerms(item.geos), geoSearchTerms(item.target_geos), item.requested_currencies, item.methods, item.requested_methods),
  };
}

function providerDocument(item) {
  return {
    id: `provider_${item.id}`,
    kind: "provider",
    label: item.brand_name || item.legal_name || item.internal_code || "PSP",
    meta: `PSP · ${item.relationship_status || "без статуса"}`,
    path: `/psps/${item.id}`,
    status: item.relationship_status || "unknown",
    record_state: item.record_state || "active",
    updated_at: item.updated_at || item.last_verified_at || null,
    search_text: text(item.brand_name, item.legal_name, item.internal_code, item.website),
  };
}

function routeDocument(item) {
  return {
    id: `route_${item.route_id}`,
    kind: "route",
    label: item.client_title || item.route_code || "Оффер",
    meta: `Оффер · ${item.provider_name || item.provider_code || "PSP"}`,
    path: `/psps/${item.provider_id}?route=${item.route_id}`,
    status: item.status || "unknown",
    record_state: item.status === "archived" ? "archived" : "active",
    updated_at: item.updated_at || item.published_at || null,
    search_text: text(item.client_title, item.route_code, item.provider_name, item.provider_code, geoSearchTerms(item.geos), values(item.currencies), values(item.methods)),
  };
}

function casinoDocument(item) {
  return {
    id: `casino_${item.id}`,
    kind: "casino",
    label: item.name || item.website || "Казино",
    meta: `Казино · ${item.contact_status || "без статуса"}`,
    path: `/casinos?entity=${encodeURIComponent(item.id)}`,
    status: item.contact_status || "unknown",
    record_state: item.record_state || "active",
    updated_at: item.updated_at || item.created_at || null,
    search_text: text(item.name, item.website, geoSearchTerms(item.geo), item.city, item.license, item.sphere, item.email, item.telegram, item.contact_name, values(item.tags)),
  };
}

function researchProviderDocument(item) {
  return {
    id: `research_provider_${item.id}`,
    kind: "provider",
    label: item.name || item.website || "PSP",
    meta: `PSP · ${item.provider_status || item.contact_status || "research"}`,
    path: `/psps?research=${encodeURIComponent(item.id)}`,
    status: item.provider_status || item.contact_status || "research",
    record_state: item.record_state || "active",
    updated_at: item.updated_at || item.created_at || null,
    search_text: text(item.name, item.website, geoSearchTerms(item.geo), item.cluster, item.specialization, item.methods, item.email, item.telegram, geoSearchTerms(item.supported_countries), values(item.supported_currencies), values(item.payment_methods)),
  };
}

function agentDocument(item) {
  return {
    id: `agent_${item.id}`,
    kind: "agent",
    label: item.name || "Субагент",
    meta: `Субагент · ${item.status || "без статуса"}`,
    path: `/agents/${item.id}`,
    status: item.status || "unknown",
    record_state: item.status === "archived" ? "archived" : "active",
    updated_at: item.updated_at || item.created_at || null,
    search_text: text(item.name, item.legal_name, item.website, item.email, item.telegram, item.notes),
  };
}

export function buildSearchDocuments({ leads, management, coverage, captainsBridge }) {
  const operationalProviders = values(management?.providers);
  const linkedResearchIds = new Set(operationalProviders.map((item) => item.legacy_psp_id).filter((value) => Number.isFinite(Number(value))).map(Number));
  const operationalIdentities = new Set(operationalProviders.flatMap((item) => [
    normalizeName(item.brand_name) ? `name:${normalizeName(item.brand_name)}` : "",
    normalizeDomain(item.website) ? `domain:${normalizeDomain(item.website)}` : "",
  ]).filter(Boolean));
  const researchProviders = values(captainsBridge?.psp_providers).filter((item) => {
    if (linkedResearchIds.has(Number(item.id))) return false;
    return ![
      normalizeName(item.name) ? `name:${normalizeName(item.name)}` : "",
      normalizeDomain(item.website) ? `domain:${normalizeDomain(item.website)}` : "",
    ].some((identity) => identity && operationalIdentities.has(identity));
  });

  return [
    ...values(leads).map(merchantDocument),
    ...operationalProviders.map(providerDocument),
    ...researchProviders.map(researchProviderDocument),
    ...values(captainsBridge?.casino_leads).map(casinoDocument),
    ...values(management?.organizations).filter((item) => item.organization_type === "agent").map(agentDocument),
    ...values(coverage?.routes).map(routeDocument),
  ];
}

function hasCronAccess(request) {
  const expected = String(process.env.CRON_SECRET || "");
  const received = String(request.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!expected || !received) return false;
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);
  return expectedBuffer.length === receivedBuffer.length && timingSafeEqual(expectedBuffer, receivedBuffer);
}

async function authorize(request) {
  if (request.method === "POST") return requireOfferPspStaff(request);
  if (request.method === "GET" && hasCronAccess(request)) return null;
  if (request.method !== "GET") throw new HttpError(405, "Method not allowed");
  throw new HttpError(401, "Invalid cron authorization");
}

export default async function handler(request, response) {
  try {
    await authorize(request);
    const config = getSearchConfig();
    if (!config.state.enabled) return sendJson(response, 503, { error: "Search module is disabled or unconfigured" });

    const snapshot = await serviceSupabaseRequest("rpc/get_offerpsp_search_index_snapshot", {
      method: "POST",
      body: "{}",
    });
    const leads = snapshot?.leads;
    const management = snapshot?.management;
    const coverage = snapshot?.coverage;
    const captainsBridge = snapshot?.captains_bridge;

    const documents = buildSearchDocuments({ leads, management, coverage, captainsBridge });
    const task = await syncSearchDocuments(documents, config);
    return sendJson(response, 200, {
      source: "supabase",
      index: config.index,
      document_count: documents.length,
      counts: documents.reduce((accumulator, item) => ({
        ...accumulator,
        [item.kind]: Number(accumulator[item.kind] || 0) + 1,
      }), {}),
      task_uid: task?.taskUid ?? null,
      strategy: task?.strategy || "unknown",
    });
  } catch (error) {
    return sendError(response, error);
  }
}
