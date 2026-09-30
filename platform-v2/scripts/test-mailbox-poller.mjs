import assert from "node:assert/strict";
import { parseMailboxMessage, pollOfferPspMailbox, resolveMailboxIngestUrl } from "../api/_lib/mailbox-poller.mjs";

assert.equal(
  resolveMailboxIngestUrl({
    ingestUrl: "https://canonical.supabase.co/functions/v1/offerpsp-ingest-email",
    supabaseUrl: "https://canonical.supabase.co",
  }),
  "https://canonical.supabase.co/functions/v1/offerpsp-ingest-email",
);
assert.throws(
  () => resolveMailboxIngestUrl({
    ingestUrl: "https://legacy.supabase.co/functions/v1/offerpsp-ingest-email",
    supabaseUrl: "https://canonical.supabase.co",
  }),
  /does not match the canonical Supabase project/,
);
assert.throws(
  () => resolveMailboxIngestUrl({
    ingestUrl: "http://canonical.supabase.co/functions/v1/offerpsp-ingest-email",
    supabaseUrl: "https://canonical.supabase.co",
  }),
  /must use HTTPS/,
);

const source = Buffer.from([
  "From: Partner <partner@example.com>",
  "To: bizdev@offerpsp.com",
  "Subject: OfferPSP inbound test",
  "Message-ID: <offerpsp-test@example.com>",
  "Date: Tue, 11 Aug 2026 23:22:11 +0000",
  "Content-Type: text/plain; charset=utf-8",
  "",
  "External inbound mailbox verification.",
].join("\r\n"));

const parsed = await parseMailboxMessage({ source, uid: 7, uidValidity: "42" });
assert.equal(parsed.from_email, "partner@example.com");
assert.deepEqual(parsed.to, ["bizdev@offerpsp.com"]);
assert.equal(parsed.message_id, "<offerpsp-test@example.com>");
assert.match(parsed.text, /External inbound mailbox verification/);
assert.deepEqual(parsed.attachments, []);

const multipartSource = Buffer.from([
  "From: PAYOK <partner@example.com>",
  "To: bizdev@offerpsp.com",
  "Subject: New PAYOK offer",
  "Message-ID: <offerpsp-attachment-test@example.com>",
  "MIME-Version: 1.0",
  "Content-Type: multipart/mixed; boundary=offerpsp-boundary",
  "",
  "--offerpsp-boundary",
  "Content-Type: text/plain; charset=utf-8",
  "",
  "Please review the attached rate card.",
  "--offerpsp-boundary",
  "Content-Type: text/plain; name=PAYOK-offer.txt",
  "Content-Disposition: attachment; filename=PAYOK-offer.txt",
  "Content-Transfer-Encoding: base64",
  "",
  Buffer.from("GEO: India\nMethod: UPI\nMDR PayIn: 6%").toString("base64"),
  "--offerpsp-boundary--",
  "",
].join("\r\n"));
const parsedWithAttachment = await parseMailboxMessage({ source: multipartSource, uid: 8, uidValidity: "42" });
assert.equal(parsedWithAttachment.attachment_count, 1);
assert.equal(parsedWithAttachment.attachments[0].filename, "PAYOK-offer.txt");
assert.equal(parsedWithAttachment.attachments[0].status, "extracted");
assert.match(parsedWithAttachment.attachments[0].extracted_text, /MDR PayIn: 6%/);
assert.equal(Buffer.from(parsedWithAttachment.attachments[0].content_base64, "base64").toString("utf8"), "GEO: India\nMethod: UPI\nMDR PayIn: 6%");

const marked = [];
const searches = [];
class FakeImapClient {
  constructor() {
    this.mailbox = { uidValidity: 42n };
  }
  async connect() {}
  async getMailboxLock() { return { release() {} }; }
  async search(query) { searches.push(query); return [7]; }
  async fetchOne() { return { source }; }
  async messageFlagsAdd(uid, flags) { marked.push([uid, flags]); }
  async logout() {}
}

const summary = await pollOfferPspMailbox(
  {
    imapPassword: "test-only",
    ingestUrl: "https://example.supabase.co/functions/v1/offerpsp-ingest-email",
    ingestToken: "test-only",
  },
  {
    ImapClient: FakeImapClient,
    ingestPayload: async (payload) => {
      assert.equal(payload.message_id, "<offerpsp-test@example.com>");
      return { success: true, duplicate: false };
    },
  },
);

assert.deepEqual(summary, { scanned: 1, ingested: 1, duplicates: 0, failed: 0, deferred: 0 });
assert.deepEqual(searches, [{ not: { keyword: "$OfferPSPIngested" } }]);
assert.deepEqual(marked, [[7, ["$OfferPSPIngested"]]]);
console.log("OfferPSP mailbox poller tests passed");

const sentSource = Buffer.from([
  "From: Boris <bizdev@offerpsp.com>", "To: Assaf <assaf@presspay.example>",
  "Subject: Re: OfferPSP partnership", "Message-ID: <spark-sent@offerpsp.com>",
  "In-Reply-To: <partner-reply@presspay.example>", "References: <initial@offerpsp.com> <partner-reply@presspay.example>",
  "Date: Wed, 30 Sep 2026 11:18:00 +0000", "Content-Type: text/plain; charset=utf-8", "", "Please continue by email.",
].join("\r\n"));
const sentPayload = await parseMailboxMessage({ source: sentSource, uid: 10, uidValidity: "99", mailbox: "Sent Items", direction: "outbound", account: "bizdev@offerpsp.com" });
assert.equal(sentPayload.direction, "outbound");
assert.equal(sentPayload.is_read, true);
assert.equal(sentPayload.in_reply_to, "<partner-reply@presspay.example>");
assert.deepEqual(sentPayload.references, ["<initial@offerpsp.com>", "<partner-reply@presspay.example>"]);
await assert.rejects(() => parseMailboxMessage({ source, uid: 7, uidValidity: "42", direction: "outbound", account: "bizdev@offerpsp.com" }), /sender does not match/);

const folderMarks = [];
const folderSearches = [];
const imported = [];
class SentImapClient extends FakeImapClient {
  async list() { return [{ path: "Sent Items", specialUse: "\\Sent" }]; }
  async getMailboxLock(path) { this.folder = path; return { release() {} }; }
  async search(query) { folderSearches.push({ folder: this.folder, query }); return this.folder === "INBOX" ? [7] : [10, 11]; }
  async fetchOne(uid) { return { source: this.folder === "INBOX" ? source : sentSource, flags: new Set(["\\Seen"]) }; }
  async messageFlagsAdd(uid, flags) { folderMarks.push([this.folder, uid, flags]); }
}
const syncConfig = { imapPassword: "test-only", ingestUrl: "https://example.supabase.co/functions/v1/offerpsp-ingest-email", ingestToken: "test-only", syncSent: true, batchLimit: 1 };
const syncSummary = await pollOfferPspMailbox(syncConfig, { ImapClient: SentImapClient, ingestPayload: async (payload) => { imported.push(payload); return { success: true, duplicate: payload.direction === "outbound" }; } });
assert.deepEqual(syncSummary, { scanned: 2, ingested: 1, duplicates: 1, failed: 0, deferred: 0 });
assert.deepEqual(imported.map((item) => item.direction), ["inbound", "outbound"]);
assert.equal(imported[0].is_read, true, "Spark Seen state must not create new unread work");
assert.equal(folderMarks[1][1], 10, "Sent backfill must process its oldest pending UID first");
assert.ok(folderSearches[1].query.since instanceof Date, "Sent history must have a bounded lookback");
assert.deepEqual(folderMarks.map(([folder]) => folder), ["INBOX", "Sent Items"]);
class MissingSent extends SentImapClient { async list() { return []; } }
const inboxOnlyDependencies = (ImapClient) => ({ ImapClient, ingestPayload: async (payload) => {
  assert.equal(payload.direction, "inbound", "Sent discovery failure must not stop Inbox ingestion");
  return { success: true };
} });
assert.deepEqual(await pollOfferPspMailbox(syncConfig, inboxOnlyDependencies(MissingSent)),
  { scanned: 1, ingested: 1, duplicates: 0, failed: 1, deferred: 0 });
class UnavailableSentListing extends SentImapClient { async list() { throw new Error("Sent listing unavailable"); } }
assert.deepEqual(await pollOfferPspMailbox(syncConfig, inboxOnlyDependencies(UnavailableSentListing)),
  { scanned: 1, ingested: 1, duplicates: 0, failed: 1, deferred: 0 });
class UnavailableSentFolder extends SentImapClient {
  async getMailboxLock(path) {
    if (path === "Sent Items") throw new Error("Sent folder unavailable");
    return super.getMailboxLock(path);
  }
}
assert.deepEqual(await pollOfferPspMailbox(syncConfig, inboxOnlyDependencies(UnavailableSentFolder)),
  { scanned: 1, ingested: 1, duplicates: 0, failed: 1, deferred: 0 });
console.log("PASS Inbox/Sent sync, reply headers, source-account fence, Seen state and bounded backfill");
