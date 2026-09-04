import { createHash } from "node:crypto";
import { decodeBase64File, FileInputError } from "./_lib/file-input.mjs";
import { extractPdfText } from "./_lib/pdf-text-extractor.mjs";
import { convertWithDocling, getDoclingConfig } from "./_lib/modules/docling.mjs";

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
    buffer = decodeBase64File(encoded);
  } catch (error) {
    if (error instanceof FileInputError) return sendJson(response, 422, { error: error.code });
    throw error;
  }
  if (!buffer.length || buffer.length > MAX_PDF_BYTES) {
    return sendJson(response, 413, { error: "pdf_size_invalid", max_bytes: MAX_PDF_BYTES });
  }
  if (buffer.subarray(0, 5).toString("ascii") !== "%PDF-") {
    return sendJson(response, 422, { error: "invalid_pdf_signature" });
  }

  try {
    const doclingConfig = getDoclingConfig();
    let extracted = null;
    let nativeError = null;
    let docling = null;

    try {
      extracted = await extractPdfText(buffer);
    } catch (error) {
      nativeError = error instanceof Error ? error.message : "Native PDF extraction failed";
    }

    if (doclingConfig.state.enabled) {
      try {
        docling = await convertWithDocling(
          { filename: String(input.filename || "offer.pdf"), buffer, mimeType: "application/pdf" },
          doclingConfig,
        );
      } catch (error) {
        docling = { engine: "docling", error: error instanceof Error ? error.message : "Docling failed" };
      }
    }

    const hasDoclingText = Boolean(docling && "text" in docling && docling.text);
    const useDocling = hasDoclingText && (doclingConfig.mode === "active" || !extracted);
    if (!extracted && !useDocling) {
      throw new Error([nativeError, docling?.error].filter(Boolean).join("; ") || "No PDF extractor succeeded");
    }

    const text = useDocling ? docling.text : extracted.text;
    return sendJson(response, 200, {
      text,
      page_count: extracted?.pageCount || null,
      extraction_method: useDocling ? "docling" : extracted.extractionMethod,
      source_sha256: createHash("sha256").update(buffer).digest("hex"),
      needs_ocr: !text,
      module_trace: {
        docling_mode: doclingConfig.mode,
        native_status: extracted ? "success" : "failed",
        docling_status: hasDoclingText ? "success" : docling?.error ? "failed" : "disabled",
        ...(nativeError ? { native_error: nativeError } : {}),
        ...(hasDoclingText ? { docling_text_length: docling.text.length } : {}),
      },
    });
  } catch (error) {
    return sendJson(response, 422, {
      error: "pdf_extraction_failed",
      message: error instanceof Error ? error.message : "Unknown PDF extraction error",
    });
  }
}
