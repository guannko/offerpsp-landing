import { randomUUID } from "node:crypto";
import { HttpError } from "./staff-auth.mjs";
import { executeOfferPspTool, offerPspTools } from "./offerpsp-mcp.mjs";
import { offerPspActionsResource, offerPspOAuthOrigin, requireOfferPspMcpStaff } from "./offerpsp-oauth.mjs";

function json(response, status, body) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Access-Control-Allow-Origin", "https://chatgpt.com");
  response.end(JSON.stringify(body));
}

const actionResponseSchema = {
  type: "object",
  properties: {
    status: {
      type: "string",
      enum: ["VERIFIED", "PARTIAL", "BLOCKED"],
      description: "Verification status for the action result.",
    },
    action: {
      type: "string",
      description: "The OfferPSP action that was executed.",
    },
    result: {
      description: "Action-specific JSON result returned by the OfferPSP MCP Gateway.",
    },
  },
  required: ["status", "action", "result"],
  additionalProperties: false,
};

const errorResponseSchema = {
  type: "object",
  properties: {
    status: {
      type: "string",
      enum: ["BLOCKED"],
      description: "The action could not be completed.",
    },
    error: {
      type: "string",
      description: "A safe explanation of why the action was blocked.",
    },
  },
  required: ["status", "error"],
  additionalProperties: false,
};

function operationFor(definition) {
  const readOnly = Boolean(definition.annotations?.readOnlyHint);
  const schema = definition.inputSchema || { type: "object", properties: {} };
  const hasProperties = Object.keys(schema.properties || {}).length > 0;
  return {
    operationId: definition.name,
    summary: definition.title,
    description: definition.description,
    "x-openai-isConsequential": !readOnly,
    security: [{ offerPspOAuth: [readOnly ? "offerpsp:read" : "offerpsp:write"] }],
    ...(hasProperties ? {
      requestBody: {
        required: true,
        content: { "application/json": { schema } },
      },
    } : {}),
    responses: {
      200: {
        description: "OfferPSP operation result",
        content: { "application/json": { schema: { $ref: "#/components/schemas/ActionResponse" } } },
      },
      400: {
        description: "Invalid request",
        content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
      },
      401: {
        description: "OfferPSP staff authorization required",
        content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
      },
      403: {
        description: "OAuth scope is insufficient",
        content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
      },
    },
  };
}

export function offerPspActionsOpenApi() {
  const origin = offerPspOAuthOrigin();
  return {
    openapi: "3.1.0",
    info: {
      title: "OfferPSP Operator Actions",
      version: "1.0.0",
      description: "Staff-authorized OpenAPI adapter for the existing OfferPSP MCP Gateway. External messages remain draft-only and bulk execution requires a server-issued one-time confirmation token.",
    },
    servers: [{ url: origin }],
    paths: Object.fromEntries(offerPspTools.map((definition) => [
      `/actions/${definition.name}`,
      { post: operationFor(definition) },
    ])),
    components: {
      schemas: {
        ActionResponse: actionResponseSchema,
        ErrorResponse: errorResponseSchema,
      },
      securitySchemes: {
        offerPspOAuth: {
          type: "oauth2",
          flows: {
            authorizationCode: {
              authorizationUrl: `${origin}/oauth/authorize`,
              tokenUrl: `${origin}/oauth/token`,
              scopes: {
                "offerpsp:read": "Read and analyze OfferPSP staff data",
                "offerpsp:write": "Perform explicit internal OfferPSP changes",
                offline_access: "Keep the staff-authorized connection active",
              },
            },
          },
        },
      },
    },
  };
}

export function offerPspActionsSchemaHandler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return json(response, 405, { error: "Method not allowed" });
  }
  response.setHeader("Cache-Control", "public, max-age=300");
  response.setHeader("Access-Control-Allow-Origin", "*");
  return json(response, 200, offerPspActionsOpenApi());
}

export async function offerPspActionHandler(request, response) {
  if (request.method === "OPTIONS") {
    response.setHeader("Access-Control-Allow-Origin", "https://chatgpt.com");
    response.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
    response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    return response.status(204).end();
  }
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST, OPTIONS");
    return json(response, 405, { error: "Method not allowed" });
  }
  try {
    const name = String(request.query?.action || "");
    const definition = offerPspTools.find((item) => item.name === name);
    if (!definition) throw new HttpError(404, "Unknown OfferPSP action");
    const context = await requireOfferPspMcpStaff(request, offerPspActionsResource());
    const requiredScope = definition.annotations?.readOnlyHint ? "offerpsp:read" : "offerpsp:write";
    if (!context.oauth?.scopes?.has(requiredScope)) throw new HttpError(403, `OAuth scope ${requiredScope} is required`);
    const callId = String(request.headers?.["x-openai-request-id"] || request.headers?.["x-request-id"] || randomUUID());
    const result = await executeOfferPspTool(name, request.body || {}, { request, context, callId });
    return json(response, 200, { status: "VERIFIED", action: name, result });
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    return json(response, status, {
      status: "BLOCKED",
      error: error instanceof Error ? error.message : "OfferPSP action failed",
    });
  }
}
