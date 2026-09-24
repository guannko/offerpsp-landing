import { appendSentMessage } from "./sent-mail-archive.mjs";

/**
 * Deliver one database-claimed OfferPSP email. The caller owns the claim and supplies
 * the bounded completion RPCs. Ambiguous SMTP outcomes are never retried here.
 */
export async function deliverClaimedEmail({
  claim,
  draftId,
  configuration = {},
  env = process.env,
  callRpc,
  completeRpc,
  uncertainRpc,
}) {
  if (typeof callRpc !== "function") throw new Error("Delivery RPC caller is required");
  const attemptId = String(claim?.attempt_id || "").trim();
  const numericDraftId = Number(draftId);
  const lockUncertain = async (reason) => {
    if (!uncertainRpc || !attemptId || !Number.isSafeInteger(numericDraftId) || numericDraftId <= 0) return;
    await callRpc(uncertainRpc, {
      p_draft_id: numericDraftId,
      p_attempt_id: attemptId,
      p_error: reason,
    }).catch(() => undefined);
  };
  const senderUrl = env.N8N_EMAIL_WEBHOOK_URL;
  const webhookSecret = env.AIBOT_WEBHOOK_SECRET;
  if (!senderUrl || !webhookSecret) {
    await lockUncertain("Email bridge is not configured");
    return { status: 503, body: { success: false, error: "Email bridge is not configured" } };
  }

  const to = String(claim?.to_email || "").trim().toLowerCase();
  const subject = String(claim?.subject || "").trim();
  const emailBody = String(claim?.body || "").trim();
  if (!attemptId || !Number.isSafeInteger(Number(draftId)) || Number(draftId) <= 0
      || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to) || !subject || !emailBody) {
    await lockUncertain("Claimed email draft has an invalid canonical payload");
    return { status: 409, body: { success: false, delivery_uncertain: true, error: "Claimed email draft has an invalid canonical payload" } };
  }
  if (subject.length > 240 || emailBody.length > 50000) {
    await lockUncertain("Claimed email draft is too large");
    return { status: 409, body: { success: false, delivery_uncertain: true, error: "Claimed email draft is too large" } };
  }

  const fromName = configuration.from_name || "OfferPSP";
  const fromEmail = configuration.from_email || "bizdev@offerpsp.com";
  const replyTo = configuration.reply_to || "bizdev@offerpsp.com";
  let delivery;
  let result = {};
  try {
    delivery = await fetch(senderUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-captain-secret": webhookSecret },
      body: JSON.stringify({
        to,
        subject,
        body: emailBody,
        from_name: fromName,
        from_email: fromEmail,
        reply_to: replyTo,
        lead_id: claim.lead_internal_id || null,
        draft_id: Number(draftId),
        delivery_attempt_id: attemptId,
      }),
    });
    result = await delivery.json().catch(() => ({}));
    if (!delivery.ok || result.success === false) throw new Error(result.message || "Email sender failed");
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Email sender failed";
    await lockUncertain(reason);
    return {
      status: 502,
      body: {
        success: false,
        delivery_uncertain: true,
        error: `${reason}. Delivery was not retried automatically.`,
      },
    };
  }

  const messageId = String(result.message_id || result.messageId || "").trim() || null;
  const provider = String(result.provider || configuration.provider || "smtp").trim().toLowerCase();
  const sentAt = result.sent_at ? new Date(result.sent_at) : new Date();
  let sentArchive = { archived: false, duplicate: false, error: "SMTP response did not include Message-ID" };
  if (messageId) {
    try {
      sentArchive = await appendSentMessage({
        imapHost: env.OFFERPSP_IMAP_HOST || "imap.secureserver.net",
        imapPort: env.OFFERPSP_IMAP_PORT || "993",
        imapUser: env.OFFERPSP_IMAP_USER || fromEmail,
        imapPassword: env.OFFERPSP_IMAP_PASSWORD,
      }, {
        fromName,
        fromEmail,
        to,
        replyTo,
        subject,
        text: emailBody,
        html: typeof result.html === "string" ? result.html : null,
        messageId,
        sentAt,
      });
    } catch (error) {
      sentArchive = { archived: false, duplicate: false, error: error instanceof Error ? error.message : "Sent archive failed" };
    }
  }

  const archiveStatus = sentArchive.archived ? (sentArchive.duplicate ? "duplicate" : "archived") : "failed";
  const completionBody = {
    p_draft_id: Number(draftId),
    p_attempt_id: attemptId,
    p_external_message_id: messageId,
    p_provider: provider === "brevo" ? "brevo" : "smtp",
    p_archive_status: archiveStatus,
    p_archive_error: sentArchive.archived ? null : sentArchive.error,
  };
  let journalRecorded = false;
  let journalError = "Delivery journal could not be finalized";
  for (let attempt = 0; attempt < 3 && !journalRecorded; attempt += 1) {
    try {
      const completion = await callRpc(completeRpc, completionBody);
      journalRecorded = completion?.success !== false;
      if (!journalRecorded) journalError = completion?.message || completion?.error || "Delivery journal rejected completion";
    } catch (error) {
      journalError = error instanceof Error ? error.message : journalError;
    }
  }
  if (!journalRecorded) {
    await lockUncertain(journalError);
  }

  return {
    status: journalRecorded && sentArchive.archived ? 200 : 207,
    body: {
      success: true,
      to,
      message_id: messageId,
      provider,
      sent_archive: sentArchive,
      journal_recorded: journalRecorded,
      warning: !journalRecorded
        ? "Email was sent, but the delivery journal could not be finalized. The attempt is locked against automatic resend and requires reconciliation."
        : !sentArchive.archived
          ? "Email was sent and journaled, but the IMAP Sent copy could not be synchronized."
          : null,
    },
  };
}
