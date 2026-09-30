import { createHash } from "node:crypto";
import { extractOfferEmailAttachment } from "./offer-email-attachments.mjs";
import { convertWithDocling, getDoclingConfig } from "./modules/docling.mjs";
import {
  HttpError,
  providerSupabaseFetch,
  requireOfferPspProvider,
  sendError,
  sendJson,
} from "./staff-auth.mjs";

const MAX_SOURCE_BYTES = 15 * 1024 * 1024;
const DIRECT_EXTENSIONS = new Set(["txt", "md", "csv", "tsv", "json", "html", "htm", "xml", "pdf", "docx", "xlsx"]);
const DOCLING_EXTENSIONS = new Set(["pdf", "doc", "docx", "xls", "xlsx", "png", "jpg", "jpeg", "tif", "tiff", "webp"]);
const ALLOWED_ORIGINS = new Set([
  "https://offerpsp.com",
  "http://localhost:3000",
  "http://localhost:4173",
  "http://localhost:5173",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:4173",
  "http://127.0.0.1:5173",
]);

function setCors(request, response) {
  const origin = String(request.headers.origin || "");
  if (ALLOWED_ORIGINS.has(origin)) response.setHeader("Access-Control-Allow-Origin", origin);
  response.setHeader("Vary", "Origin");
  response.setHeader("Access-Control-Allow-Headers", "authorization, content-type");
  response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
}

function extension(filename) {
  return String(filename || "").split(".").pop()?.toLowerCase() || "";
}

function encodedStoragePath(path) {
  return String(path).split("/").map(encodeURIComponent).join("/");
}

export async function providerOfferSourceHandler(request, response) {
  setCors(request, response);
  if (request.method === "OPTIONS") return response.status(204).end();
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST, OPTIONS");
    return sendJson(response, 405, { error: "method_not_allowed" });
  }

  try {
    const input = request.body && typeof request.body === "object" ? request.body : {};
    const providerId = String(input.provider_id || "").trim();
    const storagePath = String(input.storage_path || "").trim();
    const filename = String(input.filename || "source.bin").trim().slice(0, 240);
    if (!/^[0-9a-f-]{36}$/i.test(providerId)) throw new HttpError(422, "Invalid PSP provider ID");
    const context = await requireOfferPspProvider(request, providerId, ["owner", "admin", "editor"]);
    const requiredPrefix = `providers/${providerId}/${context.user.id}/`;
    if (!storagePath.startsWith(requiredPrefix) || storagePath.includes("..")) {
      throw new HttpError(403, "Invalid private source path");
    }
    const fileExtension = extension(filename);
    if (!DIRECT_EXTENSIONS.has(fileExtension) && !DOCLING_EXTENSIONS.has(fileExtension)) {
      throw new HttpError(415, "Unsupported offer source type");
    }

    const sourceResponse = await providerSupabaseFetch(
      context,
      `storage/v1/object/authenticated/offerpsp-private-sources/${encodedStoragePath(storagePath)}`,
      { method: "GET" },
    );
    const buffer = Buffer.from(await sourceResponse.arrayBuffer());
    if (!buffer.length || buffer.length > MAX_SOURCE_BYTES) throw new HttpError(413, "Offer source size is invalid");

    let result = null;
    if (DIRECT_EXTENSIONS.has(fileExtension)) {
      result = await extractOfferEmailAttachment({
        filename,
        contentType: String(input.mime_type || sourceResponse.headers.get("content-type") || "application/octet-stream"),
        content: buffer,
      }, { maxBytes: MAX_SOURCE_BYTES });
    }

    if ((!result?.extracted_text || ["needs_ocr", "needs_review"].includes(result.status)) && DOCLING_EXTENSIONS.has(fileExtension)) {
      const config = getDoclingConfig();
      if (config.state.enabled) {
        const docling = await convertWithDocling({
          filename,
          buffer,
          mimeType: String(input.mime_type || sourceResponse.headers.get("content-type") || "application/octet-stream"),
        }, config);
        if (docling.text) {
          result = {
            ...(result || {}),
            accepted: true,
            status: docling.status || "extracted",
            extracted_text: docling.text,
            extraction_method: docling.engine,
            extraction_error: Array.isArray(docling.errors) && docling.errors.length ? docling.errors.join("; ") : null,
          };
        }
      }
    }

    if (!result?.extracted_text) {
      throw new HttpError(422, result?.extraction_error || "The file contains no extractable offer text");
    }
    return sendJson(response, 200, {
      text: result.extracted_text,
      extraction_method: result.extraction_method,
      source_sha256: createHash("sha256").update(buffer).digest("hex"),
      size_bytes: buffer.length,
      filename,
      mime_type: String(input.mime_type || sourceResponse.headers.get("content-type") || "application/octet-stream"),
      status: result.status,
    });
  } catch (error) {
    return sendError(response, error);
  }
}

export default providerOfferSourceHandler;
