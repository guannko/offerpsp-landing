export function mailFollowUpPresentation(thread: { status?: string | null; follow_up_at?: string | null }, now: number) {
  if (thread.status !== "follow_up") return null;
  const deadline = Date.parse(thread.follow_up_at || "");
  if (!Number.isFinite(deadline)) return { label: "Follow-up без даты", hint: "Дата не задана или некорректна — нужно выбрать срок." };
  const date = new Date(deadline).toLocaleString("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  return deadline > now
    ? { label: "Follow-up запланирован", hint: `Напомнить ${date}. Срок ещё не наступил.` }
    : { label: "Нужен follow-up", hint: `Срок ${date} наступил — нужно проверить переписку и решить, писать ли партнёру.` };
}
