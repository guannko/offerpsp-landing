import { createHash } from "node:crypto";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { prepareOfferEmailAttachments } from "./offer-email-attachments.mjs";
import { findSentMailbox } from "./sent-mail-archive.mjs";

const DEFAULT_BATCH_LIMIT = 25;
const MAX_BATCH_LIMIT = 50;
const PROCESSED_FLAG = "$OfferPSPIngested";
const INGEST_PATH = "/functions/v1/offerpsp-ingest-email";

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

export async function parseMailboxMessage({ source, uid, uidValidity, mailbox = "INBOX", direction = "inbound", account, seen = false }) {
  const parsed = await simpleParser(source, {
    skipHtmlToText: true,
    skipTextToHtml: true,
    skipImageLinks: true,
    maxHtmlLengthToParse: 2_000_000,
  });
  const fromEmail = firstAddress(parsed.from);
  if (!fromEmail) throw new Error("Inbound email has no valid sender");
  if (direction === "outbound" && fromEmail !== String(account || "").trim().toLowerCase()) {
    throw new Error("Sent mailbox sender does not match the configured account");
  }
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
    imap_mailbox: mailbox,
    direction,
    is_read: direction === "outbound" || seen,
    mailbox_account: account || null,
    attachment_count: attachments.length,
    attachments,
  };
}

export const resolveMailboxIngestUrl = ({ ingestUrl, supabaseUrl }) => {
  if (!ingestUrl) throw new Error("Mailbox poller is missing configuration: ingestUrl");
  let configured;
  try {
    configured = new URL(ingestUrl);
  } catch {
    throw new Error("Mailbox ingest URL is invalid");
  }
  if (configured.protocol !== "https:" || configured.pathname.replace(/\/$/, "") !== INGEST_PATH) {
    throw new Error("Mailbox ingest URL must use HTTPS and the OfferPSP ingest function path");
  }
  if (!supabaseUrl) return configured.toString();

  let canonical;
  try {
    canonical = new URL(supabaseUrl);
  } catch {
    throw new Error("Canonical Supabase URL is invalid");
  }
  if (canonical.protocol !== "https:" || configured.origin !== canonical.origin) {
    throw new Error("Mailbox ingest URL does not match the canonical Supabase project");
  }
  return configured.toString();
};

const assertConfig = (config) => {
  const required = ["imapPassword", "ingestToken"];
  const missing = required.filter((key) => !config[key]);
  if (missing.length) throw new Error(`Mailbox poller is missing configuration: ${missing.join(", ")}`);
  return resolveMailboxIngestUrl(config);
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
  const ingestUrl = assertConfig(config);
  const resolvedConfig = { ...config, ingestUrl };
  const ImapClient = dependencies.ImapClient || ImapFlow;
  const parseMessage = dependencies.parseMessage || parseMailboxMessage;
  const ingestPayload = dependencies.ingestPayload || ingestMailboxPayload;
  const limit = Math.max(1, Math.min(Number(config.batchLimit) || DEFAULT_BATCH_LIMIT, MAX_BATCH_LIMIT));
  const deadline = Date.now() + Math.max(5_000, Number(config.runtimeBudgetMs) || 45_000);
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
  const summary = { scanned: 0, ingested: 0, duplicates: 0, failed: 0, deferred: 0 };

  try {
    await client.connect();
    const folders = [{ path: "INBOX", direction: "inbound" }];
    if (config.syncSent === true) {
      try {
        const sent = findSentMailbox(await client.list());
        if (!sent?.path || sent.path === "INBOX") throw new Error("IMAP Sent mailbox was not found; sync is enabled");
        folders.push({ path: sent.path, direction: "outbound" });
      } catch (error) {
        summary.failed += 1;
        console.error("OfferPSP Sent mailbox discovery failed", { error: error?.message || "Unknown error" });
      }
    }
    for (const folder of folders) {
      let lock;
      try {
        lock = await client.getMailboxLock(folder.path);
        const uidValidity = String(client.mailbox?.uidValidity || "0");
        const query = { not: { keyword: PROCESSED_FLAG } };
        if (folder.direction === "outbound") {
          const days = Math.max(1, Math.min(Number(config.sentBackfillDays) || 30, 90));
          query.since = new Date(Date.now() - days * 86_400_000);
        }
        const found = await client.search(query, { uid: true });
        // Sent backfill is bounded and oldest-first, so new messages cannot starve it.
        const pendingUids = folder.direction === "outbound" ? found.slice(0, limit) : found.slice(-limit);
        summary.scanned += pendingUids.length;

        for (const [index, uid] of pendingUids.entries()) {
          if (Date.now() >= deadline) {
            summary.deferred += pendingUids.length - index;
            break;
          }
          try {
            const message = await client.fetchOne(uid, { source: true, flags: true }, { uid: true });
            if (!message?.source) throw new Error("IMAP message source is empty");
            const payload = await parseMessage({ source: message.source, uid, uidValidity,
              mailbox: folder.path, direction: folder.direction,
              account: config.imapUser || "bizdev@offerpsp.com", seen: message.flags?.has("\\Seen") || false });
            const result = await ingestPayload(payload, resolvedConfig);
            await client.messageFlagsAdd(uid, [PROCESSED_FLAG], { uid: true });
            if (result?.duplicate) summary.duplicates += 1;
            else summary.ingested += 1;
          } catch (error) {
            summary.failed += 1;
            console.error("OfferPSP mailbox message failed", { uid, mailbox: folder.path, error: error?.message || "Unknown error" });
          }
        }
      } catch (error) {
        summary.failed += 1;
        console.error("OfferPSP mailbox folder failed", { mailbox: folder.path, error: error?.message || "Unknown error" });
      } finally {
        lock?.release();
      }
    }
  } finally {
    await client.logout().catch(() => undefined);
  }

  return summary;
}
