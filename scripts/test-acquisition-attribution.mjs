#!/usr/bin/env node

import assert from "node:assert/strict";
import {
  buildAcquisitionTouch,
  buildLeadAttributionFields,
  collectAcquisitionAttribution,
} from "../acquisition-attribution.js";

const memoryStorage = () => {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
  };
};

const google = buildAcquisitionTouch({
  href: "https://offerpsp.com/psp-matching-process.html?utm_source=google&utm_medium=cpc&utm_campaign=eu_psp&gclid=CaseSensitive-123",
  referrer: "https://www.google.com/search?q=payment+provider",
  capturedAt: "2026-08-27T10:00:00.000Z",
});
assert.equal(google.touch.source_category, "campaign");
assert.equal(google.touch.source_platform, "google-ads");
assert.equal(google.touch.gclid, "CaseSensitive-123");
assert.equal(google.touch.referrer, "https://www.google.com/search");

const storage = memoryStorage();
const first = collectAcquisitionAttribution({
  href: "https://offerpsp.com/cross-border-payment-matching.html?utm_source=google&utm_medium=cpc&wbraid=WB-1",
  referrer: "https://google.com/search?q=psp",
  storage,
  cryptoApi: { randomUUID: () => "session-1" },
  now: new Date("2026-08-27T10:00:00.000Z"),
});
const internal = collectAcquisitionAttribution({
  href: "https://offerpsp.com/#request",
  referrer: "https://offerpsp.com/cross-border-payment-matching.html?utm_source=google",
  storage,
  cryptoApi: { randomUUID: () => "should-not-change" },
  now: new Date("2026-08-27T10:02:00.000Z"),
});
assert.deepEqual(internal.first_touch, first.first_touch);
assert.deepEqual(internal.last_touch, first.last_touch);
assert.equal(internal.session_id, "session-1");

const affiliate = collectAcquisitionAttribution({
  href: "https://offerpsp.com/?utm_source=partner-x&utm_medium=affiliate&affiliate_id=agent-42&click_id=click-99",
  storage: memoryStorage(),
  cryptoApi: { randomUUID: () => "session-2" },
  now: new Date("2026-08-27T11:00:00.000Z"),
});
const fields = buildLeadAttributionFields(affiliate);
assert.equal(fields.source_platform, "partner-x");
assert.equal(fields.affiliate_id, "agent-42");
assert.equal(fields.affiliate_click_id, "click-99");
assert.equal(fields.first_touch_at, "2026-08-27T11:00:00.000Z");

process.stdout.write("PASS acquisition attribution preserves paid and affiliate first/last touch\n");
