export type CalendarLayer = "past" | "now" | "future";
export type CalendarEvent = {
  id: string;
  nature: "fact" | "plan";
  kind: "email_sent" | "email_received" | "shortlist_shared" | "task_done" | "task_due" | "follow_up" | "activity";
  occurred_at: string;
  person: string;
  title: string;
  detail: string;
  href: string;
  task_id: string | null;
  lead_id: string | null;
  status: string | null;
  evidence: { reply_confirmed?: boolean; delivery_status?: string; sender?: string; recipients?: string[];
    version?: number; shortlist_id?: string; options?: Array<{ code?: string; title?: string }>; event_type?: string };
};
export type CalendarPage = { events: CalendarEvent[]; has_more: boolean; next_offset: number; generated_at: string };

/** Local civil days, not UTC slices or fixed 24-hour additions (DST-safe). */
export function calendarDay(now: Date) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return { start, end, key: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}` };
}
export function calendarLayer(at: string, now: Date): CalendarLayer | null {
  const time = Date.parse(at);
  if (!Number.isFinite(time)) return null;
  const { start, end } = calendarDay(now);
  return time < start.getTime() ? "past" : time < end.getTime() ? "now" : "future";
}
export function calendarWindow(start: Date, end: Date, layer: CalendarLayer, now: Date) {
  const day = calendarDay(now);
  const from = layer === "now" ? day.start : layer === "future" ? new Date(Math.max(start.getTime(), day.end.getTime())) : start;
  const to = layer === "now" ? day.end : layer === "past" ? new Date(Math.min(end.getTime(), day.start.getTime())) : end;
  return from < to ? { start: from.toISOString(), end: to.toISOString() } : null;
}
export function calendarEventLabel(event: CalendarEvent): string {
  switch (event.kind) {
    case "email_sent": return event.evidence.reply_confirmed ? "Мы ответили" : "Мы написали";
    case "email_received": return event.evidence.reply_confirmed ? "Нам ответили" : "Входящее письмо";
    case "shortlist_shared": return "Предложения в кабинете";
    case "task_done": return "Задача выполнена";
    case "task_due": return "Срок задачи";
    case "follow_up": return "Связаться";
    default: return event.evidence.event_type === "lead_submitted" ? "Заявка получена"
      : event.evidence.event_type === "pre_compliance_decision" ? "Решение по проверке"
      : event.evidence.event_type === "provider_review_decision" ? "Решение PSP" : "Действие по клиенту";
  }
}
export function calendarEventColor(event: CalendarEvent): string {
  if (event.nature === "plan") return "#927d5c";
  if (event.kind === "email_received") return "#687553";
  if (event.kind === "shortlist_shared") return "#886141";
  return "#777d77";
}
export function mergeCalendarPages(previous: CalendarEvent[], next: CalendarEvent[]) {
  return [...new Map([...previous, ...next].map((event) => [event.id, event])).values()]
    .sort((a, b) => Date.parse(a.occurred_at) - Date.parse(b.occurred_at) || a.id.localeCompare(b.id));
}
