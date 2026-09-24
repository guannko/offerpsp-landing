import { request as httpsRequest } from "node:https";

const GLEIF_API = "https://api.gleif.org/api/v1/lei-records";
const UN_SANCTIONS_XML = "https://scsanctions.un.org/resources/xml/en/name/consolidated.xml";
const MGA_AUTHORISATION = "https://authorisation.mga.org.mt/verification.aspx";
const CGA_CERTIFICATE = "https://cert.cga.cw/certificate";
const UKGC_REGISTER = "https://www.gamblingcommission.gov.uk/public-register/businesses";
const UKGC_FILES = {
  businesses: "https://www.gamblingcommission.gov.uk/downloads/business-licence-register-businesses.csv",
  domains: "https://www.gamblingcommission.gov.uk/downloads/business-licence-register-domain-names.csv",
  licences: "https://www.gamblingcommission.gov.uk/downloads/business-licence-register-licences.csv",
};
const GIBRALTAR_REGISTER = "https://www.gamblingdivision.gov.gi/licence-holders";
const IOM_GSC_REGISTER = "https://www.isleofmangsc.com/gambling/supervision/online-gambling-licensee-register/";
const KGC_PERMIT_HOLDERS = "https://gamingcommission.ca/interactive-gaming/permit-holders/";
const SGA_REGISTER = "https://www.spelinspektionen.se/en/licence-and-permit/licence-and-permit-directory/";
const SGA_API = "https://www.spelinspektionen.se/api/licenseregistryapi/";
const ONTARIO_OPERATOR_DIRECTORY = "https://www.igamingontario.ca/en/operator/operators";
const REGULATOR_SOURCES = {
  MGA: MGA_AUTHORISATION,
  CGA: CGA_CERTIFICATE,
  UKGC: UKGC_REGISTER,
  GIBRALTAR: GIBRALTAR_REGISTER,
  IOM_GSC: IOM_GSC_REGISTER,
  KGC: KGC_PERMIT_HOLDERS,
  SGA: SGA_REGISTER,
  ONTARIO: ONTARIO_OPERATOR_DIRECTORY,
};
const UN_ALLOWED_HOSTS = new Set(["scsanctions.un.org", "unsolprodfiles.blob.core.windows.net"]);
const cache = new Map();

const clean = (value, limit = 500) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, limit);
const decodeXml = (value) => String(value ?? "").replace(/&(?:amp|quot|apos|lt|gt|#39);/gi, (entity) => ({
  "&amp;": "&", "&quot;": '"', "&apos;": "'", "&#39;": "'", "&lt;": "<", "&gt;": ">",
})[entity.toLowerCase()] || entity);

function visibleHtmlText(value) {
  return clean(decodeXml(String(value ?? "")
    .replace(/<(script|style|noscript|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")), 100_000);
}

export function normalizeEvidenceName(value) {
  return clean(value, 300).normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[’‘`´]/g, "'").replace(/[^\p{L}\p{N}]+/gu, " ").trim().toUpperCase();
}

function fixedHttpsRequest(url, { signal, maxBytes = 2_000_000, accept = "application/json" } = {}) {
  return new Promise((resolve, reject) => {
    const request = httpsRequest(url, {
      method: "GET", agent: false, signal,
      headers: { "user-agent": "OfferPSP-Evidence/2.0", accept, "accept-encoding": "identity" },
    }, (response) => {
      const statusCode = response.statusCode || 0;
      if ([301, 302, 303, 307, 308].includes(statusCode)) {
        const location = response.headers.location;
        response.destroy();
        resolve({ statusCode, location });
        return;
      }
      const declared = Number(response.headers["content-length"] || 0);
      if (declared > maxBytes) {
        response.destroy(); reject(new Error("response_too_large")); return;
      }
      const chunks = [];
      let size = 0;
      response.on("data", (chunk) => {
        size += chunk.length;
        if (size > maxBytes) {
          response.destroy(); reject(new Error("response_too_large")); return;
        }
        chunks.push(chunk);
      });
      response.on("aborted", () => reject(new Error("incomplete_response")));
      response.on("error", reject);
      response.on("end", () => resolve({
        statusCode,
        contentType: String(response.headers["content-type"] || "").split(";")[0].toLowerCase(),
        body: Buffer.concat(chunks).toString("utf8"),
        finalUrl: url.href,
      }));
    });
    request.on("error", reject);
    request.end();
  });
}

/** Fixed-origin transport for authoritative public sources. Caller input can never select a host. */
export async function requestOfficialSource(input, {
  allowedHosts, request = fixedHttpsRequest, timeoutMs = 20_000, maxBytes = 2_000_000,
  accept = "application/json", maxRedirects = 2,
} = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let url = new URL(input);
    for (let hop = 0; hop <= maxRedirects; hop++) {
      if (url.protocol !== "https:" || url.username || url.password || !allowedHosts.has(url.hostname)) throw new Error("blocked_official_source");
      const response = await request(url, { signal: controller.signal, maxBytes, accept });
      if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
        if (hop === maxRedirects || !response.location) throw new Error("official_redirect_failed");
        url = new URL(response.location, url);
        continue;
      }
      if (response.statusCode < 200 || response.statusCode >= 300) throw new Error("official_source_unavailable");
      return { ...response, finalUrl: url.href };
    }
    throw new Error("official_redirect_failed");
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

function countryCode(value) {
  const normalized = clean(value, 80).toUpperCase();
  const aliases = { ESTONIA: "EE", CYPRUS: "CY", GEORGIA: "GE", "UNITED KINGDOM": "GB", UK: "GB", USA: "US", "UNITED STATES": "US" };
  return aliases[normalized] || (/^[A-Z]{2}$/.test(normalized) ? normalized : "");
}

function summarizeGleifCandidate(item, submitted) {
  const attributes = item?.attributes || {};
  const entity = attributes.entity || {};
  const registration = attributes.registration || {};
  const legalName = clean(entity.legalName?.name, 300);
  const submittedName = normalizeEvidenceName(submitted.company || submitted.legal_name);
  const submittedRegistration = clean(submitted.registration_number || submitted.registry_code, 100).toUpperCase();
  const submittedCountry = countryCode(submitted.registration_geo || submitted.registration_jurisdiction);
  const jurisdiction = clean(entity.jurisdiction, 30).toUpperCase();
  const registeredAs = clean(entity.registeredAs || registration.validatedAs, 100).toUpperCase();
  return {
    lei: clean(attributes.lei || item.id, 30), legal_name: legalName,
    jurisdiction, registered_as: registeredAs, entity_status: clean(entity.status, 30),
    registration_status: clean(registration.status, 30), corroboration_level: clean(registration.corroborationLevel, 50),
    registration_authority: clean(entity.registeredAt?.id || registration.validatedAt?.id, 50),
    exact_name: Boolean(submittedName && normalizeEvidenceName(legalName) === submittedName),
    registration_number_match: Boolean(submittedRegistration && registeredAs && submittedRegistration === registeredAs),
    country_match: Boolean(submittedCountry && (jurisdiction === submittedCountry || jurisdiction.startsWith(`${submittedCountry}-`))),
    source_url: item?.links?.self || (attributes.lei ? `${GLEIF_API}/${encodeURIComponent(attributes.lei)}` : null),
  };
}

export function parseGleifResponse(body, submitted = {}) {
  const data = Array.isArray(body?.data) ? body.data : [];
  const candidates = data.slice(0, 10).map((item) => summarizeGleifCandidate(item, submitted));
  const exactRegistration = candidates.find((item) => item.registration_number_match && item.exact_name);
  const exactNameCountry = candidates.find((item) => item.exact_name && item.country_match);
  const exactName = candidates.find((item) => item.exact_name);
  const best = exactRegistration || exactNameCountry || exactName || null;
  const verified = Boolean(exactRegistration && exactRegistration.entity_status === "ACTIVE" &&
    exactRegistration.registration_status === "ISSUED" && exactRegistration.corroboration_level === "FULLY_CORROBORATED");
  return {
    outcome: verified ? "verified_identifier_match" : best ? "candidate_match" : "not_found",
    verified, match_basis: verified ? "legal_name_and_registration_number" :
      exactNameCountry ? "legal_name_and_country" : exactName ? "legal_name_only" : "none",
    record: best,
    candidate_count: Number(body?.meta?.pagination?.total || data.length),
    golden_copy_published_at: body?.meta?.goldenCopy?.publishDate || null,
    source_url: GLEIF_API,
  };
}

export async function lookupGleifEntity(submitted = {}, { requestSource = requestOfficialSource } = {}) {
  const name = clean(submitted.legal_name || submitted.company, 200);
  if (!name) return { outcome: "not_applicable", verified: false, source_url: GLEIF_API };
  const url = new URL(GLEIF_API);
  url.searchParams.set("filter[entity.legalName]", name);
  url.searchParams.set("page[size]", "10");
  try {
    const response = await requestSource(url.href, { allowedHosts: new Set(["api.gleif.org"]), maxBytes: 1_500_000, accept: "application/vnd.api+json, application/json" });
    if (!/json/.test(response.contentType || "application/json")) throw new Error("unexpected_content");
    return parseGleifResponse(JSON.parse(response.body), submitted);
  } catch {
    return { outcome: "unavailable", verified: false, source_url: GLEIF_API };
  }
}

function xmlValue(block, tag) {
  return clean(decodeXml(block.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "i"))?.[1] || ""), 300);
}

function xmlValues(block, tag) {
  return [...block.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "gi"))].map((match) => clean(decodeXml(match[1]), 300)).filter(Boolean);
}

export function parseUnSanctionsXml(xml) {
  const generatedAt = xml.match(/<CONSOLIDATED_LIST\b[^>]*\bdateGenerated="([^"]+)"/i)?.[1] || null;
  const records = [];
  for (const type of ["INDIVIDUAL", "ENTITY"]) {
    const pattern = new RegExp(`<${type}>([\\s\\S]*?)<\\/${type}>`, "gi");
    for (const match of xml.matchAll(pattern)) {
      const block = match[1];
      const primary = ["FIRST_NAME", "SECOND_NAME", "THIRD_NAME", "FOURTH_NAME"].map((tag) => xmlValue(block, tag)).filter(Boolean).join(" ");
      const aliases = xmlValues(block, "ALIAS_NAME");
      const names = [...new Set([primary, ...aliases].map((value) => clean(value)).filter(Boolean))];
      records.push({
        type: type.toLowerCase(), reference_number: xmlValue(block, "REFERENCE_NUMBER"),
        list_type: xmlValue(block, "UN_LIST_TYPE"), listed_on: xmlValue(block, "LISTED_ON"), names,
        normalized_names: names.map(normalizeEvidenceName).filter(Boolean),
      });
    }
  }
  return { generated_at: generatedAt, records };
}

function sanctionSearchNames(submitted) {
  return [...new Set([submitted.legal_name, submitted.company, submitted.contact_name, submitted.representative_name]
    .map((value) => ({ raw: clean(value, 300), normalized: normalizeEvidenceName(value) }))
    .filter((item) => item.normalized.length >= 4 && (item.normalized.includes(" ") || item.normalized.length >= 6))
    .map((item) => JSON.stringify(item)))].map((item) => JSON.parse(item));
}

export function matchUnSanctions(parsed, submitted = {}) {
  const searched = sanctionSearchNames(submitted);
  const matches = [];
  for (const record of parsed.records || []) {
    for (const target of searched) {
      const index = record.normalized_names.indexOf(target.normalized);
      if (index >= 0) matches.push({
        searched_name: target.raw, matched_name: record.names[index], entity_type: record.type,
        reference_number: record.reference_number, list_type: record.list_type, listed_on: record.listed_on,
      });
    }
  }
  return {
    outcome: matches.length ? "exact_name_match" : "no_exact_name_match",
    matches: matches.slice(0, 20), searched_names: searched.map((item) => item.raw),
    generated_at: parsed.generated_at, source_url: UN_SANCTIONS_XML,
    disclaimer: "An exact-name result requires manual identity resolution. No match is not sanctions clearance.",
  };
}

export async function screenUnSanctions(submitted = {}, { requestSource = requestOfficialSource, now = Date.now } = {}) {
  if (!sanctionSearchNames(submitted).length) return { outcome: "not_applicable", matches: [], source_url: UN_SANCTIONS_XML };
  const cached = cache.get("un-sanctions");
  try {
    let parsed;
    if (cached && cached.expiresAt > now()) parsed = cached.value;
    else {
      const response = await requestSource(UN_SANCTIONS_XML, { allowedHosts: UN_ALLOWED_HOSTS, maxBytes: 3_000_000, accept: "application/xml, text/xml, application/octet-stream" });
      parsed = parseUnSanctionsXml(response.body);
      if (!parsed.records.length) throw new Error("empty_sanctions_list");
      cache.set("un-sanctions", { value: parsed, expiresAt: now() + 6 * 60 * 60 * 1000 });
    }
    return matchUnSanctions(parsed, submitted);
  } catch {
    return { outcome: "unavailable", matches: [], source_url: UN_SANCTIONS_XML };
  }
}

function submittedDomain(submitted = {}) {
  try {
    const raw = clean(submitted.company_url || submitted.website, 2000);
    if (!raw) return "";
    return new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).hostname.toLowerCase().replace(/^www\./, "");
  } catch { return ""; }
}

function submittedLicenceNumber(submitted = {}) {
  const explicit = clean(submitted.license_number || submitted.licence_number, 120);
  if (explicit) return explicit.toUpperCase();
  const freeText = clean(`${submitted.license || ""} ${submitted.qualification_notes || ""}`, 4000);
  return clean(freeText.match(/MGA\/[A-Z0-9-]+\/\d+\/\d+(?:-\d+)?|OGL\/\d{4}\/\d+\/\d+|\d{5,6}-[A-Z]-\d{6}-\d{3}/i)?.[0], 120).toUpperCase();
}

function sameDomain(left, right) {
  const a = clean(left, 300).toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[/?#]/)[0];
  const b = clean(right, 300).toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[/?#]/)[0];
  return Boolean(a && b && (a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`)));
}

function submittedNameMatches(recordName, submitted = {}) {
  const expected = normalizeEvidenceName(submitted.legal_name || submitted.company);
  return Boolean(expected && normalizeEvidenceName(recordName) === expected);
}

function evidenceUrl(value) {
  try {
    const url = new URL(clean(value, 4000));
    return url.protocol === "https:" && !url.username && !url.password ? url : null;
  } catch { return null; }
}

function submittedLicenceEvidenceUrl(submitted = {}) {
  const explicit = evidenceUrl(submitted.license_evidence_url || submitted.licence_evidence_url);
  if (explicit) return explicit;
  const freeText = `${submitted.license || ""} ${submitted.qualification_notes || ""}`;
  for (const match of freeText.match(/https:\/\/[^\s<>"']+/gi) || []) {
    const candidate = evidenceUrl(match.replace(/[),.;\]]+$/, ""));
    if ([
      "authorisation.mga.org.mt", "cert.cga.cw", "www.gamblingcommission.gov.uk", "gamblingcommission.gov.uk",
      "www.gamblingdivision.gov.gi", "gamblingdivision.gov.gi", "www.isleofmangsc.com", "isleofmangsc.com",
      "gamingcommission.ca", "www.gamingcommission.ca", "www.spelinspektionen.se", "spelinspektionen.se",
      "www.igamingontario.ca", "igamingontario.ca", "www.agco.ca", "agco.ca",
    ].includes(candidate?.hostname)) return candidate;
  }
  return null;
}

export function parseMgaAuthorisationHtml(html, submitted = {}, sourceUrl = MGA_AUTHORISATION) {
  const text = visibleHtmlText(html);
  const legalName = clean(text.match(/Licensee Information\s*:\s*(.*?)\s+Address\s*:/i)?.[1], 300);
  const status = clean(text.match(/Status Of Licence\s*:\s*([A-Za-z ]+?)(?:\s+Licen[cs]es?\b|\s+Licence Number\b)/i)?.[1], 80);
  const licenceNumbers = [...new Set(text.match(/MGA\/[A-Z0-9-]+\/\d+\/\d+(?:-\d+)?/gi) || [])];
  const licenceRecords = licenceNumbers.map((number) => {
    const escaped = number.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const rowStatus = clean(text.match(new RegExp(`${escaped}[\\s\\S]{0,500}?\\b(Licensed|Suspended|Expired|Revoked|Surrendered|Cancelled|Pending)\\b`, "i"))?.[1], 40);
    return { licence_number: number, status: rowStatus || "unknown" };
  });
  const domains = [...new Set([...String(html || "").matchAll(/https?:\/\/[^\s"'<>]+/gi)].map((match) => {
    try { return new URL(match[0].replace(/&amp;/gi, "&")).hostname.toLowerCase().replace(/^www\./, ""); } catch { return ""; }
  }).filter((domain) => domain && !domain.endsWith("mga.org.mt") && domain !== "fonts.gstatic.com"))];
  const submittedNumber = submittedLicenceNumber(submitted);
  const domain = submittedDomain(submitted);
  const exactName = submittedNameMatches(legalName, submitted);
  const numberMatch = Boolean(submittedNumber && licenceNumbers.some((item) => item.toUpperCase() === submittedNumber));
  const submittedLicenceStatus = licenceRecords.find((item) => item.licence_number.toUpperCase() === submittedNumber)?.status || "unknown";
  const domainMatch = Boolean(domain && domains.some((item) => sameDomain(item, domain)));
  const active = /^licensed$/i.test(status) && /^licensed$/i.test(submittedLicenceStatus);
  const verified = active && exactName && numberMatch && domainMatch;
  return {
    regulator: "MGA", outcome: !legalName ? "not_found" : !active ? "inactive_or_adverse_status" : verified ? "verified_identifier_match" : "candidate_match",
    verified, status: status || "unknown", submitted_licence_status: submittedLicenceStatus, legal_name: legalName || null, licence_numbers: licenceNumbers,
    licence_records: licenceRecords,
    domains, exact_name: exactName, licence_number_match: numberMatch, domain_match: domainMatch,
    match_basis: verified ? "legal_name_licence_number_and_domain" : "partial_identifiers",
    source_url: sourceUrl,
  };
}

export function parseCgaCertificateHtml(html, submitted = {}, sourceUrl = CGA_CERTIFICATE) {
  const text = visibleHtmlText(html);
  const unavailable = /\bNot Found\b|cannot be found in our registry|wrong identification values/i.test(text);
  const removed = /\bNot Active\b|domain has been removed from the registry/i.test(text);
  const match = text.match(/certify that\s+([^\s,]+)\s+is operated by\s+(.+?),\s+a company incorporated[\s\S]*?Company Number\s+([^\s,]+)[\s\S]*?license number\s+([^\s,]+)[\s\S]*?current status is\s+([A-Za-z ]+?)(?:\s+Image|\s+Copyright|$)/i);
  const domain = clean(match?.[1], 300).toLowerCase().replace(/^www\./, "");
  const legalName = clean(match?.[2], 300);
  const companyNumber = clean(match?.[3], 120);
  const licenceNumber = clean(match?.[4], 120);
  const status = clean(match?.[5], 80) || (removed ? "Not Active" : unavailable ? "Not Found" : "unknown");
  const exactName = submittedNameMatches(legalName, submitted);
  const numberMatch = Boolean(submittedLicenceNumber(submitted) && licenceNumber.toUpperCase() === submittedLicenceNumber(submitted));
  const domainMatch = Boolean(submittedDomain(submitted) && sameDomain(domain, submittedDomain(submitted)));
  const registration = clean(submitted.registration_number || submitted.registry_code, 120).toUpperCase();
  const companyNumberMatch = registration ? companyNumber.toUpperCase() === registration : null;
  const active = /^active$/i.test(status);
  const verified = active && exactName && numberMatch && domainMatch && companyNumberMatch !== false;
  return {
    regulator: "CGA", outcome: unavailable ? "not_found" : removed || !active && Boolean(match) ? "inactive_or_adverse_status" : verified ? "verified_identifier_match" : match ? "candidate_match" : "unavailable",
    verified, status, legal_name: legalName || null, company_number: companyNumber || null,
    licence_number: licenceNumber || null, domain: domain || null, exact_name: exactName,
    licence_number_match: numberMatch, domain_match: domainMatch, company_number_match: companyNumberMatch,
    match_basis: verified ? "legal_name_licence_number_and_domain" : "partial_identifiers",
    source_url: sourceUrl,
  };
}

function parseCsv(text) {
  const input = String(text || "");
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let index = 0; index < input.length; index++) {
    const char = input[index];
    if (quoted) {
      if (char === '"' && input[index + 1] === '"') { field += '"'; index++; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { row.push(field); field = ""; }
    else if (char === "\n") { row.push(field.replace(/\r$/, "")); rows.push(row); row = []; field = ""; }
    else field += char;
  }
  if (field || row.length) { row.push(field.replace(/\r$/, "")); rows.push(row); }
  const headers = (rows.shift() || []).map((item) => item.replace(/^\uFEFF/, "").trim());
  return rows.filter((item) => item.some(Boolean)).map((items) => Object.fromEntries(headers.map((header, index) => [header, clean(items[index], 1000)])));
}

function htmlCells(rowHtml) {
  return [...String(rowHtml || "").matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]\s*>/gi)]
    .map((match) => ({ raw: match[1], text: visibleHtmlText(match[1]) }));
}

function htmlDomains(fragment, excludedHosts = []) {
  const excluded = new Set(excludedHosts.map((item) => item.toLowerCase()));
  return [...new Set([...String(fragment || "").matchAll(/href=["']([^"']+)["']/gi)].map((match) => {
    try {
      const url = new URL(decodeXml(match[1]));
      return url.protocol.startsWith("http") ? url.hostname.toLowerCase().replace(/^www\./, "") : "";
    } catch { return ""; }
  }).filter((domain) => domain && !excluded.has(domain) && !excluded.has(`www.${domain}`)))];
}

function publishedDateFromText(text) {
  const match = clean(text, 100_000).match(/(?:last\s+updated|listing\s+is\s+accurate\s+as\s+of|updated)\s*:?\s*([A-Za-z]+\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4}|\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]+\s+\d{4})/i);
  if (!match) return null;
  const parsed = Date.parse(match[1].replace(/(\d)(?:st|nd|rd|th)\b/gi, "$1"));
  if (!Number.isFinite(parsed)) return null;
  const date = new Date(parsed);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function registryIsFresh(publishedAt, now = new Date(), maxAgeDays = 120) {
  if (!publishedAt) return false;
  const age = (new Date(now).getTime() - new Date(`${publishedAt}T00:00:00Z`).getTime()) / 86_400_000;
  return age >= -2 && age <= maxAgeDays;
}

function gibraltarNameVariants(value) {
  const raw = clean(value, 500).replace(/\s+Approved Brands?\s*$/i, "");
  const withoutGroup = raw.replace(/\s*\([^)]*(?:group|t\/a|formerly|incorporating)[^)]*\)\s*/gi, " ").trim();
  const withoutTrailingBrand = withoutGroup.replace(/^(.+\b(?:limited|ltd\.?|plc|inc\.?|llc))\s+\([^)]*\)\s*$/i, "$1").trim();
  return [...new Set([raw, withoutGroup, withoutTrailingBrand, ...withoutTrailingBrand.split(/\s+&\s+/)].map(normalizeEvidenceName).filter(Boolean))];
}

export function parseGibraltarRegisterHtml(html, submitted = {}, sourceUrl = GIBRALTAR_REGISTER) {
  const expectedName = normalizeEvidenceName(submitted.legal_name || submitted.company);
  const rows = [...String(html || "").matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr\s*>/gi)].map((match) => htmlCells(match[1]))
    .filter((cells) => cells.length >= 3 && /^\d+$/.test(cells[0].text.replace(/\D/g, "")));
  const records = rows.map((cells) => ({
    register_position: Number(cells[0].text.replace(/\D/g, "")),
    published_name: clean(cells[1].text.replace(/\s+Approved Brands?\s*$/i, ""), 500),
    name_variants: gibraltarNameVariants(cells[1].text),
    approved_brands_url: clean(cells[1].raw.match(/href=["']([^"']+\.pdf)["']/i)?.[1], 2000) || null,
    licence_categories: clean(cells[2].text, 500),
  }));
  const record = records.find((item) => expectedName && item.name_variants.includes(expectedName)) || null;
  return {
    regulator: "GIBRALTAR", outcome: record ? "candidate_match" : "not_found", verified: false,
    status: record ? "Listed in current licence-holder register" : "Not found",
    legal_name: record?.published_name || null, exact_name: Boolean(record), domain_match: false,
    licence_number_match: null, public_licence_number: false,
    licence_categories: record?.licence_categories || null, approved_brands_url: record?.approved_brands_url || null,
    match_basis: record ? "exact_legal_name_only_domain_and_number_not_published_in_register" : "none",
    limitation: "The public register confirms the licence holder name and category, but the main register does not publish a licence number or bind the submitted domain.",
    source_url: sourceUrl,
  };
}

export function parseIomGscRegisterHtml(html, submitted = {}, sourceUrl = IOM_GSC_REGISTER, now = new Date()) {
  const tables = [...String(html || "").matchAll(/<table\b[^>]*>([\s\S]*?)<\/table\s*>/gi)];
  const records = tables.map((table) => {
    const fields = new Map();
    for (const row of table[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr\s*>/gi)) {
      const cells = htmlCells(row[1]);
      if (cells.length >= 2) fields.set(cells[0].text.toLowerCase().replace(/\s+/g, " "), { text: cells[1].text, raw: cells[1].raw });
    }
    const domainField = [...fields.entries()].find(([key]) => /website domains?/.test(key))?.[1];
    return {
      legal_name: fields.get("company name")?.text || "", status: fields.get("licence status")?.text || "",
      valid_from: fields.get("licence valid from")?.text || "", valid_to: fields.get("licence valid to")?.text || "",
      licence_type: [...fields.entries()].find(([key]) => /ogra licence type/.test(key))?.[1]?.text || "",
      domains: htmlDomains(domainField?.raw || "", ["isleofmangsc.com", "www.isleofmangsc.com"]),
    };
  }).filter((item) => item.legal_name);
  const record = records.find((item) => submittedNameMatches(item.legal_name, submitted)) || null;
  const active = Boolean(record && /^active$/i.test(record.status) && (/^current$/i.test(record.valid_to) || Date.parse(record.valid_to) >= new Date(now).getTime()));
  const domainMatch = Boolean(record && submittedDomain(submitted) && record.domains.some((domain) => sameDomain(domain, submittedDomain(submitted))));
  const verified = active && domainMatch;
  const registerUpdatedAt = publishedDateFromText(visibleHtmlText(html));
  return {
    regulator: "IOM_GSC", outcome: !record ? "not_found" : !active ? "inactive_or_adverse_status" : verified ? "verified_registry_match" : "candidate_match",
    verified, status: record?.status || "Not found", legal_name: record?.legal_name || null,
    valid_from: record?.valid_from || null, valid_to: record?.valid_to || null, licence_type: record?.licence_type || null,
    domains: record?.domains || [], exact_name: Boolean(record), domain_match: domainMatch,
    licence_number_match: null, public_licence_number: false, register_updated_at: registerUpdatedAt,
    match_basis: verified ? "active_legal_name_domain_and_validity_dates_no_public_licence_number" : record ? "partial_identifiers" : "none",
    source_url: sourceUrl,
  };
}

export function parseKahnawakePermitHoldersHtml(html, submitted = {}, sourceUrl = KGC_PERMIT_HOLDERS, now = new Date()) {
  const table = String(html || "").match(/<figure\b[^>]*\bid=["']phTable["'][^>]*>[\s\S]*?<table\b[^>]*>([\s\S]*?)<\/table\s*>/i)?.[1] || "";
  const rows = [...table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr\s*>/gi)].map((match) => htmlCells(match[1])).filter((cells) => cells.length >= 2);
  const records = rows.map((cells) => ({ legal_name: cells[0].text, domains: htmlDomains(cells[1].raw, ["gamingcommission.ca", "www.gamingcommission.ca"]) })).filter((item) => item.legal_name && !/^operator$/i.test(item.legal_name));
  const matched = records.filter((item) => submittedNameMatches(item.legal_name, submitted));
  const domain = submittedDomain(submitted);
  const record = matched.find((item) => domain && item.domains.some((value) => sameDomain(value, domain))) || matched[0] || null;
  const domainMatch = Boolean(record && domain && record.domains.some((value) => sameDomain(value, domain)));
  const registerUpdatedAt = publishedDateFromText(visibleHtmlText(html));
  const registerFresh = registryIsFresh(registerUpdatedAt, now);
  const verified = Boolean(record && domainMatch && registerFresh);
  return {
    regulator: "KGC", outcome: !record ? "not_found" : verified ? "verified_registry_match" : "candidate_match",
    verified, status: record ? "Published certified permit-holder list" : "Not found", legal_name: record?.legal_name || null,
    domains: matched.flatMap((item) => item.domains).slice(0, 100), exact_name: Boolean(record), domain_match: domainMatch,
    licence_number_match: null, public_licence_number: false, register_updated_at: registerUpdatedAt, register_fresh: registerFresh,
    match_basis: verified ? "certified_legal_name_and_domain_in_fresh_official_list" : record ? "official_name_domain_list_is_stale_or_partial" : "none",
    limitation: registerFresh ? null : "The regulator page identifies certified operators and domains but is explicitly dated older than the freshness window, so it is not treated as current verification.",
    source_url: sourceUrl,
  };
}

export function matchSwedenRegistry(records = [], submitted = {}, now = new Date(), sourceUrl = SGA_REGISTER) {
  const exact = records.filter((item) => submittedNameMatches(item?.licenseHolder?.licenseHolderName, submitted));
  const current = exact.filter((item) => /^(aktiv|active)$/i.test(clean(item?.licenseStatus?.licenseStatusName, 80)) &&
    (!item.licenseFrom || new Date(item.licenseFrom).getTime() <= new Date(now).getTime()) &&
    (!item.licenseTo || new Date(item.licenseTo).getTime() >= new Date(now).getTime()));
  const domain = submittedDomain(submitted);
  const matched = current.find((item) => domain && (item.licenseUrls || []).some((entry) => sameDomain(entry?.licenseUrl, domain))) || null;
  const holder = exact[0]?.licenseHolder || null;
  const verified = Boolean(matched);
  return {
    regulator: "SGA", outcome: !exact.length ? "not_found" : !current.length ? "inactive_or_adverse_status" : verified ? "verified_registry_match" : "candidate_match",
    verified, status: current.length ? "Active" : exact.length ? "No current active licence" : "Not found",
    legal_name: holder?.licenseHolderName || null, holder_id: holder?.licenseHolderId || null,
    licence_id: matched?.licenseId || null, licence_type: matched?.licenseType?.licenseTypeName || null,
    valid_from: matched?.licenseFrom || null, valid_to: matched?.licenseTo || null,
    domains: current.flatMap((item) => (item.licenseUrls || []).map((entry) => entry?.licenseUrl).filter(Boolean)).slice(0, 100),
    exact_name: Boolean(exact.length), domain_match: verified, licence_number_match: null, public_licence_number: false,
    match_basis: verified ? "active_legal_name_domain_registry_id_and_validity_dates_no_public_licence_number" : exact.length ? "partial_identifiers" : "none",
    source_url: sourceUrl,
  };
}

export function parseOntarioOperatorDirectoryHtml(html, submitted = {}, sourceUrl = ONTARIO_OPERATOR_DIRECTORY, now = new Date()) {
  const headings = [...String(html || "").matchAll(/<h3\b[^>]*>([\s\S]*?)<\/h3\s*>/gi)];
  const records = headings.map((match, index) => {
    const fragment = String(html || "").slice(match.index + match[0].length, headings[index + 1]?.index ?? String(html || "").length);
    if (!/operator-item/i.test(fragment)) return null;
    return { legal_name: visibleHtmlText(match[1]), domains: htmlDomains(fragment, ["igamingontario.ca", "www.igamingontario.ca"]) };
  }).filter(Boolean);
  const matched = records.filter((item) => submittedNameMatches(item.legal_name, submitted));
  const domain = submittedDomain(submitted);
  const record = matched.find((item) => domain && item.domains.some((value) => sameDomain(value, domain))) || matched[0] || null;
  const domainMatch = Boolean(record && domain && record.domains.some((value) => sameDomain(value, domain)));
  const registerUpdatedAt = publishedDateFromText(visibleHtmlText(html));
  const registerFresh = registryIsFresh(registerUpdatedAt, now);
  const verified = Boolean(record && domainMatch && registerFresh);
  return {
    regulator: "ONTARIO", outcome: !record ? "not_found" : verified ? "verified_registry_match" : "candidate_match",
    verified, status: record ? "Registered and approved operator contracted by iGaming Ontario" : "Not found",
    legal_name: record?.legal_name || null, domains: matched.flatMap((item) => item.domains).slice(0, 100),
    exact_name: Boolean(record), domain_match: domainMatch, licence_number_match: null, public_licence_number: false,
    register_updated_at: registerUpdatedAt, register_fresh: registerFresh,
    authorization_model: "AGCO registration plus iGaming Ontario operating agreement",
    match_basis: verified ? "registered_approved_legal_name_domain_and_current_iGO_directory" : record ? "partial_identifiers_or_stale_directory" : "none",
    source_url: sourceUrl,
  };
}

export function matchUkgcRegistry(registry = {}, submitted = {}) {
  const expectedName = normalizeEvidenceName(submitted.legal_name || submitted.company);
  const expectedNumber = submittedLicenceNumber(submitted);
  const expectedDomain = submittedDomain(submitted);
  const businesses = Array.isArray(registry.businesses) ? registry.businesses : [];
  const domains = Array.isArray(registry.domains) ? registry.domains : [];
  const licences = Array.isArray(registry.licences) ? registry.licences : [];
  const nameAccounts = new Set(businesses.filter((row) => expectedName && normalizeEvidenceName(row["Licence Account Name"]) === expectedName).map((row) => row["Account Number"]));
  const numberAccounts = new Set(licences.filter((row) => expectedNumber && row["Licence Number"].toUpperCase() === expectedNumber).map((row) => row["Account Number"]));
  const currentDomain = (row) => /^(active|white label)$/i.test(row.Status);
  const domainAccounts = new Set(domains.filter((row) => expectedDomain && currentDomain(row) && sameDomain(row["Domain Name"], expectedDomain)).map((row) => row["Account Number"]));
  const candidates = [...new Set([...nameAccounts, ...numberAccounts, ...domainAccounts])];
  const account = candidates.find((value) => nameAccounts.has(value) && numberAccounts.has(value) && domainAccounts.has(value)) ||
    candidates.find((value) => numberAccounts.has(value)) || candidates.find((value) => nameAccounts.has(value)) || candidates[0] || null;
  const legalName = businesses.find((row) => row["Account Number"] === account)?.["Licence Account Name"] || null;
  const accountLicences = licences.filter((row) => row["Account Number"] === account);
  const matchingLicence = accountLicences.find((row) => expectedNumber && row["Licence Number"].toUpperCase() === expectedNumber) || null;
  const activeRemote = accountLicences.filter((row) => /^active$/i.test(row.Status) && /remote/i.test(row.Type));
  const matchingDomainRows = domains.filter((row) => row["Account Number"] === account && currentDomain(row));
  const matchingDomains = matchingDomainRows.map((row) => row["Domain Name"]);
  const submittedDomainRecord = matchingDomainRows.find((row) => sameDomain(row["Domain Name"], expectedDomain)) || null;
  const exactName = Boolean(account && nameAccounts.has(account));
  const numberMatch = Boolean(account && numberAccounts.has(account));
  const domainMatch = Boolean(account && domainAccounts.has(account));
  const active = Boolean(matchingLicence && /^active$/i.test(matchingLicence.Status) && /remote/i.test(matchingLicence.Type));
  const verified = exactName && numberMatch && domainMatch && active;
  const adverse = Boolean(matchingLicence && !/^active$/i.test(matchingLicence.Status));
  return {
    regulator: "UKGC", outcome: !account ? "not_found" : adverse ? "inactive_or_adverse_status" : verified ? "verified_identifier_match" : "candidate_match",
    verified, status: matchingLicence?.Status || (activeRemote.length ? "Active" : "unknown"), account_number: account,
    legal_name: legalName, licence_number: matchingLicence?.["Licence Number"] || null,
    licence_type: matchingLicence?.Type || null, activity: matchingLicence?.Activity || null,
    exact_name: exactName, licence_number_match: numberMatch, domain_match: domainMatch,
    active_remote_licences: activeRemote.slice(0, 20), domains: matchingDomains.slice(0, 50),
    submitted_domain_status: submittedDomainRecord?.Status || null,
    match_basis: verified ? "legal_name_licence_number_and_domain" : "partial_identifiers",
    source_url: account ? `${UKGC_REGISTER}/detail/${encodeURIComponent(account)}` : UKGC_REGISTER,
  };
}

async function loadUkgcRegistry({ requestSource = requestOfficialSource, now = Date.now } = {}) {
  const cached = cache.get("ukgc-register");
  if (cached && cached.expiresAt > now()) return cached.value;
  const allowedHosts = new Set(["www.gamblingcommission.gov.uk"]);
  const responses = await Promise.all(Object.values(UKGC_FILES).map((url) => requestSource(url, {
    allowedHosts, maxBytes: 1_500_000, accept: "text/csv, text/plain",
  })));
  const value = {
    businesses: parseCsv(responses[0].body), domains: parseCsv(responses[1].body), licences: parseCsv(responses[2].body),
  };
  if (!value.businesses.length || !value.domains.length || !value.licences.length) throw new Error("empty_ukgc_register");
  cache.set("ukgc-register", { value, expiresAt: now() + 6 * 60 * 60 * 1000 });
  return value;
}

async function loadSwedenRegistry(submitted = {}, { requestSource = requestOfficialSource, now = Date.now } = {}) {
  const legalName = clean(submitted.legal_name || submitted.company, 300);
  if (!legalName) return [];
  const cacheKey = `sga-register:${normalizeEvidenceName(legalName)}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > now()) return cached.value;
  const searchUrl = new URL(SGA_API);
  searchUrl.searchParams.set("query", legalName);
  searchUrl.searchParams.set("page", "1");
  const searchResponse = await requestSource(searchUrl.href, {
    allowedHosts: new Set(["www.spelinspektionen.se"]), maxBytes: 1_500_000, accept: "application/json",
  });
  const search = JSON.parse(searchResponse.body);
  const exactHolders = (Array.isArray(search?.holders) ? search.holders : []).filter((holder) =>
    normalizeEvidenceName(holder?.name) === normalizeEvidenceName(legalName) && /^[A-F0-9]{64}$/i.test(clean(holder?.id, 100))).slice(0, 5);
  const records = (await Promise.all(exactHolders.map(async (holder) => {
    const url = new URL("GetLicensesForHolder", SGA_API);
    url.searchParams.set("holderId", holder.id);
    const response = await requestSource(url.href, {
      allowedHosts: new Set(["www.spelinspektionen.se"]), maxBytes: 1_500_000, accept: "application/json",
    });
    const body = JSON.parse(response.body);
    return Array.isArray(body) ? body : [];
  }))).flat();
  cache.set(cacheKey, { value: records, expiresAt: now() + 6 * 60 * 60 * 1000 });
  return records;
}

async function loadOfficialHtml(url, allowedHosts, { requestSource = requestOfficialSource, now = Date.now } = {}) {
  const cacheKey = `official-html:${url}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > now()) return cached.value;
  const response = await requestSource(url, { allowedHosts: new Set(allowedHosts), maxBytes: 2_000_000, accept: "text/html, application/xhtml+xml" });
  if (!/<html|<table|<h3/i.test(response.body)) throw new Error("unexpected_official_html");
  cache.set(cacheKey, { value: response.body, expiresAt: now() + 6 * 60 * 60 * 1000 });
  return response.body;
}

function regulatorFromSubmission(submitted = {}) {
  const jurisdiction = clean(`${submitted.license_jurisdiction || ""} ${submitted.licence_jurisdiction || ""} ${submitted.license || ""} ${submitted.qualification_notes || ""}`, 4000).toUpperCase();
  const url = submittedLicenceEvidenceUrl(submitted);
  if (url?.hostname === "authorisation.mga.org.mt") return "MGA";
  if (url?.hostname === "cert.cga.cw") return "CGA";
  if (url?.hostname === "www.gamblingcommission.gov.uk" || url?.hostname === "gamblingcommission.gov.uk") return "UKGC";
  if (url?.hostname === "www.gamblingdivision.gov.gi" || url?.hostname === "gamblingdivision.gov.gi") return "GIBRALTAR";
  if (url?.hostname === "www.isleofmangsc.com" || url?.hostname === "isleofmangsc.com") return "IOM_GSC";
  if (url?.hostname === "gamingcommission.ca" || url?.hostname === "www.gamingcommission.ca") return "KGC";
  if (url?.hostname === "www.spelinspektionen.se" || url?.hostname === "spelinspektionen.se") return "SGA";
  if (["www.igamingontario.ca", "igamingontario.ca", "www.agco.ca", "agco.ca"].includes(url?.hostname)) return "ONTARIO";
  if (/\b(MALTA|MGA)\b/.test(jurisdiction)) return "MGA";
  if (/CURACAO|CURAÇAO|\bCGA\b/.test(jurisdiction)) return "CGA";
  if (/GIBRALTAR|GAMBLING DIVISION/.test(jurisdiction)) return "GIBRALTAR";
  if (/ISLE OF MAN|\bIOM\b|\bOGRA\b/.test(jurisdiction)) return "IOM_GSC";
  if (/KAHNAWAKE|KAHNAWÀ:KE|KAHNAWÁ:KE|KAHNAWÀKE|KAHNAWÁKE/.test(jurisdiction)) return "KGC";
  if (/SWEDEN|SWEDISH GAMBLING AUTHORITY|SPELINSPEKTIONEN/.test(jurisdiction)) return "SGA";
  if (/ONTARIO|\bAGCO\b|IGAMING ONTARIO/.test(jurisdiction)) return "ONTARIO";
  if (/\b(UKGC|UNITED KINGDOM|GREAT BRITAIN|UK GAMBLING COMMISSION|UK|GB)\b/.test(jurisdiction)) return "UKGC";
  return null;
}

export async function verifyGamingLicence(submitted = {}, {
  requestSource = requestOfficialSource, now = Date.now, loadUkgc = loadUkgcRegistry, loadSweden = loadSwedenRegistry,
} = {}) {
  const regulator = regulatorFromSubmission(submitted);
  const gamblingContext = /(?:casino|gambling|betting|sportsbook|igaming|i-gaming)/i.test(clean(`${submitted.vertical || ""} ${submitted.sphere || ""} ${submitted.details || ""}`, 5000));
  const claimed = submitted.license_status === "licensed" || Boolean(submittedLicenceNumber(submitted)) || Boolean(clean(submitted.license_jurisdiction || submitted.licence_jurisdiction));
  if (!regulator) return { regulator: null, outcome: gamblingContext || claimed ? "unsupported_or_unspecified_regulator" : "not_applicable", verified: false, source_url: null };
  try {
    if (regulator === "UKGC") return matchUkgcRegistry(await loadUkgc({ requestSource, now }), submitted);
    if (regulator === "SGA") return matchSwedenRegistry(await loadSweden(submitted, { requestSource, now }), submitted, new Date(now()));
    if (regulator === "GIBRALTAR") return parseGibraltarRegisterHtml(await loadOfficialHtml(GIBRALTAR_REGISTER,
      ["www.gamblingdivision.gov.gi", "gamblingdivision.gov.gi"], { requestSource, now }), submitted);
    if (regulator === "IOM_GSC") return parseIomGscRegisterHtml(await loadOfficialHtml(IOM_GSC_REGISTER,
      ["www.isleofmangsc.com", "isleofmangsc.com"], { requestSource, now }), submitted, IOM_GSC_REGISTER, new Date(now()));
    if (regulator === "KGC") return parseKahnawakePermitHoldersHtml(await loadOfficialHtml(KGC_PERMIT_HOLDERS,
      ["gamingcommission.ca", "www.gamingcommission.ca"], { requestSource, now }), submitted, KGC_PERMIT_HOLDERS, new Date(now()));
    if (regulator === "ONTARIO") return parseOntarioOperatorDirectoryHtml(await loadOfficialHtml(ONTARIO_OPERATOR_DIRECTORY,
      ["www.igamingontario.ca", "igamingontario.ca"], { requestSource, now }), submitted, ONTARIO_OPERATOR_DIRECTORY, new Date(now()));
    const url = submittedLicenceEvidenceUrl(submitted);
    const validMga = regulator === "MGA" && url?.hostname === "authorisation.mga.org.mt" && url.pathname.toLowerCase() === "/verification.aspx" && /^[0-9a-f-]{36}$/i.test(url.searchParams.get("company") || "");
    const validCga = regulator === "CGA" && url?.hostname === "cert.cga.cw" && url.pathname.toLowerCase() === "/certificate" && Boolean(url.searchParams.get("id"));
    if (!url) return { regulator, outcome: "evidence_url_required", verified: false, source_url: regulator === "MGA" ? MGA_AUTHORISATION : CGA_CERTIFICATE };
    if (!validMga && !validCga) return { regulator, outcome: "invalid_evidence_url", verified: false, source_url: regulator === "MGA" ? MGA_AUTHORISATION : CGA_CERTIFICATE };
    const response = await requestSource(url.href, {
      allowedHosts: new Set([url.hostname]), maxBytes: 2_000_000, accept: "text/html, application/xhtml+xml",
    });
    return regulator === "MGA" ? parseMgaAuthorisationHtml(response.body, submitted, url.href) : parseCgaCertificateHtml(response.body, submitted, url.href);
  } catch {
    return { regulator, outcome: "unavailable", verified: false, source_url: REGULATOR_SOURCES[regulator] || null };
  }
}

export async function collectOfficialCompanyEvidence(submitted = {}, {
  env = process.env, lookupGleif = lookupGleifEntity, screenUn = screenUnSanctions, verifyGaming = verifyGamingLicence,
} = {}) {
  const gleif = env.OFFERPSP_GLEIF_ENABLED === "true" ? lookupGleif(submitted) : Promise.resolve({ outcome: "disabled", verified: false, source_url: GLEIF_API });
  const unSanctions = env.OFFERPSP_UN_SANCTIONS_ENABLED === "true" ? screenUn(submitted) : Promise.resolve({ outcome: "disabled", matches: [], source_url: UN_SANCTIONS_XML });
  const gamingLicence = env.OFFERPSP_GAMBLING_REGULATORS_ENABLED === "true" ? verifyGaming(submitted) : Promise.resolve({ outcome: "disabled", verified: false, regulator: null, source_url: null });
  const [gleifResult, unResult, gamingResult] = await Promise.all([gleif, unSanctions, gamingLicence]);
  return { gleif: gleifResult, gambling_licence: gamingResult, sanctions: { sources: [{ source: "un_consolidated", ...unResult }], coverage: "partial" } };
}
