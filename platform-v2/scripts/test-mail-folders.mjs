import assert from "node:assert/strict";
import { buildMailFolderIndex, mailFolderMessage } from "../src/lib/mailFolders.ts";

const message = (id, fields = {}) => ({ id, thread_id: "conversation", direction: "inbound",
  delivery_status: "received", is_read: true, created_at: "2026-10-06T10:00:00Z", ...fields });
const incoming = message("in", { is_read: false });
const outgoing = message("out", { direction: "outbound", delivery_status: "sent",
  is_read: false, sent_at: "2026-10-06T11:00:00Z" });
const draft = message("draft", { direction: "outbound", delivery_status: "draft",
  created_at: "2026-10-06T12:00:00Z" });
const index = buildMailFolderIndex([draft, outgoing, incoming]);
assert.equal(index.unreadCounts.get("conversation"), 1, "an outbound read flag never makes mail unread");
assert.equal(index.latest.get("conversation").id, "out", "drafts cannot replace actual correspondence");
assert.equal(mailFolderMessage(index, "conversation", "inbox").id, "in", "a reply must not remove incoming mail from Inbox");
assert.equal(mailFolderMessage(index, "conversation", "sent").id, "out");
assert.equal(mailFolderMessage(index, "conversation", "unread").id, "in", "unread preview must be the actual incoming letter");
assert.equal(mailFolderMessage(index, "conversation", "all").id, "out");

for (const status of ["draft", "pending", "queued", "failed", "cancelled", "uncertain"]) {
  const result = buildMailFolderIndex([message(status, { direction: "outbound", delivery_status: status })]);
  assert.equal(result.sent.size, 0, `${status} is not a successful send`);
  assert.equal(result.latest.size, 0);
  assert.equal(result.unreadCounts.size, 0);
}
const sentOnly = buildMailFolderIndex([outgoing]);
assert.equal(sentOnly.inbox.size, 0);
assert.equal(sentOnly.unread.size, 0);
const afterRead = buildMailFolderIndex([{ ...incoming, is_read: true }, outgoing, draft]);
assert.equal(afterRead.unread.size, 0);
assert.equal(afterRead.sent.size, 1);
assert.equal(afterRead.inbox.size, 1);
const laterIncoming = message("later-in", { created_at: "2026-10-06T13:00:00Z" });
const replied = buildMailFolderIndex([outgoing, laterIncoming, incoming]);
assert.equal(replied.latest.get("conversation").id, "later-in");
assert.equal(replied.sent.get("conversation").id, "out", "receiving a reply must not remove sent mail");
assert.equal(replied.unread.get("conversation").id, "in", "a newer read letter must not hide an older unread one");
assert.deepEqual([...buildMailFolderIndex([]).latest], []);
console.log("PASS mail folders: inbound-only unread, directional previews, reply preservation, drafts and delivery evidence");
