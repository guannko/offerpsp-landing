const EXPECTED_TOKEN_SHA256 = "93617c50544c2e57a8815335c1034dc6c3410918e4f47602f7d31fae4752915f";

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });

const sha256 = async (value: string) => {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
};

const bytesToHex = async (bytes: Uint8Array) => {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
};

const decodeBase64 = (value: string) => {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};

const safeFilename = (value: string) => {
  const normalized = value.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return (normalized || "attachment").slice(-120);
};

const restHeaders = (serviceRoleKey: string) => ({
  apikey: serviceRoleKey,
  Authorization: `Bearer ${serviceRoleKey}`,
  "Content-Type": "application/json",
});

Deno.serve(async (request) => {
  if (request.method !== "POST") return json(405, { success: false, error: "Method not allowed" });

  const authorization = request.headers.get("authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token || await sha256(token) !== EXPECTED_TOKEN_SHA256) {
    return json(401, { success: false, error: "Unauthorized" });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("OfferPSP ingest gateway is missing Supabase runtime configuration");
    return json(500, { success: false, error: "Server configuration error" });
  }

  let input: { payload?: Record<string, unknown> };
  try {
    input = await request.json();
  } catch {
    return json(400, { success: false, error: "Invalid JSON" });
  }
  if (!input.payload || typeof input.payload !== "object" || Array.isArray(input.payload)) {
    return json(400, { success: false, error: "Email payload is required" });
  }

  const attachments = Array.isArray(input.payload.attachments) ? input.payload.attachments : [];
  const emailPayload = { ...input.payload };
  delete emailPayload.attachments;

  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/aibot_n8n_ingest_email`, {
    method: "POST",
    headers: restHeaders(serviceRoleKey),
    body: JSON.stringify({ p_payload: emailPayload }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result?.success === false) {
    console.error("OfferPSP Mail Center RPC rejected an inbound email", { status: response.status });
    return json(502, { success: false, error: "Mail Center ingestion failed" });
  }

  const attachmentResults: Record<string, unknown>[] = [];
  for (const rawAttachment of attachments) {
    if (!rawAttachment || typeof rawAttachment !== "object" || Array.isArray(rawAttachment)) continue;
    const attachment = rawAttachment as Record<string, unknown>;
    if (attachment.accepted !== true || typeof attachment.content_base64 !== "string") {
      attachmentResults.push({
        filename: attachment.filename || "attachment",
        status: attachment.status || "ignored",
        accepted: false,
      });
      continue;
    }

    try {
      const bytes = decodeBase64(attachment.content_base64);
      const sizeBytes = Number(attachment.size_bytes || 0);
      if (!sizeBytes || sizeBytes !== bytes.byteLength || sizeBytes > 10 * 1024 * 1024) {
        throw new Error("Attachment size validation failed");
      }
      const expectedHash = String(attachment.sha256 || "").toLowerCase();
      const actualHash = await bytesToHex(bytes);
      if (!expectedHash || expectedHash !== actualHash) throw new Error("Attachment hash validation failed");

      const receivedAt = String(emailPayload.received_at || new Date().toISOString());
      const date = /^\d{4}-\d{2}-\d{2}/.test(receivedAt) ? receivedAt.slice(0, 10) : new Date().toISOString().slice(0, 10);
      const storagePath = `email/${date}/${result.message_id}/${actualHash.slice(0, 16)}-${safeFilename(String(attachment.filename || "attachment"))}`;
      const storageUrl = `${supabaseUrl}/storage/v1/object/offerpsp-private-sources/${storagePath.split("/").map(encodeURIComponent).join("/")}`;
      const upload = await fetch(storageUrl, {
        method: "POST",
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          "Content-Type": String(attachment.content_type || "application/octet-stream"),
          "x-upsert": "false",
        },
        body: bytes,
      });
      if (!upload.ok && upload.status !== 409) {
        const uploadError = await upload.text().catch(() => "");
        if (!/already exists|duplicate/i.test(uploadError)) throw new Error(`Private source upload failed (${upload.status})`);
      }

      const recordPayload = {
        message_id: result.message_id,
        filename: attachment.filename,
        content_type: attachment.content_type,
        size_bytes: sizeBytes,
        sha256: actualHash,
        storage_path: storagePath,
        extracted_text: attachment.extracted_text || null,
        extraction_method: attachment.extraction_method || null,
        extraction_error: attachment.extraction_error || null,
        status: attachment.status || "needs_review",
        metadata: { source: "imap", received_at: emailPayload.received_at || null },
      };
      const recorded = await fetch(`${supabaseUrl}/rest/v1/rpc/aibot_n8n_record_email_attachment`, {
        method: "POST",
        headers: restHeaders(serviceRoleKey),
        body: JSON.stringify({ p_payload: recordPayload }),
      });
      const recordResult = await recorded.json().catch(() => ({}));
      if (!recorded.ok || recordResult?.success === false) {
        throw new Error(`Attachment registry rejected the file (${recorded.status})`);
      }
      attachmentResults.push({ filename: attachment.filename, accepted: true, ...recordResult });
    } catch (error) {
      console.error("OfferPSP email attachment ingestion failed", {
        filename: attachment.filename || "attachment",
        error: error instanceof Error ? error.message : "Unknown attachment error",
      });
      return json(502, { success: false, error: "Email attachment ingestion failed" });
    }
  }

  return json(200, { ...result, attachments: attachmentResults });
});
