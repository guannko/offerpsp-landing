import {
  HttpError,
  requireOfferPspStaff,
  sendError,
  sendJson,
  serviceSupabaseRequest,
  staffSupabaseRequest,
} from "./_lib/staff-auth.mjs";
import { waitUntil } from "@vercel/functions";
import { collectGeoSignals, normalizeSiteOneAudit, publicPageChecksFromEvidence } from "./_lib/siteone-audit.mjs";
import { mcpResourceMetadataHandler, offerPspMcpHandler } from "./_lib/offerpsp-mcp-http.mjs";
import { offerPspActionHandler, offerPspActionsSchemaHandler } from "./_lib/offerpsp-actions.mjs";
import {
  oauthAuthorizeHandler,
  oauthDecisionHandler,
  oauthMetadataHandler,
  oauthRegisterHandler,
  oauthRequestHandler,
  oauthTokenHandler,
} from "./_lib/offerpsp-oauth.mjs";
import { runSiteOneAudit } from "./_lib/siteone-runner.mjs";
import { collectSeoAgentEvidence, runSeoGeoAgent } from "./_lib/seo-geo-agent.mjs";
import { getGoogleSearchConsoleOverview } from "./_lib/google-search-console.mjs";
import { getLiveVercelTraffic } from "./_lib/vercel-web-analytics.mjs";
import {
  buildSeoAuditSourceMatrix,
  collectLiveSeoAuditSources,
  seoAgentExternalEvidence,
} from "./_lib/seo-audit-sources.mjs";
import { probeDocling } from "./_lib/modules/docling.mjs";
import {
  evaluateMerchantRouteRisk,
  getRulesConfig,
  probeRules,
} from "./_lib/modules/gorules.mjs";
import { probeSearch } from "./_lib/modules/meilisearch.mjs";
import { providerOfferSourceHandler } from "./_lib/provider-offer-source.mjs";
import { bixGatewayHealthHandler } from "./_lib/bix-gateway-health.mjs";
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

async function probeVercelWebAnalytics() {
  const traffic = await getLiveVercelTraffic();
  return {
    name: "vercel_web_analytics",
    configured: true,
    enabled: true,
    healthy: true,
    source: traffic.source,
    visitors: traffic.visitors,
    pageviews: traffic.pageviews,
    fetched_at: traffic.fetched_at,
  };
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
  const probedModules = await Promise.all([
    settle("docling", probeDocling),
    settle("gorules", probeRules),
    settle("meilisearch", probeSearch),
    settle("mem0", probeSemanticMemory),
    settle("vercel_web_analytics", probeVercelWebAnalytics),
  ]);
  const modules = probedModules.map((item) => {
    if (item.name === "docling" && !item.enabled) {
      return {
        ...item,
        optional: true,
        substitute_healthy: true,
        substitute: "PDF.js + Mammoth + spreadsheet parser",
        reason: "native_parser_is_primary",
      };
    }
    if (item.name === "mem0" && !item.enabled) {
      return {
        ...item,
        optional: true,
        substitute_healthy: true,
        substitute: "Supabase BIXOFFPSP memory, journal and timeline",
        reason: "supabase_memory_is_primary",
      };
    }
    return item;
  });
  return sendJson(response, 200, {
    checked_at: new Date().toISOString(),
    modules,
    posthog: {
      name: "posthog",
      configured: false,
      enabled: false,
      optional: true,
      substitute_healthy: true,
      substitute: "Supabase operational analytics; public acquisition uses Vercel Web Analytics",
      reason: "product_decision_not_to_track_staff_behaviour",
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

async function seoAudit(request, response, staffContext) {
  if (request.method !== "POST") return sendJson(response, 405, { error: "Method not allowed" });
  const run = await staffSupabaseRequest(staffContext, "rpc/request_offerpsp_seo_audit", {
    method: "POST",
    body: "{}",
  });
  if (!run?.id) throw new HttpError(502, "SEO audit request was not created");
  if (run.reused) {
    return sendJson(response, 202, { accepted: true, reused: true, run_id: run.id, status: run.status });
  }

  waitUntil(executeAuditRun(run.id));
  return sendJson(response, 202, {
    accepted: true,
    reused: false,
    run_id: run.id,
    status: "queued",
  });
}

async function failAuditRun(runId, message) {
  await serviceSupabaseRequest(`offerpsp_seo_audit_runs?id=eq.${encodeURIComponent(runId)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      status: "failed",
      completed_at: new Date().toISOString(),
      error_message: String(message || "SEO audit failed").slice(0, 500),
    }),
  });
}

async function executeAuditRun(runId) {
  await serviceSupabaseRequest(`offerpsp_seo_audit_runs?id=eq.${encodeURIComponent(runId)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ status: "running", started_at: new Date().toISOString(), error_message: null }),
  });

  try {
    const liveSourcesPromise = collectLiveSeoAuditSources();
    const report = await runSiteOneAudit();
    const audit = normalizeSiteOneAudit(report, "https://offerpsp.com/");
    audit.metadata = { ...audit.metadata, geo_signals: await collectGeoSignals() };
    const evidence = await collectSeoAgentEvidence(audit);
    const liveSources = await liveSourcesPromise;
    evidence.external_sources = seoAgentExternalEvidence(liveSources);
    audit.metadata.public_page_checks = publicPageChecksFromEvidence(evidence);
    const affectedFormPages = evidence.pages
      .filter((page) => Number(page?.form_controls?.unlabeled || 0) > 0)
      .map((page) => ({
        url: page.url,
        unlabeled_controls: page.form_controls.unlabeled_controls,
      }));
    audit.metadata.form_label_evidence = {
      verified: true,
      checked_pages: evidence.pages.filter((page) => Number(page?.status) >= 200 && Number(page?.status) < 400).length,
      affected_pages: affectedFormPages,
    };
    try {
      audit.agent_analysis = await runSeoGeoAgent(audit, { evidence });
    } catch (agentError) {
      audit.agent_analysis = {
        status: "failed",
        agent: "OfferPSP SEO/GEO Agent",
        generated_at: new Date().toISOString(),
        error_message: String(agentError?.message || agentError).slice(0, 500),
      };
    }
    audit.metadata.source_matrix = buildSeoAuditSourceMatrix({ audit, liveSources });
    const inserted = await serviceSupabaseRequest("offerpsp_technical_audits", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(audit),
    });
    const auditRow = Array.isArray(inserted) ? inserted[0] : inserted;
    if (!auditRow?.id) throw new Error("Technical audit was not stored");
    await serviceSupabaseRequest(`offerpsp_seo_audit_runs?id=eq.${encodeURIComponent(runId)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        status: "completed",
        completed_at: new Date().toISOString(),
        technical_audit_id: auditRow.id,
        error_message: null,
        metadata: {
          tool: audit.tool,
          tool_version: audit.tool_version,
          agent_status: audit.agent_analysis?.status || "unknown",
          agent_model: audit.agent_analysis?.model || null,
          source_matrix: audit.metadata.source_matrix.summary,
        },
      }),
    });
    return auditRow;
  } catch (error) {
    await failAuditRun(runId, error?.message || error);
    throw error;
  }
}

async function seoAuditScheduled(request, response) {
  if (request.method !== "GET") return sendJson(response, 405, { error: "Method not allowed" });
  const cronSecret = String(process.env.CRON_SECRET || "").trim();
  if (!cronSecret || request.headers.authorization !== `Bearer ${cronSecret}`) {
    throw new HttpError(401, "Invalid cron authorization");
  }
  const rows = await serviceSupabaseRequest("offerpsp_seo_audit_runs", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ status: "running", trigger_source: "schedule", started_at: new Date().toISOString() }),
  });
  const run = Array.isArray(rows) ? rows[0] : rows;
  if (!run?.id) throw new HttpError(502, "Scheduled SEO audit run was not created");
  const audit = await executeAuditRun(run.id);
  return sendJson(response, 201, { run_id: run.id, status: "completed", audit_id: audit.id });
}

async function seoLiveTraffic(request, response) {
  if (request.method !== "GET") return sendJson(response, 405, { error: "Method not allowed" });
  return sendJson(response, 200, await getLiveVercelTraffic());
}

async function googleSearchConsole(request, response) {
  if (request.method !== "GET") return sendJson(response, 405, { error: "Method not allowed" });
  return sendJson(response, 200, await getGoogleSearchConsoleOverview());
}

const handlers = {
  "evaluate-rules": evaluateRules,
  "module-health": moduleHealth,
  "mcp": offerPspMcpHandler,
  "mcp-resource-metadata": mcpResourceMetadataHandler,
  "gpt-actions": offerPspActionHandler,
  "gpt-actions-schema": offerPspActionsSchemaHandler,
  "oauth-metadata": oauthMetadataHandler,
  "oauth-register": oauthRegisterHandler,
  "oauth-authorize": oauthAuthorizeHandler,
  "oauth-token": oauthTokenHandler,
  "oauth-request": oauthRequestHandler,
  "oauth-decision": oauthDecisionHandler,
  "seo-audit": seoAudit,
  "seo-audit-scheduled": seoAuditScheduled,
  "seo-live-traffic": seoLiveTraffic,
  "google-search-console": googleSearchConsole,
  "semantic-memory": semanticMemory,
  "provider-offer-source": providerOfferSourceHandler,
  "bix-gateway-health": bixGatewayHealthHandler,
};

export default async function handler(request, response) {
  try {
    const moduleName = String(request.query?.module || "");
    const moduleHandler = handlers[moduleName];
    if (!moduleHandler) throw new HttpError(404, "Unknown platform module endpoint");
    if (["mcp", "mcp-resource-metadata", "gpt-actions", "gpt-actions-schema", "oauth-metadata", "oauth-register", "oauth-authorize", "oauth-token", "provider-offer-source", "bix-gateway-health"].includes(moduleName)) {
      return await moduleHandler(request, response);
    }
    if (moduleName === "seo-audit-scheduled") {
      return await moduleHandler(request, response);
    }
    const staffContext = await requireOfferPspStaff(request);
    return await moduleHandler(request, response, staffContext);
  } catch (error) {
    return sendError(response, error);
  }
}
