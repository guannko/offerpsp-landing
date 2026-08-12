import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router";
import { useControlBridge } from "../../context/ControlBridgeContext";
import { supabase } from "../../lib/supabase";
import { ChatIcon, CloseIcon, PaperPlaneIcon } from "../../icons";

type AssistantMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  confirmationToken?: string | null;
};

const pageNames: Record<string, string> = {
  "/": "Командный центр",
  "/inbox": "Входящие",
  "/pipeline": "Воронка",
  "/merchants": "Мерчи",
  "/casinos": "Казино",
  "/psps": "PSP",
  "/offers": "Офферы",
  "/compliance": "Проверка лидов",
  "/deals": "Сделки",
  "/communications": "Коммуникации",
  "/operations": "Задачи и календарь",
  "/agents": "Субагенты",
  "/analytics": "Аналитика",
  "/integrations": "Интеграции",
};

function createId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
}

function plainText(value: unknown) {
  const text = String(value || "");
  if (typeof document === "undefined") return text.replace(/<[^>]*>/g, "");
  const element = document.createElement("div");
  element.innerHTML = text.replace(/<br\s*\/?>/gi, "\n");
  return (element.textContent || "").trim();
}

export default function AIBotAssistant() {
  const { pathname } = useLocation();
  const { user, staff, leads, providers, organizations } = useControlBridge();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const endRef = useRef<HTMLDivElement>(null);

  const pageContext = useMemo(() => {
    const parts = pathname.split("/").filter(Boolean);
    const root = parts.length ? `/${parts[0]}` : "/";
    const entityId = parts[1] || null;
    let entityType: string | null = null;
    let entityName: string | null = null;

    if (root === "/merchants" && entityId) {
      const lead = leads.find((item) => item.lead_id === entityId);
      entityType = "merchant";
      entityName = lead?.company || lead?.name || null;
    } else if (root === "/psps" && entityId) {
      const provider = providers.find((item) => item.id === entityId);
      entityType = "psp";
      entityName = provider?.brand_name || null;
    } else if (root === "/agents" && entityId) {
      const organization = organizations.find((item) => item.id === entityId);
      entityType = "subagent";
      entityName = organization?.name || null;
    }

    return {
      path: pathname,
      page: pageNames[root] || "Captain's Bridge",
      entity_type: entityType,
      entity_id: entityId,
      entity_name: entityName,
    };
  }, [leads, organizations, pathname, providers]);

  const storageKey = user ? `offerpsp-aibot-messages:${user.id}` : null;
  const sessionKey = user ? `offerpsp-aibot-session:${user.id}` : null;

  useEffect(() => {
    if (!storageKey) return;
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || "[]");
      if (Array.isArray(saved)) setMessages(saved.slice(-40));
    } catch {
      setMessages([]);
    }
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey) return;
    localStorage.setItem(storageKey, JSON.stringify(messages.slice(-40)));
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, storageKey]);

  async function sendMessage(message: string) {
    const clean = message.trim();
    if (!clean || pending || !user) return;
    setPending(true);
    setError(null);
    setMessages((current) => [...current, { id: createId(), role: "user", text: clean }]);
    setInput("");

    try {
      const { data } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token;
      if (!accessToken) throw new Error("Сессия истекла. Войди в рубку заново.");

      let sessionId = sessionKey ? localStorage.getItem(sessionKey) : null;
      if (!sessionId) {
        sessionId = `web-${createId()}`;
        if (sessionKey) localStorage.setItem(sessionKey, sessionId);
      }

      const response = await fetch("/api/aibot-command", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          message: clean,
          session_id: sessionId,
          context: pageContext,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.success === false) throw new Error(result.error || "AIBot не ответил.");

      setMessages((current) => [
        ...current,
        {
          id: createId(),
          role: "assistant",
          text: plainText(result.answer || result.message || result.output || "Готово."),
          confirmationToken: result.confirmation_required ? result.confirmation_token : null,
        },
      ]);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не удалось выполнить команду.");
    } finally {
      setPending(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void sendMessage(input);
  }

  const contextualPrompt = pageContext.entity_name
    ? `Что требует внимания по ${pageContext.entity_name}?`
    : "Что требует моего внимания сегодня?";

  return (
    <>
      {open ? (
        <section className="fixed inset-x-3 bottom-3 z-[100] flex max-h-[calc(100vh-1.5rem)] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl sm:left-auto sm:right-6 sm:w-[430px] dark:border-gray-800 dark:bg-gray-950">
          <header className="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-gray-800">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500 text-white"><ChatIcon className="size-5" /></span>
                <div>
                  <p className="font-semibold text-gray-900 dark:text-white">AIBot</p>
                  <p className="max-w-[280px] truncate text-xs text-gray-500">{pageContext.entity_name || pageContext.page}</p>
                </div>
              </div>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800" aria-label="Закрыть AIBot"><CloseIcon className="size-5" /></button>
          </header>

          <div className="min-h-[280px] flex-1 space-y-3 overflow-y-auto bg-gray-50 px-4 py-4 sm:max-h-[58vh] dark:bg-gray-900">
            {messages.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-4 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-300">
                <p className="font-semibold text-gray-900 dark:text-white">Рабочий агент Captain's Bridge</p>
                <p className="mt-1">Ищет данные, обновляет карточки, ставит задачи, готовит письма и работает с офферами. Массовые изменения — только после подтверждения.</p>
                <button type="button" onClick={() => void sendMessage(contextualPrompt)} className="mt-3 text-left text-brand-500 hover:text-brand-600">{contextualPrompt}</button>
              </div>
            ) : null}
            {messages.map((message) => (
              <div key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[88%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm leading-6 ${message.role === "user" ? "bg-brand-500 text-white" : "border border-gray-200 bg-white text-gray-800 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"}`}>
                  {message.text}
                  {message.confirmationToken ? (
                    <div className="mt-3 flex gap-2 border-t border-gray-200 pt-3 dark:border-gray-700">
                      <button type="button" disabled={pending} onClick={() => void sendMessage(`подтверждаю ${message.confirmationToken}`)} className="rounded-lg bg-brand-500 px-3 py-1.5 font-semibold text-white">Подтвердить</button>
                      <button type="button" disabled={pending} onClick={() => void sendMessage(`отмена ${message.confirmationToken}`)} className="rounded-lg border border-gray-300 px-3 py-1.5 dark:border-gray-700">Отмена</button>
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
            {pending ? <div className="text-sm text-gray-500">Обрабатываю…</div> : null}
            {error ? <div className="rounded-xl bg-error-50 p-3 text-sm text-error-600 dark:bg-error-950/30">{error}</div> : null}
            <div ref={endRef} />
          </div>

          <form onSubmit={submit} className="flex items-end gap-2 border-t border-gray-100 bg-white p-3 dark:border-gray-800 dark:bg-gray-950">
            <textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} rows={2} placeholder="Поставь задачу AIBot…" className="min-h-12 flex-1 resize-none rounded-xl border border-gray-300 bg-transparent px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-brand-500 dark:border-gray-700 dark:text-white" />
            <button type="submit" disabled={pending || !input.trim()} className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-500 text-white disabled:opacity-40" aria-label="Отправить"><PaperPlaneIcon className="size-5" /></button>
          </form>
          <footer className="px-4 pb-3 text-[11px] text-gray-400">{staff?.display_name || user?.email} · защищённый staff-доступ</footer>
        </section>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className="fixed bottom-5 right-5 z-[90] flex h-14 items-center gap-2 rounded-2xl bg-brand-500 px-4 text-sm font-semibold text-white shadow-2xl hover:bg-brand-600" aria-label="Открыть AIBot">
          <ChatIcon className="size-6" /> <span className="hidden sm:inline">AIBot</span>
        </button>
      )}
    </>
  );
}
