import { isIP } from "node:net";
import { buildCompanyScreening } from "./company-screening.mjs";
import { evidenceUrl, fetchPublicEvidence } from "./safe-evidence-fetch.mjs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Internal worker primitive. The host must authenticate and load a fresh claimed job from DB.
 * No matching, clearance, notifications, raw HTML persistence or outbound merchant messages.
 */
export async function collectClaimedCompanyEvidence(job, { fetchEvidence = fetchPublicEvidence, now = () => new Date() } = {}) {
  if (!UUID.test(job?.lead_id || "") || !UUID.test(job?.run_id || "")) throw new Error("A claimed screening run is required");
  if (!(Date.parse(job.lease_until) > now().valueOf())) throw new Error("Screening lease expired");
  let website = { statusCode: 0, body: "", error: "missing_company_url" };
  let rdap = { statusCode: 0, body: {}, error: "missing_company_url" };
  let source;
  try { source = evidenceUrl(job.company_url); } catch { /* No unsafe or mailbox-domain fallback. */ }
  if (source) {
    const host = source.hostname.replace(/^\[|\]$/g, "").replace(/^www\./, "");
    [website, rdap] = await Promise.all([
      fetchEvidence(source.href),
      isIP(host) ? Promise.resolve({ statusCode: 0, body: {}, error: "domain_required" }) :
        fetchEvidence(`https://rdap.org/domain/${encodeURIComponent(host)}`, { kind: "rdap" }),
    ]);
  } else if (job.company_url) {
    website.error = "invalid_or_blocked_url"; rdap.error = "invalid_or_blocked_url";
  }
  // Avoid work after expiry; the DB completion fence remains authoritative against races.
  if (!(Date.parse(job.lease_until) > now().valueOf())) throw new Error("Screening lease expired");
  return { lead_id: job.lead_id, run_id: job.run_id, payload: buildCompanyScreening(job, website, rdap, now()) };
}

export async function processClaimedCompany(job, { complete, ...collectionOptions } = {}) {
  if (typeof complete !== "function") throw new Error("Fenced completion callback is required");
  const result = await collectClaimedCompanyEvidence(job, collectionOptions);
  const receipt = await complete(result);
  if (!["completed", "already_completed", "stale_or_cancelled", "module_disabled"].includes(receipt?.outcome)) {
    throw new Error("Screening completion was not acknowledged");
  }
  return receipt;
}
