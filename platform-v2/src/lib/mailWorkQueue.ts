import type { EmailMessage, EmailThread } from "../types/offerpsp";

type MailWorkItem = { scope: "now" | "waiting" | "later" | "done"; priority: number; detail: string };

/** Reading is not resolving. Lifecycle state takes precedence over unread badges. */
export function mailWorkItem(thread: EmailThread, now: number, todayStartedAt: number, latestMessage?: Pick<EmailMessage, "direction" | "delivery_status" | "sent_at" | "received_at" | "created_at">): MailWorkItem | null {
  if (["archived", "trashed"].includes(thread.status)) return null;
  if (thread.status === "closed") {
    return Date.parse(thread.updated_at || thread.last_message_at) >= todayStartedAt
      ? { scope: "done", priority: 0, detail: "закрыта сегодня" } : null;
  }
  const followUp = Date.parse(thread.follow_up_at || "");
  if (Number.isFinite(followUp) && followUp <= now) {
    return { scope: "now", priority: 5, detail: "нужен follow-up" };
  }
  if (thread.status === "awaiting_reply") {
    return { scope: "waiting", priority: thread.priority === "urgent" ? 5 : 2, detail: "ждём ответ партнёра" };
  }
  if (Number.isFinite(followUp) && followUp > now) {
    return { scope: "later", priority: 1, detail: "назначен будущий follow-up" };
  }
  if (thread.status === "follow_up") return { scope: "now", priority: 5, detail: "нужен follow-up" };
  if (thread.is_flagged) return { scope: "now", priority: 4, detail: "установлен флаг" };
  const latestAt = latestMessage ? Date.parse(latestMessage.sent_at || latestMessage.received_at || latestMessage.created_at) : NaN;
  if (latestMessage?.direction === "outbound" && ["sent", "delivered"].includes(latestMessage.delivery_status)
    && latestAt >= Date.parse(thread.last_message_at)) return null;
  if (thread.unread_count > 0) return { scope: "now", priority: 6, detail: `${thread.unread_count} непрочитанных` };
  if (thread.status === "open") return { scope: "now", priority: 3, detail: "цепочка открыта · ответьте, отложите или закройте" };
  return null;
}
