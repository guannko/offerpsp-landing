import type { WorkTask } from "../types/offerpsp";

export function taskWorkScope(task: WorkTask, source: "operator" | "aibot", now: number, todayStartedAt: number): "now" | "waiting" | "later" | "done" | null {
  const status = String(task.status || "").toLowerCase();
  if (["cancelled", "canceled"].includes(status)) return null;
  if (["done", "completed", "closed"].includes(status)) {
    return Date.parse(task.completed_at || task.updated_at || task.created_at || "") >= todayStartedAt ? "done" : null;
  }
  if (source === "aibot") return "now";
  if (["waiting", "blocked", "pending_external"].includes(status)) return "waiting";
  // A deadline tomorrow is not a deferred start. Only a scheduled start puts work in Later.
  return Date.parse(task.scheduled_for || "") > now ? "later" : "now";
}
