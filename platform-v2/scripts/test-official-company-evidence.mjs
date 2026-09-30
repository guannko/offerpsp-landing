import assert from "node:assert/strict";
import { test } from "node:test";
import {
  collectOfficialCompanyEvidence,
  lookupGleifEntity,
  matchUnSanctions,
  matchSwedenRegistry,
  matchUkgcRegistry,
  normalizeEvidenceName,
  parseCgaCertificateHtml,
  parseGleifResponse,
  parseGibraltarRegisterHtml,
  parseIomGscRegisterHtml,
  parseKahnawakePermitHoldersHtml,
  parseMgaAuthorisationHtml,
  parseOntarioOperatorDirectoryHtml,
  parseUnSanctionsXml,
  requestOfficialSource,
  screenUnSanctions,
  verifyGamingLicence,
} from "../api/_lib/official-company-evidence.mjs";

const gleifFixture = {
  meta: { goldenCopy: { publishDate: "2026-09-17T08:00:00Z" }, pagination: { total: 1 } },
  data: [{ id: "7ZW8QJWVPR4P1J1KQY45", attributes: { lei: "7ZW8QJWVPR4P1J1KQY45", entity: {
    legalName: { name: "BRAININDEX OÜ" }, jurisdiction: "EE", status: "ACTIVE", registeredAs: "12345678", registeredAt: { id: "RA000181" },
  }, registration: { status: "ISSUED", corroborationLevel: "FULLY_CORROBORATED", validatedAs: "12345678" } },
  links: { self: "https://api.gleif.org/api/v1/lei-records/7ZW8QJWVPR4P1J1KQY45" } }],
};

const sanctionsXml = `<?xml version="1.0"?><CONSOLIDATED_LIST dateGenerated="2026-09-16T23:00:04Z"><INDIVIDUALS><INDIVIDUAL><FIRST_NAME>John</FIRST_NAME><SECOND_NAME>Doe</SECOND_NAME><REFERENCE_NUMBER>QDi.001</REFERENCE_NUMBER><UN_LIST_TYPE>Al-Qaida</UN_LIST_TYPE><LISTED_ON>2020-01-01</LISTED_ON><INDIVIDUAL_ALIAS><ALIAS_NAME>Johnny Doe</ALIAS_NAME></INDIVIDUAL_ALIAS></INDIVIDUAL></INDIVIDUALS><ENTITIES><ENTITY><FIRST_NAME>Example Payments Ltd</FIRST_NAME><REFERENCE_NUMBER>QDe.001</REFERENCE_NUMBER><UN_LIST_TYPE>Al-Qaida</UN_LIST_TYPE><LISTED_ON>2021-01-01</LISTED_ON><ENTITY_ALIAS><ALIAS_NAME>Example Pay</ALIAS_NAME></ENTITY_ALIAS></ENTITY></ENTITIES></CONSOLIDATED_LIST>`;

const mgaHtml = `<html><body>Dynamic Seal Of Authorisation
Licensee Information : Example Gaming Limited Address : Malta
Status Of Licence : Licensed Licenses Licence Number MGA/B2C/123/2026 B2C - Gaming Service Licence Licensed
Website Urls : <a href="https://casino.example/">casino.example</a>
For authenticity, make sure that the address starts with https://authorisation.mga.org.mt</body></html>`;

const cgaHtml = `<html><body><h1>Certificate of Operation</h1><p>This is to certify that casino.example is operated by Example Gaming N.V., a company incorporated under the laws of Curaçao with Company Number 165000 and licensed by the Curaçao Gaming Authority to offer games of chance under license number OGL/2026/100/0001 in accordance with the National Ordinance on Games of Chance.</p><p>The license was granted on 01/01/2026 and its current status is Active</p><img alt="Certification seal"></body></html>`;

const gibraltarHtml = `<html><body><p>Register of Licence Holders</p><table><tbody><tr><td>1</td><td>Example Gibraltar Limited (Example Group)<br><a href="https://gamblingdivision.gov.gi/uploads/example.pdf">Approved Brands</a></td><td>Gaming Operator (B2C)</td></tr></tbody></table></body></html>`;
const iomHtml = `<html><body><p>Last updated: 16th September 2026.</p><table><tbody>
<tr><td><strong>Company Name</strong></td><td>Example IOM Limited</td></tr>
<tr><td><strong>Licence Status</strong></td><td>Active</td></tr>
<tr><td><strong>Licence valid From</strong></td><td>01/01/2024</td></tr>
<tr><td><strong>Licence Valid to</strong></td><td>Current</td></tr>
<tr><td><strong>OGRA Licence type</strong></td><td>Full Licence</td></tr>
<tr><td><strong>Website Domains</strong></td><td><a href="https://casino-iom.example">casino-iom.example</a></td></tr>
</tbody></table></body></html>`;
const kahnawakeHtml = `<html><body><p>The following list of Operators and their URLs have been certified by the Kahnawà:ke Gaming Commission. <strong>Updated September 28, 2023.</strong></p><figure id="phTable"><table><thead><tr><th>OPERATOR</th><th>URL</th></tr></thead><tbody><tr><td>Example KGC Limited</td><td><a href="https://casino-kgc.example">casino-kgc.example</a></td></tr></tbody></table></figure></body></html>`;
const swedenRecords = [{ licenseId: 707777586, licenseHolder: { licenseHolderId: "A".repeat(64), licenseHolderName: "Example Sweden Limited" },
  licenseFrom: "2024-01-01T00:00:00", licenseTo: "2028-12-31T00:00:00", licenseStatus: { licenseStatusName: "Aktiv" },
  licenseType: { licenseTypeName: "Kommersiellt online" }, licenseUrls: [{ licenseUrl: "casino-se.example" }] }];
const ontarioHtml = `<html><body><p>The listing is accurate as of September 1, 2026.</p><h3>Example Ontario Limited</h3><ul class="operator-list-operators"><li class="operator-item"><a href="https://casino-on.example" title="Example Casino">Play Example Casino</a></li></ul></body></html>`;

test("name normalization preserves a deterministic exact-match boundary", () => {
  assert.equal(normalizeEvidenceName("BrainIndex OÜ"), "BRAININDEX OU");
  assert.notEqual(normalizeEvidenceName("Example Pay"), normalizeEvidenceName("Example Payments Ltd"));
});

test("GLEIF needs both exact legal name and registration number before verification", () => {
  const candidate = parseGleifResponse(gleifFixture, { company: "BrainIndex OÜ", registration_geo: "EE" });
  assert.equal(candidate.outcome, "candidate_match");
  assert.equal(candidate.verified, false);
  assert.equal(candidate.match_basis, "legal_name_and_country");
  const verified = parseGleifResponse(gleifFixture, { company: "BrainIndex OU", registration_geo: "EE", registration_number: "12345678" });
  assert.equal(verified.outcome, "verified_identifier_match");
  assert.equal(verified.verified, true);
  assert.equal(verified.record.registration_authority, "RA000181");
});

test("GLEIF request is fixed to the official endpoint and returns bounded evidence", async () => {
  let called;
  const result = await lookupGleifEntity({ company: "BrainIndex OÜ", registration_number: "12345678" }, { requestSource: async (url, options) => {
    called = { url: new URL(url), options };
    return { statusCode: 200, contentType: "application/vnd.api+json", body: JSON.stringify(gleifFixture) };
  } });
  assert.equal(called.url.hostname, "api.gleif.org");
  assert.equal(called.url.pathname, "/api/v1/lei-records");
  assert.equal(called.url.searchParams.get("filter[entity.legalName]"), "BrainIndex OÜ");
  assert.equal(result.verified, true);
});

test("official transport refuses redirecting outside the immutable allow-list", async () => {
  const request = async () => ({ statusCode: 302, location: "https://attacker.invalid/private" });
  await assert.rejects(requestOfficialSource("https://api.gleif.org/api/v1/lei-records", {
    allowedHosts: new Set(["api.gleif.org"]), request,
  }), /blocked_official_source/);
});

test("UN parser matches exact primary and alias names without fuzzy clearance", () => {
  const parsed = parseUnSanctionsXml(sanctionsXml);
  assert.equal(parsed.records.length, 2);
  assert.equal(matchUnSanctions(parsed, { company: "Example Pay" }).outcome, "exact_name_match");
  assert.equal(matchUnSanctions(parsed, { company: "Example Payment" }).outcome, "no_exact_name_match");
  const person = matchUnSanctions(parsed, { contact_name: "John Doe" });
  assert.equal(person.matches[0].reference_number, "QDi.001");
  assert.match(person.disclaimer, /not sanctions clearance/i);
});

test("UN source failure is unavailable, never a clean result", async () => {
  const result = await screenUnSanctions({ company: "Example Pay" }, { requestSource: async () => { throw new Error("offline"); }, now: () => 1 });
  assert.equal(result.outcome, "unavailable");
  assert.deepEqual(result.matches, []);
});

test("MGA verification requires active status plus exact legal name, licence and domain", () => {
  const result = parseMgaAuthorisationHtml(mgaHtml, {
    company: "Example Gaming Limited", company_url: "https://casino.example", license_number: "MGA/B2C/123/2026",
  }, "https://authorisation.mga.org.mt/verification.aspx?company=00000000-0000-0000-0000-000000000000&details=1&lang=EN");
  assert.equal(result.outcome, "verified_identifier_match");
  assert.equal(result.verified, true);
  assert.equal(result.domain_match, true);
  const suspended = parseMgaAuthorisationHtml(mgaHtml.replace(/Licensed/g, "Suspended"), {
    company: "Example Gaming Limited", company_url: "https://casino.example", license_number: "MGA/B2C/123/2026",
  });
  assert.equal(suspended.outcome, "inactive_or_adverse_status");
  assert.equal(suspended.verified, false);
});

test("CGA verification binds the active certificate to operator, licence number and player-facing domain", () => {
  const result = parseCgaCertificateHtml(cgaHtml, {
    company: "Example Gaming N.V.", company_url: "https://casino.example", license_number: "OGL/2026/100/0001", registration_number: "165000",
  }, "https://cert.cga.cw/certificate?id=test-token");
  assert.equal(result.outcome, "verified_identifier_match");
  assert.equal(result.verified, true);
  assert.equal(result.company_number_match, true);
  const withoutSubmittedRegistration = parseCgaCertificateHtml(cgaHtml, {
    company: "Example Gaming N.V.", company_url: "https://casino.example", license_number: "OGL/2026/100/0001",
  });
  assert.equal(withoutSubmittedRegistration.verified, true);
  assert.equal(withoutSubmittedRegistration.company_number_match, null);
  const removed = parseCgaCertificateHtml("<h1>Not Active</h1><p>This domain has been removed from the registry.</p>", {});
  assert.equal(removed.outcome, "inactive_or_adverse_status");
  assert.equal(removed.verified, false);
});

test("UKGC verification requires the same account for legal name, active remote licence and active domain", () => {
  const registry = {
    businesses: [{ "Account Number": "123", "Licence Account Name": "Example Gaming Limited" }],
    domains: [{ "Account Number": "123", "Domain Name": "casino.example", Status: "Active" }],
    licences: [{ "Account Number": "123", "Licence Number": "000123-R-123456-001", Status: "Active", Type: "Remote", Activity: "Casino" }],
  };
  const result = matchUkgcRegistry(registry, {
    company: "Example Gaming Limited", company_url: "https://casino.example", license_number: "000123-R-123456-001",
  });
  assert.equal(result.outcome, "verified_identifier_match");
  assert.equal(result.verified, true);
  const mismatch = matchUkgcRegistry(registry, {
    company: "Example Gaming Limited", company_url: "https://other.example", license_number: "000123-R-123456-001",
  });
  assert.equal(mismatch.outcome, "candidate_match");
  assert.equal(mismatch.verified, false);
});

test("UKGC accepts an official white-label domain while preserving that relationship", () => {
  const registry = {
    businesses: [{ "Account Number": "123", "Licence Account Name": "Example Gaming Limited" }],
    domains: [{ "Account Number": "123", "Domain Name": "casino.example", Status: "White Label" }],
    licences: [{ "Account Number": "123", "Licence Number": "000123-R-123456-001", Status: "Active", Type: "Remote", Activity: "Casino" }],
  };
  const result = matchUkgcRegistry(registry, {
    company: "Example Gaming Limited", company_url: "https://casino.example", license_number: "000123-R-123456-001",
  });
  assert.equal(result.outcome, "verified_identifier_match");
  assert.equal(result.verified, true);
  assert.equal(result.submitted_domain_status, "White Label");
});

test("research free-text licence fields identify UKGC and preserve exact verification rules", async () => {
  const registry = {
    businesses: [{ "Account Number": "123", "Licence Account Name": "Example Gaming Limited" }],
    domains: [{ "Account Number": "123", "Domain Name": "casino.example", Status: "Active" }],
    licences: [{ "Account Number": "123", "Licence Number": "000123-R-123456-001", Status: "Active", Type: "Remote", Activity: "Casino" }],
  };
  const result = await verifyGamingLicence({
    company: "Example Gaming Limited", company_url: "casino.example",
    qualification_notes: "UK licence 000123-R-123456-001",
  }, { loadUkgc: async () => registry });
  assert.equal(result.regulator, "UKGC");
  assert.equal(result.verified, true);
});

test("research free-text licence fields can carry the official MGA dynamic-seal URL", async () => {
  let requestedUrl;
  const officialUrl = "https://authorisation.mga.org.mt/verification.aspx?company=00000000-0000-0000-0000-000000000000&details=1&lang=EN";
  const result = await verifyGamingLicence({
    company: "Example Gaming Limited", company_url: "casino.example",
    qualification_notes: `Malta MGA/B2C/123/2026 ${officialUrl}`,
  }, { requestSource: async (url) => { requestedUrl = url; return { body: mgaHtml }; } });
  assert.equal(requestedUrl, officialUrl);
  assert.equal(result.regulator, "MGA");
  assert.equal(result.verified, true);
});

test("Gibraltar register stays candidate-only when the official page does not bind a domain or public licence number", () => {
  const result = parseGibraltarRegisterHtml(gibraltarHtml, { company: "Example Gibraltar Limited", company_url: "casino-gib.example" });
  assert.equal(result.outcome, "candidate_match");
  assert.equal(result.verified, false);
  assert.equal(result.exact_name, true);
  assert.equal(result.public_licence_number, false);
  assert.match(result.approved_brands_url, /example\.pdf$/);
});

test("Isle of Man register verifies exact active legal name and published domain without inventing a licence number", () => {
  const result = parseIomGscRegisterHtml(iomHtml, { company: "Example IOM Limited", company_url: "https://casino-iom.example" }, undefined, new Date("2026-09-17T00:00:00Z"));
  assert.equal(result.outcome, "verified_registry_match");
  assert.equal(result.verified, true);
  assert.equal(result.domain_match, true);
  assert.equal(result.licence_number_match, null);
  assert.equal(result.register_updated_at, "2026-09-16");
});

test("Kahnawake certified operator/domain page is not promoted to current verification when its published date is stale", () => {
  const result = parseKahnawakePermitHoldersHtml(kahnawakeHtml, { company: "Example KGC Limited", company_url: "casino-kgc.example" }, undefined, new Date("2026-09-17T00:00:00Z"));
  assert.equal(result.outcome, "candidate_match");
  assert.equal(result.verified, false);
  assert.equal(result.domain_match, true);
  assert.equal(result.register_fresh, false);
});

test("Swedish Gambling Authority verification requires exact holder, active validity and a matching licensed domain", () => {
  const result = matchSwedenRegistry(swedenRecords, { company: "Example Sweden Limited", company_url: "https://casino-se.example" }, new Date("2026-09-17T00:00:00Z"));
  assert.equal(result.outcome, "verified_registry_match");
  assert.equal(result.verified, true);
  assert.equal(result.licence_id, 707777586);
  const wrongDomain = matchSwedenRegistry(swedenRecords, { company: "Example Sweden Limited", company_url: "other.example" }, new Date("2026-09-17T00:00:00Z"));
  assert.equal(wrongDomain.outcome, "candidate_match");
  assert.equal(wrongDomain.verified, false);
});

test("Ontario directory represents the combined AGCO registration and iGO agreement without calling it a licence number", () => {
  const result = parseOntarioOperatorDirectoryHtml(ontarioHtml, { company: "Example Ontario Limited", company_url: "casino-on.example" }, undefined, new Date("2026-09-17T00:00:00Z"));
  assert.equal(result.outcome, "verified_registry_match");
  assert.equal(result.verified, true);
  assert.match(result.authorization_model, /AGCO registration/);
  assert.equal(result.public_licence_number, false);
});

test("new regulator aliases dispatch only to their fixed official sources", async () => {
  let requestedUrl;
  const iom = await verifyGamingLicence({ company: "Example IOM Limited", company_url: "casino-iom.example", license_jurisdiction: "Isle of Man" }, {
    requestSource: async (url) => { requestedUrl = url; return { body: iomHtml }; }, now: () => new Date("2026-09-17T00:00:00Z").getTime(),
  });
  assert.equal(requestedUrl, "https://www.isleofmangsc.com/gambling/supervision/online-gambling-licensee-register/");
  assert.equal(iom.verified, true);
  const sweden = await verifyGamingLicence({ company: "Example Sweden Limited", company_url: "casino-se.example", licence_jurisdiction: "Sweden" }, {
    loadSweden: async () => swedenRecords, now: () => new Date("2026-09-17T00:00:00Z").getTime(),
  });
  assert.equal(sweden.regulator, "SGA");
  assert.equal(sweden.verified, true);
});

test("official connectors are opt-in and expose partial coverage", async () => {
  let calls = 0;
  const disabled = await collectOfficialCompanyEvidence({ company: "Example" }, { env: {}, lookupGleif: async () => { calls++; }, screenUn: async () => { calls++; }, verifyGaming: async () => { calls++; } });
  assert.equal(calls, 0);
  assert.equal(disabled.gleif.outcome, "disabled");
  const enabled = await collectOfficialCompanyEvidence({ company: "Example" }, {
    env: { OFFERPSP_GLEIF_ENABLED: "true", OFFERPSP_UN_SANCTIONS_ENABLED: "true", OFFERPSP_GAMBLING_REGULATORS_ENABLED: "true" },
    lookupGleif: async () => ({ outcome: "not_found", verified: false }),
    screenUn: async () => ({ outcome: "no_exact_name_match", matches: [] }),
    verifyGaming: async () => ({ regulator: "MGA", outcome: "candidate_match", verified: false }),
  });
  assert.equal(enabled.gleif.outcome, "not_found");
  assert.equal(enabled.sanctions.coverage, "partial");
  assert.equal(enabled.gambling_licence.regulator, "MGA");
});
