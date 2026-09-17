import { createHash } from "node:crypto";
import { ImapFlow } from "imapflow";

const cleanHeader = (value, name) => {
  const text = String(value || "").trim();
  if (!text || /[\r\n]/.test(text)) throw new Error(`${name} is invalid`);
  return text;
};

const encodeHeader = (value) => {
  const text = cleanHeader(value, "Header");
  return /^[\x20-\x7e]+$/.test(text)
    ? text
    : `=?UTF-8?B?${Buffer.from(text, "utf8").toString("base64")}?=`;
};

const base64Lines = (value) => {
  const encoded = Buffer.from(String(value || ""), "utf8").toString("base64");
  return encoded.match(/.{1,76}/g)?.join("\r\n") || "";
};

export const normalizeMessageId = (value) => {
  const messageId = cleanHeader(value, "Message-ID");
  if (!/^<[^<>\s@]+@[^<>\s@]+>$/.test(messageId)) throw new Error("Message-ID is invalid");
  return messageId;
};

export function buildSentMime({ fromName, fromEmail, to, replyTo, subject, text, html, messageId, sentAt = new Date() }) {
  const safeMessageId = normalizeMessageId(messageId);
  const safeFrom = cleanHeader(fromEmail, "From email").toLowerCase();
  const safeTo = cleanHeader(to, "Recipient").toLowerCase();
  const safeReplyTo = cleanHeader(replyTo || fromEmail, "Reply-To").toLowerCase();
  const safeSubject = encodeHeader(subject);
  const safeFromName = encodeHeader(fromName || "OfferPSP");
  const boundary = `offerpsp-${createHash("sha256").update(`${safeMessageId}|${safeSubject}`).digest("hex").slice(0, 24)}`;
  const date = sentAt instanceof Date ? sentAt : new Date(sentAt);
  if (Number.isNaN(date.getTime())) throw new Error("Sent date is invalid");

  return Buffer.from([
    `Date: ${date.toUTCString()}`,
    `Message-ID: ${safeMessageId}`,
    `From: ${safeFromName} <${safeFrom}>`,
    `To: ${safeTo}`,
    `Reply-To: ${safeReplyTo}`,
    `Subject: ${safeSubject}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary=\"${boundary}\"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: base64",
    "",
    base64Lines(text),
    `--${boundary}`,
    "Content-Type: text/html; charset=utf-8",
    "Content-Transfer-Encoding: base64",
    "",
    base64Lines(html || String(text || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>")),
    `--${boundary}--`,
    "",
  ].join("\r\n"), "utf8");
}

export const findSentMailbox = (mailboxes) => {
  const folders = Array.isArray(mailboxes) ? mailboxes : [];
  return folders.find((mailbox) => mailbox?.specialUse === "\\Sent")
    || folders.find((mailbox) => /^(sent|sent items|sent mail|отправленные)$/i.test(String(mailbox?.name || mailbox?.path || "").trim()))
    || null;
};

export async function appendSentMessage(config, message, dependencies = {}) {
  const required = ["imapPassword"];
  const missing = required.filter((key) => !config?.[key]);
  if (missing.length) throw new Error(`Sent archive is missing configuration: ${missing.join(", ")}`);
  const ImapClient = dependencies.ImapClient || ImapFlow;
  const client = new ImapClient({
    host: config.imapHost || "imap.secureserver.net",
    port: Number(config.imapPort) || 993,
    secure: true,
    auth: {
      user: config.imapUser || "bizdev@offerpsp.com",
      pass: config.imapPassword,
    },
    logger: false,
    socketTimeout: 45_000,
    greetingTimeout: 20_000,
  });
  const messageId = normalizeMessageId(message.messageId);
  const raw = buildSentMime({ ...message, messageId });

  try {
    await client.connect();
    const mailbox = findSentMailbox(await client.list());
    if (!mailbox?.path) throw new Error("IMAP Sent mailbox was not found");
    const lock = await client.getMailboxLock(mailbox.path);
    try {
      const existing = await client.search({ header: { "message-id": messageId } }, { uid: true });
      if (existing.length > 0) {
        return { archived: true, duplicate: true, mailbox: mailbox.path, messageId };
      }
      const appended = await client.append(mailbox.path, raw, ["\\Seen"], message.sentAt || new Date());
      if (!appended) throw new Error("IMAP server rejected the Sent append");
      return { archived: true, duplicate: false, mailbox: mailbox.path, messageId };
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => undefined);
  }
}
