import type { EmailMessage } from "../types/offerpsp";

export type MailFolderView = "inbox" | "unread" | "sent" | string;

// A saved draft (even with a timestamp) is not a sent letter.
export const isCorrespondenceMessage = (message: EmailMessage) =>
  message.direction === "inbound"
  || (message.direction === "outbound" && ["sent", "delivered"].includes(message.delivery_status));

const timestamp = (message: EmailMessage) => {
  const value = Date.parse(message.sent_at || message.received_at || message.created_at);
  return Number.isFinite(value) ? value : 0;
};

export function buildMailFolderIndex(messages: EmailMessage[]) {
  const latest = new Map<string, EmailMessage>();
  const inbox = new Map<string, EmailMessage>();
  const sent = new Map<string, EmailMessage>();
  const unread = new Map<string, EmailMessage>();
  const unreadCounts = new Map<string, number>();
  const remember = (map: Map<string, EmailMessage>, message: EmailMessage) => {
    const previous = map.get(message.thread_id);
    if (!previous || timestamp(message) > timestamp(previous)
      || (timestamp(message) === timestamp(previous) && message.id > previous.id)) {
      map.set(message.thread_id, message);
    }
  };
  for (const message of messages) {
    if (!isCorrespondenceMessage(message)) continue;
    remember(latest, message);
    if (message.direction === "outbound") {
      remember(sent, message);
    } else {
      remember(inbox, message);
      if (message.is_read === false) {
        remember(unread, message);
        unreadCounts.set(message.thread_id, (unreadCounts.get(message.thread_id) || 0) + 1);
      }
    }
  }
  return { latest, inbox, sent, unread, unreadCounts };
}

export function mailFolderMessage(index: ReturnType<typeof buildMailFolderIndex>, threadId: string, scope: MailFolderView) {
  if (scope === "inbox") return index.inbox.get(threadId);
  if (scope === "unread") return index.unread.get(threadId);
  if (scope === "sent") return index.sent.get(threadId);
  return index.latest.get(threadId);
}
