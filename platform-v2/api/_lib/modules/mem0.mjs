import { MemoryClient } from "mem0ai";
import { moduleMode, moduleState, optionalUrl } from "./config.mjs";

const ALLOWED_CATEGORIES = new Set(["decision", "procedure", "preference", "relationship", "verified_fact"]);
const SECRET_PATTERN = /(api[_-]?key|password|secret|token)\s*[:=]|sk-[a-z0-9_-]{16,}/i;

export function getSemanticMemoryConfig() {
  const mode = moduleMode("OFFERPSP_SEMANTIC_MEMORY_MODE");
  const apiKey = String(process.env.MEM0_API_KEY || "").trim();
  const host = optionalUrl("MEM0_HOST");
  const profile = String(process.env.MEM0_PROFILE || "BIXOFFPSP").trim();
  return {
    mode,
    apiKey,
    host,
    profile,
    state: moduleState({ name: "mem0", mode, configured: Boolean(apiKey), detail: profile }),
  };
}

export function createSemanticMemoryClient(config = getSemanticMemoryConfig()) {
  if (!config.state.enabled) throw new Error("Mem0 is disabled or unconfigured");
  return new MemoryClient({ apiKey: config.apiKey, ...(config.host ? { host: config.host } : {}) });
}

export async function probeSemanticMemory(config = getSemanticMemoryConfig(), client = null) {
  if (!config.state.enabled) return { ...config.state, healthy: false, reason: "disabled_or_unconfigured" };
  await (client || createSemanticMemoryClient(config)).ping();
  return { ...config.state, healthy: true, status: "available" };
}

export function validateMemoryCandidate(candidate) {
  const content = String(candidate?.content || "").trim();
  const category = String(candidate?.category || "").trim();
  if (!candidate?.verified) throw new Error("Semantic memory accepts verified facts only");
  if (!ALLOWED_CATEGORIES.has(category)) throw new Error("Unsupported semantic memory category");
  if (content.length < 3 || content.length > 1_200) throw new Error("Semantic memory content must be 3-1200 characters");
  if (SECRET_PATTERN.test(content)) throw new Error("Possible secret detected; memory write blocked");
  return { content, category };
}

export async function searchSemanticMemory(query, options = {}, config = getSemanticMemoryConfig(), client = null) {
  const term = String(query || "").trim();
  if (term.length < 2) return [];
  const response = await (client || createSemanticMemoryClient(config)).search(term, {
    filters: { user_id: config.profile },
    topK: Math.min(Math.max(Number(options.limit || 8), 1), 20),
  });
  return response?.results || response || [];
}

export async function rememberSemanticCandidate(candidate, config = getSemanticMemoryConfig(), client = null) {
  const value = validateMemoryCandidate(candidate);
  if (config.mode === "shadow") {
    return { stored: false, shadow: true, candidate: value };
  }
  if (config.mode !== "active") throw new Error("Semantic memory writes are disabled");
  const response = await (client || createSemanticMemoryClient(config)).add(
    [{ role: "user", content: value.content }],
    {
      userId: config.profile,
      metadata: {
        category: value.category,
        source: String(candidate.source || "captains_bridge"),
        verified_at: new Date().toISOString(),
      },
    },
  );
  return { stored: true, shadow: false, response };
}
