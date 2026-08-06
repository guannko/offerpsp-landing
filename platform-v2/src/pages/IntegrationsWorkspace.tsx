import { useCallback, useEffect, useMemo, useState } from "react";
import PageMeta from "../components/common/PageMeta";
import { ErrorBanner, PageHeading, Panel, SkeletonPage } from "../components/control/Ui";
import { useControlBridge } from "../context/ControlBridgeContext";
import { supabase } from "../lib/supabase";
import type { IntegrationSetting } from "../types/offerpsp";

const field = "h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 outline-none focus:border-brand-400 dark:border-gray-700 dark:text-white";
type Health = { supabase: boolean; n8n_email_webhook: boolean; n8n_telegram_webhook: boolean };

async function authHeaders() {
  const session = await supabase.auth.getSession();
  return { Authorization: `Bearer ${session.data.session?.access_token || ""}` };
}

export default function IntegrationsWorkspace() {
  const bridge = useControlBridge();
  const [settings, setSettings] = useState<IntegrationSetting[]>([]);
  const [health, setHealth] = useState<Health | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const [settingsResult, headers] = await Promise.all([supabase.rpc("get_offerpsp_integration_settings"), authHeaders()]);
    const response = await fetch("/api/integration-health", { headers });
    const healthResult = await response.json().catch(() => ({}));
    if (settingsResult.error) setError(settingsResult.error.message);
    else setSettings((settingsResult.data || []) as IntegrationSetting[]);
    if (!response.ok || !healthResult.success) setError(healthResult.error || "Не удалось проверить серверные подключения");
    else setHealth(healthResult.checks as Health);
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
    else { setNotice(`${byKey[key]?.display_name || key}: серверная конфигурация доступна.`); await load(); }
    setBusy(null);
  }

  if (bridge.loading || loading) return <SkeletonPage/>;
  const status = (ok?: boolean) => <span className={`rounded-full px-3 py-1 text-xs font-semibold ${ok?"bg-success-50 text-success-700":"bg-warning-50 text-warning-700"}`}>{ok?"Подключено":"Не настроено"}</span>;
  return <>
    <PageMeta title="Интеграции | OfferPSP" description="Настройки и проверки рабочих интеграций."/>
    <PageHeading eyebrow="System control" title="Интеграции" description="Операционные настройки меняются здесь. Токены и webhook URL остаются в защищённом хранилище сервера и никогда не показываются браузеру."/>
    {(bridge.error || error) && <ErrorBanner message={bridge.error || error || "Ошибка"}/>}
    {notice && <div className="mb-5 rounded-xl border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-700">{notice}</div>}
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
      <Panel><div className="flex items-start justify-between gap-4"><div><h2 className="text-lg font-semibold text-gray-900 dark:text-white">Supabase</h2><p className="mt-1 text-sm text-gray-500">База, Auth, RLS и staff RPC.</p></div>{status(health?.supabase)}</div><div className="mt-5 rounded-xl bg-gray-50 p-4 text-sm text-gray-600 dark:bg-white/[0.03] dark:text-gray-300"><p>Проект: <strong>xcizofpejsomjiflesbx</strong></p><p className="mt-2">Настройки базы доступны только через миграции; из интерфейса проверяется рабочая staff-сессия.</p></div><button disabled={Boolean(busy)} onClick={()=>void check("supabase")} className="mt-4 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-semibold dark:border-gray-700">Проверить доступ</button></Panel>

      {byKey.n8n && <Panel><div className="flex items-start justify-between gap-4"><div><h2 className="text-lg font-semibold text-gray-900 dark:text-white">n8n / AIBot</h2><p className="mt-1 text-sm text-gray-500">Автоматизации и рабочие workflow.</p></div>{status(Boolean(health?.n8n_email_webhook || health?.n8n_telegram_webhook))}</div><label className="mt-5 flex items-center justify-between rounded-xl border border-gray-200 p-4 text-sm dark:border-gray-800"><span><strong className="block text-gray-900 dark:text-white">Операционные автоматизации</strong><span className="text-gray-500">Разрешить использование рабочих каналов из Captain's Bridge.</span></span><input type="checkbox" checked={Boolean(byKey.n8n.configuration.operations_enabled)} onChange={(event)=>update("n8n",{configuration:{operations_enabled:event.target.checked}})} className="h-5 w-5"/></label><div className="mt-4 flex gap-3"><button disabled={Boolean(busy)} onClick={()=>void save("n8n")} className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white">Сохранить</button><button disabled={Boolean(busy)} onClick={()=>void check("n8n")} className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-semibold dark:border-gray-700">Проверить шлюзы</button></div></Panel>}

      {byKey.email && <Panel><div className="flex items-start justify-between gap-4"><div><h2 className="text-lg font-semibold text-gray-900 dark:text-white">Email Sender</h2><p className="mt-1 text-sm text-gray-500">Исходящая почта через n8n.</p></div>{status(health?.n8n_email_webhook)}</div><label className="mt-5 flex items-center gap-3 text-sm font-semibold text-gray-700 dark:text-gray-200"><input type="checkbox" checked={byKey.email.enabled} onChange={(event)=>update("email",{enabled:event.target.checked})} className="h-5 w-5"/>Канал включён</label><div className="mt-4 grid gap-3"><input className={field} value={String(byKey.email.configuration.from_name||"")} onChange={(event)=>update("email",{configuration:{from_name:event.target.value}})} placeholder="Имя отправителя"/><input className={field} type="email" value={String(byKey.email.configuration.from_email||"")} onChange={(event)=>update("email",{configuration:{from_email:event.target.value}})} placeholder="Email отправителя"/><input className={field} type="email" value={String(byKey.email.configuration.reply_to||"")} onChange={(event)=>update("email",{configuration:{reply_to:event.target.value}})} placeholder="Reply-To"/></div><div className="mt-4 flex gap-3"><button disabled={Boolean(busy)} onClick={()=>void save("email")} className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white">Сохранить</button><button disabled={Boolean(busy)} onClick={()=>void check("email")} className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-semibold dark:border-gray-700">Проверить шлюз</button></div></Panel>}

      {byKey.telegram && <Panel><div className="flex items-start justify-between gap-4"><div><h2 className="text-lg font-semibold text-gray-900 dark:text-white">Telegram</h2><p className="mt-1 text-sm text-gray-500">AIBot и ручные сообщения из Captain's Bridge.</p></div>{status(health?.n8n_telegram_webhook)}</div><label className="mt-5 flex items-center gap-3 text-sm font-semibold text-gray-700 dark:text-gray-200"><input type="checkbox" checked={byKey.telegram.enabled} onChange={(event)=>update("telegram",{enabled:event.target.checked})} className="h-5 w-5"/>Канал включён</label><div className="mt-4 grid gap-3"><input className={field} value={String(byKey.telegram.configuration.default_chat_id||"")} onChange={(event)=>update("telegram",{configuration:{default_chat_id:event.target.value}})} placeholder="Chat ID по умолчанию"/><label className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-300"><input type="checkbox" checked={Boolean(byKey.telegram.configuration.lead_notifications)} onChange={(event)=>update("telegram",{configuration:{lead_notifications:event.target.checked}})} className="h-5 w-5"/>Уведомлять о новых лидах</label><label className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-300"><input type="checkbox" checked={Boolean(byKey.telegram.configuration.error_notifications)} onChange={(event)=>update("telegram",{configuration:{error_notifications:event.target.checked}})} className="h-5 w-5"/>Уведомлять об ошибках</label></div><div className="mt-4 flex gap-3"><button disabled={Boolean(busy)} onClick={()=>void save("telegram")} className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white">Сохранить</button><button disabled={Boolean(busy)} onClick={()=>void check("telegram")} className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-semibold dark:border-gray-700">Проверить шлюз</button></div></Panel>}
    </div>
    <Panel className="mt-5"><h2 className="text-lg font-semibold text-gray-900 dark:text-white">Граница безопасности</h2><p className="mt-2 text-sm leading-6 text-gray-500">Интерфейс хранит только безопасные параметры: адрес отправителя, chat ID и переключатели. API keys, OAuth credentials и webhook URL управляются сервером Vercel и n8n. Их нельзя прочитать или случайно сохранить в браузере.</p></Panel>
  </>;
}
