const json = (response, status, body) => {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body));
};

export default async function handler(request, response) {
  if (request.method !== "POST") return json(response, 405, { success: false, error: "Method not allowed" });
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const senderUrl = process.env.N8N_EMAIL_WEBHOOK_URL;
  if (!supabaseUrl || !supabaseKey || !senderUrl) return json(response, 503, { success: false, error: "Email bridge is not configured" });
  const authorization = request.headers.authorization || "";
  if (!authorization.startsWith("Bearer ")) return json(response, 401, { success: false, error: "Authentication required" });

  const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: { apikey: supabaseKey, Authorization: authorization } });
  if (!userResponse.ok) return json(response, 401, { success: false, error: "Invalid session" });
  const user = await userResponse.json();
  const staffResponse = await fetch(`${supabaseUrl}/rest/v1/offerpsp_staff_members?select=user_id&user_id=eq.${encodeURIComponent(user.id)}&active=eq.true`, { headers: { apikey: supabaseKey, Authorization: authorization } });
  const staff = staffResponse.ok ? await staffResponse.json() : [];
  if (!Array.isArray(staff) || !staff.length) return json(response, 403, { success: false, error: "Active OfferPSP staff account required" });

  const body = typeof request.body === "string" ? JSON.parse(request.body || "{}") : (request.body || {});
  const to = String(body.to || "").trim().toLowerCase();
  const subject = String(body.subject || "").trim();
  const emailBody = String(body.body || "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to) || !subject || !emailBody) return json(response, 400, { success: false, error: "Valid recipient, subject and body are required" });
  if (subject.length > 240 || emailBody.length > 50000) return json(response, 400, { success: false, error: "Email is too large" });

  const delivery = await fetch(senderUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to, subject, body: emailBody, from_name: "OfferPSP", lead_id: body.lead_id || null }) });
  const result = await delivery.json().catch(() => ({}));
  if (!delivery.ok || result.success === false) return json(response, 502, { success: false, error: result.message || "Email sender failed" });
  return json(response, 200, { success: true, to });
}
