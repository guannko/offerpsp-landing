// Generates an inactive manual-test graph. No live workflow ID, secret, merchant data or DB key.
// Supply a verified dedicated httpHeaderAuth credential reference at staging, not a plaintext token.
export function buildScreeningWorkflow({ endpoint, credential } = {}) {
  const url = new URL(endpoint);
  if (url.protocol !== "https:" || url.username || url.password || url.searchParams.get("module") !== "company-screening-worker") throw new Error("Protected screening endpoint required");
  if (!credential?.id || !credential?.name) throw new Error("Verified worker credential reference required");
  const http = (name, id, x, jsonBody, retry) => ({
    // 4.3 supports all required options and can execute on the verified n8n 1.117.2 baseline.
    name, id, position: [x, 0], type: "n8n-nodes-base.httpRequest", typeVersion: 4.3,
    parameters: { method: "POST", url: url.href, authentication: "genericCredentialType", genericAuthType: "httpHeaderAuth",
      sendBody: true, specifyBody: "json", jsonBody,
      options: { timeout: 45000, redirect: { redirect: { followRedirects: false } } } },
    credentials: { httpHeaderAuth: { id: credential.id, name: credential.name } },
    retryOnFail: retry, ...(retry ? { maxTries: 2, waitBetweenTries: 2000 } : {}), onError: "stopWorkflow",
  });
  return {
    name: "OfferPSP Screening v2 — isolated manual validation", active: false,
    settings: { executionOrder: "v1", saveDataSuccessExecution: "none", saveDataErrorExecution: "all", executionTimeout: 120 },
    nodes: [
      { id: "manual", name: "Manual test only", type: "n8n-nodes-base.manualTrigger", typeVersion: 1, position: [0, 0], parameters: {} },
      http("Claim one run", "claim", 240, '{"action":"claim"}', false),
      { id: "expand", name: "Expand run IDs", type: "n8n-nodes-base.code", typeVersion: 2, position: [480, 0], parameters: { jsCode: "const jobs = $input.first().json.jobs;\nif (!Array.isArray(jobs) || jobs.length > 1) throw new Error('Invalid claim receipt');\nreturn jobs.map(({lead_id, run_id}) => ({json:{lead_id,run_id}}));" } },
      http("Process claimed run", "process", 720, '={{ JSON.stringify({action:"process",lead_id:$json.lead_id,run_id:$json.run_id}) }}', true),
      { id: "receipt", name: "Verify result receipt", type: "n8n-nodes-base.code", typeVersion: 2, position: [960, 0], parameters: { jsCode: "const receipt = $input.first().json;\nif (!['completed','already_completed','stale_or_cancelled','in_progress','module_disabled'].includes(receipt.outcome)) throw new Error('Missing screening receipt');\nreturn [{json:{...receipt, completed:['completed','already_completed'].includes(receipt.outcome)}}];" } },
    ],
    connections: {
      "Manual test only": { main: [[{ node: "Claim one run", type: "main", index: 0 }]] },
      "Claim one run": { main: [[{ node: "Expand run IDs", type: "main", index: 0 }]] },
      "Expand run IDs": { main: [[{ node: "Process claimed run", type: "main", index: 0 }]] },
      "Process claimed run": { main: [[{ node: "Verify result receipt", type: "main", index: 0 }]] },
    },
  };
}
