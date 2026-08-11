import { createHash } from "node:crypto";
import { extractPdfText } from "./_lib/pdf-text-extractor.mjs";

const MAX_PDF_BYTES = 15 * 1024 * 1024;

function sendJson(response, status, payload) {
  response.status(status).setHeader("Content-Type", "application/json; charset=utf-8");
  response.send(JSON.stringify(payload));
}
export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return sendJson(response, 405, { error: "method_not_allowed" });
  }

  const expectedToken = process.env.OFFERPSP_PARSER_TOKEN;
  const suppliedToken = request.headers["x-offerpsp-parser-token"];
  if (!expectedToken) return sendJson(response, 503, { error: "parser_not_configured" });
  if (typeof suppliedToken !== "string" || suppliedToken !== expectedToken) {
    return sendJson(response, 401, { error: "unauthorized" });
  }

  const input = request.body && typeof request.body === "object" ? request.body : {};
  const encoded = typeof input.pdf_base64 === "string" ? input.pdf_base64 : "";
  if (!encoded) return sendJson(response, 422, { error: "pdf_required" });

  let buffer;
  try {
    buffer = Buffer.from(encoded, "base64");
  } catch {
    return sendJson(response, 422, { error: "invalid_base64" });
  }
  if (!buffer.length || buffer.length > MAX_PDF_BYTES) {
    return sendJson(response, 413, { error: "pdf_size_invalid", max_bytes: MAX_PDF_BYTES });
  }
  if (buffer.subarray(0, 5).toString("ascii") !== "%PDF-") {
    return sendJson(response, 422, { error: "invalid_pdf_signature" });
  }

  try {
    const extracted = await extractPdfText(buffer);
    return sendJson(response, 200, {
      text: extracted.text,
      page_count: extracted.pageCount,
      extraction_method: extracted.extractionMethod,
      source_sha256: createHash("sha256").update(buffer).digest("hex"),
      needs_ocr: !extracted.text,
    });
  } catch (error) {
    return sendJson(response, 422, {
      error: "pdf_extraction_failed",
      message: error instanceof Error ? error.message : "Unknown PDF extraction error",
    });
  }
}
