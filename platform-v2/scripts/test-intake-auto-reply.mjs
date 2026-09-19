import assert from "node:assert/strict";
import { test } from "node:test";
import { buildIntakeAutoReply, processIntakeAutoReply, processIntakeSubmissionReply, validateIntakeAutoReply } from "../api/_lib/intake-auto-reply.mjs";

const ready = {
  outcome: "ready",
  source_hash: "snapshot-1",
  reply_class: "missing_information",
  to_email: "merchant@example.test",
  missing_information: ["Сайт компании / продукта", "Ожидаемый месячный объём"],
  email_configuration: { from_email: "bizdev@offerpsp.com" },
};

test("missing-information reply is direct, bounded and uses only mapped canonical facts", () => {
  const message = buildIntakeAutoReply(ready);
  const validation = validateIntakeAutoReply(ready, message);
  assert.equal(validation.allowed, true);
  assert.match(message.body, /^Thank you for contacting OfferPSP\. We received your request/);
  assert.match(message.body, /- Company or product website/);
  assert.match(message.body, /- Expected monthly processing volume/);
  assert.doesNotMatch(message.body, /provider accepted|commission|revenue share/i);
  assert.equal(message.body.split("\n").filter((line) => line.startsWith("- ")).length, 2);
});
test("unknown screening fact fails closed instead of being copied to a customer", () => {
  const candidate = { ...ready, missing_information: ["Invented free-form requirement"] };
  const message = buildIntakeAutoReply(candidate);
  assert.deepEqual(message, { allowed: false, reason: "unknown_missing_fact", unknown: ["Invented free-form requirement"] });
  assert.equal(validateIntakeAutoReply(candidate, message).allowed, false);
});

test("independent validator rejects extra facts and restricted commercial claims", () => {
  const message = buildIntakeAutoReply(ready);
  assert.equal(validateIntakeAutoReply(ready, { ...message, body: message.body.replace("Please reply with:", "Please reply with:\n- Guaranteed approval") }).reason, "restricted_claim");
  assert.equal(validateIntakeAutoReply(ready, { ...message, body: message.body.replace("Please reply with:", "Please reply with:\n- Another unverified item") }).reason, "unverified_extra_fact");
});

test("acknowledgement contains no checklist and makes no provider promise", () => {
  const candidate = { ...ready, reply_class: "acknowledgement", missing_information: [] };
  const message = buildIntakeAutoReply(candidate);
  assert.equal(validateIntakeAutoReply(candidate, message).allowed, true);
  assert.doesNotMatch(message.body, /^- /m);
  assert.match(message.body, /No payment provider has been selected or approved/);
});

test("processor claims, delivers and completes one canonical message", async () => {
  const calls = [];
  const call = async (name, body) => {
    calls.push({ name, body });
    if (name === "prepare_offerpsp_intake_auto_reply") return ready;
    if (name === "claim_offerpsp_intake_auto_reply") return {
      outcome: "claimed", draft_id: 41, attempt_id: "11111111-1111-4111-8111-111111111111",
      to_email: ready.to_email, subject: body.p_subject, body: body.p_body, lead_internal_id: body.p_lead_id,
      email_configuration: ready.email_configuration,
    };
    if (name === "complete_offerpsp_intake_auto_reply") return { success: true, outcome: "sent" };
    throw new Error(`Unexpected RPC ${name}`);
  };
  const deliver = async (input) => {
    assert.equal(input.draftId, 41);
    assert.equal(input.completeRpc, "complete_offerpsp_intake_auto_reply");
    await input.callRpc(input.completeRpc, { p_draft_id: 41 });
    return { body: { success: true, journal_recorded: true, message_id: "<one@example.test>", sent_archive: { archived: true, duplicate: false } } };
  };
  const result = await processIntakeAutoReply("10000000-0000-4000-8000-000000000001", { call, deliver });
  assert.equal(result.outcome, "sent");
  assert.deepEqual(calls.map((item) => item.name), [
    "prepare_offerpsp_intake_auto_reply", "claim_offerpsp_intake_auto_reply", "complete_offerpsp_intake_auto_reply",
  ]);
});

test("processor never claims or delivers a gate failure or already-sent reply", async () => {
  for (const result of [
    { outcome: "review_required", reason_code: "possible_duplicate" },
    { outcome: "already_sent", draft_id: 12 },
  ]) {
    let delivered = false;
    const actual = await processIntakeAutoReply("10000000-0000-4000-8000-000000000001", {
      call: async () => result,
      deliver: async () => { delivered = true; },
    });
    assert.deepEqual(actual, result);
    assert.equal(delivered, false);
  }
});

test("submission processor sends one acknowledgement through submission-scoped RPCs", async () => {
  const submissionId = "20000000-0000-4000-8000-000000000001";
  const leadId = "30000000-0000-4000-8000-000000000001";
  const candidate = {
    ...ready,
    submission_id: submissionId,
    lead_id: leadId,
    reply_class: "acknowledgement",
    missing_information: [],
  };
  const calls = [];
  const call = async (name, body) => {
    calls.push({ name, body });
    if (name === "prepare_offerpsp_intake_submission_reply") return candidate;
    if (name === "claim_offerpsp_intake_submission_reply") return {
      outcome: "claimed", submission_id: submissionId, lead_id: leadId,
      draft_id: 51, attempt_id: "11111111-1111-4111-8111-111111111111",
      to_email: ready.to_email, subject: body.p_subject, body: body.p_body,
      lead_internal_id: leadId, email_configuration: ready.email_configuration,
    };
    if (name === "complete_offerpsp_intake_submission_reply") return { success: true, outcome: "sent" };
    throw new Error(`Unexpected RPC ${name}`);
  };
  const deliver = async (input) => {
    assert.equal(input.draftId, 51);
    assert.equal(input.completeRpc, "complete_offerpsp_intake_submission_reply");
    assert.equal(input.uncertainRpc, "mark_offerpsp_intake_submission_reply_uncertain");
    await input.callRpc(input.completeRpc, { p_draft_id: 51 });
    return { body: { success: true, journal_recorded: true, message_id: "<submission@example.test>", sent_archive: { archived: true, duplicate: false } } };
  };
  const result = await processIntakeSubmissionReply(submissionId, { call, deliver });
  assert.equal(result.outcome, "sent");
  assert.equal(result.submission_id, submissionId);
  assert.equal(result.lead_id, leadId);
  assert.deepEqual(calls.map((item) => item.name), [
    "prepare_offerpsp_intake_submission_reply",
    "claim_offerpsp_intake_submission_reply",
    "complete_offerpsp_intake_submission_reply",
  ]);
});

test("submission replay never creates a second delivery", async () => {
  let delivered = false;
  const result = await processIntakeSubmissionReply("20000000-0000-4000-8000-000000000001", {
    call: async () => ({ outcome: "already_sent", draft_id: 51 }),
    deliver: async () => { delivered = true; },
  });
  assert.equal(result.outcome, "already_sent");
  assert.equal(delivered, false);
});
