// Generates an inactive manual-test graph. No live workflow ID, secret, merchant data or DB key.
// Supply a verified dedicated httpHeaderAuth credential reference at staging, not a plaintext token.
export function buildScreeningWorkflow({ endpoint, credential, scheduled = false, errorWorkflow } = {}) {
  const url = new URL(endpoint);
  if (url.protocol !== "https:" || url.username || url.password || url.searchParams.get("module") !== "company-screening-worker") throw new Error("Protected screening endpoint required");
  if (!credential?.id || !credential?.name) throw new Error("Verified worker credential reference required");
  if (scheduled && !errorWorkflow) throw new Error("Scheduled screening requires a verified error workflow");
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
    name: scheduled ? "OfferPSP | Safe Company Screening v2" : "OfferPSP Screening v2 — isolated manual validation", active: false,
    settings: { executionOrder: "v1", saveDataSuccessExecution: scheduled ? "all" : "none", saveDataErrorExecution: "all", executionTimeout: scheduled ? 900 : 120,
      ...(scheduled ? { timezone: "Asia/Nicosia", errorWorkflow } : {}) },
    nodes: [
      { id: "manual", name: "Manual test only", type: "n8n-nodes-base.manualTrigger", typeVersion: 1, position: [0, 0], parameters: {}, ...(scheduled ? { disabled: true } : {}) },
      ...(scheduled ? [
        { id: "schedule", name: "Recovery every 12 hours", type: "n8n-nodes-base.scheduleTrigger", typeVersion: 1.2, position: [0, 180], parameters: { rule: { interval: [{ field: "hours", hoursInterval: 12 }] } } },
        { id: "event", name: "Queue event", type: "n8n-nodes-base.executeWorkflowTrigger", typeVersion: 1.1, position: [0, -180], parameters: { inputSource: "passthrough" } },
      ] : []),
      http("Claim one run", "claim", 240, '{"action":"claim"}', false),
      { id: "expand", name: "Expand run IDs", type: "n8n-nodes-base.code", typeVersion: 2, position: [480, 0], parameters: { jsCode: "const jobs = $input.first().json.jobs;\nif (!Array.isArray(jobs) || jobs.length > 1) throw new Error('Invalid claim receipt');\nreturn jobs.map(({lead_id, run_id}) => ({json:{lead_id,run_id}}));" } },
      http("Process claimed run", "process", 720, '={{ JSON.stringify({action:"process",lead_id:$json.lead_id,run_id:$json.run_id}) }}', true),
      { id: "receipt", name: "Verify result receipt", type: "n8n-nodes-base.code", typeVersion: 2, position: [960, 0], parameters: { jsCode: "const receipt = $input.first().json;\nif (!['completed','already_completed','stale_or_cancelled','in_progress','module_disabled'].includes(receipt.outcome)) throw new Error('Missing screening receipt');\n" + (scheduled ? "if (['in_progress','module_disabled'].includes(receipt.outcome)) throw new Error('Screening not completed: ' + receipt.outcome);\n" : "") + "return [{json:{...receipt, completed:['completed','already_completed'].includes(receipt.outcome)}}];" } },
    ],
    connections: {
      "Manual test only": { main: [[{ node: "Claim one run", type: "main", index: 0 }]] },
      ...(scheduled ? {
        "Recovery every 12 hours": { main: [[{ node: "Claim one run", type: "main", index: 0 }]] },
        "Queue event": { main: [[{ node: "Claim one run", type: "main", index: 0 }]] },
        // Drain available work, not just one case per 12 hours. Empty claims emit no items and stop.
        // Execution deadline provides a hard bound; timeout routes to the existing error handler.
        "Verify result receipt": { main: [[{ node: "Claim one run", type: "main", index: 0 }]] },
      } : {}),
      "Claim one run": { main: [[{ node: "Expand run IDs", type: "main", index: 0 }]] },
      "Expand run IDs": { main: [[{ node: "Process claimed run", type: "main", index: 0 }]] },
      "Process claimed run": { main: [[{ node: "Verify result receipt", type: "main", index: 0 }]] },
    },
  };
}

export function buildScreeningEventIngress({ credential, workerId, errorWorkflow } = {}) {
  if (!credential?.id || !credential?.name || !workerId || !errorWorkflow) throw new Error("Verified event credential, worker and error handler required");
  return {
    name: "OfferPSP | Screening event ingress", active: false,
    // The HTTP trigger receives a secret header. Never persist its input, even on failure.
    // The child worker saves only sanitized queue IDs and receipts for operational evidence.
    settings: { executionOrder: "v1", saveDataSuccessExecution: "none", saveDataErrorExecution: "none", saveManualExecutions: false, saveExecutionProgress: false, executionTimeout: 60, errorWorkflow },
    nodes: [
      { id: "event-webhook", name: "Authenticated queue wake-up", type: "n8n-nodes-base.webhook", typeVersion: 2, position: [0, 0], parameters: { httpMethod: "POST", path: "offerpsp-screening-ready-v1", authentication: "jwtAuth", responseMode: "onReceived", options: {} }, credentials: { jwtAuth: credential } },
      { id: "sanitize", name: "Discard request data", type: "n8n-nodes-base.code", typeVersion: 2, position: [220, 0], parameters: { jsCode: "return [{json:{source:'database_event'}}];" } },
      { id: "dispatch", name: "Wake screening worker", type: "n8n-nodes-base.executeWorkflow", typeVersion: 1.2, position: [440, 0], parameters: { source: "database", workflowId: { __rl: true, value: workerId, mode: "id", cachedResultName: "OfferPSP | Safe Company Screening v2" }, workflowInputs: { mappingMode: "autoMapInputData", value: {} }, mode: "once", options: { waitForSubWorkflow: false } } },
    ],
    connections: {
      "Authenticated queue wake-up": { main: [[{ node: "Discard request data", type: "main", index: 0 }]] },
      "Discard request data": { main: [[{ node: "Wake screening worker", type: "main", index: 0 }]] },
    },
  };
}
