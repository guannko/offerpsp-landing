#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildIntakeBriefPayload, validateIntakeBrief } from "../intake-brief.js";

const complete = {
  name: "Alex Merchant", work_email: "alex@example.com", company: "Example Merchant Ltd",
  company_url: "https://merchant.example", vertical: "E-commerce", license_status: "not_required",
  target_geos: "DE, FR", requested_currencies: "eur, usd", requested_flows: ["PAYIN", "PAYOUT"],
  requested_methods: "Cards, SEPA", expected_monthly_volume: "250000", volume_currency: "eur",
  average_ticket_amount: "85", average_ticket_currency: "eur",
  traffic_types: "Recurring, returning customers", unknown_fields: [],
};

assert.deepEqual(validateIntakeBrief(complete), { valid: true, missing: [], unknown_fields: [] });
const payload = buildIntakeBriefPayload(complete);
assert.deepEqual(payload.target_geos, ["DE", "FR"]);
assert.deepEqual(payload.requested_currencies, ["EUR", "USD"]);
assert.deepEqual(payload.requested_flows, ["PAYIN", "PAYOUT"]);
assert.equal(payload.expected_monthly_volume, 250000);
assert.equal(payload.average_ticket_amount, 85);
assert.equal(payload.monthly_volume, "250000 EUR");

const explicitUnknowns = {
  ...complete, company_url: "", license_status: "", target_geos: "", requested_currencies: "",
  requested_flows: [], requested_methods: "", expected_monthly_volume: "", volume_currency: "",
  average_ticket_amount: "", average_ticket_currency: "", traffic_types: "",
  unknown_fields: ["company_url", "license_status", "target_geos", "requested_currencies", "requested_flows",
    "requested_methods", "expected_monthly_volume", "average_ticket_amount", "traffic_types"],
};
assert.equal(validateIntakeBrief(explicitUnknowns).valid, true);
const unknownPayload = buildIntakeBriefPayload(explicitUnknowns);
assert.equal(unknownPayload.company_url, null);
assert.equal(unknownPayload.license_status, "unknown");
assert.deepEqual(unknownPayload.target_geos, []);
assert.equal(unknownPayload.expected_monthly_volume, null);
assert.equal(unknownPayload.average_ticket_amount, null);
assert.equal(unknownPayload.geos, "Not sure yet");
assert.equal(unknownPayload.methods, "Not sure yet");
assert.equal(unknownPayload.monthly_volume, "Not sure yet");

const incomplete = { ...complete, requested_methods: "", unknown_fields: [] };
assert.equal(validateIntakeBrief(incomplete).valid, false);
assert.match(validateIntakeBrief(incomplete).missing.join(" "), /payment methods/);
assert.throws(() => buildIntakeBriefPayload(incomplete), /Incomplete merchant brief/);

const blankNumbers = { ...complete, expected_monthly_volume: "", average_ticket_amount: "", unknown_fields: [] };
assert.equal(validateIntakeBrief(blankNumbers).valid, false, "blank numeric values must not be coerced to zero");
assert.match(validateIntakeBrief(blankNumbers).missing.join(" "), /monthly volume/);
assert.match(validateIntakeBrief(blankNumbers).missing.join(" "), /average ticket/);

const page = await readFile(new URL("../index.html", import.meta.url), "utf8");
for (const field of ["company_url", "license_status", "target_geos", "requested_currencies", "requested_flows",
  "requested_methods", "expected_monthly_volume", "average_ticket_amount", "traffic_types"]) {
  assert.match(page, new RegExp(`(?:name|data-unknown-for)=["']${field}["']`), `public brief must collect ${field}`);
}
assert.match(page, /data-form-step="0"/);
assert.match(page, /data-form-step="1"/);
assert.match(page, /data-form-step="2"/);
assert.doesNotMatch(page, /payload\.monthly_volume\s*=\s*["']{2}/);
assert.doesNotMatch(page, /payload\.methods\s*=\s*["']{2}/);
assert.match(page, /supabase\.auth\.signInWithOtp/);

process.stdout.write("PASS complete, explicit-unknown and incomplete merchant brief payloads\n");
