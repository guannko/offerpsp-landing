import posthog from "posthog-js";

let initialized = false;
let identifiedUserId = "";

const ALLOWED_EVENTS = new Set([
  "control_bridge_page_viewed",
  "control_bridge_search_used",
]);

function safeProperties(properties: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(properties).filter(([key, value]) =>
    ["path", "source", "result_count"].includes(key)
    && (typeof value === "string" || typeof value === "number" || typeof value === "boolean")
  ));
}

export function initAnalytics() {
  if (initialized) return true;
  const key = String(import.meta.env.VITE_POSTHOG_KEY || "").trim();
  const host = String(import.meta.env.VITE_POSTHOG_HOST || "").trim();
  if (!key || !host) return false;
  posthog.init(key, {
    api_host: host,
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    disable_session_recording: true,
    person_profiles: "identified_only",
    mask_all_text: true,
    mask_all_element_attributes: true,
    persistence: "localStorage+cookie",
  });
  initialized = true;
  return true;
}

export function identifyStaff(userId: string, role?: string | null) {
  if (!initAnalytics()) return;
  if (identifiedUserId === userId) return;
  posthog.identify(userId, { role: role || "staff", product: "offerpsp_control_bridge" });
  identifiedUserId = userId;
}

export function captureWorkspacePage(path: string) {
  if (!initAnalytics()) return;
  posthog.capture("control_bridge_page_viewed", { path });
}

export function captureProductEvent(name: string, properties: Record<string, unknown> = {}) {
  if (!initAnalytics()) return;
  if (!ALLOWED_EVENTS.has(name)) {
    console.warn(`Blocked non-allowlisted analytics event: ${name}`);
    return;
  }
  posthog.capture(name, safeProperties(properties));
}
