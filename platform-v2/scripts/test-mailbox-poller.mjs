import assert from "node:assert/strict";
import { parseMailboxMessage, pollOfferPspMailbox } from "../api/_lib/mailbox-poller.mjs";

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

assert.deepEqual(summary, { scanned: 1, ingested: 1, duplicates: 0, failed: 0 });
assert.deepEqual(searches, [{ not: { keyword: "$OfferPSPIngested" } }]);
assert.deepEqual(marked, [[7, ["$OfferPSPIngested"]]]);
console.log("OfferPSP mailbox poller tests passed");
