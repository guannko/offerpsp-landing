import { parseOfferSource } from "./_lib/offer-parser.mjs";

const MAX_SOURCE_BYTES = 2 * 1024 * 1024;

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
  if (!expectedToken) {
    return sendJson(response, 503, { error: "parser_not_configured" });
  }
  if (typeof suppliedToken !== "string" || suppliedToken !== expectedToken) {
    return sendJson(response, 401, { error: "unauthorized" });
  }

  const input = request.body && typeof request.body === "object" ? request.body : {};
  const sourceText = typeof input.source_text === "string" ? input.source_text : "";
  if (Buffer.byteLength(sourceText, "utf8") > MAX_SOURCE_BYTES) {
    return sendJson(response, 413, { error: "source_too_large" });
  }

  try {
    const sourceMetadata = input.source_metadata && typeof input.source_metadata === "object"
      ? input.source_metadata
      : {};
    const payload = parseOfferSource({
      providerKey: input.provider_key,
      providerName: input.provider_name,
      providerWebsite: input.provider_website,
      strategicPriority: input.strategic_priority,
      marginIncluded: input.margin_included,
      effectiveDate: input.effective_date,
      sourceText,
      sourceType: input.source_type || "api",
      sourceReference: input.source_reference || "api-source",
      sourceFormat: input.source_format || sourceMetadata.source_format,
      originalSource: input.original_source,
      extractionMethod: input.extraction_method || sourceMetadata.extraction_method || "plain-text",
      extractorVersion: input.extractor_version || sourceMetadata.extractor_version,
      sourceMetadata,
    });
    return sendJson(response, 200, payload);
  } catch (error) {
    return sendJson(response, 422, {
      error: "source_parse_failed",
      message: error instanceof Error ? error.message : "Unknown parser error",
    });
  }
}
