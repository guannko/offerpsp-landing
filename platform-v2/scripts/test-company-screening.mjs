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
  assert.equal(result.checks.length, 11);
  assert.equal(result.completeness_score, 82);
  assert.equal(result.risk_level, "unknown");
  assert.equal(result.authenticity_score, null);
  assert.equal(result.commercial_value_score, null);
  assert.equal(result.audit_level, "preliminary_public_evidence");
  assert.equal(result.screening_provider, "offerpsp-public-evidence-v5");
  assert.equal(result.decision_status, "manual_review_required");
  assert.equal(result.audit_coverage.status, "partial");
  assert.equal(result.audit_coverage.critical_confirmed, 0);
  assert.equal(result.audit_coverage.critical_total, 6);
  assert.equal(result.audit_coverage.limitations.length, 5);
  assert.equal(check(result, "website").evidence_level, "observed");
  assert.equal(check(result, "website").source_type, "company_website");
  assert.equal(check(result, "domain_registration").evidence_level, "observed");
  assert.equal(check(result, "domain_registration").source_type, "rdap_registry");
  assert.equal(check(result, "dossier_completeness").evidence_level, "computed");
  assert.equal(check(result, "company_identity").evidence.identity_verified, false);
  assert.equal(check(result, "sanctions_screen").status, "unknown");
  assert.equal(check(result, "adverse_media").status, "unknown");
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
  assert.equal(check(result, "licence_claim").evidence_level, "claimed");
  assert.equal(check(result, "licence_claim").evidence.licence_verified, false);
  assert.ok(result.missing_information.some((item) => item.includes("Лицензия")));
});
test("unreachable site is unknown, not a high-risk merchant", () => {
  for (const website of [{ error: "timeout" }, { statusCode: 403, body: "Access denied" }, { statusCode: 503 }, { statusCode: 200, body: "<title>Just a moment</title>" }]) {
    const result = buildCompanyScreening(lead, website, { error: "timeout" }, now);
    assert.equal(result.risk_level, "unknown");
    assert.equal(check(result, "website").status, "unknown");
    assert.equal(check(result, "website").evidence_level, "unavailable");
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
  assert.equal(check(result, "dossier_completeness").evidence.completed_fields, 0);
  assert.ok(result.missing_information.includes("Требования PayIn / PayOut"));
});
test("submitted-data completeness never masquerades as external verification", () => {
  const complete = {
    ...lead,
    license_status: "licensed",
    license_jurisdiction: "Example",
    license_number: "1234",
    license_evidence_url: "https://regulator.example/licence/1234",
    representative_authority: "Director",
  };
  const result = buildCompanyScreening(complete, site, registry, now);
  assert.equal(result.completeness_score, 100);
  assert.equal(result.decision_status, "manual_review_required");
  assert.equal(result.audit_coverage.critical_confirmed, 0);
  assert.equal(check(result, "dossier_completeness").evidence.completed_fields, 11);
  assert.equal(check(result, "licence_claim").evidence.licence_verified, false);
});
test("GLEIF verifies only an exact legal-name and registration-number match", () => {
  const official = { gleif: { outcome: "verified_identifier_match", verified: true, match_basis: "legal_name_and_registration_number",
    record: { legal_name: "Example Shop", registered_as: "12345", source_url: "https://api.gleif.org/api/v1/lei-records/TEST" } },
    sanctions: { coverage: "partial", sources: [{ source: "un_consolidated", outcome: "no_exact_name_match", matches: [], source_url: "https://scsanctions.un.org/resources/xml/en/name/consolidated.xml" }] } };
  const result = buildCompanyScreening({ ...lead, registration_number: "12345" }, site, registry, now, official);
  assert.equal(check(result, "legal_entity_reference").evidence_level, "verified");
  assert.equal(result.audit_coverage.critical_confirmed, 1);
  assert.deepEqual(result.audit_coverage.sanctions_sources_checked, ["un_consolidated"]);
  assert.equal(check(result, "sanctions_screen").status, "unknown");
  assert.match(check(result, "sanctions_screen").detail, /не санкционный допуск/i);
});
test("official gambling regulator evidence confirms only the matched licence scope", () => {
  const official = { gambling_licence: {
    regulator: "CGA", outcome: "verified_identifier_match", verified: true, status: "Active",
    legal_name: "Example Shop", licence_number: "OGL/2026/100/0001", domain: "shop.example",
    source_url: "https://cert.cga.cw/certificate?id=public-test-token",
  } };
  const result = buildCompanyScreening({ ...lead, license_status: "licensed", license_jurisdiction: "Curaçao",
    license_number: "OGL/2026/100/0001", license_evidence_url: official.gambling_licence.source_url }, site, registry, now, official);
  assert.equal(check(result, "gambling_licence_registry").status, "passed");
  assert.equal(check(result, "gambling_licence_registry").evidence_level, "verified");
  assert.equal(check(result, "gambling_licence_registry").source_type, "cga_certificate");
  assert.equal(result.audit_coverage.critical_confirmed, 1);
  assert.match(result.audit_coverage.limitations[1], /других юрисдикциях/i);
});
test("official registry match without a published licence number is described honestly", () => {
  const official = { gambling_licence: {
    regulator: "IOM_GSC", outcome: "verified_registry_match", verified: true, status: "Active",
    legal_name: "Example Shop", domains: ["shop.example"], public_licence_number: false,
    source_url: "https://www.isleofmangsc.com/gambling/supervision/online-gambling-licensee-register/",
  } };
  const result = buildCompanyScreening({ ...lead, license_status: "licensed", license_jurisdiction: "Isle of Man" }, site, registry, now, official);
  const licenceCheck = check(result, "gambling_licence_registry");
  assert.equal(licenceCheck.status, "passed");
  assert.equal(licenceCheck.evidence_level, "verified");
  assert.equal(licenceCheck.source_type, "iom_gsc_register");
  assert.match(licenceCheck.detail, /не публикует номер лицензии/i);
});
test("inactive gambling licence is an unresolved official conflict, not an automatic rejection", () => {
  const official = { gambling_licence: {
    regulator: "MGA", outcome: "inactive_or_adverse_status", verified: false, status: "Suspended",
    source_url: "https://authorisation.mga.org.mt/verification.aspx?company=00000000-0000-0000-0000-000000000000",
  } };
  const result = buildCompanyScreening(lead, site, registry, now, official);
  assert.equal(result.decision_status, "manual_review_required");
  assert.equal(result.risk_level, "unknown");
  assert.equal(result.red_flags[0].key, "gambling_licence_requires_resolution");
  assert.equal(check(result, "gambling_licence_registry").status, "warning");
  assert.match(result.summary, /расхождение по лицензии/i);
});
test("an exact sanctions name is escalated but never treated as established identity", () => {
  const official = { gleif: { outcome: "not_found", verified: false }, sanctions: { coverage: "partial", sources: [{ source: "un_consolidated", outcome: "exact_name_match",
    source_url: "https://scsanctions.un.org/resources/xml/en/name/consolidated.xml", matches: [{ searched_name: "Example Shop", matched_name: "EXAMPLE SHOP", reference_number: "QDe.999" }] }] } };
  const result = buildCompanyScreening(lead, site, registry, now, official);
  assert.equal(result.risk_level, "unknown");
  assert.equal(result.decision_status, "manual_review_required");
  assert.equal(result.red_flags[0].key, "potential_sanctions_name_match");
  assert.match(result.summary, /идентификатор/i);
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
