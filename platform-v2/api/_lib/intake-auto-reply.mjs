import { deliverClaimedEmail } from "./email-delivery.mjs";
import { serviceSupabaseRequest } from "./staff-auth.mjs";

const MISSING_FACTS = new Map([
  ["ЮРИДИЧЕСКОЕ ЛИЦО И РЕГИСТРАЦИОННЫЕ ДАННЫЕ", "Legal entity name, registration number, country and registered address"],
  ["САЙТ КОМПАНИИ / ПРОДУКТА", "Company or product website"],
  ["КОНТАКТ ПРЕДСТАВИТЕЛЯ", "Primary company contact and their role"],
  ["ВЕРТИКАЛЬ БИЗНЕСА", "Business vertical and product description"],
  ["ЦЕЛЕВЫЕ GEO", "Target countries or regions"],
  ["ПЛАТЁЖНЫЕ МЕТОДЫ", "Required payment methods"],
  ["ОЖИДАЕМЫЙ МЕСЯЧНЫЙ ОБЪЁМ", "Expected monthly processing volume"],
  ["ВАЛЮТЫ ОБРАБОТКИ", "Processing currencies"],
  ["ТРЕБОВАНИЯ PAYIN / PAYOUT", "Whether you need pay-ins, payouts, or both"],
  ["ЛИЦЕНЗИЯ, ЮРИСДИКЦИЯ И ССЫЛКА НА РЕЕСТР ЛИБО ОБОСНОВАНИЕ НЕПРИМЕНИМОСТИ", "Licence jurisdiction, licence number and regulator-register link, or why a licence is not applicable"],
  ["ПОДТВЕРЖДЕНИЕ ЮРИДИЧЕСКОГО ЛИЦА И ПОЛНОМОЧИЙ ПРЕДСТАВИТЕЛЯ", "Evidence of the legal entity and the representative's authority"],
  ["МЕРЧАНТЫ, ИХ САЙТЫ И ПОЛНОМОЧИЯ ПРЕДСТАВИТЕЛЯ ПО КАЖДОМУ", "For each represented merchant: company name, website and evidence of your authority to represent them"],
]);

const normalizeLines = (value) => String(value || "").replace(/\r\n/g, "\n").trim();
const normalizeMissingFact = (value) => String(value || "").trim().toUpperCase();

export function buildIntakeAutoReply(candidate) {
  const missing = Array.isArray(candidate?.missing_information) ? candidate.missing_information : [];
  const missingKeys = missing.map(normalizeMissingFact);
  const unknown = missing.filter((_, index) => !MISSING_FACTS.has(missingKeys[index]));
  if (unknown.length) return { allowed: false, reason: "unknown_missing_fact", unknown };
  if (candidate?.reply_class === "missing_information" && missing.length === 0) {
    return { allowed: false, reason: "missing_fact_list_empty" };
  }
  if (candidate?.reply_class === "acknowledgement" && missing.length !== 0) {
    return { allowed: false, reason: "acknowledgement_has_missing_facts" };
  }

  const subject = candidate.reply_class === "missing_information"
    ? "A few details for your OfferPSP request"
    : "We received your OfferPSP request";
  const introduction = candidate.reply_class === "missing_information"
    ? "Thank you for contacting OfferPSP. We received your request and need a few details before we can prepare the next step."
    : "Thank you for contacting OfferPSP. We received your request and have started the initial review.";
  const checklist = missing.length
    ? `\n\nPlease reply with:\n${missingKeys.map((item) => `- ${MISSING_FACTS.get(item)}`).join("\n")}`
    : "";
  const closing = missing.length
    ? "\n\nYou can reply directly to this email. Please do not send passwords, card data or other payment credentials."
    : "\n\nWe will contact you by email if we need any additional information. No payment provider has been selected or approved at this stage.";
  const body = `${introduction}${checklist}${closing}\n\nBest regards,\nOfferPSP team\nhttps://offerpsp.com`;
  return { allowed: true, subject, body, translated_facts: missingKeys.map((item) => MISSING_FACTS.get(item)) };
}

/** A separate fail-closed preflight. It validates the generated message only against the
 * canonical candidate returned by Postgres and never accepts free-form model facts.
 */
export function validateIntakeAutoReply(candidate, message) {
  if (!message?.allowed) return { allowed: false, reason: message?.reason || "message_not_built" };
  const to = String(candidate?.to_email || "").trim().toLowerCase();
  const subject = String(message.subject || "").trim();
  const body = normalizeLines(message.body);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return { allowed: false, reason: "invalid_recipient" };
  if (!candidate?.source_hash || !["missing_information", "acknowledgement"].includes(candidate?.reply_class)) {
    return { allowed: false, reason: "invalid_candidate" };
  }
  if (!subject || subject.length > 120 || !body || body.length > 6000) return { allowed: false, reason: "invalid_message_size" };
  if (!body.startsWith("Thank you for contacting OfferPSP. We received your request")) {
    return { allowed: false, reason: "missing_direct_answer" };
  }
  if (!body.endsWith("Best regards,\nOfferPSP team\nhttps://offerpsp.com")) {
    return { allowed: false, reason: "invalid_signature" };
  }
  const restricted = /\b(?:guarantee(?:d)?|approved by|provider accepted|we selected|we matched you|commission|revenue share|our margin|legal advice|contract terms|licen[cs]e verified)\b/i;
  if (restricted.test(`${subject}\n${body}`)) return { allowed: false, reason: "restricted_claim" };

  const expectedFacts = (Array.isArray(candidate.missing_information) ? candidate.missing_information : [])
    .map((item) => MISSING_FACTS.get(normalizeMissingFact(item)));
  if (expectedFacts.some((fact) => !fact) || expectedFacts.some((fact) => !body.includes(`- ${fact}`))) {
    return { allowed: false, reason: "fact_mismatch" };
  }
  const bulletCount = body.split("\n").filter((line) => line.startsWith("- ")).length;
  if (bulletCount !== expectedFacts.length) return { allowed: false, reason: "unverified_extra_fact" };
  return { allowed: true, to, subject, body };
}

const rpc = (name, body) => serviceSupabaseRequest(`rpc/${name}`, {
  method: "POST",
  body: JSON.stringify(body),
  signal: AbortSignal.timeout(10000),
});

export async function processIntakeAutoReply(leadId, { call = rpc, deliver = deliverClaimedEmail, env = process.env } = {}) {
  const candidate = await call("prepare_offerpsp_intake_auto_reply", { p_lead_id: leadId });
  if (candidate?.outcome !== "ready") return candidate || { outcome: "review_required", reason_code: "candidate_unavailable" };

  const message = buildIntakeAutoReply(candidate);
  const validation = validateIntakeAutoReply(candidate, message);
  if (!validation.allowed) {
    return call("block_offerpsp_intake_auto_reply", {
      p_lead_id: leadId,
      p_source_hash: candidate.source_hash,
      p_reason_code: validation.reason,
    });
  }

  const claim = await call("claim_offerpsp_intake_auto_reply", {
    p_lead_id: leadId,
    p_source_hash: candidate.source_hash,
    p_reply_class: candidate.reply_class,
    p_subject: validation.subject,
    p_body: validation.body,
  });
  if (claim?.outcome !== "claimed") return claim || { outcome: "review_required", reason_code: "claim_unavailable" };

  const delivered = await deliver({
    claim,
    draftId: Number(claim.draft_id),
    configuration: claim.email_configuration || {},
    env,
    callRpc: call,
    completeRpc: "complete_offerpsp_intake_auto_reply",
    uncertainRpc: "mark_offerpsp_intake_auto_reply_uncertain",
  });
  if (delivered.body?.success !== true) {
    return { outcome: delivered.body?.delivery_uncertain ? "uncertain" : "failed", reason_code: "delivery_failed" };
  }
  return {
    outcome: delivered.body.journal_recorded ? "sent" : "uncertain",
    draft_id: Number(claim.draft_id),
    message_id: delivered.body.message_id || null,
    sent_archive_status: delivered.body.sent_archive?.archived ? (delivered.body.sent_archive.duplicate ? "duplicate" : "archived") : "failed",
  };
}

export async function processIntakeSubmissionReply(submissionId, { call = rpc, deliver = deliverClaimedEmail, env = process.env } = {}) {
  const candidate = await call("prepare_offerpsp_intake_submission_reply", { p_submission_id: submissionId });
  if (candidate?.outcome !== "ready") return candidate || { outcome: "review_required", reason_code: "candidate_unavailable" };

  const message = buildIntakeAutoReply(candidate);
  const validation = validateIntakeAutoReply(candidate, message);
  if (!validation.allowed) {
    return call("block_offerpsp_intake_submission_reply", {
      p_submission_id: submissionId,
      p_source_hash: candidate.source_hash,
      p_reason_code: validation.reason,
    });
  }

  const claim = await call("claim_offerpsp_intake_submission_reply", {
    p_submission_id: submissionId,
    p_source_hash: candidate.source_hash,
    p_reply_class: candidate.reply_class,
    p_subject: validation.subject,
    p_body: validation.body,
  });
  if (claim?.outcome !== "claimed") return claim || { outcome: "review_required", reason_code: "claim_unavailable" };

  const delivered = await deliver({
    claim,
    draftId: Number(claim.draft_id),
    configuration: claim.email_configuration || {},
    env,
    callRpc: call,
    completeRpc: "complete_offerpsp_intake_submission_reply",
    uncertainRpc: "mark_offerpsp_intake_submission_reply_uncertain",
  });
  if (delivered.body?.success !== true) {
    return {
      outcome: delivered.body?.delivery_uncertain ? "uncertain" : "failed",
      submission_id: submissionId,
      lead_id: claim.lead_id || candidate.lead_id || null,
      reason_code: "delivery_failed",
    };
  }
  return {
    outcome: delivered.body.journal_recorded ? "sent" : "uncertain",
    submission_id: submissionId,
    lead_id: claim.lead_id || candidate.lead_id || null,
    draft_id: Number(claim.draft_id),
    message_id: delivered.body.message_id || null,
    sent_archive_status: delivered.body.sent_archive?.archived
      ? (delivered.body.sent_archive.duplicate ? "duplicate" : "archived")
      : "failed",
  };
}
