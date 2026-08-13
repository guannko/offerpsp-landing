import { HttpError, requireOfferPspStaff, sendError, sendJson } from "./_lib/staff-auth.mjs";
import {
  getSemanticMemoryConfig,
  rememberSemanticCandidate,
  searchSemanticMemory,
} from "./_lib/modules/mem0.mjs";

export default async function handler(request, response) {
  if (request.method !== "POST") return sendJson(response, 405, { error: "Method not allowed" });
  try {
    await requireOfferPspStaff(request);
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
  } catch (error) {
    return sendError(response, error);
  }
}
