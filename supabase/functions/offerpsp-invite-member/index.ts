import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const allowedOrigins = new Set([
  "https://ops-7q4m2x9k8v3n.vercel.app",
  "http://localhost:5173",
]);

function corsHeaders(request: Request) {
  const origin = request.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": allowedOrigins.has(origin)
      ? origin
      : "https://ops-7q4m2x9k8v3n.vercel.app",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json; charset=utf-8",
    Vary: "Origin",
  };
}

function json(request: Request, status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders(request),
  });
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(request) });
  }
  if (request.method !== "POST") {
    return json(request, 405, { success: false, error: "Method not allowed" });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authorization = request.headers.get("authorization") || "";
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !authorization.startsWith("Bearer ")) {
    return json(request, 401, { success: false, error: "Authentication required" });
  }

  const sessionClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await sessionClient.auth.getUser();
  if (userError || !userData.user) {
    return json(request, 401, { success: false, error: "Invalid session" });
  }
  const { data: isStaff, error: staffError } = await sessionClient.rpc("is_offerpsp_staff");
  if (staffError || isStaff !== true) {
    return json(request, 403, { success: false, error: "Active OfferPSP staff account required" });
  }

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return json(request, 400, { success: false, error: "Invalid JSON payload" });
  }
  const organizationId = String(payload.organization_id || "").trim();
  const email = String(payload.email || "").trim().toLowerCase();
  const role = String(payload.role || "manager").trim().toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(organizationId)) {
    return json(request, 400, { success: false, error: "Valid organization_id is required" });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json(request, 400, { success: false, error: "Valid email is required" });
  }
  if (!["owner", "admin", "manager", "viewer"].includes(role)) {
    return json(request, 400, { success: false, error: "Unsupported organization role" });
  }

  const memberParams = {
    p_organization_id: organizationId,
    p_member_id: null,
    p_email: email,
    p_role: role,
    p_active: true,
  };
  const existingMember = await sessionClient.rpc("save_offerpsp_organization_member", memberParams);
  if (!existingMember.error) {
    return json(request, 200, { success: true, invited: false, member: existingMember.data });
  }
  if (!existingMember.error.message.includes("No Supabase user exists")) {
    return json(request, 400, { success: false, error: existingMember.error.message });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const origin = request.headers.get("origin");
  const redirectOrigin = origin && allowedOrigins.has(origin)
    ? origin
    : "https://ops-7q4m2x9k8v3n.vercel.app";
  const invitation = await adminClient.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${redirectOrigin}/signin`,
    data: { offerpsp_invited_by: userData.user.id, offerpsp_organization_id: organizationId },
  });
  if (invitation.error) {
    return json(request, 400, { success: false, error: invitation.error.message });
  }

  const savedMember = await sessionClient.rpc("save_offerpsp_organization_member", memberParams);
  if (savedMember.error) {
    return json(request, 500, {
      success: false,
      error: `Invitation sent, but role assignment failed: ${savedMember.error.message}`,
    });
  }
  return json(request, 200, {
    success: true,
    invited: true,
    member: savedMember.data,
  });
});
