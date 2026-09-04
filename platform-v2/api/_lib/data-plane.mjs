import { createHash, randomUUID } from "node:crypto";

function canonicalize(value) {
  if (value == null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  if (Object.getPrototypeOf(value) !== Object.prototype) {
    throw new TypeError("Operation payload must contain only plain JSON values");
  }

  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalize(value[key])]),
  );
}

export function stableStringify(value) {
  return JSON.stringify(canonicalize(value));
}

function requireText(value, label) {
  const result = String(value || "").trim();
  if (!result) throw new TypeError(`${label} is required`);
  return result;
}

export function createOperationEnvelope({
  operationId = randomUUID(),
  idempotencyKey,
  actionType,
  actorId = "system",
  payload = {},
} = {}) {
  const operation = {
    version: 1,
    operation_id: requireText(operationId, "operationId"),
    idempotency_key: requireText(idempotencyKey, "idempotencyKey"),
    action_type: requireText(actionType, "actionType"),
    actor_id: requireText(actorId, "actorId"),
    payload: canonicalize(payload),
  };

  const fingerprintSource = {
    version: operation.version,
    idempotency_key: operation.idempotency_key,
    action_type: operation.action_type,
    actor_id: operation.actor_id,
    payload: operation.payload,
  };

  return Object.freeze({
    ...operation,
    fingerprint: createHash("sha256").update(stableStringify(fingerprintSource)).digest("hex"),
  });
}

export function createSupabasePrimaryDataPlane({ executeRpc }) {
  if (typeof executeRpc !== "function") throw new TypeError("executeRpc must be a function");

  return Object.freeze({
    id: "primary",
    provider: "supabase",
    role: "writer",
    rpc(name, body = {}) {
      return executeRpc(requireText(name, "rpc name"), body);
    },
  });
}
