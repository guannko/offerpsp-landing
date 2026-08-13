import { requireOfferPspStaff, sendError, sendJson } from "./_lib/staff-auth.mjs";
import { probeDocling } from "./_lib/modules/docling.mjs";
import { probeRules } from "./_lib/modules/gorules.mjs";
import { probeSearch } from "./_lib/modules/meilisearch.mjs";
import { probeSemanticMemory } from "./_lib/modules/mem0.mjs";

async function settle(name, probe) {
  try {
    return await probe();
  } catch (error) {
    return { name, healthy: false, error: error.message };
  }
}

export default async function handler(request, response) {
  if (request.method !== "GET") return sendJson(response, 405, { error: "Method not allowed" });
  try {
    await requireOfferPspStaff(request);
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
  } catch (error) {
    return sendError(response, error);
  }
}
