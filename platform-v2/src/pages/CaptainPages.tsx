import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import PageMeta from "../components/common/PageMeta";
import { EmptyState, ErrorBanner, Metric, PageHeading, Panel, SkeletonPage, StatusPill } from "../components/control/Ui";
import ResearchEntityEditor from "../components/control/ResearchEntityEditor";
import { useControlBridge } from "../context/ControlBridgeContext";
import { supabase } from "../lib/supabase";
import type { AgentPspProvider, CasinoLead } from "../types/offerpsp";

const field = "h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 outline-none focus:border-brand-400 dark:border-gray-700 dark:text-white";
const area = "min-h-40 w-full rounded-lg border border-gray-300 bg-transparent px-3 py-3 text-sm text-gray-800 outline-none focus:border-brand-400 dark:border-gray-700 dark:text-white";
const formatDate = (value?: string | null) => value ? new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value)) : "—";

function Frame({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  const bridge = useControlBridge();
  if (bridge.loading) return <SkeletonPage/>;
  return <><PageMeta title={`${title} | OfferPSP`} description={description}/>{bridge.error && <ErrorBanner message={bridge.error}/>} {children}</>;
}

export function IntelligenceWorkspace() {
  const { captainsBridge, refresh } = useControlBridge();
  const [query, setQuery] = useState("");
  const [section, setSection] = useState<"casinos" | "psps">("casinos");
  const [scope, setScope] = useState<"active" | "archived" | "all">("active");
  const [contactFilter, setContactFilter] = useState("all");
  const [editor, setEditor] = useState<{ type: "casino" | "psp"; record?: CasinoLead | AgentPspProvider } | null>(null);
  const needle = query.trim().toLowerCase();
  const leads = useMemo(() => captainsBridge.casino_leads.filter((lead) => {
    const scopeMatch = scope === "all" || (scope === "archived" ? lead.record_state === "archived" : lead.record_state !== "archived");
    const contactMatch = contactFilter === "all" || lead.contact_status === contactFilter;
    return scopeMatch && contactMatch && [lead.name, lead.website, lead.geo, lead.email, lead.telegram, lead.sphere, lead.contact_name, lead.license, ...(lead.tags || [])].filter(Boolean).join(" ").toLowerCase().includes(needle);
  }), [captainsBridge.casino_leads, needle, scope, contactFilter]);
  const providers = useMemo(() => captainsBridge.psp_providers.filter((provider) => {
    const scopeMatch = scope === "all" || (scope === "archived" ? provider.record_state === "archived" : provider.record_state !== "archived");
    const contactMatch = contactFilter === "all" || provider.contact_status === contactFilter;
    return scopeMatch && contactMatch && [provider.name, provider.website, provider.geo, provider.cluster, provider.specialization, provider.methods, provider.email, provider.telegram, ...(provider.supported_countries || []), ...(provider.supported_currencies || []), ...(provider.payment_methods || [])].filter(Boolean).join(" ").toLowerCase().includes(needle);
  }), [captainsBridge.psp_providers, needle, scope, contactFilter]);
  const isInWork = (status?: string | null) => Boolean(status && !["new", "not_contacted"].includes(status));
  const contacted = captainsBridge.casino_leads.filter((lead) => isInWork(lead.contact_status)).length;
  return <Frame title="База AIBot" description="Казино и PSP, найденные Telegram AI Agent."><PageHeading eyebrow="Telegram AI Agent" title="База AIBot" description="Единая исследовательская база онлайн‑казино и PSP: компании, сайты, контакты, GEO и состояние коммуникации."/>
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4"><Metric label="Онлайн‑казино" value={captainsBridge.casino_leads.length} hint="найдено агентом"/><Metric label="PSP" value={captainsBridge.psp_providers.length} hint="в исследовательской базе"/><Metric label="С контактами" value={captainsBridge.casino_leads.filter((lead)=>lead.email || lead.telegram).length + captainsBridge.psp_providers.filter((provider)=>provider.email || provider.telegram).length} hint="есть прямой канал"/><Metric label="В работе" value={contacted + captainsBridge.psp_providers.filter((provider)=>isInWork(provider.contact_status)).length} hint="контакт уже начат" tone="success"/></div>
    <Panel className="mt-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between"><div><h2 className="text-lg font-semibold text-gray-900 dark:text-white">Компании, найденные агентом</h2><p className="mt-1 text-sm text-gray-500">Строка открывает полный редактор. Ссылка на сайт остаётся отдельным действием.</p><div className="mt-4 inline-flex rounded-xl bg-gray-100 p-1 dark:bg-white/5"><button onClick={()=>setSection("casinos")} className={`rounded-lg px-4 py-2 text-sm font-semibold ${section==="casinos"?"bg-white text-gray-900 shadow-sm dark:bg-gray-800 dark:text-white":"text-gray-500"}`}>Онлайн‑казино · {captainsBridge.casino_leads.length}</button><button onClick={()=>setSection("psps")} className={`rounded-lg px-4 py-2 text-sm font-semibold ${section==="psps"?"bg-white text-gray-900 shadow-sm dark:bg-gray-800 dark:text-white":"text-gray-500"}`}>PSP · {captainsBridge.psp_providers.length}</button></div></div>
        <button onClick={()=>setEditor({type:section === "casinos" ? "casino" : "psp"})} className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white">+ Добавить {section === "casinos" ? "казино" : "PSP"}</button>
      </div>
      <div className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_180px_180px]"><input className={field} value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Компания, GEO, метод, контакт…"/><select className={field} value={contactFilter} onChange={(e)=>setContactFilter(e.target.value)}><option value="all">Все контакты</option>{["not_contacted","researching","ready","contacted","replied","negotiating","partner","rejected","paused"].map((value)=><option key={value}>{value}</option>)}</select><select className={field} value={scope} onChange={(e)=>setScope(e.target.value as typeof scope)}><option value="active">Рабочие</option><option value="archived">Архив</option><option value="all">Все записи</option></select></div>
      <p className="mt-3 text-xs text-gray-400">Показано {section === "casinos" ? leads.length : providers.length}. Нажмите на строку или «Редактировать».</p>
      {section === "casinos" ? <div className="mt-3 divide-y divide-gray-100 dark:divide-gray-800">{leads.map((lead)=><div key={lead.id} role="button" tabIndex={0} onClick={()=>setEditor({type:"casino",record:lead})} onKeyDown={(event)=>{if(event.key==="Enter")setEditor({type:"casino",record:lead});}} className="grid cursor-pointer gap-3 py-4 hover:bg-gray-50/70 lg:grid-cols-[1.3fr_1fr_1fr_140px] dark:hover:bg-white/[0.02]"><div><strong className="text-sm text-gray-900 dark:text-white">{lead.name || lead.website || "Без названия"}</strong>{lead.website ? <a onClick={(event)=>event.stopPropagation()} className="mt-1 block truncate text-xs text-brand-500 hover:underline" href={lead.website.startsWith("http")?lead.website:`https://${lead.website}`} target="_blank" rel="noreferrer">{lead.website}</a>:<span className="mt-1 block text-xs text-gray-400">сайт не найден</span>}</div><div className="text-sm text-gray-600 dark:text-gray-300">{lead.contact_name || "Контакт не указан"}<span className="block text-xs text-gray-400">{lead.email || lead.telegram || "нет канала"}</span></div><div className="text-sm text-gray-600 dark:text-gray-300">{lead.geo || "GEO —"}<span className="block text-xs text-gray-400">{lead.license || "лицензия не указана"}</span></div><div className="lg:text-right"><strong className="text-sm text-gray-900 dark:text-white">Score {lead.score ?? "—"}</strong><span className="block text-xs text-gray-400">{lead.record_state === "archived" ? "archived" : lead.contact_status || "new"}</span><span className="mt-1 block text-xs font-semibold text-brand-500">Редактировать →</span></div></div>)}{!leads.length&&<EmptyState title="Казино не найдены" description="Измените фильтры или добавьте запись вручную."/>}</div>
      : <div className="mt-3 divide-y divide-gray-100 dark:divide-gray-800">{providers.map((provider)=><div key={provider.id} role="button" tabIndex={0} onClick={()=>setEditor({type:"psp",record:provider})} onKeyDown={(event)=>{if(event.key==="Enter")setEditor({type:"psp",record:provider});}} className="grid cursor-pointer gap-3 py-4 hover:bg-gray-50/70 lg:grid-cols-[1.25fr_1fr_1.1fr_150px] dark:hover:bg-white/[0.02]"><div><strong className="text-sm text-gray-900 dark:text-white">{provider.name || provider.website || "Без названия"}</strong>{provider.website ? <a onClick={(event)=>event.stopPropagation()} className="mt-1 block truncate text-xs text-brand-500 hover:underline" href={provider.website.startsWith("http")?provider.website:`https://${provider.website}`} target="_blank" rel="noreferrer">{provider.website}</a>:<span className="mt-1 block text-xs text-gray-400">сайт не найден</span>}</div><div className="text-sm text-gray-600 dark:text-gray-300">{provider.specialization || provider.cluster || "Специализация не указана"}<span className="block text-xs text-gray-400">{provider.email || provider.telegram || "нет канала"}</span></div><div className="text-sm text-gray-600 dark:text-gray-300">{(provider.supported_countries || []).join(", ") || provider.geo || "GEO —"}<span className="block truncate text-xs text-gray-400">{(provider.payment_methods || []).join(", ") || provider.methods || "методы не указаны"}</span></div><div className="lg:text-right"><strong className="text-sm text-gray-900 dark:text-white">{provider.provider_status || "research"}</strong><span className="block text-xs text-gray-400">{provider.record_state === "archived" ? "archived" : provider.contact_status || "new"}</span><span className="mt-1 block text-xs font-semibold text-brand-500">Редактировать →</span></div></div>)}{!providers.length&&<EmptyState title="PSP не найдены" description="Измените фильтры или добавьте запись вручную."/>}</div>}
    </Panel>
    {editor && <ResearchEntityEditor entityType={editor.type} record={editor.record} onClose={()=>setEditor(null)} onSaved={refresh}/>}
  </Frame>;
}

export function CommunicationsWorkspace() {
  const { captainsBridge, mailCenter, leads, refresh } = useControlBridge();
  const [searchParams] = useSearchParams();
  const [to, setTo] = useState(""); const [subject, setSubject] = useState(""); const [body, setBody] = useState("");
  const [leadId, setLeadId] = useState(""); const [busy, setBusy] = useState(false); const [message, setMessage] = useState<{error?:boolean;text:string}|null>(null);
  const [section, setSection] = useState<"mail" | "compose" | "telegram">("mail");
  const [threadId, setThreadId] = useState("");
  const [query, setQuery] = useState("");
  const [mailScope, setMailScope] = useState<"active" | "follow_up" | "archived" | "all">("active");
  const [linkType, setLinkType] = useState<"merchant" | "casino" | "research_psp" | "general">("general");
  const [linkId, setLinkId] = useState("");

  const visibleThreads = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return mailCenter.threads.filter((thread) => {
      const scopeMatch = mailScope === "all"
        || (mailScope === "archived" ? thread.status === "archived"
          : mailScope === "follow_up" ? thread.status === "follow_up" : thread.status !== "archived");
      return scopeMatch && [thread.subject, thread.participant_email, thread.counterparty_type, thread.status]
        .filter(Boolean).join(" ").toLowerCase().includes(needle);
    });
  }, [mailCenter.threads, mailScope, query]);
  const selectedThread = mailCenter.threads.find((thread) => thread.id === threadId) || visibleThreads[0];
  const selectedMessages = selectedThread
    ? mailCenter.messages.filter((entry) => entry.thread_id === selectedThread.id)
    : [];

  useEffect(() => {
    if (!selectedThread) return;
    setLinkType(selectedThread.counterparty_type === "casino" || selectedThread.counterparty_type === "research_psp" || selectedThread.counterparty_type === "merchant" ? selectedThread.counterparty_type : "general");
    setLinkId(selectedThread.lead_id || selectedThread.counterparty_id || "");
  }, [selectedThread]);

  useEffect(() => {
    const requestedLead = searchParams.get("lead");
    if (!requestedLead || requestedLead === leadId) return;
    const selected = leads.find((lead) => lead.lead_id === requestedLead);
    if (!selected) return;
    setLeadId(requestedLead);
    if (selected.work_email) setTo(selected.work_email);
    setSection("compose");
  }, [leadId, leads, searchParams]);

  async function sendEmail(returnToThread = false) {
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
    await refresh();
    if (returnToThread) setSection("mail");
    setBusy(false);
  }

  async function openThread(id: string) {
    setThreadId(id); setSection("mail");
    const thread = mailCenter.threads.find((item) => item.id === id);
    if (thread?.unread_count) {
      await supabase.rpc("set_offerpsp_email_thread_state", { p_thread_id: id, p_status: thread.status, p_mark_read: true });
      await refresh();
    }
  }

  async function changeThreadState(status: "open" | "awaiting_reply" | "follow_up" | "closed" | "archived") {
    if (!selectedThread) return;
    setBusy(true);
    const result = await supabase.rpc("set_offerpsp_email_thread_state", { p_thread_id: selectedThread.id, p_status: status, p_mark_read: true });
    setMessage(result.error ? { error: true, text: result.error.message } : { text: "Статус переписки обновлён." });
    await refresh(); setBusy(false);
  }

  async function saveThreadLink() {
    if (!selectedThread) return;
    setBusy(true);
    const result = await supabase.rpc("link_offerpsp_email_thread", {
      p_thread_id: selectedThread.id,
      p_counterparty_type: linkType,
      p_counterparty_id: linkType === "general" ? null : linkId || null,
      p_lead_id: linkType === "merchant" ? linkId || null : null,
    });
    setMessage(result.error ? { error: true, text: result.error.message } : { text: "Переписка привязана к рабочей карточке." });
    await refresh(); setBusy(false);
  }

  function startReply() {
    if (!selectedThread) return;
    setTo(selectedThread.participant_email);
    setSubject(/^re:/i.test(selectedThread.subject) ? selectedThread.subject : `Re: ${selectedThread.subject}`);
    setBody("");
    setLeadId(selectedThread.lead_id || "");
    setSection("compose");
  }

  const linkOptions = linkType === "merchant"
    ? leads.filter((lead) => lead.record_state !== "archived").map((lead) => ({ id: lead.lead_id, label: `${lead.company || lead.name || "Мерч"} · ${lead.work_email || "нет email"}` }))
    : linkType === "casino"
      ? captainsBridge.casino_leads.filter((item) => item.record_state !== "archived").map((item) => ({ id: String(item.id), label: item.name || item.website || `Casino ${item.id}` }))
      : linkType === "research_psp"
        ? captainsBridge.psp_providers.filter((item) => item.record_state !== "archived").map((item) => ({ id: String(item.id), label: item.name || item.website || `PSP ${item.id}` }))
        : [];

  return <Frame title="Коммуникации" description="Email и Telegram в одной панели."><PageHeading eyebrow="Omnichannel desk" title="Коммуникации" description="Полный почтовый центр bizdev@offerpsp.com и Telegram‑история AIBot в одной рабочей панели."/>
    {message&&<div className={`mb-5 rounded-xl border px-4 py-3 text-sm ${message.error?"border-error-200 bg-error-50 text-error-700":"border-success-200 bg-success-50 text-success-700"}`}>{message.text}</div>}
    <div className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4"><Metric label="Переписки" value={mailCenter.metrics.threads} hint="активные цепочки"/><Metric label="Непрочитано" value={mailCenter.metrics.unread} hint="требуют просмотра" tone={mailCenter.metrics.unread ? "success" : undefined}/><Metric label="Ждём ответ" value={mailCenter.metrics.awaiting_reply} hint="наш ход сделан"/><Metric label="Follow-up" value={mailCenter.metrics.follow_up} hint="нужно напомнить"/></div>
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[250px_minmax(0,1fr)]">
      <Panel className="h-fit"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-500">Каналы</p><div className="mt-4 space-y-2">{[
        ["mail", "Почтовый центр", `${mailCenter.metrics.unread} непрочитано`],
        ["compose", "Новое письмо", "bizdev@offerpsp.com"],
        ["telegram", "Telegram / AIBot", `${captainsBridge.telegram_log.length} сообщений`],
      ].map(([id,label,hint])=><button key={id} onClick={()=>setSection(id as typeof section)} className={`w-full rounded-xl px-4 py-3 text-left ${section===id?"bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300":"hover:bg-gray-50 dark:hover:bg-white/5"}`}><strong className="block text-sm">{label}</strong><span className="mt-1 block text-xs text-gray-400">{hint}</span></button>)}</div></Panel>
      {section === "mail" ? <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
        <Panel className="min-w-0"><div className="space-y-3"><input className={field} value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="Тема, email, статус…"/><select className={field} value={mailScope} onChange={(event)=>setMailScope(event.target.value as typeof mailScope)}><option value="active">Активные</option><option value="follow_up">Только follow-up</option><option value="archived">Архив</option><option value="all">Все</option></select></div><div className="mt-4 max-h-[720px] divide-y divide-gray-100 overflow-y-auto dark:divide-gray-800">{visibleThreads.map((thread)=><button key={thread.id} onClick={()=>void openThread(thread.id)} className={`w-full px-2 py-4 text-left ${selectedThread?.id===thread.id?"bg-brand-50 dark:bg-brand-500/10":"hover:bg-gray-50 dark:hover:bg-white/[0.03]"}`}><div className="flex items-start justify-between gap-3"><strong className="line-clamp-1 text-sm text-gray-900 dark:text-white">{thread.subject}</strong>{thread.unread_count>0&&<span className="rounded-full bg-brand-500 px-2 py-0.5 text-xs font-semibold text-white">{thread.unread_count}</span>}</div><span className="mt-1 block truncate text-xs text-gray-500">{thread.participant_email}</span><div className="mt-2 flex items-center justify-between gap-2"><StatusPill status={thread.status}/><span className="text-xs text-gray-400">{formatDate(thread.last_message_at)}</span></div></button>)}{!visibleThreads.length&&<EmptyState title="Писем не найдено" description="Входящие и исходящие цепочки появятся здесь."/>}</div></Panel>
        <Panel className="min-w-0">{selectedThread ? <><div className="flex flex-col gap-4 border-b border-gray-100 pb-5 dark:border-gray-800 md:flex-row md:items-start md:justify-between"><div><h2 className="text-xl font-semibold text-gray-900 dark:text-white">{selectedThread.subject}</h2><p className="mt-1 text-sm text-gray-500">{selectedThread.participant_email} · {selectedThread.counterparty_type}</p></div><button onClick={startReply} className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white">Ответить</button></div><div className="mt-4 flex flex-wrap gap-2"><button disabled={busy} onClick={()=>void changeThreadState("open")} className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold dark:border-gray-700">Открыто</button><button disabled={busy} onClick={()=>void changeThreadState("follow_up")} className="rounded-lg border border-warning-200 bg-warning-50 px-3 py-2 text-xs font-semibold text-warning-700">Follow-up</button><button disabled={busy} onClick={()=>void changeThreadState("closed")} className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold dark:border-gray-700">Закрыть</button><button disabled={busy} onClick={()=>void changeThreadState("archived")} className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-500 dark:border-gray-700">В архив</button></div><div className="mt-4 grid gap-3 rounded-xl bg-gray-50 p-4 dark:bg-white/[0.03] md:grid-cols-[160px_minmax(0,1fr)_auto]"><select className={field} value={linkType} onChange={(event)=>{setLinkType(event.target.value as typeof linkType);setLinkId("");}}><option value="general">Без привязки</option><option value="merchant">Мерч</option><option value="casino">Казино</option><option value="research_psp">PSP из базы AIBot</option></select><select className={field} value={linkId} disabled={linkType==="general"} onChange={(event)=>setLinkId(event.target.value)}><option value="">Выберите карточку</option>{linkOptions.map((option)=><option key={option.id} value={option.id}>{option.label}</option>)}</select><button disabled={busy} onClick={()=>void saveThreadLink()} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold dark:border-gray-700">Привязать</button></div><div className="mt-5 max-h-[520px] space-y-4 overflow-y-auto pr-1">{selectedMessages.map((entry)=><div key={entry.id} className={`max-w-[88%] rounded-2xl border p-4 ${entry.direction==="outbound"?"ml-auto border-brand-100 bg-brand-50 dark:border-brand-500/20 dark:bg-brand-500/10":"border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900"}`}><div className="flex items-center justify-between gap-4"><strong className="text-xs uppercase tracking-wide text-brand-500">{entry.direction==="outbound"?"OfferPSP →":"← Входящее"}</strong><span className="text-xs text-gray-400">{formatDate(entry.sent_at || entry.received_at || entry.created_at)}</span></div><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-gray-700 dark:text-gray-200">{entry.text_body || (entry.html_body ? "HTML-письмо без текстовой версии" : "Пустое письмо")}</p><span className="mt-3 block text-xs text-gray-400">{entry.delivery_status} · {entry.provider}</span></div>)}</div></> : <EmptyState title="Выберите переписку" description="Откройте цепочку слева или создайте новое письмо."/>}</Panel>
      </div> : section === "compose"
        ? <Panel><div className="flex items-start justify-between gap-4"><div><h2 className="text-lg font-semibold text-gray-900 dark:text-white">{selectedThread && to===selectedThread.participant_email ? "Ответ на письмо" : "Новое письмо"}</h2><p className="mt-1 text-sm text-gray-500">Отправитель: <strong className="text-gray-700 dark:text-gray-200">bizdev@offerpsp.com</strong> · доставка через n8n.</p></div><button onClick={()=>setSection("mail")} className="text-sm text-gray-500">К перепискам</button></div><div className="mt-5 space-y-4"><select className={field} value={leadId} onChange={(e)=>{setLeadId(e.target.value);const selected=leads.find((lead)=>lead.lead_id===e.target.value);if(selected?.work_email)setTo(selected.work_email);}}><option value="">Без привязки к мерчу</option>{leads.filter((lead)=>lead.record_state!=="archived").map((lead)=><option key={lead.lead_id} value={lead.lead_id}>{lead.company || "Без названия"} · {lead.work_email || "нет email"}</option>)}</select><input className={field} type="email" value={to} onChange={(e)=>setTo(e.target.value)} placeholder="Получатель"/><input className={field} value={subject} onChange={(e)=>setSubject(e.target.value)} placeholder="Тема"/><textarea className={area} value={body} onChange={(e)=>setBody(e.target.value)} placeholder="Текст письма"/><button onClick={()=>void sendEmail(Boolean(selectedThread && to===selectedThread.participant_email))} disabled={busy} className="w-full rounded-lg bg-brand-500 px-4 py-3 text-sm font-semibold text-white disabled:opacity-40">{busy?"Отправляю…":"Отправить письмо"}</button></div></Panel>
        : <Panel><div className="flex items-center justify-between"><div><h2 className="text-lg font-semibold text-gray-900 dark:text-white">Telegram / AIBot log</h2><p className="mt-1 text-sm text-gray-500">Фактическая история сообщений агента.</p></div><span className="text-sm text-gray-400">{captainsBridge.telegram_log.length}</span></div><div className="mt-5 grid max-h-[720px] grid-cols-1 gap-3 overflow-y-auto lg:grid-cols-2">{captainsBridge.telegram_log.slice(0,60).map((entry)=><div key={entry.id} className="rounded-xl border border-gray-200 p-4 dark:border-gray-800"><div className="flex items-center justify-between gap-3"><strong className="text-xs uppercase tracking-wide text-brand-500">{entry.role || "message"}</strong><span className="text-xs text-gray-400">{formatDate(entry.created_at)}</span></div><p className="mt-2 line-clamp-5 whitespace-pre-wrap text-sm text-gray-600 dark:text-gray-300">{entry.message}</p></div>)}{!captainsBridge.telegram_log.length&&<EmptyState title="Telegram журнал пуст" description="Сообщения активного AIBot появятся здесь автоматически."/>}</div></Panel>}
    </div>
  </Frame>;
}

export function TasksWorkspace() {
  const { captainsBridge } = useControlBridge();
  const tasks = [...captainsBridge.offerpsp_tasks.map((task)=>({...task,origin:"OfferPSP"})), ...captainsBridge.bot_tasks.map((task)=>({...task,origin:"AIBot"}))].sort((a,b)=>String(b.created_at||"").localeCompare(String(a.created_at||"")));
  return <Frame title="Задачи" description="Единая очередь задач."><PageHeading eyebrow="Operations queue" title="Задачи OfferPSP и AIBot" description="Ручные задачи, follow‑ups и автоматические миссии собраны в одной очереди."/><div className="grid grid-cols-2 gap-3 xl:grid-cols-4"><Metric label="Всего" value={tasks.length} hint="в двух рабочих контурах"/><Metric label="Открыты" value={tasks.filter((task)=>!["done","completed","cancelled"].includes(task.status||"")).length} hint="требуют действия"/><Metric label="OfferPSP" value={captainsBridge.offerpsp_tasks.length} hint="по сделкам и мерчам"/><Metric label="AIBot" value={captainsBridge.bot_tasks.length} hint="миссии и follow‑ups"/></div><Panel className="mt-6"><div className="divide-y divide-gray-100 dark:divide-gray-800">{tasks.map((task)=><div key={`${task.origin}-${task.id}`} className="grid gap-3 py-4 md:grid-cols-[100px_1fr_130px_150px]"><strong className="text-xs uppercase tracking-wide text-brand-500">{task.origin}</strong><div><strong className="text-sm text-gray-900 dark:text-white">{task.title || task.task_type || "Задача"}</strong><span className="mt-1 block text-xs text-gray-400">{task.details || (task.payload ? JSON.stringify(task.payload).slice(0,140) : "без описания")}</span></div><StatusPill status={task.status}/><span className="text-xs text-gray-400 md:text-right">{formatDate(task.due_at || task.scheduled_for || task.created_at)}</span></div>)}{!tasks.length&&<EmptyState title="Задач нет" description="Новые задачи появятся из сделок и автоматизаций."/>}</div></Panel></Frame>;
}

export function IntegrationsWorkspace() {
  const { captainsBridge, lastUpdatedAt } = useControlBridge();
  const [health, setHealth] = useState<{ supabase: boolean; n8n_email_webhook: boolean } | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void (async () => {
      const session = await supabase.auth.getSession();
      const response = await fetch("/api/integration-health", { headers: { Authorization: `Bearer ${session.data.session?.access_token || ""}` } });
      const result = await response.json().catch(() => ({}));
      if (!active) return;
      if (!response.ok || !result.success) setHealthError(result.error || "Не удалось проверить интеграции");
      else setHealth(result.checks);
    })();
    return () => { active = false; };
  }, []);
  const systems = [
    ["Supabase", Boolean(health?.supabase && lastUpdatedAt), "Данные получены", `обновлены ${lastUpdatedAt?.toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"})||"—"}`],
    ["n8n / AIBot", Boolean(captainsBridge.telegram_log.length || captainsBridge.bot_tasks.length), "Данные получены", `${captainsBridge.telegram_log.length} сообщений · ${captainsBridge.bot_tasks.length} задач`],
    ["Email Sender", Boolean(health?.n8n_email_webhook), "Настроен", `${captainsBridge.email_drafts.length} записей в журнале`],
    ["Telegram", Boolean(captainsBridge.telegram_log.length), "Данные получены", `${captainsBridge.telegram_log.length} сообщений Lead Hunter`],
  ];
  return <Frame title="Интеграции" description="Состояние рабочих сервисов."><PageHeading eyebrow="System control" title="Интеграции" description="Показываем подтверждённую конфигурацию и фактически загруженные данные."/>{healthError&&<ErrorBanner message={healthError}/>}<div className="grid grid-cols-1 gap-4 lg:grid-cols-2">{systems.map(([name,ok,status,detail])=><Panel key={String(name)}><div className="flex items-start justify-between gap-4"><div><h2 className="text-lg font-semibold text-gray-900 dark:text-white">{name}</h2><p className="mt-2 text-sm text-gray-500">{detail}</p></div><span className={`rounded-full px-3 py-1 text-xs font-semibold ${ok ? "bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-300" : "bg-warning-50 text-warning-700 dark:bg-warning-500/10 dark:text-warning-300"}`}>{ok ? status : health ? "Требует внимания" : "Проверяю…"}</span></div></Panel>)}</div></Frame>;
}
