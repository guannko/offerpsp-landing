import { createHash } from "node:crypto";
import { decodeBase64File, FileInputError } from "./_lib/file-input.mjs";
import { convertWithDocling, getDoclingConfig } from "./_lib/modules/docling.mjs";
import { HttpError, requireOfferPspStaff } from "./_lib/staff-auth.mjs";

const MAX_DOCUMENT_BYTES = 15 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set([
  "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx",
  "eml", "msg", "png", "jpg", "jpeg", "tif", "tiff", "webp", "txt", "csv",
]);

function sendJson(response, status, payload) {
  response.status(status).setHeader("Content-Type", "application/json; charset=utf-8");
  response.send(JSON.stringify(payload));
}

function extension(filename) {
  return String(filename || "").split(".").pop()?.toLowerCase() || "";
}

async function authorizeRequest(request) {
  const expectedToken = String(process.env.OFFERPSP_PARSER_TOKEN || "");
  const suppliedToken = request.headers["x-offerpsp-parser-token"];
  if (expectedToken && typeof suppliedToken === "string" && suppliedToken === expectedToken) return;
  await requireOfferPspStaff(request);
}

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return sendJson(response, 405, { error: "method_not_allowed" });
  }

  try {
    await authorizeRequest(request);
  } catch (error) {
    if (error instanceof HttpError) return sendJson(response, error.status, { error: error.message });
    throw error;
  }

  const input = request.body && typeof request.body === "object" ? request.body : {};
  const filename = String(input.filename || "document.bin").slice(0, 240);
  if (!ALLOWED_EXTENSIONS.has(extension(filename))) {
    return sendJson(response, 415, { error: "unsupported_document_type" });
  }

  const encoded = typeof input.file_base64 === "string" ? input.file_base64 : "";
  if (!encoded) return sendJson(response, 422, { error: "file_required" });
  let buffer;
  try {
    buffer = decodeBase64File(encoded);
  } catch (error) {
    if (error instanceof FileInputError) return sendJson(response, 422, { error: error.code });
    throw error;
  }
  if (!buffer.length || buffer.length > MAX_DOCUMENT_BYTES) {
    return sendJson(response, 413, { error: "file_size_invalid", max_bytes: MAX_DOCUMENT_BYTES });
  }

  const config = getDoclingConfig();
  if (!config.state.enabled) {
    return sendJson(response, 503, { error: "docling_disabled_or_unconfigured" });
  }

  try {
    const result = await convertWithDocling({
      filename,
      buffer,
      mimeType: String(input.mime_type || "application/octet-stream"),
    }, config);
    return sendJson(response, 200, {
      text: result.text,
      structured: result.structured,
      extraction_method: result.engine,
      source_sha256: createHash("sha256").update(buffer).digest("hex"),
      status: result.status,
      errors: result.errors,
    });
  } catch (error) {
    return sendJson(response, 422, {
      error: "document_extraction_failed",
      message: error instanceof Error ? error.message : "Unknown document extraction error",
    });
  }
}
