import { timingSafeEqual } from "node:crypto";
import { sendJson, serviceSupabaseRequest } from "./staff-auth.mjs";
import { processClaimedCompany, processClaimedResearch } from "./company-screening-runner.mjs";
import { processIntakeAutoReply } from "./intake-auto-reply.mjs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INTAKE_RECEIPTS = new Set(["completed", "already_completed", "stale_or_cancelled", "module_disabled", "in_progress"]);
const RESEARCH_RECEIPTS = new Set([...INTAKE_RECEIPTS, "retry_queued", "failed"]);

// Internal transport, not a staff/MCP auth bypass. The dedicated worker token grants only these
// two bounded operations. The Supabase service key never leaves the Vercel server.
export function createCompanyScreeningWorker({
  env = process.env,
  rpc,
  processJob = processClaimedCompany,
  processResearchJob = processClaimedResearch,
  processAutoReply = processIntakeAutoReply,
} = {}) {
  const call = rpc || ((name, args) => serviceSupabaseRequest(`rpc/${name}`, {
    method: "POST", body: JSON.stringify(args), signal: AbortSignal.timeout(10000),
  }));
  return async (request, response) => {
    if (request.method !== "POST") return sendJson(response, 405, { error: "Method not allowed" });
    const token = env.OFFERPSP_SCREENING_WORKER_TOKEN;
    if (env.OFFERPSP_SCREENING_WORKER_ENABLED !== "true" || typeof token !== "string" || token.length < 32) {
      return sendJson(response, 503, { error: "Screening worker is disabled or unconfigured" });
    }
    const header = request.headers?.authorization;
    const expected = Buffer.from(`Bearer ${token}`);
    if (typeof header !== "string" || Buffer.byteLength(header) !== expected.length || !timingSafeEqual(Buffer.from(header), expected)) {
      return sendJson(response, 401, { error: "Invalid worker authorization" });
    }
    const body = request.body;
    if (!body || typeof body !== "object" || Array.isArray(body)) return sendJson(response, 400, { error: "JSON object required" });
    const keys = Object.keys(body);
    if (!((body.action === "claim" && keys.length === 1) ||
      (body.action === "recover_auto_reply" && keys.length === 1) ||
      (body.action === "process" && keys.length === 3 && UUID.test(body.lead_id || "") && UUID.test(body.run_id || "")) ||
      (body.action === "claim_research" && keys.length === 1) ||
      (body.action === "process_research" && keys.length === 3 && UUID.test(body.job_id || "") && UUID.test(body.run_id || "")))) {
      return sendJson(response, 400, { error: "Unsupported screening worker operation" });
    }
    try {
      if (body.action === "recover_auto_reply") {
        const pending = await call("claim_offerpsp_pending_intake_auto_reply", {});
        if (pending?.outcome === "empty") return sendJson(response, 200, { outcome: "empty" });
        if (pending?.outcome !== "claimed" || !UUID.test(pending.lead_id || "")) throw new Error("Invalid automatic reply queue response");
        let autoReply;
        try {
          autoReply = await processAutoReply(pending.lead_id);
        } catch {
          autoReply = { outcome: "queued", reason_code: "worker_interrupted" };
        }
        return sendJson(response, 200, { lead_id: pending.lead_id, ...autoReply });
      }
      if (body.action === "claim") {
        const jobs = await call("claim_offerpsp_pre_compliance_jobs", { p_limit: 1 });
        if (!Array.isArray(jobs) || jobs.length > 1 || jobs.some((j) => !UUID.test(j.lead_id) || !UUID.test(j.run_id))) throw new Error("Invalid queue response");
        return sendJson(response, 200, { jobs: jobs.map(({ lead_id, run_id }) => ({ lead_id, run_id })) });
      }
      if (body.action === "claim_research") {
        const jobs = await call("claim_offerpsp_research_screening_jobs", { p_limit: 1 });
        if (!Array.isArray(jobs) || jobs.length > 1 || jobs.some((j) => !UUID.test(j.job_id) || !UUID.test(j.run_id))) throw new Error("Invalid research queue response");
        return sendJson(response, 200, { jobs: jobs.map(({ job_id, run_id }) => ({ job_id, run_id })) });
      }
      if (body.action === "process_research") {
        const acquired = await call("begin_offerpsp_research_screening_run", { p_job_id: body.job_id, p_run_id: body.run_id });
        let receipt = acquired;
        if (acquired?.outcome === "acquired") {
          if (acquired.job?.job_id !== body.job_id || acquired.job?.run_id !== body.run_id) throw new Error("Research run identity mismatch");
          try {
            receipt = await processResearchJob(acquired.job, {
              complete: ({ job_id, run_id, payload }) => call("complete_offerpsp_research_screening_run", { p_job_id: job_id, p_run_id: run_id, p_payload: payload }),
            });
          } catch {
            receipt = await call("fail_offerpsp_research_screening_run", { p_job_id: body.job_id, p_run_id: body.run_id, p_error_code: "collector_failed" });
          }
        }
        if (!RESEARCH_RECEIPTS.has(receipt?.outcome)) throw new Error("Invalid research completion receipt");
        return sendJson(response, receipt.outcome === "in_progress" ? 202 : 200, {
          job_id: body.job_id, run_id: body.run_id, outcome: receipt.outcome,
        });
      }
      const acquired = await call("begin_offerpsp_pre_compliance_run", { p_lead_id: body.lead_id, p_run_id: body.run_id });
      let receipt = acquired;
      if (acquired?.outcome === "acquired") {
        if (acquired.job?.lead_id !== body.lead_id || acquired.job?.run_id !== body.run_id) throw new Error("Run identity mismatch");
        receipt = await processJob(acquired.job, {
          complete: ({ lead_id, run_id, payload }) => call("complete_offerpsp_pre_compliance_run", { p_lead_id: lead_id, p_run_id: run_id, p_payload: payload }),
        });
      }
      if (!INTAKE_RECEIPTS.has(receipt?.outcome)) throw new Error("Invalid completion receipt");
      let autoReply = null;
      if (["completed", "already_completed"].includes(receipt.outcome)) {
        try {
          autoReply = await processAutoReply(body.lead_id);
        } catch {
          // The database trigger keeps this reply queued for the 12-hour recovery branch.
          autoReply = { outcome: "queued", reason_code: "worker_interrupted" };
        }
      }
      return sendJson(response, receipt.outcome === "in_progress" ? 202 : 200, {
        lead_id: body.lead_id, run_id: body.run_id, outcome: receipt.outcome, auto_reply: autoReply,
      });
    } catch {
      // Do not leak RPC errors, dossier data or credentials into response / function logs.
      // The lease recovers interrupted work; a retry first looks for an existing receipt.
      return sendJson(response, 502, { error: "Screening worker failed; result not confirmed" });
    }
  };
}

export const companyScreeningWorkerHandler = createCompanyScreeningWorker();
