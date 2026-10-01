import assert from "node:assert/strict";
import { mailWorkItem } from "../src/lib/mailWorkQueue.ts";

const now = Date.parse("2026-09-30T12:00:00Z");
const today = Date.parse("2026-09-30T00:00:00Z");
const base = { status: "open", unread_count: 1, last_message_at: "2026-09-30T10:00:00Z" };
const work = (fields) => mailWorkItem({ ...base, ...fields }, now, today);
assert.equal(work({}).scope, "now");
assert.equal(work({ unread_count: 0 }).scope, "now", "reading must not resolve an open thread");
assert.equal(work({ tags: ['system:reply_not_needed'] }), null, 'an explicit no-answer decision resolves work without archiving mail');
assert.equal(work({ status: 'awaiting_reply', tags: ['system:reply_not_needed'] }).scope, 'waiting', 'a stale no-answer marker cannot hide an explicit wait');
for (const status of ["archived", "trashed"]) {
  assert.equal(work({ status, follow_up_at: "2026-08-20", is_flagged: true }), null);
}
assert.equal(work({ status: "closed", updated_at: "2026-09-29" }), null);
assert.equal(work({ status: "closed", follow_up_at: "2026-08-20" }).scope, "done");
assert.equal(work({ status: "awaiting_reply" }).scope, "waiting");
assert.equal(work({ status: "awaiting_reply", follow_up_at: "2026-09-29" }).scope, "now");
assert.equal(work({ follow_up_at: "2026-10-01" }).scope, "later");
assert.equal(work({ follow_up_at: "invalid" }).scope, "now");
const sent = { direction: "outbound", delivery_status: "sent", sent_at: "2026-09-30T11:00:00Z", created_at: "2026-09-30T11:00:00Z" };
assert.equal(mailWorkItem(base, now, today, sent), null, "a proved reply resolves answering, without inventing awaiting_reply");
assert.equal(mailWorkItem(base, now, today, { ...sent, delivery_status: "draft" }).scope, "now");
assert.equal(mailWorkItem({ ...base, last_message_at: "2026-09-30T11:30:00Z" }, now, today, sent).scope, "now", "a newer inbound reopens work even if the message slice is incomplete");
assert.equal(mailWorkItem({ ...base, is_flagged: true }, now, today, sent).scope, "now", "an explicit operator flag is not erased by send evidence");
console.log("PASS mail work queue lifecycle, reading, archive and follow-up precedence");
