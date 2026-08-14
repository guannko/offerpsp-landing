import { useCallback, useEffect, useMemo, useState } from "react";
import PageMeta from "../components/common/PageMeta";
import { ErrorBanner, PageHeading, Panel, SkeletonPage } from "../components/control/Ui";
import { useControlBridge } from "../context/ControlBridgeContext";
import { supabase } from "../lib/supabase";
import type { IntegrationSetting } from "../types/offerpsp";

const field = "h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 outline-none focus:border-brand-400 dark:border-gray-700 dark:text-white";
type ConnectorHealth = {
  configured: boolean;
  reachable: boolean;
  authenticated: boolean;
  delivery_tested: boolean;
  detail: string;
};
type Health = { supabase: ConnectorHealth; n8n: ConnectorHealth; email: ConnectorHealth; telegram: ConnectorHealth };
type PlatformModule = {
  name: string;
  mode?: "off" | "shadow" | "active";
  configured?: boolean;
  enabled?: boolean;
  healthy?: boolean;
  detail?: string;
  reason?: string;
  error?: string;
};
type PlatformModuleHealth = {
  checked_at: string;
  modules: PlatformModule[];
  posthog: PlatformModule;
};

const moduleMeta: Record<string, { label: string; description: string }> = {
  docling: { label: "Docling", description: "Разбор PDF, таблиц и сканов офферов." },
  gorules: { label: "GoRules", description: "Детерминированные правила matching и рисков." },
  meilisearch: { label: "Meilisearch", description: "Быстрый поиск по компаниям, офферам и сделкам." },
  mem0: { label: "Mem0", description: "Семантическая память AIBot с профилем BIXOFFPSP." },
  posthog: { label: "PostHog", description: "Продуктовая аналитика с ограничением персональных данных." },
};

async function authHeaders() {
  const session = await supabase.auth.getSession();
  return { Authorization: `Bearer ${session.data.session?.access_token || ""}` };
}

async function loadIntegrationHealth(signal?: AbortSignal) {
  const headers = await authHeaders();
  const response = await fetch("/api/integration-health", { headers, signal });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.success) throw new Error(result.error || "Не удалось проверить серверные подключения");
  return result.checks as Health;
}

async function loadPlatformModuleHealth(signal?: AbortSignal) {
  const headers = await authHeaders();
  const response = await fetch("/api/module-health", { headers, signal });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !Array.isArray(result.modules)) throw new Error(result.error || "Не удалось проверить модульное ядро");
  return result as PlatformModuleHealth;
}

function moduleStatus(item: PlatformModule) {
  if (item.healthy && item.mode === "shadow") return { label: "Тень · работает", style: "bg-warning-50 text-warning-700 dark:bg-warning-500/15 dark:text-warning-300" };
  if (item.healthy) return { label: "Работает", style: "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-300" };
  if (item.enabled) return { label: "Ошибка", style: "bg-error-50 text-error-700 dark:bg-error-500/15 dark:text-error-300" };
  if (item.configured) return { label: "Выключено", style: "bg-gray-100 text-gray-700 dark:bg-white/10 dark:text-gray-300" };
  return { label: "Не настроено", style: "bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-400" };
}

export default function IntegrationsWorkspace() {
  const bridge = useControlBridge();
  const [settings, setSettings] = useState<IntegrationSetting[]>([]);
  const [health, setHealth] = useState<Health | null>(null);
  const [platformModules, setPlatformModules] = useState<PlatformModuleHealth | null>(null);
  const [moduleError, setModuleError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null); setModuleError(null);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8_000);
    const [settingsResult, healthResult, moduleResult] = await Promise.allSettled([
      supabase.rpc("get_offerpsp_integration_settings"),
      loadIntegrationHealth(controller.signal),
      loadPlatformModuleHealth(controller.signal),
    ]);
    window.clearTimeout(timeout);
    if (settingsResult.status === "rejected") setError(settingsResult.reason instanceof Error ? settingsResult.reason.message : "Не удалось загрузить настройки");
    else if (settingsResult.value.error) setError(settingsResult.value.error.message);
    else setSettings((settingsResult.value.data || []) as IntegrationSetting[]);
    if (healthResult.status === "rejected") {
      const message = healthResult.reason instanceof DOMException && healthResult.reason.name === "AbortError"
        ? "Проверка подключений заняла больше 8 секунд. Настройки загружены; повторите проверку нужного канала."
        : healthResult.reason instanceof Error ? healthResult.reason.message : "Не удалось проверить серверные подключения";
      setError((current) => current || message);
    } else setHealth(healthResult.value);
    if (moduleResult.status === "rejected") {
      const message = moduleResult.reason instanceof DOMException && moduleResult.reason.name === "AbortError"
        ? "Проверка модулей заняла больше 8 секунд. Повторите её позже."
        : moduleResult.reason instanceof Error ? moduleResult.reason.message : "Не удалось проверить модульное ядро";
      setModuleError(message);
    } else setPlatformModules(moduleResult.value);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);
  const byKey = useMemo(() => Object.fromEntries(settings.map((item)=>[item.key,item])), [settings]);

  function update(key: IntegrationSetting["key"], patch: Partial<IntegrationSetting> & { configuration?: Record<string, string | boolean | number | null> }) {
    setSettings((current)=>current.map((item)=>item.key===key?{...item,...patch,configuration:{...item.configuration,...(patch.configuration||{})}}:item));
  }

  async function save(key: "n8n" | "email" | "telegram") {
    const item = byKey[key]; if (!item) return;
    setBusy(key); setError(null); setNotice(null);
    const result = await supabase.rpc("save_offerpsp_integration_settings", { p_integration_key:key, p_enabled:item.enabled, p_configuration:item.configuration });
    if (result.error) setError(result.error.message);
    else { setNotice(`${item.display_name}: настройки сохранены.`); await load(); }
    setBusy(null);
  }

  async function check(key: IntegrationSetting["key"]) {
    setBusy(`check-${key}`); setError(null); setNotice(null);
    const headers = await authHeaders();
    const response = await fetch("/api/integration-health", { method:"POST", headers:{...headers,"Content-Type":"application/json"}, body:JSON.stringify({integration:key}) });
    const result = await response.json().catch(()=>({}));
    if (!response.ok || !result.success) setError(result.error || "Проверка не пройдена");
    else { setNotice(`${byKey[key]?.display_name || key}: защищённый шлюз ответил. Это проверка связи, не тестовая отправка.`); await load(); }
    setBusy(null);
  }

  async function syncSearchIndex() {
    setBusy("sync-meilisearch"); setError(null); setNotice(null);
    try {
      const headers = await authHeaders();
      const response = await fetch("/api/search-index-sync", { method: "POST", headers });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Не удалось обновить поисковый индекс");
      setNotice(`Meilisearch: индекс обновлён, объектов: ${Number(result.document_count || 0)}.`);
      await load();
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : "Не удалось обновить поисковый индекс");
    } finally {
      setBusy(null);
    }
  }

  if (bridge.loading || loading) return <SkeletonPage/>;
  const status = (item?: ConnectorHealth) => {
    const verified = Boolean(item?.reachable && item?.authenticated);
    const label = verified ? "Шлюз проверен" : item?.configured ? "Ошибка связи" : "Не настроено";
    return <span title={item?.detail} className={`rounded-full px-3 py-1 text-xs font-semibold ${verified?"bg-success-50 text-success-700":"bg-warning-50 text-warning-700"}`}>{label}</span>;
  };
  const moduleItems = platformModules ? [...platformModules.modules, platformModules.posthog] : [];
  return <>
    <PageMeta title="Интеграции | OfferPSP" description="Настройки и проверки рабочих интеграций."/>
    <PageHeading eyebrow="System control" title="Интеграции" description="Операционные настройки меняются здесь. Токены и webhook URL остаются в защищённом хранилище сервера и никогда не показываются браузеру."/>
    {(bridge.error || error) && <ErrorBanner message={bridge.error || error || "Ошибка"}/>}
    {notice && <div className="mb-5 rounded-xl border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-700">{notice}</div>}
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
      <Panel><div className="flex items-start justify-between gap-4"><div><h2 className="text-lg font-semibold text-gray-900 dark:text-white">Supabase</h2><p className="mt-1 text-sm text-gray-500">База, Auth, RLS и staff RPC.</p></div>{status(health?.supabase)}</div><div className="mt-5 rounded-xl bg-gray-50 p-4 text-sm text-gray-600 dark:bg-white/[0.04] dark:text-gray-300"><p>Проект: <strong>xcizofpejsomjiflesbx</strong></p><p className="mt-2">Проверяется настоящая staff-сессия и доступ к защищённому RPC.</p></div><button disabled={Boolean(busy)} onClick={()=>void check("supabase")} className="mt-4 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700 dark:border-gray-600 dark:text-gray-100">Проверить доступ</button></Panel>

      {byKey.n8n && <Panel><div className="flex items-start justify-between gap-4"><div><h2 className="text-lg font-semibold text-gray-900 dark:text-white">n8n / AIBot</h2><p className="mt-1 text-sm text-gray-500">Автоматизации и рабочие workflow.</p></div>{status(health?.n8n)}</div><label className="mt-5 flex items-center justify-between rounded-xl border border-gray-200 p-4 text-sm dark:border-gray-700"><span><strong className="block text-gray-900 dark:text-white">Операционные автоматизации</strong><span className="text-gray-500 dark:text-gray-400">Разрешить использование рабочих каналов из Captain's Bridge.</span></span><input type="checkbox" checked={Boolean(byKey.n8n.configuration.operations_enabled)} onChange={(event)=>update("n8n",{configuration:{operations_enabled:event.target.checked}})} className="h-5 w-5"/></label><div className="mt-4 flex gap-3"><button disabled={Boolean(busy)} onClick={()=>void save("n8n")} className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white">Сохранить</button><button disabled={Boolean(busy)} onClick={()=>void check("n8n")} className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700 dark:border-gray-600 dark:text-gray-100">Проверить шлюзы</button></div></Panel>}

      {byKey.email && <Panel><div className="flex items-start justify-between gap-4"><div><h2 className="text-lg font-semibold text-gray-900 dark:text-white">Email Sender</h2><p className="mt-1 text-sm text-gray-500">Исходящая почта через n8n. Проверка шлюза не отправляет письмо.</p></div>{status(health?.email)}</div><label className="mt-5 flex items-center gap-3 text-sm font-semibold text-gray-700 dark:text-gray-200"><input type="checkbox" checked={byKey.email.enabled} onChange={(event)=>update("email",{enabled:event.target.checked})} className="h-5 w-5"/>Канал включён</label><div className="mt-4 grid gap-3"><input className={field} value={String(byKey.email.configuration.from_name||"")} onChange={(event)=>update("email",{configuration:{from_name:event.target.value}})} placeholder="Имя отправителя"/><input className={field} type="email" value={String(byKey.email.configuration.from_email||"")} onChange={(event)=>update("email",{configuration:{from_email:event.target.value}})} placeholder="Email отправителя"/><input className={field} type="email" value={String(byKey.email.configuration.reply_to||"")} onChange={(event)=>update("email",{configuration:{reply_to:event.target.value}})} placeholder="Reply-To"/></div><div className="mt-4 flex gap-3"><button disabled={Boolean(busy)} onClick={()=>void save("email")} className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white">Сохранить</button><button disabled={Boolean(busy)} onClick={()=>void check("email")} className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700 dark:border-gray-600 dark:text-gray-100">Проверить шлюз</button></div></Panel>}

      {byKey.telegram && <Panel><div className="flex items-start justify-between gap-4"><div><h2 className="text-lg font-semibold text-gray-900 dark:text-white">Telegram</h2><p className="mt-1 text-sm text-gray-500">AIBot и ручные сообщения. Проверка шлюза ничего не отправляет.</p></div>{status(health?.telegram)}</div><label className="mt-5 flex items-center gap-3 text-sm font-semibold text-gray-700 dark:text-gray-200"><input type="checkbox" checked={byKey.telegram.enabled} onChange={(event)=>update("telegram",{enabled:event.target.checked})} className="h-5 w-5"/>Канал включён</label><div className="mt-4 grid gap-3"><input className={field} value={String(byKey.telegram.configuration.default_chat_id||"")} onChange={(event)=>update("telegram",{configuration:{default_chat_id:event.target.value}})} placeholder="Chat ID по умолчанию"/><label className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-300"><input type="checkbox" checked={Boolean(byKey.telegram.configuration.lead_notifications)} onChange={(event)=>update("telegram",{configuration:{lead_notifications:event.target.checked}})} className="h-5 w-5"/>Уведомлять о новых лидах</label><label className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-300"><input type="checkbox" checked={Boolean(byKey.telegram.configuration.error_notifications)} onChange={(event)=>update("telegram",{configuration:{error_notifications:event.target.checked}})} className="h-5 w-5"/>Уведомлять об ошибках</label></div><div className="mt-4 flex gap-3"><button disabled={Boolean(busy)} onClick={()=>void save("telegram")} className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white">Сохранить</button><button disabled={Boolean(busy)} onClick={()=>void check("telegram")} className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700 dark:border-gray-600 dark:text-gray-100">Проверить шлюз</button></div></Panel>}
    </div>
    <Panel className="mt-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Модульное ядро</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-gray-500 dark:text-gray-400">Здесь показано фактическое состояние вспомогательных узлов. Теневой режим считает результат, но не меняет рабочие данные.</p>
        </div>
        <button disabled={Boolean(busy)} onClick={()=>void load()} className="shrink-0 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700 dark:border-gray-600 dark:text-gray-100">Обновить статус</button>
      </div>
      {moduleError && <div className="mt-4 rounded-xl border border-warning-200 bg-warning-50 px-4 py-3 text-sm text-warning-800 dark:border-warning-500/30 dark:bg-warning-500/10 dark:text-warning-200">{moduleError}</div>}
      <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
        {(moduleItems.length ? moduleItems : Object.keys(moduleMeta).map((name): PlatformModule=>({ name }))).map((item) => {
          const meta = moduleMeta[item.name] || { label: item.name, description: "Вспомогательный модуль платформы." };
          const current = moduleStatus(item);
          return <div key={item.name} className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-white/[0.04]">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-semibold text-gray-900 dark:text-white">{meta.label}</h3>
              <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold ${current.style}`}>{current.label}</span>
            </div>
            <p className="mt-3 text-sm leading-5 text-gray-500 dark:text-gray-400">{meta.description}</p>
            {item.detail && <p className="mt-3 truncate text-xs text-gray-400 dark:text-gray-500" title={item.detail}>{item.detail}</p>}
            {(item.error || item.reason) && <p className="mt-3 text-xs text-error-600 dark:text-error-300">{item.error || (item.reason === "disabled_or_unconfigured" ? "Модуль выключен или не настроен." : item.reason)}</p>}
            {item.name === "meilisearch" && <button disabled={Boolean(busy) || !item.enabled} onClick={()=>void syncSearchIndex()} className="mt-4 w-full rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:text-gray-100">{busy === "sync-meilisearch" ? "Обновляю…" : "Обновить индекс"}</button>}
          </div>;
        })}
      </div>
      {platformModules?.checked_at && <p className="mt-4 text-xs text-gray-400">Проверено: {new Date(platformModules.checked_at).toLocaleString("ru-RU")}</p>}
    </Panel>
    <Panel className="mt-5"><h2 className="text-lg font-semibold text-gray-900 dark:text-white">Граница безопасности</h2><p className="mt-2 text-sm leading-6 text-gray-500">Интерфейс хранит только безопасные параметры: адрес отправителя, chat ID и переключатели. API keys, OAuth credentials и webhook URL управляются сервером Vercel и n8n. Их нельзя прочитать или случайно сохранить в браузере.</p></Panel>
  </>;
}
