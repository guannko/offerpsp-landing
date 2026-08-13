import { HttpError, requireOfferPspStaff, sendError, sendJson } from "./_lib/staff-auth.mjs";
import { probeDocling } from "./_lib/modules/docling.mjs";
import {
  evaluateMerchantRouteRisk,
  getRulesConfig,
  probeRules,
} from "./_lib/modules/gorules.mjs";
import { probeSearch } from "./_lib/modules/meilisearch.mjs";
import {
  getSemanticMemoryConfig,
  probeSemanticMemory,
  rememberSemanticCandidate,
  searchSemanticMemory,
} from "./_lib/modules/mem0.mjs";

const RISK_CATEGORIES = new Set(["low", "high", "unknown"]);

function riskCategory(value, label) {
  const category = String(value || "unknown").trim().toLowerCase();
  if (!RISK_CATEGORIES.has(category)) {
    throw new HttpError(400, `${label} risk category must be low, high or unknown`);
  }
  return category;
}

async function settle(name, probe) {
  try {
    return await probe();
  } catch (error) {
    return { name, healthy: false, error: error.message };
  }
}

async function evaluateRules(request, response) {
  if (request.method !== "POST") return sendJson(response, 405, { error: "Method not allowed" });
  const config = getRulesConfig();
  if (!config.state.enabled) throw new HttpError(503, "Rules module is disabled");

  const merchantRisk = riskCategory(request.body?.merchant?.risk_category, "Merchant");
  const routeRisk = riskCategory(request.body?.route?.risk_category, "Route");
  const decision = await evaluateMerchantRouteRisk({
    merchant: { risk_category: merchantRisk },
    route: { risk_category: routeRisk },
  });

  return sendJson(response, 200, {
    mode: config.mode,
    policy: "merchant-route-risk-v1",
    authoritative: false,
    input: { merchant_risk: merchantRisk, route_risk: routeRisk },
    decision,
  });
}

async function moduleHealth(request, response) {
  if (request.method !== "GET") return sendJson(response, 405, { error: "Method not allowed" });
  const modules = await Promise.all([
    settle("docling", probeDocling),
    settle("gorules", probeRules),
    settle("meilisearch", probeSearch),
    settle("mem0", probeSemanticMemory),
  ]);
  return sendJson(response, 200, {
    checked_at: new Date().toISOString(),
    modules,
    posthog: {
      name: "posthog",
      configured: Boolean(process.env.VITE_POSTHOG_KEY && process.env.VITE_POSTHOG_HOST),
      enabled: Boolean(process.env.VITE_POSTHOG_KEY && process.env.VITE_POSTHOG_HOST),
    },
  });
}

async function semanticMemory(request, response) {
  if (request.method !== "POST") return sendJson(response, 405, { error: "Method not allowed" });
  const action = String(request.body?.action || "");
  const config = getSemanticMemoryConfig();
  if (!config.state.enabled) throw new HttpError(503, "Semantic memory is disabled or unconfigured");

  if (action === "search") {
    const results = await searchSemanticMemory(request.body?.query, { limit: request.body?.limit }, config);
    return sendJson(response, 200, { mode: config.mode, profile: config.profile, results });
  }
  if (action === "remember") {
    const result = await rememberSemanticCandidate(request.body?.candidate, config);
    return sendJson(response, 200, { mode: config.mode, profile: config.profile, ...result });
  }
  throw new HttpError(400, "Unsupported semantic memory action");
}

const handlers = {
  "evaluate-rules": evaluateRules,
  "module-health": moduleHealth,
  "semantic-memory": semanticMemory,
};

export default async function handler(request, response) {
  try {
    await requireOfferPspStaff(request);
    const moduleName = String(request.query?.module || "");
    const moduleHandler = handlers[moduleName];
    if (!moduleHandler) throw new HttpError(404, "Unknown platform module endpoint");
    return await moduleHandler(request, response);
  } catch (error) {
    return sendError(response, error);
  }
}
