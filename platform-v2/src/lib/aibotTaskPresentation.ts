import type { WorkTask } from "../types/offerpsp";

export type AibotTaskGroup = "active" | "history" | "test";
const terminal = new Set(["done", "completed", "closed", "skipped", "cancelled", "canceled", "dismissed", "archived"]);
const labels: Record<string, string> = {
  pending: "Ожидает", queued: "В очереди", scheduled: "Запланировано",
  in_progress: "В работе", processing: "В работе", running: "В работе",
  failed: "Ошибка — нужна проверка", error: "Ошибка — нужна проверка",
  done: "Выполнено", completed: "Выполнено", closed: "Закрыто",
  skipped: "Пропущено", cancelled: "Отменено", canceled: "Отменено",
  dismissed: "Убрано", archived: "В архиве",
};
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

export function aibotTaskGroup(task: WorkTask): AibotTaskGroup {
  const payload = record(task.payload);
  // Explicit fixture markers only. A real reminder mentioning a test is not a fixture.
  if (task.metadata?.qa_fixture_suppressed === true || task.metadata?.test_fixture === true
    || (task.task_type === "reminder" && typeof payload.message === "string" && /^\s*Тест:\s*/i.test(payload.message))) return "test";
  return terminal.has(String(task.status || "").toLowerCase()) ? "history" : "active";
}

export function aibotTaskPresentation(task: WorkTask) {
  const payload = record(task.payload);
  const status = String(task.status || "unknown").toLowerCase();
  const companies = Array.isArray(payload.companies) ? payload.companies : [];
  const names = companies.map((item) => record(item).name).filter((name): name is string => typeof name === "string" && Boolean(name.trim()));
  const batch = typeof payload.batch === "number" || typeof payload.batch === "string" ? String(payload.batch) : "";
  const title = task.title?.trim() || (task.task_type === "psp_contact_research"
    ? `Поиск контактов PSP${batch ? ` · пакет №${batch}` : ""}`
    : task.task_type === "reminder" ? "Напоминание" : "Задание автоматизации");
  const description = task.details?.trim() || (task.task_type === "psp_contact_research" && names.length
    ? names.join(", ") : typeof payload.message === "string" ? payload.message.trim() : "Описание не записано.");
  const stamp = aibotTaskGroup(task) === "history"
    ? task.completed_at || task.updated_at || task.scheduled_for || task.created_at
    : task.scheduled_for || task.created_at;
  return { title, description, label: labels[status] || "Неизвестный статус — нужна проверка", status,
    date: stamp && Number.isFinite(Date.parse(stamp)) ? stamp : null,
    dateLabel: task.completed_at ? "Завершено" : aibotTaskGroup(task) === "history" && task.updated_at ? "Обновлено" : task.scheduled_for ? "По расписанию" : "Создано" };
}

export function safeAibotPayload(value: unknown): string {
  const seen = new WeakSet<object>();
  function redact(item: unknown, depth = 0): unknown {
    if (depth > 8) return "[depth limit]";
    if (item && typeof item === "object") {
      if (seen.has(item)) return "[circular]";
      seen.add(item);
      if (Array.isArray(item)) return item.slice(0, 100).map((entry) => redact(entry, depth + 1));
      return Object.fromEntries(Object.entries(item).slice(0, 100).map(([key, entry]) => [key,
        /token|password|secret|authorization|api.?key|chat.?id/i.test(key) ? "[redacted]" : redact(entry, depth + 1)]));
    }
    return typeof item === "string" && item.length > 4000 ? `${item.slice(0, 4000)}…` : item;
  }
  const text = JSON.stringify(redact(value), null, 2) || "Нет данных";
  return text.length > 20000 ? `${text.slice(0, 20000)}\n[display limit]` : text;
}
