type DatedEmailMessage = {
  sent_at?: string | null;
  received_at?: string | null;
  created_at: string;
};

export type SplitEmailBody = {
  currentText: string;
  quotedText: string | null;
};

const quoteHeaderPatterns = [
  /^on\s.+\swrote:\s*$/i,
  /^.+\s(?:писал|писала|писал\(а\)):\s*$/i,
  /^-{2,}\s*(?:original message|исходное сообщение)\s*-{2,}$/i,
  /^_{2,}\s*(?:original message|исходное сообщение)\s*_{2,}$/i,
];

const looksLikeForwardedHeader = (lines: string[], index: number) => {
  if (!/^(?:from|от):\s*\S+/i.test(lines[index]?.trim() || "")) return false;
  const headerBlock = lines.slice(index, index + 7).map((line) => line.trim());
  return headerBlock.some((line) => /^(?:to|кому):\s*\S+/i.test(line))
    && headerBlock.some((line) => /^(?:subject|тема):\s*\S+/i.test(line));
};

const isQuoteBoundary = (lines: string[], index: number) => {
  const line = lines[index]?.trim() || "";
  if (!line) return false;
  if (/^>+/.test(line)) return true;
  if (quoteHeaderPatterns.some((pattern) => pattern.test(line))) return true;
  return looksLikeForwardedHeader(lines, index);
};

const cleanQuotedText = (value: string) => value
  .replace(/^\s*>+\s?/gm, "")
  .replace(/\n{4,}/g, "\n\n\n")
  .trim();

export const splitEmailBody = (value?: string | null): SplitEmailBody => {
  const normalized = String(value || "").replace(/\r\n?/g, "\n").trim();
  if (!normalized) return { currentText: "", quotedText: null };

  const lines = normalized.split("\n");
  const boundary = lines.findIndex((_, index) => isQuoteBoundary(lines, index));
  if (boundary <= 0) return { currentText: normalized, quotedText: null };

  const currentText = lines.slice(0, boundary).join("\n").trim();
  const quotedText = cleanQuotedText(lines.slice(boundary).join("\n"));
  if (!currentText || !quotedText) return { currentText: normalized, quotedText: null };
  return { currentText, quotedText };
};

export const emailMessageTimestamp = (message: DatedEmailMessage) => {
  const value = message.sent_at || message.received_at || message.created_at;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
};

export const sortEmailMessagesChronologically = <T extends DatedEmailMessage>(messages: T[]) =>
  [...messages].sort((left, right) => emailMessageTimestamp(left) - emailMessageTimestamp(right));

