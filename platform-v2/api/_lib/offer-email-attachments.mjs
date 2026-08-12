import { createHash } from "node:crypto";
import mammoth from "mammoth";
import readXlsxFile from "read-excel-file/node";
import { extractPdfText } from "./pdf-text-extractor.mjs";

export const MAX_EMAIL_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_EMAIL_ATTACHMENTS_BYTES = 12 * 1024 * 1024;
const MAX_EXTRACTED_TEXT_LENGTH = 1_000_000;

const TEXT_EXTENSIONS = new Set(["txt", "md", "csv", "tsv", "json", "html", "htm", "xml"]);
const SUPPORTED_EXTENSIONS = new Set([...TEXT_EXTENSIONS, "pdf", "docx", "xlsx"]);

const canonicalContentType = (extension, fallback) => {
  if (extension === "pdf") return "application/pdf";
  if (extension === "docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (extension === "xlsx") return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (extension === "json") return "application/json";
  if (extension === "csv") return "text/csv";
  if (extension === "tsv") return "text/tab-separated-values";
  if (TEXT_EXTENSIONS.has(extension)) return "text/plain";
  return fallback;
};

const extensionOf = (filename = "") => String(filename).split(".").pop()?.toLowerCase() || "";

const normalizeText = (value) => String(value || "")
  .replace(/\r\n?/g, "\n")
  .replace(/[ \t]+\n/g, "\n")
  .replace(/\n{4,}/g, "\n\n\n")
  .trim()
  .slice(0, MAX_EXTRACTED_TEXT_LENGTH);

const normalizeCell = (value) => {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
};

const isInlineAsset = (attachment) => {
  const disposition = String(attachment?.contentDisposition || "").toLowerCase();
  const contentType = String(attachment?.contentType || "").toLowerCase();
  return disposition === "inline" && contentType.startsWith("image/");
};

export async function extractOfferEmailAttachment(attachment) {
  const filename = String(attachment?.filename || "attachment").trim().slice(0, 255) || "attachment";
  const reportedContentType = String(attachment?.contentType || "application/octet-stream").toLowerCase();
  const content = Buffer.isBuffer(attachment?.content) ? attachment.content : Buffer.from(attachment?.content || "");
  const extension = extensionOf(filename);
  const contentType = canonicalContentType(extension, reportedContentType);
  const size = content.length;
  const sha256 = createHash("sha256").update(content).digest("hex");

  const base = {
    filename,
    content_type: contentType,
    size_bytes: size,
    sha256,
  };

  if (isInlineAsset(attachment)) {
    return { ...base, accepted: false, status: "ignored_inline", extraction_error: "Inline image ignored" };
  }
  if (!SUPPORTED_EXTENSIONS.has(extension)) {
    return { ...base, accepted: false, status: "unsupported", extraction_error: `Unsupported attachment type: .${extension || "unknown"}` };
  }
  if (!size) {
    return { ...base, accepted: false, status: "empty", extraction_error: "Attachment is empty" };
  }
  if (size > MAX_EMAIL_ATTACHMENT_BYTES) {
    return { ...base, accepted: false, status: "too_large", extraction_error: "Attachment exceeds the 10 MB email limit" };
  }

  try {
    let extractedText = "";
    let extractionMethod = "";
    if (TEXT_EXTENSIONS.has(extension)) {
      extractedText = normalizeText(content.toString("utf8"));
      extractionMethod = "offerpsp-server-text-v1";
    } else if (extension === "pdf") {
      const extracted = await extractPdfText(content);
      extractedText = normalizeText(extracted.text);
      extractionMethod = extracted.extractionMethod;
    } else if (extension === "docx") {
      const extracted = await mammoth.extractRawText({ buffer: content });
      extractedText = normalizeText(extracted.value);
      extractionMethod = "offerpsp-server-mammoth-v1";
    } else if (extension === "xlsx") {
      const rows = await readXlsxFile(content);
      extractedText = normalizeText(rows.map((row) => row.map(normalizeCell).join("\t")).join("\n"));
      extractionMethod = "offerpsp-server-xlsx-v1";
    }

    return {
      ...base,
      accepted: true,
      status: extractedText ? "extracted" : "needs_ocr",
      extracted_text: extractedText || null,
      extraction_method: extractionMethod || null,
      content_base64: content.toString("base64"),
    };
  } catch (error) {
    return {
      ...base,
      accepted: true,
      status: "needs_review",
      extracted_text: null,
      extraction_method: null,
      extraction_error: error instanceof Error ? error.message.slice(0, 500) : "Attachment extraction failed",
      content_base64: content.toString("base64"),
    };
  }
}

export async function prepareOfferEmailAttachments(attachments = []) {
  const prepared = [];
  let acceptedBytes = 0;
  for (const attachment of attachments) {
    const item = await extractOfferEmailAttachment(attachment);
    if (item.accepted) {
      if (acceptedBytes + item.size_bytes > MAX_EMAIL_ATTACHMENTS_BYTES) {
        prepared.push({
          filename: item.filename,
          content_type: item.content_type,
          size_bytes: item.size_bytes,
          sha256: item.sha256,
          accepted: false,
          status: "batch_too_large",
          extraction_error: "Combined email attachments exceed the 12 MB ingestion limit",
        });
        continue;
      }
      acceptedBytes += item.size_bytes;
    }
    prepared.push(item);
  }
  return prepared;
}
