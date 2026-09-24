const responseHeaders = {
  "cache-control": "no-store",
  "content-type": "application/json; charset=utf-8",
};

function setHeaders(response) {
  Object.entries(responseHeaders).forEach(([name, value]) => response.setHeader(name, value));
}

export async function bixGatewayHealthHandler(request, response) {
  setHeaders(response);

  if (request.method === "HEAD") return response.status(200).end();
  if (request.method !== "GET") {
    response.setHeader("allow", "GET, HEAD");
    return response.status(405).json({ error: "Method not allowed" });
  }

  return response.status(200).json({
    status: "live",
    service: "offerpsp-bix-gateway",
    phase: "foundation",
    active_writer: "primary",
    data_planes: {
      primary: { provider: "supabase", mode: "delegated" },
      reserve: { provider: "gcp", mode: "not_provisioned" },
    },
    dependency_checks_performed: false,
    checked_at: new Date().toISOString(),
  });
}

export default bixGatewayHealthHandler;
