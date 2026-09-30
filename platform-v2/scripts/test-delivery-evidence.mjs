import assert from "node:assert/strict";
import {
  attachDeliveryEvidence,
  latestEmailDelivery,
  latestTelegramDelivery,
} from "../api/_lib/delivery-evidence.mjs";

const email = latestEmailDelivery({ messages: [
  { direction: "inbound", delivery_status: "sent", external_message_id: "ignored", created_at: "2026-09-27T09:00:00Z" },
  { direction: "outbound", delivery_status: "failed", external_message_id: "ignored-2", created_at: "2026-09-27T10:00:00Z" },
  { direction: "outbound", delivery_status: "sent", external_message_id: "mail-1", sent_at: "2026-09-27T11:00:00Z" },
] });
assert.deepEqual(email, { delivered_at: "2026-09-27T11:00:00Z", reference: "mail-1" });

const telegram = latestTelegramDelivery([
  { status: "sent", external_message_id: "410", sent_at: "2026-09-27T10:00:00Z" },
  { status: "sent", external_message_id: "411", sent_at: "2026-09-27T12:00:00Z" },
]);
assert.deepEqual(telegram, { delivered_at: "2026-09-27T12:00:00Z", reference: "411" });

const verified = attachDeliveryEvidence({ reachable: true, authenticated: true }, telegram, "Telegram");
assert.equal(verified.delivery_tested, true);
assert.equal(verified.delivery_reference, "411");
assert.equal(verified.last_delivery_at, "2026-09-27T12:00:00Z");

const missing = attachDeliveryEvidence({ reachable: true, authenticated: true }, null, "Email");
assert.equal(missing.delivery_tested, false);
assert.equal(missing.delivery_reference, null);

console.log("Delivery evidence tests passed");
