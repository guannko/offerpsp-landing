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

const seen = [];
class FakeImapClient {
  constructor() {
    this.mailbox = { uidValidity: 42n };
  }
  async connect() {}
  async getMailboxLock() { return { release() {} }; }
  async search() { return [7]; }
  async fetchOne() { return { source }; }
  async messageFlagsAdd(uid, flags) { seen.push([uid, flags]); }
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
assert.deepEqual(seen, [[7, ["\\Seen"]]]);
console.log("OfferPSP mailbox poller tests passed");
