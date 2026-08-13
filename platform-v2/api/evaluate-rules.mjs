import { HttpError, requireOfferPspStaff, sendError, sendJson } from "./_lib/staff-auth.mjs";
import {
  evaluateMerchantRouteRisk,
  getRulesConfig,
} from "./_lib/modules/gorules.mjs";

const RISK_CATEGORIES = new Set(["low", "high", "unknown"]);

function riskCategory(value, label) {
  const category = String(value || "unknown").trim().toLowerCase();
  if (!RISK_CATEGORIES.has(category)) {
    throw new HttpError(400, `${label} risk category must be low, high or unknown`);
  }
  return category;
}

export default async function handler(request, response) {
  if (request.method !== "POST") return sendJson(response, 405, { error: "Method not allowed" });

  try {
    await requireOfferPspStaff(request);
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
  } catch (error) {
    return sendError(response, error);
  }
}
