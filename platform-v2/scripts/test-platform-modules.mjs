import assert from "node:assert/strict";
import { decodeBase64File, FileInputError } from "../api/_lib/file-input.mjs";
import { convertWithDocling, probeDocling } from "../api/_lib/modules/docling.mjs";
import { evaluateMerchantRouteRisk, probeRules } from "../api/_lib/modules/gorules.mjs";
import { probeSearch, searchOfferPsp, syncSearchDocuments } from "../api/_lib/modules/meilisearch.mjs";
import { buildSearchDocuments } from "../api/search-index-sync.mjs";
import {
  probeSemanticMemory,
  rememberSemanticCandidate,
  searchSemanticMemory,
  validateMemoryCandidate,
} from "../api/_lib/modules/mem0.mjs";

async function testDocling() {
  let conversionBody = null;
  const fetchImpl = async (url, init = {}) => {
    if (String(url).endsWith("/health")) return new Response("ok", { status: 200 });
    conversionBody = JSON.parse(String(init.body));
    return Response.json({
      status: "success",
      document: { md_content: "# PAYOK\nIndia UPI", json_content: { title: "PAYOK" } },
      errors: [],
    });
  };
  const config = {
    mode: "active",
    url: "https://docling.test",
    apiKey: "test-key",
    timeoutMs: 2_000,
    state: { name: "docling", enabled: true },
    fetchImpl,
  };
  const health = await probeDocling(config);
  assert.equal(health.healthy, true);
  const result = await convertWithDocling({
    filename: "payok.pdf",
    buffer: Buffer.from("fake-pdf"),
    mimeType: "application/pdf",
  }, config);
  assert.match(result.text, /PAYOK/);
  assert.equal(conversionBody.file_sources[0].filename, "payok.pdf");
  assert.equal(conversionBody.do_ocr, true);
  assert.equal(Buffer.from(conversionBody.file_sources[0].base64_string, "base64").toString(), "fake-pdf");
}

function testFileInput() {
  assert.equal(decodeBase64File(Buffer.from("PAYOK").toString("base64")).toString(), "PAYOK");
  assert.equal(decodeBase64File("data:text/plain;base64,UEFZT0s=").toString(), "PAYOK");
  assert.throws(() => decodeBase64File("not-valid-***"), FileInputError);
  assert.throws(() => decodeBase64File("A"), /invalid_base64/);
}

async function testRules() {
  const mismatch = await evaluateMerchantRouteRisk({
    merchant: { risk_category: "high" },
    route: { risk_category: "low" },
  });
  const exact = await evaluateMerchantRouteRisk({
    merchant: { risk_category: "low" },
    route: { risk_category: "low" },
  });
  const unknown = await evaluateMerchantRouteRisk({
    merchant: { risk_category: "unknown" },
    route: { risk_category: "high" },
  });
  assert.deepEqual(mismatch, { eligible: false, reason: "risk_mismatch", requires_review: false });
  assert.equal(exact.eligible, true);
  assert.equal(unknown.requires_review, true);
  assert.equal((await probeRules()).healthy, true);
}

async function testSearch() {
  const state = { settings: null, documents: null, searchOptions: null, indexes: new Set(["offerpsp_entities_v1"]) };
  let taskUid = 10;
  const index = (uid) => ({
    search: async (_query, options) => { state.searchOptions = options; return { hits: [{ id: "provider:1", label: "BR-Pay", path: "/psps/1" }] }; },
    updateSettings: async (settings) => { state.settings = settings; return { taskUid: taskUid++ }; },
    addDocuments: async (documents) => { state.documents = documents; return { taskUid: taskUid++ }; },
  });
  const client = {
    health: async () => ({ status: "available" }),
    index,
    createIndex: async (uid) => { state.indexes.add(uid); return { taskUid: taskUid++ }; },
    getIndex: async (uid) => {
      if (!state.indexes.has(uid)) throw new Error("index_not_found");
      return { uid };
    },
    swapIndexes: async () => ({ taskUid: taskUid++ }),
    deleteIndex: async (uid) => { state.indexes.delete(uid); return { taskUid: taskUid++ }; },
    deleteIndexIfExists: async (uid) => state.indexes.delete(uid),
    tasks: {
      waitForTask: async (task) => ({ uid: task.taskUid, status: "succeeded" }),
    },
  };
  const config = {
    mode: "active",
    index: "offerpsp_entities_v1",
    state: { name: "meilisearch", enabled: true },
  };
  assert.equal((await probeSearch(config, client)).healthy, true);
  assert.equal((await searchOfferPsp("BR", { filter: 'record_state = "active"' }, config, client))[0].label, "BR-Pay");
  assert.equal(state.searchOptions.filter, 'record_state = "active"');
  const task = await syncSearchDocuments([{ id: "provider:1", label: "BR-Pay" }], config, client);
  assert.equal(task.strategy, "atomic_swap");
  assert.deepEqual(state.settings.filterableAttributes, ["kind", "status", "record_state"]);
  assert.equal(state.documents.length, 1);

  const documents = buildSearchDocuments({
    leads: [{ lead_id: "lead-1", company: "Merchant One", geos: ["EU"] }],
    management: {
      providers: [{ id: "provider-1", brand_name: "BR-Pay", website: "https://brpay.io", legacy_psp_id: 7 }],
      organizations: [{ id: "agent-1", name: "Agent One", organization_type: "agent", status: "active" }],
    },
    coverage: { routes: [
      { route_id: "route-1", provider_id: "provider-1", client_title: "IN UPI", geos: ["IN"], methods: ["UPI"] },
      { route_id: "route-2", provider_id: "provider-1", client_title: "KZ P2P", geos: ["KZ"], methods: ["P2P"] },
    ] },
    captainsBridge: {
      casino_leads: [{ id: 12, name: "Casino One", website: "casino.test" }],
      psp_providers: [
        { id: 7, name: "BR Pay", website: "brpay.io" },
        { id: 8, name: "PAYOK", website: "payok.com" },
      ],
    },
  });
  assert.equal(documents.filter((item) => item.label.includes("BR")).length, 1);
  assert.deepEqual(new Set(documents.map((item) => item.kind)), new Set(["merchant", "provider", "casino", "agent", "route"]));
  const indiaRoute = documents.find((item) => item.id === "route_route-1");
  assert.match(indiaRoute.search_text, /India/);
  assert.match(indiaRoute.search_text, /Индия/);
  const cisRoute = documents.find((item) => item.id === "route_route-2");
  assert.match(cisRoute.search_text, /CIS/);
  assert.match(cisRoute.search_text, /СНГ/);
}

async function testSemanticMemory() {
  let addCalls = 0;
  const client = {
    ping: async () => undefined,
    search: async () => ({ results: [{ memory: "BR-Pay is a partner" }] }),
    add: async () => { addCalls += 1; return { id: "memory-1" }; },
  };
  const active = {
    mode: "active",
    profile: "BIXOFFPSP",
    state: { name: "mem0", enabled: true },
  };
  assert.equal((await probeSemanticMemory(active, client)).healthy, true);
  assert.equal((await searchSemanticMemory("BR-Pay", {}, active, client)).length, 1);
  const shadow = await rememberSemanticCandidate({
    content: "BR-Pay is a verified active partner",
    category: "relationship",
    verified: true,
  }, { ...active, mode: "shadow" }, client);
  assert.equal(shadow.shadow, true);
  assert.equal(addCalls, 0);
  const stored = await rememberSemanticCandidate({
    content: "BR-Pay is a verified active partner",
    category: "relationship",
    verified: true,
  }, active, client);
  assert.equal(stored.stored, true);
  assert.equal(addCalls, 1);
  assert.throws(() => validateMemoryCandidate({
    content: "api_key=do-not-store-this",
    category: "verified_fact",
    verified: true,
  }), /secret/i);
}

testFileInput();
await testDocling();
await testRules();
await testSearch();
await testSemanticMemory();
console.log("Platform module contract tests passed");
