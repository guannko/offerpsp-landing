import { HttpError, requireOfferPspStaff, sendError, sendJson } from "./_lib/staff-auth.mjs";
import { getSearchConfig, searchOfferPsp } from "./_lib/modules/meilisearch.mjs";

export default async function handler(request, response) {
  if (request.method !== "GET") return sendJson(response, 405, { error: "Method not allowed" });
  try {
    await requireOfferPspStaff(request);
    const query = String(request.query?.q || "").trim();
    if (query.length < 2 || query.length > 120) throw new HttpError(400, "Query must be 2-120 characters");
    const config = getSearchConfig();
    if (!config.state.enabled) {
      return sendJson(response, 200, { source: "local_fallback", results: [] });
    }
    const results = await searchOfferPsp(query, { limit: request.query?.limit }, config);
    return sendJson(response, 200, { source: "meilisearch", results });
  } catch (error) {
    return sendError(response, error);
  }
}
