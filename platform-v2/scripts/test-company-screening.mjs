import assert from "node:assert/strict";
import { test } from "node:test";
import { buildCompanyScreening } from "../api/_lib/company-screening.mjs";
import { screeningNodeCode } from "./company-screening-n8n.mjs";

const now = new Date("2026-09-16T12:00:00Z");
const lead = { lead_id: "fixture-no-action-required", company: "Example Shop", company_url: "https://shop.example/", work_email: "contact@shop.example", vertical: "e-commerce", monthly_volume: "100000", target_geos: ["DE"], requested_methods: ["cards"], requested_currencies: ["EUR"], details: "We need a PSP with PayIn and PayOut." };
const site = { statusCode: 200, body: '<html><head><title>Example Shop</title><meta name="description" content="Tools and household products for everyday life."></head><body><h1>Example Shop</h1><p>We sell tools and household products for everyday life to customers in Europe and the United Kingdom.</p></body></html>' };
const registry = { statusCode: 200, body: { events: [{ eventAction: "registration", eventDate: "2020-01-01T00:00:00Z" }] } };
const check = (result, key) => result.checks.find((item) => item.check_key === key);

test("complete submitted brief is not verified KYB or an automatic low-risk decision", () => {
  const result = buildCompanyScreening(lead, site, registry, now);
  assert.equal(result.checks.length, 8);
  assert.equal(result.completeness_score, 82);
  assert.equal(result.risk_level, "unknown");
  assert.equal(result.authenticity_score, null);
  assert.equal(result.commercial_value_score, null);
  assert.equal(check(result, "company_identity").evidence.identity_verified, false);
  assert.equal(check(result, "sanctions_adverse_media").status, "unknown");
  assert.equal(result.classification, "unknown");
  assert.equal(result.missing_information.length, 2);
});
test("company asking for a PSP is not a PSP", () => {
  const result = buildCompanyScreening({ ...lead, existing_classification: "merchant" }, site, registry, now);
  assert.equal(result.classification, "merchant");
});
test("scripts cannot provide identity or licence evidence", () => {
  const result = buildCompanyScreening(lead, { statusCode: 200, body: '<script>We are a payment gateway. Licensed company.</script><style>.licensed { color: red; }</style><p>Small shell</p>' }, registry, now);
  assert.equal(check(result, "website").status, "unknown");
  assert.equal(check(result, "licence_claim").status, "unknown");
  assert.equal(result.classification, "unknown");
});
test("site claim is explicitly unverified and does not fill a licence", () => {
  const result = buildCompanyScreening(lead, { ...site, body: site.body.replace('</body>', '<p>Licensed by Example Regulator under licence 1234.</p></body>') }, registry, now);
  assert.equal(check(result, "licence_claim").status, "warning");
  assert.equal(check(result, "licence_claim").evidence.licence_verified, false);
  assert.ok(result.missing_information.some((item) => item.includes("Лицензия")));
});
test("unreachable site is unknown, not a high-risk merchant", () => {
  for (const website of [{ error: "timeout" }, { statusCode: 403, body: "Access denied" }, { statusCode: 503 }, { statusCode: 200, body: "<title>Just a moment</title>" }]) {
    const result = buildCompanyScreening(lead, website, { error: "timeout" }, now);
    assert.equal(result.risk_level, "unknown");
    assert.equal(check(result, "website").status, "unknown");
    assert.deepEqual(result.red_flags, []);
    assert.equal(result.confidence, null);
  }
});
test("free email is not substituted for the company site", () => {
  const result = buildCompanyScreening({ work_email: "fixture@gmail.com", website_url: "https://gmail.com" }, {}, {}, now);
  assert.equal(result.source_links.length, 0);
  assert.equal(check(result, "website").source_url, null);
  assert.ok(result.missing_information.includes("Сайт компании / продукта"));
  assert.ok(result.yellow_flags.some((item) => item.key === "free_email"));
});
test("invalid/future RDAP events remain unknown", () => {
  for (const eventDate of ["not-a-date", "2099-01-01"]) {
    const result = buildCompanyScreening(lead, site, { statusCode: 200, body: { events: [{ eventAction: "registration", eventDate }] } }, now);
    assert.equal(check(result, "domain_registration").status, "unknown");
  }
});
test("failure status cannot lend credibility to a RDAP body", () => {
  const result = buildCompanyScreening(lead, site, { ...registry, statusCode: 500 }, now);
  assert.equal(check(result, "domain_registration").status, "unknown");
});
test("missing placeholders and boolean false do not complete a dossier", () => {
  const result = buildCompanyScreening({ company: "unknown", target_geos: [""], requested_methods: [], monthly_volume: "0", payin_required: false, payout_required: false }, {}, {}, now);
  assert.equal(result.completeness_score, 0);
  assert.ok(result.missing_information.includes("Требования PayIn / PayOut"));
});
test("input objects are never enriched or overwritten", () => {
  const frozen = structuredClone(lead);
  Object.freeze(frozen);
  buildCompanyScreening(frozen, site, registry, now);
  assert.deepEqual(frozen, lead);
});
test("evidence strips URL credentials/query/hash and excludes raw HTML", () => {
  const result = buildCompanyScreening({ ...lead, company_url: "https://shop.example/?token=do-not-retain#fragment" }, site, registry, now);
  assert.equal(result.source_links[0].url, "https://shop.example/");
  assert.ok(!JSON.stringify(result).includes("<html>"));
  assert.equal(buildCompanyScreening({ ...lead, company_url: "https://user:secret@shop.example" }, {}, {}, now).source_links.length, 0);
});
test("the exact n8n adapter runs a two-item batch without mixing evidence", () => {
  const second = { ...lead, lead_id: "second-fixture", company: "Different", company_url: "https://different.example" };
  const nodes = { "Build Check Targets": [{ json: lead }, { json: second }], "Check Website": [{ json: site }, { json: { error: "timeout" } }] };
  const execute = new Function("$", "$input", screeningNodeCode());
  const result = execute((name) => ({ all: () => nodes[name] }), { all: () => [{ json: registry }, { json: {} }] });
  assert.equal(result[0].json.lead_id, lead.lead_id);
  assert.equal(check(result[0].json.payload, "website").status, "passed");
  assert.equal(result[1].json.lead_id, second.lead_id);
  assert.equal(check(result[1].json.payload, "website").status, "unknown");
  assert.deepEqual(result[1].pairedItem, { item: 1 });
  assert.throws(() => execute((name) => ({ all: () => nodes[name] }), { all: () => [] }), /alignment failed/);
});
