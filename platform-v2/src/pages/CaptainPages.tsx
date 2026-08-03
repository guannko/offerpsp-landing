import { useMemo, useState } from "react";
import PageMeta from "../components/common/PageMeta";
import { EmptyState, ErrorBanner, Metric, PageHeading, Panel, SkeletonPage, StatusPill } from "../components/control/Ui";
import { useControlBridge } from "../context/ControlBridgeContext";
import { supabase } from "../lib/supabase";

const field = "h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 outline-none focus:border-brand-400 dark:border-gray-700 dark:text-white";
const area = "min-h-40 w-full rounded-lg border border-gray-300 bg-transparent px-3 py-3 text-sm text-gray-800 outline-none focus:border-brand-400 dark:border-gray-700 dark:text-white";
const formatDate = (value?: string | null) => value ? new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value)) : "—";

function Frame({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  const bridge = useControlBridge();
  if (bridge.loading) return <SkeletonPage/>;
  return <><PageMeta title={`${title} | OfferPSP`} description={description}/>{bridge.error && <ErrorBanner message={bridge.error}/>} {children}</>;
}

export function IntelligenceWorkspace() {
  const { captainsBridge } = useControlBridge();
  const [query, setQuery] = useState("");
  const [section, setSection] = useState<"casinos" | "psps">("casinos");
  const needle = query.trim().toLowerCase();
  const leads = useMemo(() => captainsBridge.casino_leads.filter((lead) => [lead.name, lead.website, lead.geo, lead.email, lead.telegram, lead.sphere, lead.contact_name].filter(Boolean).join(" ").toLowerCase().includes(needle)), [captainsBridge.casino_leads, needle]);
  const providers = useMemo(() => captainsBridge.psp_providers.filter((provider) => [provider.name, provider.website, provider.geo, provider.cluster, provider.specialization, provider.methods, provider.email, provider.telegram, ...(provider.supported_countries || []), ...(provider.supported_currencies || []), ...(provider.payment_methods || [])].filter(Boolean).join(" ").toLowerCase().includes(needle)), [captainsBridge.psp_providers, needle]);
  const contacted = captainsBridge.casino_leads.filter((lead) => lead.contact_status && lead.contact_status !== "new").length;
  return <Frame title="База AIBot" description="Казино и PSP, найденные Telegram AI Agent."><PageHeading eyebrow="Telegram AI Agent" title="База AIBot" description="Единая исследовательская база онлайн‑казино и PSP: компании, сайты, контакты, GEO и состояние коммуникации."/>
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4"><Metric label="Онлайн‑казино" value={captainsBridge.casino_leads.length} hint="найдено агентом"/><Metric label="PSP" value={captainsBridge.psp_providers.length} hint="в исследовательской базе"/><Metric label="С контактами" value={captainsBridge.casino_leads.filter((lead)=>lead.email || lead.telegram).length + captainsBridge.psp_providers.filter((provider)=>provider.email || provider.telegram).length} hint="есть прямой канал"/><Metric label="В работе" value={contacted + captainsBridge.psp_providers.filter((provider)=>provider.contact_status && provider.contact_status !== "new").length} hint="контакт уже начат" tone="success"/></div>
    <Panel className="mt-6"><div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><h2 className="text-lg font-semibold text-gray-900 dark:text-white">Компании, найденные агентом</h2><p className="mt-1 text-sm text-gray-500">Живые данные из Supabase AIBot, а не отдельная копия.</p><div className="mt-4 inline-flex rounded-xl bg-gray-100 p-1 dark:bg-white/5"><button onClick={()=>setSection("casinos")} className={`rounded-lg px-4 py-2 text-sm font-semibold ${section==="casinos"?"bg-white text-gray-900 shadow-sm dark:bg-gray-800 dark:text-white":"text-gray-500"}`}>Онлайн‑казино · {captainsBridge.casino_leads.length}</button><button onClick={()=>setSection("psps")} className={`rounded-lg px-4 py-2 text-sm font-semibold ${section==="psps"?"bg-white text-gray-900 shadow-sm dark:bg-gray-800 dark:text-white":"text-gray-500"}`}>PSP · {captainsBridge.psp_providers.length}</button></div></div><input className={`${field} lg:max-w-sm`} value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Компания, GEO, метод, контакт…"/></div>
      {section === "casinos" ? <div className="mt-5 divide-y divide-gray-100 dark:divide-gray-800">{leads.map((lead)=><div key={lead.id} className="grid gap-3 py-4 lg:grid-cols-[1.3fr_1fr_1fr_120px]"><div><strong className="text-sm text-gray-900 dark:text-white">{lead.name || lead.website || "Без названия"}</strong>{lead.website ? <a className="mt-1 block truncate text-xs text-brand-500 hover:underline" href={lead.website.startsWith("http")?lead.website:`https://${lead.website}`} target="_blank" rel="noreferrer">{lead.website}</a>:<span className="mt-1 block text-xs text-gray-400">сайт не найден</span>}</div><div className="text-sm text-gray-600 dark:text-gray-300">{lead.contact_name || "Контакт не указан"}<span className="block text-xs text-gray-400">{lead.email || lead.telegram || "нет канала"}</span></div><div className="text-sm text-gray-600 dark:text-gray-300">{lead.geo || "GEO —"}<span className="block text-xs text-gray-400">{lead.license || "лицензия не указана"}</span></div><div className="lg:text-right"><strong className="text-sm text-gray-900 dark:text-white">Score {lead.score ?? "—"}</strong><span className="block text-xs text-gray-400">{lead.contact_status || "new"}</span></div></div>)}{!leads.length&&<EmptyState title="Казино не найдены" description="Измените поисковый запрос."/>}</div>
      : <div className="mt-5 divide-y divide-gray-100 dark:divide-gray-800">{providers.map((provider)=><div key={provider.id} className="grid gap-3 py-4 lg:grid-cols-[1.25fr_1fr_1.1fr_130px]"><div><strong className="text-sm text-gray-900 dark:text-white">{provider.name || provider.website || "Без названия"}</strong>{provider.website ? <a className="mt-1 block truncate text-xs text-brand-500 hover:underline" href={provider.website.startsWith("http")?provider.website:`https://${provider.website}`} target="_blank" rel="noreferrer">{provider.website}</a>:<span className="mt-1 block text-xs text-gray-400">сайт не найден</span>}</div><div className="text-sm text-gray-600 dark:text-gray-300">{provider.specialization || provider.cluster || "Специализация не указана"}<span className="block text-xs text-gray-400">{provider.email || provider.telegram || "нет канала"}</span></div><div className="text-sm text-gray-600 dark:text-gray-300">{(provider.supported_countries || []).join(", ") || provider.geo || "GEO —"}<span className="block truncate text-xs text-gray-400">{(provider.payment_methods || []).join(", ") || provider.methods || "методы не указаны"}</span></div><div className="lg:text-right"><strong className="text-sm text-gray-900 dark:text-white">{provider.provider_status || "prospect"}</strong><span className="block text-xs text-gray-400">{provider.contact_status || "new"}</span></div></div>)}{!providers.length&&<EmptyState title="PSP не найдены" description="Измените поисковый запрос."/>}</div>}
    </Panel>
  </Frame>;
}

export function CommunicationsWorkspace() {
  const { captainsBridge, leads, refresh } = useControlBridge();
  const [to, setTo] = useState(""); const [subject, setSubject] = useState(""); const [body, setBody] = useState("");
  const [leadId, setLeadId] = useState(""); const [busy, setBusy] = useState(false); const [message, setMessage] = useState<{error?:boolean;text:string}|null>(null);

  async function sendEmail() {
    if (!to.trim() || !subject.trim() || !body.trim()) { setMessage({ error: true, text: "Заполните получателя, тему и текст." }); return; }
    setBusy(true); setMessage(null);
    const created = await supabase.rpc("create_offerpsp_email_draft", { p_lead_id: leadId || null, p_to_email: to, p_subject: subject, p_body: body });
    if (created.error) { setMessage({ error: true, text: created.error.message }); setBusy(false); return; }
    const draftId = Number((created.data as {id?:number})?.id);
    await supabase.rpc("set_offerpsp_email_draft_status", { p_draft_id: draftId, p_status: "sending" });
    const session = await supabase.auth.getSession();
    try {
      const response = await fetch("/api/send-email", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.data.session?.access_token || ""}` }, body: JSON.stringify({ to, subject, body, lead_id: leadId || null }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) throw new Error(result.error || result.message || "Email sender returned an error");
      await supabase.rpc("set_offerpsp_email_draft_status", { p_draft_id: draftId, p_status: "sent" });
      setMessage({ text: `Письмо отправлено на ${to}.` }); setSubject(""); setBody("");
    } catch (error) {
      await supabase.rpc("set_offerpsp_email_draft_status", { p_draft_id: draftId, p_status: "failed" });
      setMessage({ error: true, text: error instanceof Error ? error.message : "Не удалось отправить письмо" });
    }
    await refresh(); setBusy(false);
  }

  return <Frame title="Коммуникации" description="Email и Telegram в одной панели."><PageHeading eyebrow="Omnichannel desk" title="Коммуникации" description="Письма, история отправки и Telegram‑диалоги AIBot в одном рабочем контуре."/>
    {message&&<div className={`mb-5 rounded-xl border px-4 py-3 text-sm ${message.error?"border-error-200 bg-error-50 text-error-700":"border-success-200 bg-success-50 text-success-700"}`}>{message.text}</div>}
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-2"><Panel><h2 className="text-lg font-semibold text-gray-900 dark:text-white">Новое письмо</h2><p className="mt-1 text-sm text-gray-500">Отправитель: <strong className="text-gray-700 dark:text-gray-200">bizdev@offerpsp.com</strong> · доставка через n8n.</p><div className="mt-5 space-y-4"><select className={field} value={leadId} onChange={(e)=>{setLeadId(e.target.value);const selected=leads.find((lead)=>lead.lead_id===e.target.value);if(selected?.work_email)setTo(selected.work_email);}}><option value="">Без привязки к мерчу</option>{leads.filter((lead)=>lead.record_state!=="archived").map((lead)=><option key={lead.lead_id} value={lead.lead_id}>{lead.company || "Без названия"} · {lead.work_email || "нет email"}</option>)}</select><input className={field} type="email" value={to} onChange={(e)=>setTo(e.target.value)} placeholder="Получатель"/><input className={field} value={subject} onChange={(e)=>setSubject(e.target.value)} placeholder="Тема"/><textarea className={area} value={body} onChange={(e)=>setBody(e.target.value)} placeholder="Текст письма"/><button onClick={()=>void sendEmail()} disabled={busy} className="w-full rounded-lg bg-brand-500 px-4 py-3 text-sm font-semibold text-white disabled:opacity-40">{busy?"Отправляю…":"Отправить письмо"}</button></div></Panel>
      <Panel><h2 className="text-lg font-semibold text-gray-900 dark:text-white">Email journal</h2><div className="mt-5 max-h-[610px] divide-y divide-gray-100 overflow-y-auto dark:divide-gray-800">{captainsBridge.email_drafts.map((draft)=><div key={draft.id} className="py-4"><div className="flex items-start justify-between gap-3"><div><strong className="text-sm text-gray-900 dark:text-white">{draft.subject || "Без темы"}</strong><span className="mt-1 block text-xs text-gray-400">{draft.to_email || "нет получателя"} · {formatDate(draft.created_at)}</span></div><StatusPill status={draft.status}/></div><p className="mt-2 line-clamp-2 text-xs text-gray-500">{draft.body}</p></div>)}{!captainsBridge.email_drafts.length&&<EmptyState title="Писем пока нет" description="Первое отправленное письмо появится здесь."/>}</div></Panel>
    </div><Panel className="mt-6"><h2 className="text-lg font-semibold text-gray-900 dark:text-white">Telegram / AIBot log</h2><div className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-2">{captainsBridge.telegram_log.slice(0,30).map((entry)=><div key={entry.id} className="rounded-xl border border-gray-200 p-4 dark:border-gray-800"><div className="flex items-center justify-between gap-3"><strong className="text-xs uppercase tracking-wide text-brand-500">{entry.role || "message"}</strong><span className="text-xs text-gray-400">{formatDate(entry.created_at)}</span></div><p className="mt-2 line-clamp-4 whitespace-pre-wrap text-sm text-gray-600 dark:text-gray-300">{entry.message}</p></div>)}{!captainsBridge.telegram_log.length&&<EmptyState title="Telegram журнал пуст" description="Сообщения активного AIBot появятся здесь автоматически."/>}</div></Panel>
  </Frame>;
}

export function TasksWorkspace() {
  const { captainsBridge } = useControlBridge();
  const tasks = [...captainsBridge.offerpsp_tasks.map((task)=>({...task,origin:"OfferPSP"})), ...captainsBridge.bot_tasks.map((task)=>({...task,origin:"AIBot"}))].sort((a,b)=>String(b.created_at||"").localeCompare(String(a.created_at||"")));
  return <Frame title="Задачи" description="Единая очередь задач."><PageHeading eyebrow="Operations queue" title="Задачи OfferPSP и AIBot" description="Ручные задачи, follow‑ups и автоматические миссии собраны в одной очереди."/><div className="grid grid-cols-2 gap-3 xl:grid-cols-4"><Metric label="Всего" value={tasks.length} hint="в двух рабочих контурах"/><Metric label="Открыты" value={tasks.filter((task)=>!["done","completed","cancelled"].includes(task.status||"")).length} hint="требуют действия"/><Metric label="OfferPSP" value={captainsBridge.offerpsp_tasks.length} hint="по сделкам и мерчам"/><Metric label="AIBot" value={captainsBridge.bot_tasks.length} hint="миссии и follow‑ups"/></div><Panel className="mt-6"><div className="divide-y divide-gray-100 dark:divide-gray-800">{tasks.map((task)=><div key={`${task.origin}-${task.id}`} className="grid gap-3 py-4 md:grid-cols-[100px_1fr_130px_150px]"><strong className="text-xs uppercase tracking-wide text-brand-500">{task.origin}</strong><div><strong className="text-sm text-gray-900 dark:text-white">{task.title || task.task_type || "Задача"}</strong><span className="mt-1 block text-xs text-gray-400">{task.details || (task.payload ? JSON.stringify(task.payload).slice(0,140) : "без описания")}</span></div><StatusPill status={task.status}/><span className="text-xs text-gray-400 md:text-right">{formatDate(task.due_at || task.scheduled_for || task.created_at)}</span></div>)}{!tasks.length&&<EmptyState title="Задач нет" description="Новые задачи появятся из сделок и автоматизаций."/>}</div></Panel></Frame>;
}

export function IntegrationsWorkspace() {
  const { captainsBridge, lastUpdatedAt } = useControlBridge();
  const systems = [
    ["Supabase", "Подключён", `данные обновлены ${lastUpdatedAt?.toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"})||"—"}`],
    ["n8n / AIBot", "Работает", `${captainsBridge.telegram_log.length} сообщений · ${captainsBridge.bot_tasks.length} задач загружено`],
    ["Email Sender", "Работает", `${captainsBridge.email_drafts.length} записей в журнале`],
    ["Telegram", "Работает", "Lead Hunter и рабочие уведомления"],
  ];
  return <Frame title="Интеграции" description="Состояние рабочих сервисов."><PageHeading eyebrow="System control" title="Интеграции" description="Показываем фактический поток данных, а не декоративный список логотипов."/><div className="grid grid-cols-1 gap-4 lg:grid-cols-2">{systems.map(([name,status,detail])=><Panel key={name}><div className="flex items-start justify-between gap-4"><div><h2 className="text-lg font-semibold text-gray-900 dark:text-white">{name}</h2><p className="mt-2 text-sm text-gray-500">{detail}</p></div><span className="rounded-full bg-success-50 px-3 py-1 text-xs font-semibold text-success-700 dark:bg-success-500/10 dark:text-success-300">{status}</span></div></Panel>)}</div></Frame>;
}
