import { buildCompanyScreening } from "../api/_lib/company-screening.mjs";

// Legacy evidence adapter only, not a deployable worker. Safe fetch + fenced completion are
// implemented in company-screening-runner.mjs. Never stage edits on an active n8n workflow.
export function screeningNodeCode() {
  return `${buildCompanyScreening.toString()}
const leads = $('Build Check Targets').all();
const websites = $('Check Website').all();
const domains = $input.all();
if (leads.length !== websites.length || leads.length !== domains.length) {
  throw new Error('Screening item alignment failed; refusing to attach evidence to the wrong lead');
}
return leads.map((item, index) => ({
  json: { lead_id: item.json.lead_id, payload: buildCompanyScreening(item.json, websites[index].json, domains[index].json) },
  pairedItem: { item: index },
}));`;
}

if (process.argv.includes("--print")) process.stdout.write(screeningNodeCode());
