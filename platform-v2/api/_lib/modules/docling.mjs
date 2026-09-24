import { moduleMode, moduleState, optionalUrl } from "./config.mjs";

export function getDoclingConfig() {
  const mode = moduleMode("OFFERPSP_DOCLING_MODE");
  const url = optionalUrl("DOCLING_URL");
  return {
    mode,
    url,
    apiKey: String(process.env.DOCLING_API_KEY || "").trim(),
    timeoutMs: Number(process.env.DOCLING_TIMEOUT_MS || 45_000),
    state: moduleState({ name: "docling", mode, configured: Boolean(url) }),
  };
}

function headers(config) {
  return {
    "content-type": "application/json",
    ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
  };
}

export async function probeDocling(config = getDoclingConfig()) {
  if (!config.state.enabled) return { ...config.state, healthy: false, reason: "disabled_or_unconfigured" };
  const request = config.fetchImpl || fetch;
  const response = await request(`${config.url}/health`, {
    headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
    signal: AbortSignal.timeout(Math.min(config.timeoutMs, 8_000)),
  });
  return { ...config.state, healthy: response.ok, status: response.status };
}

export async function convertWithDocling({ filename, buffer, mimeType }, config = getDoclingConfig()) {
  if (!config.state.enabled) throw new Error("Docling is disabled or unconfigured");
  if (!filename || !Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new Error("Docling conversion requires a non-empty file");
  }

  const request = config.fetchImpl || fetch;
  const response = await request(`${config.url}/v1/convert/source`, {
    method: "POST",
    headers: headers(config),
    signal: AbortSignal.timeout(config.timeoutMs),
    body: JSON.stringify({
      file_sources: [
        {
          filename,
          base64_string: buffer.toString("base64"),
        },
      ],
      to_formats: ["md", "json", "text"],
      do_ocr: true,
      table_mode: "accurate",
      abort_on_error: false,
    }),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.detail || payload?.message || `Docling returned ${response.status}`);

  const document = payload?.document || {};
  const text = String(document.md_content || document.text_content || "").trim();
  if (!text) throw new Error("Docling returned no usable text");

  return {
    engine: "docling",
    text,
    mimeType: mimeType || "application/octet-stream",
    structured: document.json_content || null,
    status: payload.status || "success",
    errors: Array.isArray(payload.errors) ? payload.errors : [],
  };
}
