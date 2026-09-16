import { timingSafeEqual } from "node:crypto";
import { sendJson, serviceSupabaseRequest } from "./staff-auth.mjs";
import { processClaimedCompany } from "./company-screening-runner.mjs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RECEIPTS = new Set(["completed", "already_completed", "stale_or_cancelled", "module_disabled", "in_progress"]);

// Internal transport, not a staff/MCP auth bypass. The dedicated worker token grants only these
// two bounded operations. The Supabase service key never leaves the Vercel server.
export function createCompanyScreeningWorker({ env = process.env, rpc, processJob = processClaimedCompany } = {}) {
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
      (body.action === "process" && keys.length === 3 && UUID.test(body.lead_id || "") && UUID.test(body.run_id || "")))) {
      return sendJson(response, 400, { error: "Only claim or process with lead_id/run_id is supported" });
    }
    try {
      if (body.action === "claim") {
        const jobs = await call("claim_offerpsp_pre_compliance_jobs", { p_limit: 1 });
        if (!Array.isArray(jobs) || jobs.length > 1 || jobs.some((j) => !UUID.test(j.lead_id) || !UUID.test(j.run_id))) throw new Error("Invalid queue response");
        return sendJson(response, 200, { jobs: jobs.map(({ lead_id, run_id }) => ({ lead_id, run_id })) });
      }
      const acquired = await call("begin_offerpsp_pre_compliance_run", { p_lead_id: body.lead_id, p_run_id: body.run_id });
      let receipt = acquired;
      if (acquired?.outcome === "acquired") {
        if (acquired.job?.lead_id !== body.lead_id || acquired.job?.run_id !== body.run_id) throw new Error("Run identity mismatch");
        receipt = await processJob(acquired.job, {
          complete: ({ lead_id, run_id, payload }) => call("complete_offerpsp_pre_compliance_run", { p_lead_id: lead_id, p_run_id: run_id, p_payload: payload }),
        });
      }
      if (!RECEIPTS.has(receipt?.outcome)) throw new Error("Invalid completion receipt");
      return sendJson(response, receipt.outcome === "in_progress" ? 202 : 200, {
        lead_id: body.lead_id, run_id: body.run_id, outcome: receipt.outcome,
      });
    } catch {
      // Do not leak RPC errors, dossier data or credentials into response / function logs.
      // The lease recovers interrupted work; a retry first looks for an existing receipt.
      return sendJson(response, 502, { error: "Screening worker failed; result not confirmed" });
    }
  };
}

export const companyScreeningWorkerHandler = createCompanyScreeningWorker();
