import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { collectPortalIntakeBrief, syncPortalIntakeUnknowns } from "../portal/intake-form.js";
import { buildIntakeBriefPayload, validateIntakeBrief } from "../intake-brief.js";
import { normalizePublicIntake } from "../platform-v2/scripts/public-intake-normalizer.mjs";

const html = await readFile(new URL("../portal/index.html", import.meta.url), "utf8");
const formMarkup = html.match(/<form id="newRequestForm"[\s\S]*?<\/form>/)[0];
const canonicalKeys = ["company_url", "license_status", "target_geos", "requested_currencies",
  "requested_flows", "requested_methods", "expected_monthly_volume", "average_ticket_amount", "traffic_types"];
for (const name of ["name", "work_email", "company", "vertical", ...canonicalKeys, "volume_currency", "average_ticket_currency"]) {
  const tag = formMarkup.match(new RegExp(`<(?:input|select)[^>]*name="${name}"[^>]*>`))?.[0];
  assert.ok(tag, `Portal must collect ${name}`);
  assert.match(tag, /\brequired\b/, `Portal must visibly require ${name}`);
}
assert.match(formMarkup, /briefRequiredHint/);
assert.match(html, /app\.js\?v=20261002-quality/);
assert.match(html, /styles\.css\?v=20261002-quality/);

const complete = {
  name: "Alex Merchant", work_email: "wrong@untrusted.example", company: "Example Merchant Ltd",
  company_url: "https://merchant.example", vertical: "iGaming", license_status: "licensed",
  target_geos: "DE, FR", requested_currencies: "eur, usd", requested_flows: "PAYIN,PAYOUT",
  requested_methods: "Cards, SEPA", expected_monthly_volume: "250000", volume_currency: "eur",
  average_ticket_amount: "85", average_ticket_currency: "eur", traffic_types: "Recurring", consent: true,
};
function fixture(values) {
  const controls = [...formMarkup.matchAll(/<(?:input|select)[^>]+>/g)].map(([tag]) => {
    const attr = (key) => tag.match(new RegExp(`${key}="([^"]*)"`))?.[1];
    return { name: attr("name"), value: values[attr("name")] ?? "", required: /\brequired\b/.test(tag),
      disabled: false, checked: false, dataset: { unknownFor: attr("data-unknown-for"),
        briefField: attr("data-brief-field"), required: attr("data-required") } };
  });
  return { controls, querySelectorAll(selector) {
    if (selector.startsWith("[data-unknown-for")) return controls.filter(c => c.dataset.unknownFor
      && (!selector.endsWith(":checked") || c.checked));
    const key = selector.match(/data-brief-field="([^"]*)"/)?.[1];
    return controls.filter(c => c.dataset.briefField === key);
  } };
}
// Node has no browser FormData(form); this adapter exercises collection against
// the actual named controls, respecting the HTML rule that disabled fields are omitted.
const originalFormData = globalThis.FormData;
globalThis.FormData = class extends Map {
  constructor(form) { super(form.controls.filter(c => c.name && !c.disabled).map(c => [c.name, c.value])); }
};
try {
  const form = fixture(complete);
  const collect = () => collectPortalIntakeBrief(form, "alex@example.com");
  const payload = buildIntakeBriefPayload(collect());
  assert.equal(payload.work_email, "alex@example.com", "identity comes from authenticated session");
  assert.deepEqual(payload.requested_flows, ["PAYIN", "PAYOUT"]);
  assert.equal(normalizePublicIntake({ ...payload, consent: true }).monthly_volume, "250000 EUR");

  form.controls.find(c => c.name === "requested_methods").value = "";
  assert.equal(validateIntakeBrief(collect()).valid, false);
  assert.throws(() => buildIntakeBriefPayload(collect()), /payment methods/);
  const unknown = form.controls.find(c => c.dataset.unknownFor === "requested_methods");
  unknown.checked = true;
  syncPortalIntakeUnknowns(form);
  assert.equal(form.controls.find(c => c.name === "requested_methods").required, false);
  const unknownPayload = buildIntakeBriefPayload(collect());
  assert.deepEqual(unknownPayload.requested_methods, []);
  assert.ok(unknownPayload.profile_unknown_fields.includes("requested_methods"));
  assert.equal(normalizePublicIntake({ ...unknownPayload, consent: true }).methods, "Not sure yet");
  unknown.checked = false;
  syncPortalIntakeUnknowns(form);
  assert.equal(validateIntakeBrief(collect()).valid, false, "unchecking must restore validation");
  form.controls.find(c => c.name === "requested_methods").value = "Cards";
  form.controls.find(c => c.name === "requested_flows").value = "unknown";
  assert.ok(buildIntakeBriefPayload(collect()).profile_unknown_fields.includes("requested_flows"));

  const empty = fixture({ work_email: "alex@example.com" });
  const emailOnly = collectPortalIntakeBrief(empty, "alex@example.com");
  assert.equal(validateIntakeBrief(emailOnly).valid, false);
  assert.throws(() => normalizePublicIntake({ work_email: "alex@example.com", consent: true }), /Required merchant brief/);
  assert.throws(() => buildIntakeBriefPayload(emailOnly), /Incomplete merchant brief/);
} finally { globalThis.FormData = originalFormData; }
console.log("PASS portal required brief, authoritative email, both flows, explicit unknown/reset, incomplete and email-only rejection");
