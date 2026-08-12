import { createHash } from "node:crypto";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { prepareOfferEmailAttachments } from "./offer-email-attachments.mjs";

const DEFAULT_BATCH_LIMIT = 25;
const MAX_BATCH_LIMIT = 50;
const PROCESSED_FLAG = "$OfferPSPIngested";

const addressList = (addressObject) =>
  (addressObject?.value || [])
    .map((entry) => String(entry?.address || "").trim().toLowerCase())
    .filter(Boolean);

const firstAddress = (addressObject) => addressList(addressObject)[0] || "";

const headerValue = (headers, name) => {
  const value = headers?.get?.(name);
  if (Array.isArray(value)) return value.map(String).join(", ");
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
};

export const buildFallbackMessageId = ({ uidValidity, uid, source }) => {
  const digest = createHash("sha256").update(source).digest("hex").slice(0, 24);
  return `<offerpsp-imap-${uidValidity}-${uid}-${digest}@offerpsp.com>`;
};

export async function parseMailboxMessage({ source, uid, uidValidity }) {
  const parsed = await simpleParser(source, {
    skipHtmlToText: true,
    skipTextToHtml: true,
    skipImageLinks: true,
    maxHtmlLengthToParse: 2_000_000,
  });
  const fromEmail = firstAddress(parsed.from);
  if (!fromEmail) throw new Error("Inbound email has no valid sender");
  const attachments = await prepareOfferEmailAttachments(parsed.attachments || []);

  return {
    from_email: fromEmail,
    to: addressList(parsed.to),
    cc: addressList(parsed.cc),
    subject: String(parsed.subject || "(no subject)").trim().slice(0, 500),
    text: parsed.text || null,
    html: typeof parsed.html === "string" ? parsed.html : null,
    message_id: String(parsed.messageId || "").trim() || buildFallbackMessageId({ uidValidity, uid, source }),
    in_reply_to: String(parsed.inReplyTo || "").trim() || null,
    references: Array.isArray(parsed.references)
      ? parsed.references.map(String)
      : parsed.references
        ? [String(parsed.references)]
        : [],
    received_at: (parsed.date instanceof Date ? parsed.date : new Date()).toISOString(),
    headers: {
      "reply-to": headerValue(parsed.headers, "reply-to"),
      "return-path": headerValue(parsed.headers, "return-path"),
      "x-mailer": headerValue(parsed.headers, "x-mailer"),
    },
    imap_uid: uid,
    imap_uid_validity: uidValidity,
    attachment_count: attachments.length,
    attachments,
  };
}

const assertConfig = (config) => {
  const required = ["imapPassword", "ingestUrl", "ingestToken"];
  const missing = required.filter((key) => !config[key]);
  if (missing.length) throw new Error(`Mailbox poller is missing configuration: ${missing.join(", ")}`);
};

export async function ingestMailboxPayload(payload, config, fetchImpl = fetch) {
  const response = await fetchImpl(config.ingestUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.ingestToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ payload }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result?.success === false) {
    throw new Error(result?.message || result?.error || `Mail Center ingestion failed with HTTP ${response.status}`);
  }
  return result;
}

export async function pollOfferPspMailbox(config, dependencies = {}) {
  assertConfig(config);
  const ImapClient = dependencies.ImapClient || ImapFlow;
  const parseMessage = dependencies.parseMessage || parseMailboxMessage;
  const ingestPayload = dependencies.ingestPayload || ingestMailboxPayload;
  const limit = Math.max(1, Math.min(Number(config.batchLimit) || DEFAULT_BATCH_LIMIT, MAX_BATCH_LIMIT));
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
  const summary = { scanned: 0, ingested: 0, duplicates: 0, failed: 0 };

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      const uidValidity = String(client.mailbox?.uidValidity || "0");
      const pendingUids = (await client.search({ not: { keyword: PROCESSED_FLAG } }, { uid: true }))
        .slice(-limit);
      summary.scanned = pendingUids.length;

      for (const uid of pendingUids) {
        try {
          const message = await client.fetchOne(uid, { source: true }, { uid: true });
          if (!message?.source) throw new Error("IMAP message source is empty");
          const payload = await parseMessage({ source: message.source, uid, uidValidity });
          const result = await ingestPayload(payload, config);
          await client.messageFlagsAdd(uid, [PROCESSED_FLAG], { uid: true });
          if (result?.duplicate) summary.duplicates += 1;
          else summary.ingested += 1;
        } catch (error) {
          summary.failed += 1;
          console.error("OfferPSP mailbox message failed", { uid, error: error?.message || "Unknown error" });
        }
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => undefined);
  }

  return summary;
}
