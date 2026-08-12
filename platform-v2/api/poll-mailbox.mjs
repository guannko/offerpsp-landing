import { pollOfferPspMailbox } from "./_lib/mailbox-poller.mjs";

const json = (response, status, body) => {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(body));
};

export const config = { maxDuration: 60 };

export default async function handler(request, response) {
  if (!['GET', 'POST'].includes(request.method)) {
    return json(response, 405, { success: false, error: "Method not allowed" });
  }

  const expectedSecret = process.env.OFFERPSP_MAILBOX_POLL_SECRET || process.env.CRON_SECRET;
  if (!expectedSecret || request.headers.authorization !== `Bearer ${expectedSecret}`) {
    return json(response, 401, { success: false, error: "Unauthorized" });
  }

  try {
    const summary = await pollOfferPspMailbox({
      imapHost: process.env.OFFERPSP_IMAP_HOST || "imap.secureserver.net",
      imapPort: process.env.OFFERPSP_IMAP_PORT || "993",
      imapUser: process.env.OFFERPSP_IMAP_USER || "bizdev@offerpsp.com",
      imapPassword: process.env.OFFERPSP_IMAP_PASSWORD,
      ingestUrl: process.env.OFFERPSP_MAIL_INGEST_URL,
      ingestToken: process.env.OFFERPSP_MAIL_INGEST_TOKEN,
      batchLimit: process.env.OFFERPSP_MAILBOX_BATCH_LIMIT || "25",
    });
    return json(response, summary.failed ? 207 : 200, { success: summary.failed === 0, ...summary });
  } catch (error) {
    console.error("OfferPSP mailbox poll failed", { error: error?.message || "Unknown error" });
    return json(response, 502, { success: false, error: "Mailbox poll failed" });
  }
}
