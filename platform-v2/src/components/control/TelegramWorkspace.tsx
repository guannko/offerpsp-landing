import { useCallback, useEffect, useMemo, useState } from "react";
import { EmptyState, Panel, StatusPill } from "./Ui";
import { useControlBridge } from "../../context/ControlBridgeContext";
import { supabase } from "../../lib/supabase";
import type { IntegrationSetting, TelegramDelivery } from "../../types/offerpsp";

const field = "h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 outline-none focus:border-brand-400 dark:border-gray-700 dark:text-white";
const area = "min-h-36 w-full rounded-lg border border-gray-300 bg-transparent px-3 py-3 text-sm text-gray-800 outline-none focus:border-brand-400 dark:border-gray-700 dark:text-white";

export default function TelegramWorkspace() {
  const { captainsBridge, leads } = useControlBridge();
  const [deliveries, setDeliveries] = useState<TelegramDelivery[]>([]);
  const [chatId, setChatId] = useState("");
  const [leadId, setLeadId] = useState("");
  const [message, setMessage] = useState("");
  const [tab, setTab] = useState<"send" | "history" | "aibot">("send");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ error?: boolean; text: string } | null>(null);
  const activeLeads = useMemo(()=>leads.filter((lead)=>lead.record_state!=="archived"),[leads]);

  const load = useCallback(async () => {
    const [messagesResult, settingsResult] = await Promise.all([
      supabase.rpc("list_offerpsp_telegram_messages", { p_limit: 150 }),
      supabase.rpc("get_offerpsp_integration_settings"),
    ]);
    if (!messagesResult.error) setDeliveries((messagesResult.data || []) as TelegramDelivery[]);
    if (!settingsResult.error) {
      const telegram = ((settingsResult.data || []) as IntegrationSetting[]).find((item)=>item.key==="telegram");
      if (telegram?.configuration.default_chat_id) setChatId((current)=>current || String(telegram.configuration.default_chat_id));
    }
  }, []);

  useEffect(()=>{void load();},[load]);

  async function send() {
    if (!/^-?\d+$/.test(chatId.trim()) || !message.trim()) { setNotice({error:true,text:"Укажите корректный chat ID и текст сообщения."}); return; }
    setBusy(true); setNotice(null);
    const session = await supabase.auth.getSession();
    try {
      const response = await fetch("/api/send-telegram", { method:"POST", headers:{"Content-Type":"application/json",Authorization:`Bearer ${session.data.session?.access_token||""}`}, body:JSON.stringify({chat_id:chatId.trim(),message:message.trim(),lead_id:leadId||null}) });
      const result = await response.json().catch(()=>({}));
      if (!response.ok || !result.success) throw new Error(result.error || "Telegram sender returned an error");
      setNotice({text:result.recorded === false
        ? `Сообщение отправлено · message ${result.message_id || "accepted"}, но история не записалась.`
        : `Сообщение отправлено в Telegram · message ${result.message_id || "accepted"}.`});
      setMessage(""); setTab("history"); await load();
    } catch (error) { setNotice({error:true,text:error instanceof Error?error.message:"Не удалось отправить сообщение"}); }
    setBusy(false);
  }

  return <div className="space-y-5">
    {notice&&<div className={`rounded-xl border px-4 py-3 text-sm ${notice.error?"border-error-200 bg-error-50 text-error-700":"border-success-200 bg-success-50 text-success-700"}`}>{notice.text}</div>}
    <div className="inline-flex rounded-xl bg-gray-100 p-1 dark:bg-white/5">{[["send","Отправить"],["history",`Исходящие · ${deliveries.length}`],["aibot",`Журнал AIBot · ${captainsBridge.telegram_log.length}`]].map(([id,label])=><button key={id} onClick={()=>setTab(id as typeof tab)} className={`rounded-lg px-4 py-2 text-sm font-semibold ${tab===id?"bg-white text-gray-900 shadow-sm dark:bg-gray-800 dark:text-white":"text-gray-500"}`}>{label}</button>)}</div>
    {tab==="send"&&<Panel><div><h2 className="text-lg font-semibold text-gray-900 dark:text-white">Новое сообщение Telegram</h2><p className="mt-1 text-sm text-gray-500">Сообщение отправит рабочий OfferPSP AIBot через защищённый n8n-шлюз.</p></div><div className="mt-5 space-y-4"><select className={field} value={leadId} onChange={(event)=>setLeadId(event.target.value)}><option value="">Без привязки к мерчу</option>{activeLeads.map((lead)=><option key={lead.lead_id} value={lead.lead_id}>{lead.company||lead.name||lead.work_email}</option>)}</select><input className={field} value={chatId} onChange={(event)=>setChatId(event.target.value)} placeholder="Telegram chat ID"/><textarea className={area} maxLength={4096} value={message} onChange={(event)=>setMessage(event.target.value)} placeholder="Текст сообщения"/><div className="flex items-center justify-between gap-4"><span className="text-xs text-gray-400">{message.length} / 4096</span><button disabled={busy} onClick={()=>void send()} className="rounded-lg bg-brand-500 px-5 py-3 text-sm font-semibold text-white disabled:opacity-40">{busy?"Отправляю…":"Отправить в Telegram"}</button></div></div></Panel>}
    {tab==="history"&&<Panel><div className="divide-y divide-gray-100 dark:divide-gray-800">{deliveries.map((entry)=><div key={entry.id} className="grid gap-3 py-4 md:grid-cols-[minmax(0,1fr)_140px_170px]"><div><strong className="text-sm text-gray-900 dark:text-white">{entry.merchant_name||`Chat ${entry.chat_id}`}</strong><p className="mt-1 whitespace-pre-wrap text-sm text-gray-600 dark:text-gray-300">{entry.message_text}</p>{entry.error_message&&<span className="mt-1 block text-xs text-error-600">{entry.error_message}</span>}</div><StatusPill status={entry.status}/><span className="text-xs text-gray-400 md:text-right">{new Date(entry.created_at).toLocaleString("ru-RU")}</span></div>)}{!deliveries.length&&<EmptyState title="Исходящих сообщений нет" description="Отправленные через Captain's Bridge сообщения появятся здесь."/>}</div></Panel>}
    {tab==="aibot"&&<Panel><div><h2 className="text-lg font-semibold text-gray-900 dark:text-white">Журнал AIBot</h2><p className="mt-1 text-sm text-gray-500">Технический диалог Lead Hunter, если workflow сохраняет его в Supabase.</p></div><div className="mt-5 grid max-h-[720px] grid-cols-1 gap-3 overflow-y-auto lg:grid-cols-2">{captainsBridge.telegram_log.slice(0,100).map((entry)=><div key={entry.id} className="rounded-xl border border-gray-200 p-4 dark:border-gray-800"><div className="flex items-center justify-between gap-3"><strong className="text-xs uppercase tracking-wide text-brand-500">{entry.role||"message"}</strong><span className="text-xs text-gray-400">{entry.created_at?new Date(entry.created_at).toLocaleString("ru-RU"):"—"}</span></div><p className="mt-2 whitespace-pre-wrap text-sm text-gray-600 dark:text-gray-300">{entry.message}</p></div>)}{!captainsBridge.telegram_log.length&&<EmptyState title="Журнал AIBot пуст" description="Это не означает ошибку Telegram: workflow может не сохранять технический диалог."/>}</div></Panel>}
  </div>;
}
