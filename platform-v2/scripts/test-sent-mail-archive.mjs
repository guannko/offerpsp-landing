import assert from "node:assert/strict";
import { simpleParser } from "mailparser";
import { appendSentMessage, buildSentMime, findSentMailbox } from "../api/_lib/sent-mail-archive.mjs";

const message = {
  fromName: "OfferPSP",
  fromEmail: "bizdev@offerpsp.com",
  to: "merchant@example.test",
  replyTo: "bizdev@offerpsp.com",
  subject: "Проверка OfferPSP — sent copy",
  text: "Hello merchant",
  html: "<p>Hello merchant</p>",
  messageId: "<offerpsp-test@offerpsp.com>",
  sentAt: new Date("2026-09-17T10:00:00Z"),
};

const mime = buildSentMime(message).toString("utf8");
assert.match(mime, /Message-ID: <offerpsp-test@offerpsp\.com>/);
assert.match(mime, /Subject: =\?UTF-8\?B\?/);
assert.match(mime, /Content-Type: multipart\/alternative/);
assert.equal(findSentMailbox([{ path: "Archive", specialUse: "\\Archive" }, { path: "Sent", specialUse: "\\Sent" }]).path, "Sent");

const state = { appended: [], searched: [], locks: [] };
class FakeImapClient {
  async connect() {}
  async list() { return [{ path: "INBOX", name: "INBOX" }, { path: "Sent", name: "Sent", specialUse: "\\Sent" }]; }
  async getMailboxLock(path) { state.locks.push(path); return { release() {} }; }
  async search(query) { state.searched.push(query); return []; }
  async append(path, raw, flags, date) { state.appended.push({ path, raw, flags, date }); return { uid: 9 }; }
  async logout() {}
}

const result = await appendSentMessage({ imapPassword: "test-only" }, message, { ImapClient: FakeImapClient });
assert.deepEqual(result, { archived: true, duplicate: false, mailbox: "Sent", messageId: message.messageId });
assert.deepEqual(state.locks, ["Sent"]);
assert.deepEqual(state.searched, [{ header: { "message-id": message.messageId } }]);
assert.equal(state.appended.length, 1);
assert.deepEqual(state.appended[0].flags, ["\\Seen"]);
const parsed = await simpleParser(state.appended[0].raw);
assert.equal(parsed.messageId, message.messageId);
assert.equal(parsed.text.trim(), "Hello merchant");
assert.equal(parsed.html, message.html);

class DuplicateImapClient extends FakeImapClient {
  async search() { return [15]; }
}
const duplicate = await appendSentMessage({ imapPassword: "test-only" }, message, { ImapClient: DuplicateImapClient });
assert.equal(duplicate.duplicate, true);
assert.equal(state.appended.length, 1);

console.log("OfferPSP Sent archive tests passed");
