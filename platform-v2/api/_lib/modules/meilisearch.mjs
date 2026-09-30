import { Meilisearch } from "meilisearch";
import { randomUUID } from "node:crypto";
import { moduleMode, moduleState, optionalUrl } from "./config.mjs";

export function getSearchConfig() {
  const mode = moduleMode("OFFERPSP_SEARCH_MODE");
  const host = optionalUrl("MEILISEARCH_HOST");
  const apiKey = String(process.env.MEILISEARCH_API_KEY || "").trim();
  const index = String(process.env.MEILISEARCH_INDEX || "offerpsp_entities_v1").trim();
  return {
    mode,
    host,
    apiKey,
    index,
    state: moduleState({ name: "meilisearch", mode, configured: Boolean(host && apiKey), detail: index }),
  };
}

export function createSearchClient(config = getSearchConfig()) {
  if (!config.state.enabled) throw new Error("Meilisearch is disabled or unconfigured");
  return new Meilisearch({ host: config.host, apiKey: config.apiKey, timeout: 8_000 });
}

export async function probeSearch(config = getSearchConfig(), client = null) {
  if (!config.state.enabled) return { ...config.state, healthy: false, reason: "disabled_or_unconfigured" };
  const info = await (client || createSearchClient(config)).health();
  return { ...config.state, healthy: info?.status === "available", status: info?.status || "unknown" };
}

export async function searchOfferPsp(query, options = {}, config = getSearchConfig(), client = null) {
  const term = String(query || "").trim();
  if (term.length < 2) return [];
  const index = (client || createSearchClient(config)).index(config.index);
  const result = await index.search(term, {
    limit: Math.min(Math.max(Number(options.limit || 12), 1), 30),
    attributesToHighlight: [],
    attributesToCrop: [],
    filter: options.filter,
  });
  return result.hits || [];
}

async function waitForSuccess(client, task) {
  const result = await client.tasks.waitForTask(task, { timeout: 30_000 });
  if (result?.status === "failed" || result?.status === "canceled") {
    throw new Error(result?.error?.message || `Meilisearch task ${task.taskUid} ${result.status}`);
  }
  return result;
}

export async function syncSearchDocuments(documents, config = getSearchConfig(), client = null) {
  if (!Array.isArray(documents)) throw new Error("Search documents must be an array");
  const searchClient = client || createSearchClient(config);
  const stagingUid = `${config.index}__staging_${randomUUID().replaceAll("-", "")}`;

  try {
    const creation = await searchClient.createIndex(stagingUid, { primaryKey: "id" });
    await waitForSuccess(searchClient, creation);
    const staging = searchClient.index(stagingUid);
    const settings = await staging.updateSettings({
      searchableAttributes: ["label", "search_text", "meta"],
      filterableAttributes: ["kind", "status", "record_state"],
      sortableAttributes: ["updated_at"],
      displayedAttributes: ["id", "kind", "label", "meta", "path", "status", "record_state", "updated_at"],
    });
    await waitForSuccess(searchClient, settings);

    if (documents.length) {
      const addition = await staging.addDocuments(documents, { primaryKey: "id" });
      await waitForSuccess(searchClient, addition);
    }

    try {
      await searchClient.getIndex(config.index);
    } catch {
      const targetCreation = await searchClient.createIndex(config.index, { primaryKey: "id" });
      await waitForSuccess(searchClient, targetCreation);
    }

    const swap = await searchClient.swapIndexes([{ indexes: [config.index, stagingUid] }]);
    await waitForSuccess(searchClient, swap);
    const cleanup = await searchClient.deleteIndex(stagingUid);
    await waitForSuccess(searchClient, cleanup);

    return {
      taskUid: swap.taskUid,
      documentCount: documents.length,
      strategy: "atomic_swap",
    };
  } catch (error) {
    await searchClient.deleteIndexIfExists(stagingUid).catch(() => false);
    throw error;
  }
}
