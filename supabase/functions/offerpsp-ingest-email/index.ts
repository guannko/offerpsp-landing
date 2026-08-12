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

  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/aibot_n8n_ingest_email`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ p_payload: input.payload }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result?.success === false) {
    console.error("OfferPSP Mail Center RPC rejected an inbound email", { status: response.status });
    return json(502, { success: false, error: "Mail Center ingestion failed" });
  }
  return json(200, result);
});
