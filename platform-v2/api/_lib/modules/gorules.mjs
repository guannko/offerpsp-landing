import { readFile } from "node:fs/promises";
import { ZenEngine } from "@gorules/zen-engine";
import { moduleMode, moduleState } from "./config.mjs";

const defaultPolicyUrl = new URL("../../../rules/merchant-route-risk-v1.jdm.json", import.meta.url);

export function getRulesConfig() {
  const mode = moduleMode("OFFERPSP_RULES_MODE", "shadow");
  return {
    mode,
    state: moduleState({ name: "gorules", mode, configured: true, detail: "merchant-route-risk-v1" }),
  };
}

export async function createRulesEngine(policyUrl = defaultPolicyUrl) {
  const content = await readFile(policyUrl);
  return new ZenEngine({
    loader: async (key) => (key === "merchant-route-risk-v1" ? content : null),
  });
}

export async function evaluateMerchantRouteRisk(context, engine = null) {
  const runner = engine || (await createRulesEngine());
  const result = await runner.evaluate("merchant-route-risk-v1", {
    merchant: { risk_category: String(context?.merchant?.risk_category || "unknown").toLowerCase() },
    route: { risk_category: String(context?.route?.risk_category || "unknown").toLowerCase() },
  });
  return result?.result || result;
}

export async function probeRules(config = getRulesConfig()) {
  if (config.mode === "off") return { ...config.state, healthy: false, reason: "disabled" };
  const result = await evaluateMerchantRouteRisk({
    merchant: { risk_category: "high" },
    route: { risk_category: "low" },
  });
  return {
    ...config.state,
    healthy: result?.eligible === false && result?.reason === "risk_mismatch",
    sample: result,
  };
}
