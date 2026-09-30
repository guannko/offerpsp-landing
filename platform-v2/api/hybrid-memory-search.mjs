import { HttpError, requireOfferPspStaff, sendError, sendJson } from "./_lib/staff-auth.mjs";
import { getSemanticMemoryConfig, searchSemanticMemory } from "./_lib/modules/mem0.mjs";

function serverConfig() {
  return {
    url: String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").replace(/\/$/, ""),
    key: String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim(),
  };
}

async function searchOperationalMemory(query, chatId, limit) {
  const config = serverConfig();
  if (!config.url || !config.key) {
    return { available: false, reason: "service_role_not_configured", context: null };
  }
  const response = await fetch(`${config.url}/rest/v1/rpc/aibot_n8n_get_agent_context_v1`, {
    method: "POST",
    headers: {
      apikey: config.key,
      authorization: `Bearer ${config.key}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      p_chat_id: chatId,
      p_profile_key: "BIXOFFPSP",
      p_query: query,
      p_history_limit: Math.min(Math.max(limit * 2, 10), 40),
      p_memory_limit: limit,
    }),
    signal: AbortSignal.timeout(8_000),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.message || payload?.error || "Operational memory search failed");
  return { available: true, context: payload };
}

export default async function handler(request, response) {
  if (request.method !== "POST") return sendJson(response, 405, { error: "Method not allowed" });
  try {
    await requireOfferPspStaff(request);
    const query = String(request.body?.query || "").trim();
    if (query.length < 2 || query.length > 300) throw new HttpError(400, "Query must be 2-300 characters");
    const limit = Math.min(Math.max(Number(request.body?.limit || 8), 1), 20);
    const chatId = String(request.body?.chat_id || "captains_bridge").slice(0, 120);
    const semanticConfig = getSemanticMemoryConfig();

    const [operational, semantic] = await Promise.allSettled([
      searchOperationalMemory(query, chatId, limit),
      semanticConfig.state.enabled
        ? searchSemanticMemory(query, { limit }, semanticConfig)
        : Promise.resolve([]),
    ]);

    return sendJson(response, 200, {
      profile: "BIXOFFPSP",
      query,
      operational: operational.status === "fulfilled"
        ? operational.value
        : { available: false, reason: operational.reason?.message || "search_failed", context: null },
      semantic: {
        available: semanticConfig.state.enabled && semantic.status === "fulfilled",
        mode: semanticConfig.mode,
        results: semantic.status === "fulfilled" ? semantic.value : [],
        ...(semantic.status === "rejected" ? { reason: semantic.reason?.message || "search_failed" } : {}),
      },
    });
  } catch (error) {
    return sendError(response, error);
  }
}
