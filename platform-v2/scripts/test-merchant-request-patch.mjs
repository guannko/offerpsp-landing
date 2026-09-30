import assert from "node:assert/strict";
import { merchantRequestPatch } from "../src/lib/merchantRequestPatch.ts";

const original = { company: "Old company", name: "Boris", work_email: "old@example.test", target_geos: "", requested_methods: "", expected_monthly_volume: "", assigned_to: "staff-id", risk_segment: "auto" };
assert.deepEqual(merchantRequestPatch(original, { ...original }), {});
assert.deepEqual(merchantRequestPatch(original, { ...original, requested_methods: "PIX; UPI", target_geos: "BR, IN", expected_monthly_volume: "100000" }), { requested_methods: ["PIX", "UPI"], target_geos: ["BR", "IN"], expected_monthly_volume: 100000 });
assert.deepEqual(merchantRequestPatch(original, { ...original, risk_segment: "high", assigned_to: "" }), { assigned_to: null });
assert.deepEqual(merchantRequestPatch({ expected_monthly_volume: "100" }, { expected_monthly_volume: "" }), { expected_monthly_volume: null });
console.log("PASS request patch does not overwrite hidden company/contact fields or untouched defaults");
