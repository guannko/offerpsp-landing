const VALID_MODES = new Set(["off", "shadow", "active"]);

export function moduleMode(name, fallback = "off") {
  const value = String(process.env[name] || fallback).trim().toLowerCase();
  return VALID_MODES.has(value) ? value : fallback;
}

export function optionalUrl(name) {
  const value = String(process.env[name] || "").trim();
  return value ? value.replace(/\/$/, "") : "";
}

export function moduleState({ name, mode, configured, detail }) {
  return {
    name,
    mode,
    configured: Boolean(configured),
    enabled: mode !== "off" && Boolean(configured),
    ...(detail ? { detail } : {}),
  };
}
