// Generates an inactive manual-test graph. No live workflow ID, secret, merchant data or DB key.
// Supply a verified dedicated httpHeaderAuth credential reference at staging, not a plaintext token.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function renderStuckIntakeAlert(alert) {
  if (alert?.outcome !== "ready") return null;
  if (!UUID.test(alert.lead_id || "") || !UUID.test(alert.claim_token || "") || !/^[1-9][0-9]*$/.test(String(alert.chat_id || ""))) {
    throw new Error("Invalid stuck-intake alert identity");
  }
  const clean = (value, max = 180) => String(value ?? "не указано").replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, max);
  const at = alert.detected_at && Number.isFinite(Date.parse(alert.detected_at))
    ? new Intl.DateTimeFormat("ru-RU", { timeZone: "Asia/Nicosia", dateStyle: "short", timeStyle: "short" }).format(new Date(alert.detected_at)) + " (Кипр)"
    : "время не подтверждено";
  const reason = {
    auto_reply_queued: "первый ответ не начал обрабатываться за 20 минут",
    auto_reply_claimed: "отправка первого ответа не завершилась за 15 минут",
    operator_review: "первый ответ остановлен и требует решения оператора",
    task_overdue: "просрочена задача первого ответа",
  }[alert.alert_kind] || clean(alert.alert_kind);
  const reasonCode = {
    response_task_inactive: "задача первого ответа неактивна",
    source_not_allowlisted: "источник заявки требует ручной проверки",
    recipient_missing: "не указан адрес получателя",
    recipient_invalid: "адрес получателя не прошёл проверку",
    missing_required_fields: "для безопасного ответа не хватает обязательных данных",
    screening_incomplete: "предварительная проверка ещё не завершена",
    delivery_uncertain: "доставка первого ответа не подтверждена",
  }[alert.reason_code] || clean(alert.reason_code, 120);
  const leadStatus = {
    new: "новая",
    qualifying: "квалификация",
    pending: "ожидает обработки",
    active: "в работе",
    closed: "закрыта",
    archived: "в архиве",
  }[alert.lead_status] || clean(alert.lead_status, 80);
  const repeat = Number(alert.notification_count) > 0 ? `\nПовторное напоминание: ${Number(alert.notification_count) + 1}` : "";
  const text = [
    "⚠️ OfferPSP · заявка требует внимания",
    "",
    `Компания: ${clean(alert.company)}`,
    `Стопор: ${reason}`,
    `Состояние с: ${at}`,
    `Почему остановилось: ${reasonCode}`,
    `Статус заявки: ${leadStatus}${repeat}`,
    "",
    "Нажмите кнопку и устраните причину в карточке мерчанта.",
  ].join("\n").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  return { ...alert, chat_id: String(alert.chat_id), text, merchant_url: String(alert.merchant_url || "") };
}

export function buildScreeningWorkflow({ endpoint, credential, scheduled = false, errorWorkflow, operatorCardWorkerId, databaseCredential, telegramCredential } = {}) {
  const url = new URL(endpoint);
  if (url.protocol !== "https:" || url.username || url.password || url.searchParams.get("module") !== "company-screening-worker") throw new Error("Protected screening endpoint required");
  if (!credential?.id || !credential?.name) throw new Error("Verified worker credential reference required");
  if (scheduled && !errorWorkflow) throw new Error("Scheduled screening requires a verified error workflow");
  const refreshCards = scheduled && typeof operatorCardWorkerId === "string" && operatorCardWorkerId.length > 0;
  const stuckAlerts = scheduled && Boolean(databaseCredential?.id && databaseCredential?.name && telegramCredential?.id && telegramCredential?.name);
  const http = (name, id, x, jsonBody, retry, y = 0) => ({
    // 4.3 supports all required options and can execute on the verified n8n 1.117.2 baseline.
    name, id, position: [x, y], type: "n8n-nodes-base.httpRequest", typeVersion: 4.3,
    parameters: { method: "POST", url: url.href, authentication: "genericCredentialType", genericAuthType: "httpHeaderAuth",
      sendBody: true, specifyBody: "json", jsonBody,
      options: { timeout: 45000, redirect: { redirect: { followRedirects: false } } } },
    credentials: { httpHeaderAuth: { id: credential.id, name: credential.name } },
    retryOnFail: retry, ...(retry ? { maxTries: 2, waitBetweenTries: 2000 } : {}), onError: "stopWorkflow",
  });
  const dispatchCard = (name, id, x, y, reason) => ({
    name,id,position:[x,y],type:"n8n-nodes-base.executeWorkflow",typeVersion:1.2,
    parameters:{source:"database",workflowId:{__rl:true,value:operatorCardWorkerId,mode:"id",cachedResultName:"OfferPSP | Operator intake card"},
      workflowInputs:{mappingMode:"defineBelow",value:{lead_id:"={{ $json.lead_id }}",reason}},mode:"once",options:{waitForSubWorkflow:false}},
    onError:"stopWorkflow",
  });
  const rpc = (name, id, x, y, procedure, jsonBody) => ({
    name, id, position: [x, y], type: "n8n-nodes-base.httpRequest", typeVersion: 4.3,
    parameters: { method: "POST", url: `https://iceopurxqzqmwtcmwfzl.supabase.co/rest/v1/rpc/${procedure}`,
      authentication: "predefinedCredentialType", nodeCredentialType: "supabaseApi", sendBody: true,
      specifyBody: "json", jsonBody, options: { timeout: 15000, redirect: { redirect: { followRedirects: false } } } },
    credentials: { supabaseApi: databaseCredential }, onError: "stopWorkflow",
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
      ...(scheduled ? [
        http("Recover one auto reply", "recover-auto-reply", 1200, '{"action":"recover_auto_reply"}', false),
        http("Recover one submission reply", "recover-submission-reply", 1200, '{"action":"recover_submission_reply"}', false, 160),
        ...(refreshCards ? [
          dispatchCard("Refresh operator card", "refresh-card", 1200, -80, "screening_completed"),
          { id:"filter-recovered-card",name:"Filter recovered card",type:"n8n-nodes-base.code",typeVersion:2,position:[1440,80],
            parameters:{jsCode:"const row=$input.first().json;return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(row.lead_id||'')?[{json:row}]:[];"}},
          dispatchCard("Refresh recovered operator card", "refresh-recovered-card", 1680, 80, "auto_reply_recovered"),
          { id:"filter-recovered-submission-card",name:"Filter recovered submission card",type:"n8n-nodes-base.code",typeVersion:2,position:[1440,240],
            parameters:{jsCode:"const row=$input.first().json;return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(row.lead_id||'')?[{json:row}]:[];"}},
          dispatchCard("Refresh recovered submission card", "refresh-recovered-submission-card", 1680, 240, "submission_reply_recovered"),
        ] : []),
        ...(stuckAlerts ? [
          rpc("Claim stuck intake alert", "claim-stuck-alert", 240, 520, "claim_offerpsp_stuck_intake_alert", "{}"),
          { id: "render-stuck-alert", name: "Render stuck intake alert", type: "n8n-nodes-base.code", typeVersion: 2, position: [480, 520],
            parameters: { jsCode: `const UUID=${UUID.toString()};\n${renderStuckIntakeAlert.toString()}\nconst alert=renderStuckIntakeAlert($input.first().json);return alert?[{json:alert}]:[];` } },
          { id: "send-stuck-alert", name: "Send stuck intake alert", type: "n8n-nodes-base.telegram", typeVersion: 1.2, position: [720, 520],
            parameters: { resource: "message", operation: "sendMessage", chatId: "={{ $json.chat_id }}", text: "={{ $json.text }}",
              replyMarkup: "inlineKeyboard", inlineKeyboard: { rows: [{ row: { buttons: [{ text: "Открыть мерчанта", additionalFields: { url: "={{ $json.merchant_url }}" } }] } }] },
              additionalFields: { parse_mode: "HTML", disable_web_page_preview: true, appendAttribution: false } },
            credentials: { telegramApi: telegramCredential }, retryOnFail: true, maxTries: 2, waitBetweenTries: 2000, onError: "stopWorkflow" },
          rpc("Record stuck intake alert", "record-stuck-alert", 960, 520, "complete_offerpsp_stuck_intake_alert",
            `={{ JSON.stringify({p_lead_id:$('Render stuck intake alert').first().json.lead_id,p_claim_token:$('Render stuck intake alert').first().json.claim_token,p_message_id:String($json.result?.message_id||$json.message_id||'')}) }}`),
        ] : []),
      ] : []),
      http("Claim one research run", "claim-research", 240, '{"action":"claim_research"}', false, 320),
      { id: "expand-research", name: "Expand research run IDs", type: "n8n-nodes-base.code", typeVersion: 2, position: [480, 320], parameters: { jsCode: "const jobs = $input.first().json.jobs;\nif (!Array.isArray(jobs) || jobs.length > 1) throw new Error('Invalid research claim receipt');\nreturn jobs.map(({job_id, run_id}) => ({json:{job_id,run_id}}));" } },
      http("Process claimed research run", "process-research", 720, '={{ JSON.stringify({action:"process_research",job_id:$json.job_id,run_id:$json.run_id}) }}', true, 320),
      { id: "receipt-research", name: "Verify research result receipt", type: "n8n-nodes-base.code", typeVersion: 2, position: [960, 320], parameters: { jsCode: "const receipt = $input.first().json;\nif (!['completed','already_completed','stale_or_cancelled','in_progress','module_disabled','retry_queued','failed'].includes(receipt.outcome)) throw new Error('Missing research screening receipt');\nreturn [{json:{...receipt, completed:['completed','already_completed'].includes(receipt.outcome)}}];" } },
    ],
    connections: {
      "Manual test only": { main: [[{ node: "Claim one run", type: "main", index: 0 }, { node: "Claim one research run", type: "main", index: 0 }]] },
      ...(scheduled ? {
        "Recovery every 12 hours": { main: [[{ node: "Claim one run", type: "main", index: 0 }, { node: "Claim one research run", type: "main", index: 0 }, { node: "Recover one auto reply", type: "main", index: 0 }, { node: "Recover one submission reply", type: "main", index: 0 }, ...(stuckAlerts ? [{ node: "Claim stuck intake alert", type: "main", index: 0 }] : [])]] },
        "Queue event": { main: [[{ node: "Claim one run", type: "main", index: 0 }, { node: "Claim one research run", type: "main", index: 0 }]] },
        // Drain available work, not just one case per 12 hours. Empty claims emit no items and stop.
        // Execution deadline provides a hard bound; timeout routes to the existing error handler.
        "Verify result receipt": { main: [[{ node: "Claim one run", type: "main", index: 0 }, { node: "Recover one auto reply", type: "main", index: 0 }, ...(refreshCards ? [{ node: "Refresh operator card", type: "main", index: 0 }] : [])]] },
        ...(refreshCards ? {
          "Recover one auto reply": { main: [[{ node: "Filter recovered card", type: "main", index: 0 }]] },
          "Filter recovered card": { main: [[{ node: "Refresh recovered operator card", type: "main", index: 0 }]] },
          "Recover one submission reply": { main: [[{ node: "Filter recovered submission card", type: "main", index: 0 }]] },
          "Filter recovered submission card": { main: [[{ node: "Refresh recovered submission card", type: "main", index: 0 }]] },
        } : {}),
        ...(stuckAlerts ? {
          "Claim stuck intake alert": { main: [[{ node: "Render stuck intake alert", type: "main", index: 0 }]] },
          "Render stuck intake alert": { main: [[{ node: "Send stuck intake alert", type: "main", index: 0 }]] },
          "Send stuck intake alert": { main: [[{ node: "Record stuck intake alert", type: "main", index: 0 }]] },
          "Record stuck intake alert": { main: [[{ node: "Claim stuck intake alert", type: "main", index: 0 }]] },
        } : {}),
        "Verify research result receipt": { main: [[{ node: "Claim one research run", type: "main", index: 0 }]] },
      } : {}),
      "Claim one run": { main: [[{ node: "Expand run IDs", type: "main", index: 0 }]] },
      "Expand run IDs": { main: [[{ node: "Process claimed run", type: "main", index: 0 }]] },
      "Process claimed run": { main: [[{ node: "Verify result receipt", type: "main", index: 0 }]] },
      "Claim one research run": { main: [[{ node: "Expand research run IDs", type: "main", index: 0 }]] },
      "Expand research run IDs": { main: [[{ node: "Process claimed research run", type: "main", index: 0 }]] },
      "Process claimed research run": { main: [[{ node: "Verify research result receipt", type: "main", index: 0 }]] },
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
