import assert from "node:assert/strict";
import { isQaAttributionMarker, isQaFixtureLead, isQaFixtureProvider, isQaFixtureRoute, isQaFixtureTask } from "../src/lib/qaFixtures.ts";

assert.equal(isQaFixtureLead({
  lead_id: "11111111-1111-4111-8111-111111111111",
  company: "Ordinary Ltd",
  name: "QA runner",
  work_email: "runner@example.com",
  company_url: "https://example.com",
  source_category: "test",
  source_platform: "BIX INSTANT INTAKE E2E",
  source_referrer: null,
  utm_source: null,
  utm_campaign: "portal regression",
  details: null,
}), true, "historical QA attribution markers must hide the lead even when its company looks ordinary");

assert.equal(isQaAttributionMarker("organic", "normal launch"), false, "ordinary attribution must remain visible");
assert.equal(isQaAttributionMarker("qa-user@example.invalid"), true, ".invalid identities are synthetic");

assert.equal(isQaFixtureTask({
  lead_id: "0d982f0b-7b8f-4caa-9e36-8481b181b4ae",
  title: "Confirm company identity before linking contact",
  details: "WinPiski QA — NO ACTION REQUIRED submitted a new request.",
}), true, "QA marker must hide a task even when it was attached to a real lead ID");

assert.equal(isQaFixtureTask({
  lead_id: "ad724d57-e894-4d16-b7b0-948165aef4bf",
  title: "Golden scenario refresh",
}), true, "registered golden merchant tasks must remain outside Operations");

assert.equal(isQaFixtureTask({
  lead_id: "11111111-1111-4111-8111-111111111111",
  title: "Review Railon dossier",
  details: "Confirm missing currencies and payment methods.",
}), false, "ordinary merchant work must remain visible");

assert.equal(isQaFixtureProvider({
  id: "1e584fde-67d7-42d1-be52-83c014218c09",
  brand_name: "PAYOK E2E TEST 20260826",
  legal_name: null,
  internal_code: "PSP-000014",
  website: null,
}), true, "the historical PAYOK E2E provider must stay outside the working registry");

assert.equal(isQaFixtureRoute({
  provider_id: "1e584fde-67d7-42d1-be52-83c014218c09",
  provider_name: "PAYOK E2E TEST 20260826",
  provider_code: "PSP-000014",
  client_title: "E2E route",
}), true, "PAYOK E2E routes must stay outside catalogues, filters and counters");

process.stdout.write("PASS QA fixtures stay outside operational views and attribution\n");
