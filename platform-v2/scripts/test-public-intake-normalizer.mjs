import assert from "node:assert/strict";
import { buildN8nPublicIntakeNormalizerCode, normalizePublicIntake } from "./public-intake-normalizer.mjs";

const complete = normalizePublicIntake({ body: {
  name: "Alex Merchant", work_email: "alex@example.com", company: "Example Merchant Ltd",
  company_url: "https://merchant.example", vertical: "E-commerce", license_status: "not_required",
  target_geos: ["DE", "FR"], requested_currencies: ["eur", "usd"], requested_flows: ["PAYIN", "PAYOUT"],
  requested_methods: ["Cards", "SEPA"], expected_monthly_volume: 250000, volume_currency: "eur",
  average_ticket_amount: 85, average_ticket_currency: "eur", traffic_types: ["Recurring"],
  profile_unknown_fields: [], attribution: { version: 2, intake_brief: { injected: true } }, consent: true,
} });
assert.equal(complete.monthly_volume, "250000 EUR");
assert.deepEqual(complete.attribution.intake_brief.requested_flows, ["PAYIN", "PAYOUT"]);
assert.equal(complete.attribution.intake_brief.average_ticket_amount, 85);
assert.equal(complete.attribution.intake_brief.injected, undefined, "client must not inject a trusted brief envelope");

const unknown = normalizePublicIntake({
  name: "Alex Merchant", work_email: "alex@example.com", company: "Unknown Merchant Ltd",
  vertical: "E-commerce", license_status: "unknown", target_geos: [], requested_currencies: [],
  requested_flows: [], requested_methods: [], expected_monthly_volume: null, average_ticket_amount: null,
  traffic_types: [], profile_unknown_fields: ["company_url", "license_status", "target_geos", "requested_currencies",
    "requested_flows", "requested_methods", "expected_monthly_volume", "average_ticket_amount", "traffic_types"],
  consent: "true",
});
assert.equal(unknown.geos, "Not sure yet");
assert.equal(unknown.attribution.intake_brief.license_status, "unknown");
assert.equal(unknown.attribution.intake_brief.profile_unknown_fields.length, 9);

assert.throws(() => normalizePublicIntake({ ...complete, requested_methods: [], attribution: undefined }), /payment methods/);
assert.throws(() => normalizePublicIntake({ ...complete, expected_monthly_volume: "", attribution: undefined }), /monthly volume/);
assert.match(buildN8nPublicIntakeNormalizerCode(), /normalizePublicIntake\(\$input\.first\(\)\.json\)/);

process.stdout.write("PASS n8n public intake normalization for complete, unknown and incomplete briefs\n");
