import { useSyncExternalStore } from "react";

const listeners = new Set<() => void>();
let version = 0;
const message = (id: string, thread_id: string, direction: string, delivery_status: string, is_read: boolean, hour: number, text_body: string) => ({
  id, thread_id, direction, delivery_status, is_read, text_body, body_loaded: true,
  sender_email: direction === "outbound" ? "bizdev@offerpsp.com" : "partner@example.invalid",
  recipient_emails: [direction === "outbound" ? "partner@example.invalid" : "bizdev@offerpsp.com"],
  subject: "QA negotiation", created_at: `2026-10-06T${hour}:00:00Z`, provider: "qa",
});
const messages = [message("incoming", "dialogue", "inbound", "received", false, 10, "QA входящее: условия партнёра"),
  message("outgoing", "dialogue", "outbound", "sent", false, 11, "QA отправленное: наш ответ"),
  message("unsent", "dialogue", "outbound", "draft", true, 12, "QA черновик: ещё НЕ отправляли"),
  message("sent-only", "outbound-only", "outbound", "sent", false, 13, "QA только отправленное"),
  message("draft-only", "draft-thread", "outbound", "draft", true, 14, "QA только черновик")];
const threads = ["dialogue", "outbound-only", "draft-thread"].map((id) => ({ id,
  subject: id === "dialogue" ? "QA переговоры" : id === "outbound-only" ? "QA без входящих" : "QA несохранённая отправка",
  participant_email: "partner@example.invalid", status: "open", unread_count: 9,
  counterparty_type: "general", last_message_at: "2026-10-06T14:00:00Z", tags: [],
}));
const data = { loading: false, refreshing: false, ready: true, error: null, user: null,
  leads: [], providers: [], mailCenterLoaded: true, mailCenterError: null,
  captainsBridge: { email_drafts: [{ id: 1, status: "draft", subject: "QA черновик", to_email: "partner@example.invalid", body: "Не отправлено" }], psp_providers: [], casino_leads: [], telegram_log: [] },
  mailCenter: { threads, messages, attachments: [], templates: [], metrics: { threads: 3, unread: 99, awaiting_reply: 0, follow_up: 0 } },
  refresh: async () => { version += 1; for (const listener of listeners) listener(); },
};
export function useControlBridge() {
  useSyncExternalStore((listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; }, () => version);
  return data;
}
export const supabase = {
  rpc: async (name: string, args: { p_thread_id?: string; p_mark_read?: boolean } = {}) => {
    if (name === "set_offerpsp_email_thread_state") {
      for (const entry of messages) if (entry.thread_id === args.p_thread_id && entry.direction === "inbound") entry.is_read = Boolean(args.p_mark_read);
      data.mailCenter = { ...data.mailCenter, messages: [...messages] };
    }
    return { data: name === "get_offerpsp_email_thread_entity_context" ? { status: "unlinked" } : null, error: null };
  },
};
export const hasSupabaseConfig = false;
