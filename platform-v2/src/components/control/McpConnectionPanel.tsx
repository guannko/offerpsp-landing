import { useEffect, useState } from "react";
import { Panel } from "./Ui";

type Metadata = { resource?: string; authorization_servers?: string[] };

export default function McpConnectionPanel() {
  const [metadata, setMetadata] = useState<Metadata | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/.well-known/oauth-protected-resource", { signal: controller.signal })
      .then(async (response) => { if (!response.ok) throw new Error("metadata unavailable"); return response.json(); })
      .then((value) => setMetadata(value))
      .catch((error) => { if (error?.name !== "AbortError") setFailed(true); });
    return () => controller.abort();
  }, []);
  return <Panel className="mb-5 border-brand-200 dark:border-brand-500/25">
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div><div className="flex items-center gap-3"><h2 className="text-lg font-semibold text-gray-900 dark:text-white">OfferPSP MCP Operator</h2><span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${metadata ? "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-300" : failed ? "bg-error-50 text-error-700 dark:bg-error-500/15 dark:text-error-300" : "bg-warning-50 text-warning-700 dark:bg-warning-500/15 dark:text-warning-300"}`}>{metadata ? "Шлюз опубликован" : failed ? "Недоступен" : "Проверяю…"}</span></div><p className="mt-2 max-w-3xl text-sm leading-6 text-gray-500 dark:text-gray-400">Открытое расширяемое MCP-подключение для Codex: поиск, карточки, matching, SEO/GEO, задачи, черновики, память BIXOFFPSP и здоровье шлюзов. Новые узлы добавляются в этот Gateway.</p></div>
      <a href={metadata?.resource || "/mcp"} className="shrink-0 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700 dark:border-gray-600 dark:text-gray-100">MCP endpoint</a>
    </div>
    <div className="mt-4 grid gap-3 text-xs text-gray-500 md:grid-cols-3 dark:text-gray-400"><span>Авторизация: Supabase OAuth 2.1</span><span>Доступ: только active staff + RLS</span><span>Внешние действия: draft/token only</span></div>
  </Panel>;
}
