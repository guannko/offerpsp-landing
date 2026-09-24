#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import handler from "../api/_lib/provider-offer-source.mjs";
import { parseOfferSource } from "../api/_lib/offer-parser.mjs";

const providerId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const xlsxFixture = Buffer.from((await readFile(new URL("./fixtures/provider-portal-payok-table.xlsx.b64", import.meta.url), "utf8")).trim(), "base64");
process.env.SUPABASE_URL = "https://supabase.test";
process.env.SUPABASE_PUBLISHABLE_KEY = "publishable-test-key";

const originalFetch = globalThis.fetch;
globalThis.fetch = async (url) => {
  if (String(url).endsWith("/auth/v1/user")) return new Response(JSON.stringify({ id: userId }), { status: 200 });
  if (String(url).endsWith("/rest/v1/rpc/can_access_offerpsp_provider_workspace")) return new Response("true", { status: 200 });
  if (String(url).includes("/storage/v1/object/authenticated/offerpsp-private-sources/")) {
    if (String(url).includes("fixture.xlsx")) {
      return new Response(xlsxFixture, { status: 200, headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" } });
    }
    return new Response("Country: Brazil\nMethod: PIX\nPayIn: 5.5%", { status: 200, headers: { "content-type": "text/plain" } });
  }
  throw new Error(`Unexpected request: ${url}`);
};

function responseCapture() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; return this; },
    status(value) { this.statusCode = value; return this; },
    json(value) { this.body = value; return this; },
    end() { return this; },
  };
}

try {
  const response = responseCapture();
  await handler({
    method: "POST",
    headers: { authorization: "Bearer provider-user-token", origin: "https://offerpsp.com" },
    body: {
      provider_id: providerId,
      storage_path: `providers/${providerId}/${userId}/fixture.txt`,
      filename: "fixture.txt",
      mime_type: "text/plain",
    },
  }, response);
  assert.equal(response.statusCode, 200);
  assert.match(response.body.text, /PayIn: 5\.5%/);
  assert.equal(response.body.extraction_method, "offerpsp-server-text-v1");
  assert.equal(response.body.content_base64, undefined, "API must not echo the private source file");
  assert.equal(response.headers["access-control-allow-origin"], "https://offerpsp.com");

  const workbook = responseCapture();
  await handler({
    method: "POST",
    headers: { authorization: "Bearer provider-user-token", origin: "https://offerpsp.com" },
    body: {
      provider_id: providerId,
      storage_path: `providers/${providerId}/${userId}/fixture.xlsx`,
      filename: "fixture.xlsx",
      mime_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    },
  }, workbook);
  assert.equal(workbook.statusCode, 200, JSON.stringify(workbook.body));
  assert.equal(workbook.body.extraction_method, "offerpsp-server-xlsx-v1");
  assert.match(workbook.body.text, /INDONESIA \| IDR QRIS/);
  assert.match(workbook.body.text, /BRAZIL \| BRL PIX/);
  assert.equal(workbook.body.content_base64, undefined, "API must not echo the private workbook");
  const parsedWorkbook = parseOfferSource({ providerName: "PAYOK E2E TEST", sourceText: workbook.body.text, sourceType: "file", sourceReference: "fixture.xlsx" });
  assert.equal(parsedWorkbook.batch.routes.length, 2);
  assert.deepEqual(parsedWorkbook.batch.routes.map((route) => route.geos[0]), ["ID", "BR"]);
  for (const route of parsedWorkbook.batch.routes) {
    assert.ok(route.fees.some((fee) => fee.flow === "payin"), "PayIn row label must win over adjacent spreadsheet notes");
    assert.ok(route.fees.some((fee) => fee.flow === "payout"), "PayOut row must retain its flow");
  }
  assert.equal(parsedWorkbook.batch.parser_metadata.blocking_anomaly_count, 0);

  const foreign = responseCapture();
  await handler({
    method: "POST",
    headers: { authorization: "Bearer provider-user-token", origin: "https://offerpsp.com" },
    body: {
      provider_id: providerId,
      storage_path: `providers/${providerId}/33333333-3333-4333-8333-333333333333/foreign.txt`,
      filename: "foreign.txt",
      mime_type: "text/plain",
    },
  }, foreign);
  assert.equal(foreign.statusCode, 403);

  process.stdout.write("PASS provider source extraction authorization, private download and response boundary\n");
} finally {
  globalThis.fetch = originalFetch;
}
