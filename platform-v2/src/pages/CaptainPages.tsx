import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import PageMeta from "../components/common/PageMeta";
import { EmptyState, ErrorBanner, Metric, PageHeading, Panel, SkeletonPage, humanizeCode, statusLabels } from "../components/control/Ui";
import ResearchEntityEditor from "../components/control/ResearchEntityEditor";
import TelegramWorkspace from "../components/control/TelegramWorkspace";
import { useControlBridge } from "../context/ControlBridgeContext";
import { supabase } from "../lib/supabase";
import type { CasinoLead, EmailAttachment, EmailMessage, EmailTemplate, EmailThread } from "../types/offerpsp";

const field = "h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 outline-none focus:border-brand-400 dark:border-gray-700 dark:text-white";
const area = "min-h-40 w-full rounded-lg border border-gray-300 bg-transparent px-3 py-3 text-sm text-gray-800 outline-none focus:border-brand-400 dark:border-gray-700 dark:text-white";
const formatDate = (value?: string | null) => value ? new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value)) : "—";
const activeCasinoStatuses = ["partner", "active", "replied"];
const inactiveCasinoStatuses = ["rejected", "paused"];
const counterpartyLabels: Record<string, string> = {
  casino: "Казино",
  general: "Без привязки",
  merchant: "Мерч",
  provider: "PSP",
  research_psp: "PSP из базы AIBot",
};

const mailThreadLabels: Record<string, { label: string; hint: string; className: string }> = {
  open: { label: "Открытая переписка", hint: "Нужно определить следующий шаг", className: "border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-700 dark:bg-white/5 dark:text-gray-200" },
  awaiting_reply: { label: "Ждём ответ партнёра", hint: "Последнее письмо отправили мы", className: "border-brand-200 bg-brand-50 text-brand-700 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-300" },
  follow_up: { label: "Нужен follow-up", hint: "Пора напомнить о переписке", className: "border-warning-200 bg-warning-50 text-warning-700 dark:border-warning-500/30 dark:bg-warning-500/10 dark:text-warning-300" },
  closed: { label: "Переписка закрыта", hint: "Активных действий не требуется", className: "border-gray-200 bg-gray-50 text-gray-500 dark:border-gray-700 dark:bg-white/5 dark:text-gray-400" },
  archived: { label: "В архиве", hint: "Переписка убрана из рабочего списка", className: "border-gray-200 bg-gray-50 text-gray-500 dark:border-gray-700 dark:bg-white/5 dark:text-gray-400" },
  trashed: { label: "В корзине", hint: "Автоматическое удаление через 15 дней", className: "border-error-200 bg-error-50 text-error-700 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-300" },
};

const messageDate = (entry: { sent_at?: string | null; received_at?: string | null; created_at: string }) =>
  entry.sent_at || entry.received_at || entry.created_at;
const priorityWeight: Record<string, number> = { low: 1, normal: 2, high: 3, urgent: 4 };
const priorityLabels: Record<string, string> = { low: "Низкий", normal: "Обычный", high: "Высокий", urgent: "Срочно" };
const isActiveMailThread = (thread: EmailThread) => !["closed", "archived", "trashed"].includes(thread.status);
const isOverdueThread = (thread: EmailThread) => Boolean(thread.follow_up_at && isActiveMailThread(thread) && new Date(thread.follow_up_at).getTime() <= Date.now());
const toDateTimeLocal = (value?: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
};

const trashExpiresAt = (value?: string | null) => {
  if (!value) return null;
  const deletedAt = new Date(value);
  if (Number.isNaN(deletedAt.getTime())) return null;
  return new Date(deletedAt.getTime() + 15 * 24 * 60 * 60 * 1000).toISOString();
};
const stripHtml = (value: string) => {
  if (typeof document === "undefined") return value.replace(/<[^>]*>/g, " ");
  const element = document.createElement("div");
  element.innerHTML = value;
  return element.textContent || "";
};

function Frame({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  const bridge = useControlBridge();
  if (bridge.loading) return <SkeletonPage label={`Загружаем раздел «${title}»…`}/>;
  return <><PageMeta title={`${title} | OfferPSP`} description={description}/>{bridge.error && <ErrorBanner message={bridge.error}/>} {children}</>;
}

export function CasinosWorkspace() {
  const { captainsBridge, refresh } = useControlBridge();
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<"active" | "pipeline" | "inactive" | "hidden" | "all">("active");
  const [contactFilter, setContactFilter] = useState("all");
  const [editor, setEditor] = useState<{ record?: CasinoLead } | null>(null);
  const needle = query.trim().toLowerCase();
  const leads = useMemo(() => captainsBridge.casino_leads.filter((lead) => {
    const hidden = lead.record_state === "archived";
    const inactive = !hidden && inactiveCasinoStatuses.includes(lead.contact_status || "");
    const active = !inactive && activeCasinoStatuses.includes(lead.contact_status || "");
    const scopeMatch = scope === "all" || (scope === "hidden" ? hidden : !hidden && (scope === "inactive" ? inactive : scope === "active" ? active : !active && !inactive));
    const contactMatch = contactFilter === "all" || lead.contact_status === contactFilter;
    return scopeMatch && contactMatch && [lead.name, lead.website, lead.geo, lead.email, lead.telegram, lead.sphere, lead.contact_name, lead.license, ...(lead.tags || [])].filter(Boolean).join(" ").toLowerCase().includes(needle);
  }), [captainsBridge.casino_leads, needle, scope, contactFilter]);
  const count = (kind: "active" | "pipeline" | "inactive" | "hidden") => captainsBridge.casino_leads.filter((lead) => {
    const hidden = lead.record_state === "archived";
    const inactive = !hidden && inactiveCasinoStatuses.includes(lead.contact_status || "");
    const active = !inactive && activeCasinoStatuses.includes(lead.contact_status || "");
    return kind === "hidden" ? hidden : !hidden && (kind === "inactive" ? inactive : kind === "active" ? active : !active && !inactive);
  }).length;

  const requestedEntity = searchParams.get("entity");
  useEffect(() => {
    if (!requestedEntity) return;
    const record = captainsBridge.casino_leads.find((lead) => String(lead.id) === requestedEntity);
    if (record) setEditor({ record });
  }, [captainsBridge.casino_leads, requestedEntity]);

  const closeEditor = () => {
    setEditor(null);
    if (!requestedEntity) return;
    const next = new URLSearchParams(searchParams);
    next.delete("entity");
    setSearchParams(next, { replace: true });
  };
  return <Frame title="Казино" description="Рабочий реестр онлайн-казино."><PageHeading eyebrow="Counterparty organizer" title="Казино" description="Единый реестр найденных и активных компаний. AIBot наполняет его из Telegram, а команда ведёт контакт, почту, заметки и задачи в рабочей карточке." action={<button onClick={()=>setEditor({})} className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white">+ Добавить казино</button>}/>
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-5"><Metric label="Всего" value={captainsBridge.casino_leads.length} hint="в едином реестре"/><Metric label="Активные" value={count("active")} hint="контакт и работа начаты" tone="success"/><Metric label="В обработке" value={count("pipeline")} hint="исследование и переговоры"/><Metric label="Неактивные" value={count("inactive")} hint="пауза или отказ"/><Metric label="Скрытые" value={count("hidden")} hint="сохранены вне работы"/></div>
    <Panel className="mt-6">
      <div><h2 className="text-lg font-semibold text-gray-900 dark:text-white">Рабочий список</h2><p className="mt-1 text-sm text-gray-500">Нажмите на компанию, чтобы открыть её органайзер.</p></div>
      <div className="mt-4 flex flex-wrap gap-2">{[["active","Активные"],["pipeline","В обработке"],["inactive","Неактивные"],["hidden","Скрытые"],["all","Все"]].map(([value,label])=><button key={value} onClick={()=>setScope(value as typeof scope)} className={`rounded-lg px-3 py-2 text-sm ${scope===value?"bg-brand-500 text-white":"bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-300"}`}>{label}</button>)}</div>
      <div className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_220px]"><input className={field} value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Компания, GEO, контакт, лицензия…"/><select className={field} value={contactFilter} onChange={(e)=>setContactFilter(e.target.value)}><option value="all">Все статусы контакта</option>{["not_contacted","researching","ready","contacted","replied","negotiating","partner","rejected","paused"].map((value)=><option key={value} value={value}>{statusLabels[value] || value}</option>)}</select></div>
      <p className="mt-3 text-xs text-gray-400">Показано {leads.length} из {captainsBridge.casino_leads.length}.</p>
      <div className="mt-3 divide-y divide-gray-100 dark:divide-gray-800">{leads.map((lead)=><div key={lead.id} role="button" tabIndex={0} onClick={()=>setEditor({record:lead})} onKeyDown={(event)=>{if(event.key==="Enter")setEditor({record:lead});}} className="grid cursor-pointer gap-3 py-4 hover:bg-gray-50/70 lg:grid-cols-[1.3fr_1fr_1fr_140px] dark:hover:bg-white/[0.02]"><div><strong className="text-sm text-gray-900 dark:text-white">{lead.name || lead.website || "Без названия"}</strong>{lead.website ? <a onClick={(event)=>event.stopPropagation()} className="mt-1 block truncate text-xs text-brand-500 hover:underline" href={lead.website.startsWith("http")?lead.website:`https://${lead.website}`} target="_blank" rel="noreferrer">{lead.website}</a>:<span className="mt-1 block text-xs text-gray-400">сайт не найден</span>}</div><div className="text-sm text-gray-600 dark:text-gray-300">{lead.contact_name || "Контакт не указан"}<span className="block text-xs text-gray-400">{lead.email || lead.telegram || "нет канала"}</span></div><div className="text-sm text-gray-600 dark:text-gray-300">{lead.geo || "GEO —"}<span className="block text-xs text-gray-400">{lead.license || "лицензия не указана"}</span></div><div className="lg:text-right"><strong className="text-sm text-gray-900 dark:text-white">Score {lead.score ?? "—"}</strong><span className="block text-xs text-gray-400">{humanizeCode(lead.record_state === "archived" ? "archived" : lead.contact_status || "new")}</span><span className="mt-1 block text-xs font-semibold text-brand-500">Открыть карточку →</span></div></div>)}{!leads.length&&<EmptyState title="Казино не найдены" description="Измените фильтры или добавьте запись вручную."/>}</div>
    </Panel>
    {editor && <ResearchEntityEditor entityType="casino" record={editor.record} onClose={closeEditor} onSaved={refresh}/>}
  </Frame>;
}

export const IntelligenceWorkspace = CasinosWorkspace;

export function CommunicationsWorkspace() {
  const { captainsBridge, mailCenter, leads, providers, refresh, ready } = useControlBridge();
  const [searchParams, setSearchParams] = useSearchParams();
  const [to, setTo] = useState(""); const [subject, setSubject] = useState(""); const [body, setBody] = useState("");
  const [leadId, setLeadId] = useState(""); const [busy, setBusy] = useState(false); const [message, setMessage] = useState<{error?:boolean;text:string}|null>(null);
  const [activeDraftId, setActiveDraftId] = useState<number | null>(null);
  const [section, setSection] = useState<"mail" | "compose" | "telegram">("mail");
  const [threadId, setThreadId] = useState("");
  const [query, setQuery] = useState("");
  const [mailScope, setMailScope] = useState<"active" | "unread" | "inbox" | "sent" | "awaiting_reply" | "overdue" | "flagged" | "follow_up" | "attachments" | "closed" | "archived" | "trash" | "all">("active");
  const [linkType, setLinkType] = useState<"merchant" | "provider" | "casino" | "research_psp" | "general">("general");
  const [linkId, setLinkId] = useState("");
  const [attachmentTypes, setAttachmentTypes] = useState<Record<string, "offer" | "contract" | "">>({});
  const [attachmentTargetTypes, setAttachmentTargetTypes] = useState<Record<string, "provider" | "merchant">>({});
  const [attachmentTargets, setAttachmentTargets] = useState<Record<string, string>>({});
  const [organizerPriority, setOrganizerPriority] = useState<"low" | "normal" | "high" | "urgent">("normal");
  const [organizerFlagged, setOrganizerFlagged] = useState(false);
  const [organizerFollowUp, setOrganizerFollowUp] = useState("");
  const [organizerNotes, setOrganizerNotes] = useState("");
  const [organizerTags, setOrganizerTags] = useState("");
  const [summaryBusy, setSummaryBusy] = useState(false);
  const [templateId, setTemplateId] = useState("");

  const lastMessageByThread = useMemo(() => {
    const result = new Map<string, EmailMessage>();
    mailCenter.messages.forEach((entry) => result.set(entry.thread_id, entry));
    return result;
  }, [mailCenter.messages]);
  const messageThreadById = useMemo(() => {
    const result = new Map<string, string>();
    mailCenter.messages.forEach((entry) => result.set(entry.id, entry.thread_id));
    return result;
  }, [mailCenter.messages]);
  const attachmentThreadIds = useMemo(() => new Set(mailCenter.attachments
    .map((entry) => messageThreadById.get(entry.message_id))
    .filter((entry): entry is string => Boolean(entry))), [mailCenter.attachments, messageThreadById]);
  const visibleThreads = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return mailCenter.threads.filter((thread) => {
      const lastDirection = lastMessageByThread.get(thread.id)?.direction;
      const scopeMatch = (mailScope === "all" && thread.status !== "trashed")
        || (mailScope === "active" ? !["archived", "trashed"].includes(thread.status)
          : mailScope === "unread" ? !["archived", "trashed"].includes(thread.status) && thread.unread_count > 0
          : mailScope === "inbox" ? !["archived", "trashed"].includes(thread.status) && lastDirection === "inbound"
          : mailScope === "sent" ? !["archived", "trashed"].includes(thread.status) && lastDirection === "outbound"
          : mailScope === "awaiting_reply" ? thread.status === "awaiting_reply"
          : mailScope === "overdue" ? isOverdueThread(thread)
          : mailScope === "flagged" ? Boolean(thread.is_flagged) && isActiveMailThread(thread)
          : mailScope === "follow_up" ? thread.status === "follow_up"
          : mailScope === "attachments" ? !["archived", "trashed"].includes(thread.status) && attachmentThreadIds.has(thread.id)
          : mailScope === "closed" ? thread.status === "closed"
          : mailScope === "archived" ? thread.status === "archived"
          : thread.status === "trashed");
      const last = lastMessageByThread.get(thread.id);
      return scopeMatch && [thread.subject, thread.participant_email, thread.counterparty_type, thread.status, thread.organizer_notes, thread.ai_summary, ...(thread.tags || []), last?.text_body]
        .filter(Boolean).join(" ").toLowerCase().includes(needle);
    }).sort((left, right) => {
      if (Boolean(left.is_flagged) !== Boolean(right.is_flagged)) return left.is_flagged ? -1 : 1;
      const priorityDifference = (priorityWeight[right.priority || "normal"] || 2) - (priorityWeight[left.priority || "normal"] || 2);
      if (priorityDifference) return priorityDifference;
      if (isOverdueThread(left) !== isOverdueThread(right)) return isOverdueThread(left) ? -1 : 1;
      return new Date(right.last_message_at).getTime() - new Date(left.last_message_at).getTime();
    });
  }, [attachmentThreadIds, lastMessageByThread, mailCenter.threads, mailScope, query]);
  const selectedThread = mailCenter.threads.find((thread) => thread.id === threadId) || visibleThreads[0];
  const selectedMessages = selectedThread
    ? mailCenter.messages.filter((entry) => entry.thread_id === selectedThread.id)
    : [];
  const selectedMessageIds = new Set(selectedMessages.map((entry) => entry.id));
  const selectedAttachments = mailCenter.attachments.filter((entry) => selectedMessageIds.has(entry.message_id));
  const lastSelectedMessage = selectedMessages[selectedMessages.length - 1];
  const selectedThreadState = selectedThread ? mailThreadLabels[selectedThread.status] || mailThreadLabels.open : null;
  const selectedTrashExpiresAt = selectedThread?.status === "trashed" ? trashExpiresAt(selectedThread.trashed_at) : null;
  const pendingDrafts = captainsBridge.email_drafts.filter((entry) => ["draft", "failed"].includes(entry.status || "draft"));
  const mailFolderOptions = useMemo(() => {
    const activeThreads = mailCenter.threads.filter((thread) => !["archived", "trashed"].includes(thread.status));
    const countByDirection = (direction: EmailMessage["direction"]) => activeThreads.filter((thread) => lastMessageByThread.get(thread.id)?.direction === direction).length;
    return [
      { id: "active", label: "Все активные", count: activeThreads.length },
      { id: "unread", label: "Непрочитанные", count: activeThreads.filter((thread) => thread.unread_count > 0).length },
      { id: "inbox", label: "Входящие", count: countByDirection("inbound") },
      { id: "sent", label: "Отправленные", count: countByDirection("outbound") },
      { id: "awaiting_reply", label: "Ждём ответ", count: mailCenter.metrics.awaiting_reply },
      { id: "overdue", label: "Просрочено", count: mailCenter.metrics.overdue_follow_up || 0 },
      { id: "flagged", label: "С флагом", count: mailCenter.metrics.flagged || 0 },
      { id: "follow_up", label: "Нужен follow-up", count: mailCenter.metrics.follow_up },
      { id: "attachments", label: "С вложениями", count: activeThreads.filter((thread) => attachmentThreadIds.has(thread.id)).length },
      { id: "closed", label: "Закрытые", count: mailCenter.threads.filter((thread) => thread.status === "closed").length },
      { id: "archived", label: "Архив", count: mailCenter.threads.filter((thread) => thread.status === "archived").length },
      { id: "trash", label: "Корзина", count: mailCenter.metrics.trash || 0 },
      { id: "all", label: "Вся почта", count: mailCenter.threads.filter((thread) => thread.status !== "trashed").length },
    ] as const;
  }, [attachmentThreadIds, lastMessageByThread, mailCenter.metrics.awaiting_reply, mailCenter.metrics.flagged, mailCenter.metrics.follow_up, mailCenter.metrics.overdue_follow_up, mailCenter.metrics.trash, mailCenter.threads]);
  const activeDraft = activeDraftId === null
    ? null
    : captainsBridge.email_drafts.find((entry) => entry.id === activeDraftId) || null;
  const mailQuickFilters = [
    { scope: "unread", label: "новых", count: mailCenter.metrics.unread, numberClass: "text-gray-900 dark:text-white" },
    { scope: "awaiting_reply", label: "ждём ответ", count: mailCenter.metrics.awaiting_reply, numberClass: "text-gray-900 dark:text-white" },
    { scope: "overdue", label: "просрочено", count: mailCenter.metrics.overdue_follow_up || 0, numberClass: "text-error-600" },
    { scope: "flagged", label: "с флагом", count: mailCenter.metrics.flagged || 0, numberClass: "text-warning-600" },
    { scope: "attachments", label: "файлов", count: mailCenter.metrics.attachments_to_review || 0, numberClass: "text-gray-900 dark:text-white" },
  ] as const;

  function openMailScope(scope: typeof mailScope) {
    setSection("mail");
    setMailScope(scope);
    setQuery("");
    setThreadId("");
  }

  useEffect(() => {
    if (!selectedThread) return;
    setLinkType(selectedThread.counterparty_type === "casino" || selectedThread.counterparty_type === "research_psp" || selectedThread.counterparty_type === "provider" || selectedThread.counterparty_type === "merchant" ? selectedThread.counterparty_type : "general");
    setLinkId(selectedThread.lead_id || selectedThread.counterparty_id || "");
    setOrganizerPriority(selectedThread.priority || "normal");
    setOrganizerFlagged(Boolean(selectedThread.is_flagged));
    setOrganizerFollowUp(toDateTimeLocal(selectedThread.follow_up_at));
    setOrganizerNotes(selectedThread.organizer_notes || "");
    setOrganizerTags((selectedThread.tags || []).join(", "));
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

  useEffect(() => {
    const rawDraftId = searchParams.get("draft");
    if (!rawDraftId) return;
    const requestedDraftId = Number(rawDraftId);
    if (!Number.isInteger(requestedDraftId) || requestedDraftId <= 0) {
      setMessage({ error: true, text: "Некорректный ID черновика." });
      return;
    }
    if (activeDraftId === requestedDraftId) return;
    const requestedDraft = captainsBridge.email_drafts.find((entry) => entry.id === requestedDraftId);
    if (!requestedDraft) {
      if (ready) setMessage({ error: true, text: `Черновик #${requestedDraftId} не найден или недоступен.` });
      return;
    }
    if (!["draft", "failed"].includes(requestedDraft.status || "draft")) {
      setMessage({ error: true, text: `Черновик #${requestedDraftId} уже имеет статус «${statusLabels[String(requestedDraft.status || "unknown")] || requestedDraft.status}» и не может быть отправлен повторно.` });
      setSection("mail");
      return;
    }
    setActiveDraftId(requestedDraft.id);
    setTo(requestedDraft.to_email || "");
    setSubject(requestedDraft.subject || "");
    setBody(requestedDraft.body || "");
    setLeadId(/^[0-9a-f-]{36}$/i.test(requestedDraft.lead_internal_id || "") ? requestedDraft.lead_internal_id || "" : "");
    setMessage({ text: `Черновик #${requestedDraft.id} открыт для проверки.` });
    setSection("compose");
  }, [activeDraftId, captainsBridge.email_drafts, ready, searchParams]);

  function closeDraft() {
    const next = new URLSearchParams(searchParams);
    next.delete("draft");
    setSearchParams(next, { replace: true });
    setActiveDraftId(null);
    setTo(""); setSubject(""); setBody(""); setLeadId("");
    setSection("mail");
  }

  async function sendEmail(returnToThread = false) {
    if (!to.trim() || !subject.trim() || !body.trim()) { setMessage({ error: true, text: "Заполните получателя, тему и текст." }); return; }
    setBusy(true); setMessage(null);
    let draftId = activeDraftId;
    if (draftId !== null) {
      const updated = await supabase.rpc("update_offerpsp_email_draft", {
        p_draft_id: draftId,
        p_to_email: to,
        p_subject: subject,
        p_body: body,
      });
      if (updated.error) { setMessage({ error: true, text: updated.error.message }); setBusy(false); return; }
    } else {
      const created = await supabase.rpc("create_offerpsp_email_draft", { p_lead_id: leadId || null, p_to_email: to, p_subject: subject, p_body: body });
      if (created.error) { setMessage({ error: true, text: created.error.message }); setBusy(false); return; }
      draftId = Number((created.data as {id?:number})?.id);
      if (!Number.isFinite(draftId)) { setMessage({ error: true, text: "Черновик создан без корректного ID. Отправка остановлена, чтобы не потерять историю." }); setBusy(false); return; }
    }
    const sendingState = await supabase.rpc("set_offerpsp_email_draft_status", { p_draft_id: draftId, p_status: "sending" });
    if (sendingState.error) { setMessage({ error: true, text: `Черновик создан, но отправка остановлена: статус не записан (${sendingState.error.message}).` }); setBusy(false); return; }
    const session = await supabase.auth.getSession();
    try {
      const response = await fetch("/api/send-email", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.data.session?.access_token || ""}` }, body: JSON.stringify({ to, subject, body, lead_id: leadId || null }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) throw new Error(result.error || result.message || "Email sender returned an error");
      const sentState = await supabase.rpc("set_offerpsp_email_draft_status", { p_draft_id: draftId, p_status: "sent" });
      setMessage(sentState.error
        ? { error: true, text: `Письмо доставлено на ${to}, но статус в почтовом центре не записан: ${sentState.error.message}` }
        : { text: `Письмо отправлено на ${to} и записано в почтовом центре.` });
      if (!sentState.error && activeDraftId !== null) closeDraft();
      else if (!sentState.error) { setSubject(""); setBody(""); }
    } catch (error) {
      const failedState = await supabase.rpc("set_offerpsp_email_draft_status", { p_draft_id: draftId, p_status: "failed" });
      const deliveryError = error instanceof Error ? error.message : "Не удалось отправить письмо";
      setMessage({ error: true, text: failedState.error ? `${deliveryError}. Статус ошибки также не записан: ${failedState.error.message}` : deliveryError });
    }
    await refresh();
    if (returnToThread) setSection("mail");
    setBusy(false);
  }

  async function openThread(id: string) {
    setThreadId(id); setSection("mail");
    const thread = mailCenter.threads.find((item) => item.id === id);
    if (thread?.unread_count) {
      setBusy(true);
      const result = await supabase.rpc("set_offerpsp_email_thread_state", { p_thread_id: id, p_status: thread.status, p_mark_read: true });
      if (result.error) setMessage({ error: true, text: `Переписка открыта, но отметка о прочтении не записана: ${result.error.message}` });
      await refresh();
      setBusy(false);
    }
  }

  async function changeThreadState(status: "open" | "awaiting_reply" | "follow_up" | "closed" | "archived" | "trashed" | "restore") {
    if (!selectedThread) return;
    setBusy(true); setMessage(null);
    const result = await supabase.rpc("set_offerpsp_email_thread_state", { p_thread_id: selectedThread.id, p_status: status, p_mark_read: null });
    setMessage(result.error
      ? { error: true, text: result.error.message }
      : { text: status === "trashed"
        ? "Переписка перемещена в корзину и будет окончательно удалена через 15 дней."
        : status === "restore" ? "Переписка восстановлена из корзины." : "Статус переписки обновлён." });
    if (!result.error && ["trashed", "restore"].includes(status)) setThreadId("");
    await refresh(); setBusy(false);
  }

  async function setThreadReadState(markRead: boolean) {
    if (!selectedThread) return;
    setBusy(true); setMessage(null);
    const result = await supabase.rpc("set_offerpsp_email_thread_state", {
      p_thread_id: selectedThread.id,
      p_status: selectedThread.status,
      p_mark_read: markRead,
    });
    setMessage(result.error
      ? { error: true, text: result.error.message }
      : { text: markRead ? "Переписка помечена прочитанной." : "Переписка возвращена в непрочитанные." });
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

  async function saveOrganizer(patch?: Record<string, unknown>, successText = "Органайзер переписки сохранён.") {
    if (!selectedThread) return;
    const tags = organizerTags.split(",").map((tag) => tag.trim()).filter(Boolean);
    setBusy(true); setMessage(null);
    const result = await supabase.rpc("update_offerpsp_email_thread_organizer", {
      p_thread_id: selectedThread.id,
      p_patch: patch || {
        priority: organizerPriority,
        is_flagged: organizerFlagged,
        follow_up_at: organizerFollowUp ? new Date(organizerFollowUp).toISOString() : null,
        organizer_notes: organizerNotes || null,
        tags,
      },
    });
    setMessage(result.error ? { error: true, text: result.error.message } : { text: successText });
    await refresh(); setBusy(false);
  }

  function setFollowUpPreset(days: number | null) {
    if (days === null) { setOrganizerFollowUp(""); return; }
    const target = new Date();
    target.setDate(target.getDate() + days);
    target.setHours(10, 0, 0, 0);
    setOrganizerFollowUp(toDateTimeLocal(target.toISOString()));
  }

  async function generateAiSummary() {
    if (!selectedThread || !selectedMessages.length || summaryBusy) return;
    setSummaryBusy(true); setMessage(null);
    try {
      const conversation = selectedMessages.map((entry) => {
        const content = (entry.text_body || stripHtml(entry.html_body || "") || "(empty message)").trim().slice(0, 1400);
        return `[${entry.direction === "outbound" ? "OfferPSP → partner" : "Partner → OfferPSP"}; ${messageDate(entry)}]\n${content}`;
      }).join("\n\n").slice(-5000);
      const prompt = `Составь краткое рабочее резюме этой email-цепочки для почтового органайзера OfferPSP. Только факты из писем, ничего не придумывай. Язык ответа — русский. Формат: 4–6 коротких пунктов: текущая ситуация; что хочет контрагент; что обещал OfferPSP; следующий шаг; срок; риски или неизвестные. Если данных нет, прямо напиши «не указано».\n\nТема: ${selectedThread.subject}\nКонтрагент: ${selectedThread.participant_email}\n\n${conversation}`;
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) throw new Error("Сессия истекла. Войди в Радиорубку заново.");
      const response = await fetch("/api/aibot-command", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          message: prompt,
          session_id: `mail-summary-${selectedThread.id}`,
          context: { path: "/communications", page: "Радиорубка", entity_type: "email_thread", entity_id: selectedThread.id, entity_name: selectedThread.subject },
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.success === false) throw new Error(payload.error || "AIBot не подготовил резюме.");
      const summary = stripHtml(String(payload.answer || payload.message || payload.output || "")).replace(/\*\*/g, "").trim();
      if (!summary) throw new Error("AIBot вернул пустое резюме.");
      const saved = await supabase.rpc("update_offerpsp_email_thread_organizer", {
        p_thread_id: selectedThread.id,
        p_patch: { ai_summary: summary },
      });
      if (saved.error) throw new Error(`Резюме получено, но не сохранено: ${saved.error.message}`);
      setMessage({ text: "AI-резюме цепочки создано и сохранено." });
      await refresh();
    } catch (error) {
      setMessage({ error: true, text: error instanceof Error ? error.message : "Не удалось создать AI-резюме." });
    } finally {
      setSummaryBusy(false);
    }
  }

  async function downloadAttachment(attachmentId: string) {
    const attachment = mailCenter.attachments.find((entry) => entry.id === attachmentId);
    if (!attachment) return;
    setBusy(true); setMessage(null);
    const signed = await supabase.storage.from(attachment.storage_bucket).createSignedUrl(attachment.storage_path, 60);
    if (signed.error || !signed.data?.signedUrl) setMessage({ error: true, text: signed.error?.message || "Не удалось открыть приватный файл." });
    else window.open(signed.data.signedUrl, "_blank", "noopener,noreferrer");
    setBusy(false);
  }

  async function classifyAttachment(attachmentId: string) {
    const attachment = mailCenter.attachments.find((entry) => entry.id === attachmentId);
    if (!attachment) return;
    const documentType = attachmentTypes[attachmentId] || "";
    if (!documentType) { setMessage({ error: true, text: "Сначала укажите: это оффер или договор." }); return; }
    const inheritedMerchantId = selectedThread?.lead_id || (selectedThread?.counterparty_type === "merchant" ? selectedThread.counterparty_id : null);
    const inheritedProviderId = attachment.provider_id || (selectedThread?.counterparty_type === "provider" ? selectedThread.counterparty_id : null);
    const targetType = documentType === "offer"
      ? "provider"
      : (attachmentTargetTypes[attachmentId] || (inheritedMerchantId ? "merchant" : "provider"));
    const targetId = attachmentTargets[attachmentId]
      || (targetType === "merchant" ? inheritedMerchantId : inheritedProviderId)
      || "";
    if (!targetId) { setMessage({ error: true, text: `Выберите компанию, к которой сохранить ${documentType === "offer" ? "оффер" : "договор"}.` }); return; }
    setBusy(true); setMessage(null);
    const result = await supabase.rpc("classify_offerpsp_email_attachment", {
      p_attachment_id: attachmentId,
      p_document_type: documentType,
      p_provider_id: targetType === "provider" ? targetId : null,
      p_lead_id: targetType === "merchant" ? targetId : null,
    });
    setMessage(result.error
      ? { error: true, text: result.error.message }
      : { text: documentType === "offer"
        ? "Оффер сохранён и отправлен в очередь разбора. Публикация отключена до ручной проверки."
        : "Договор сохранён в документах выбранной компании." });
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

  function templateCompany() {
    if (selectedThread?.counterparty_type === "provider" && selectedThread.counterparty_id) {
      const provider = providers.find((entry) => entry.id === selectedThread.counterparty_id);
      if (provider?.brand_name) return provider.brand_name;
    }
    const domain = (selectedThread?.participant_email || to).split("@")[1];
    return domain ? domain.split(".")[0].replace(/[-_]+/g, " ") : "your team";
  }

  function applyTemplate(template: EmailTemplate) {
    const replacements: Record<string, string> = {
      "{{company}}": templateCompany(),
      "{{contact_name}}": "Team",
      "{{subject}}": selectedThread?.subject || subject || "our partnership enquiry",
    };
    const render = (value: string) => Object.entries(replacements).reduce((result, [key, replacement]) => result.split(key).join(replacement), value);
    setTemplateId(template.id);
    setSubject(render(template.subject_template));
    setBody(render(template.body_template));
    if (selectedThread) {
      setTo(selectedThread.participant_email);
      setLeadId(selectedThread.lead_id || "");
    }
    setMessage({ text: `Шаблон «${template.name}» применён. Проверьте и персонализируйте письмо перед отправкой.` });
  }

  const linkOptions = linkType === "merchant"
    ? leads.filter((lead) => lead.record_state !== "archived").map((lead) => ({ id: lead.lead_id, label: `${lead.company || lead.name || "Мерч"} · ${lead.work_email || "нет email"}` }))
    : linkType === "casino"
      ? captainsBridge.casino_leads.filter((item) => item.record_state !== "archived").map((item) => ({ id: String(item.id), label: item.name || item.website || `Casino ${item.id}` }))
      : linkType === "research_psp"
        ? captainsBridge.psp_providers.filter((item) => item.record_state !== "archived").map((item) => ({ id: String(item.id), label: item.name || item.website || `PSP ${item.id}` }))
        : linkType === "provider"
          ? providers.filter((provider) => provider.relationship_status !== "archived").map((provider) => ({ id: provider.id, label: provider.brand_name }))
          : [];

  function renderAttachment(attachment: EmailAttachment) {
    const documentType = attachmentTypes[attachment.id] || attachment.document_type || "";
    const inheritedMerchantId = selectedThread?.lead_id || (selectedThread?.counterparty_type === "merchant" ? selectedThread.counterparty_id : null);
    const inheritedProviderId = attachment.provider_id || (selectedThread?.counterparty_type === "provider" ? selectedThread.counterparty_id : null);
    const targetType = documentType === "offer"
      ? "provider"
      : (attachmentTargetTypes[attachment.id] || (inheritedMerchantId ? "merchant" : "provider"));
    const targetId = attachmentTargets[attachment.id]
      || (targetType === "merchant" ? inheritedMerchantId : inheritedProviderId)
      || "";
    const inherited = Boolean(targetId && !attachmentTargets[attachment.id]);
    const targetOptions = targetType === "provider"
      ? providers.filter((provider) => provider.relationship_status !== "archived").map((provider) => ({ id: provider.id, label: provider.brand_name }))
      : leads.filter((lead) => lead.record_state !== "archived").map((lead) => ({ id: lead.lead_id, label: `${lead.company || lead.name || "Мерч"} · ${lead.work_email || "нет email"}` }));
    const classified = Boolean(attachment.document_type);

    return <div key={attachment.id} className="rounded-xl bg-gray-50 p-3 dark:bg-white/[0.04]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <strong className="text-sm text-gray-900 dark:text-white">{attachment.filename}</strong>
          <span className="mt-1 block text-xs text-gray-400">{Math.ceil(attachment.size_bytes / 1024)} KB · {humanizeCode(attachment.status)}{attachment.provider_name ? ` · ${attachment.provider_name}` : ""}</span>
          {attachment.extraction_error && <span className="mt-1 block text-xs text-error-500">{attachment.extraction_error}</span>}
        </div>
        <button disabled={busy} onClick={() => void downloadAttachment(attachment.id)} className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold dark:border-gray-700">Скачать оригинал</button>
      </div>
      {classified ? <div className="mt-3 rounded-lg border border-success-200 bg-success-50 px-3 py-2 text-xs text-success-700 dark:bg-success-500/10">
        {attachment.document_type === "offer" ? "Оффер" : "Договор"} сохранён: {attachment.target_entity_name || attachment.provider_name || "компания привязана"}
      </div> : <div className="mt-3 space-y-2">
        <div className="grid gap-2 md:grid-cols-2">
          <select className={field} value={documentType} onChange={(event) => setAttachmentTypes((current) => ({ ...current, [attachment.id]: event.target.value as "offer" | "contract" | "" }))}>
            <option value="">Что это за файл?</option>
            <option value="offer">Оффер</option>
            <option value="contract">Договор</option>
          </select>
          {documentType === "contract" && <select className={field} value={targetType} onChange={(event) => { const value = event.target.value as "provider" | "merchant"; setAttachmentTargetTypes((current) => ({ ...current, [attachment.id]: value })); setAttachmentTargets((current) => ({ ...current, [attachment.id]: "" })); }}>
            <option value="provider">Договор с PSP</option>
            <option value="merchant">Договор с мерчем</option>
          </select>}
        </div>
        {documentType && <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
          <div>
            <select className={field} value={targetId} onChange={(event) => setAttachmentTargets((current) => ({ ...current, [attachment.id]: event.target.value }))}>
              <option value="">Выберите компанию</option>
              {targetOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
            </select>
            {inherited && <span className="mt-1 block text-xs text-success-600">Компания определена по переписке. При необходимости можно изменить.</span>}
          </div>
          <button disabled={busy || !targetId || (documentType === "offer" && !attachment.has_extracted_text)} onClick={() => void classifyAttachment(attachment.id)} className="rounded-lg bg-brand-500 px-4 py-2 text-xs font-semibold text-white disabled:opacity-40">
            {documentType === "offer" ? "Сохранить оффер" : "Сохранить договор"}
          </button>
        </div>}
        {documentType === "offer" && !attachment.has_extracted_text && <p className="text-xs text-warning-600">Текст не извлечён: нужен OCR или ручной разбор оригинала.</p>}
        {!documentType && <p className="text-xs text-gray-500">Сначала выберите тип файла. Ничего не публикуется автоматически.</p>}
      </div>}
    </div>;
  }

  return <Frame title="Радиорубка" description="Почта и партнёрские коммуникации OfferPSP."><PageHeading eyebrow="Captain's Bridge / Radio room" title="Радиорубка" description="Почта, цепочки переговоров и следующий шаг по каждой партнёрской коммуникации." action={<button onClick={()=>setSection("compose")} className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white">+ Новое письмо</button>}/>
    {message&&<div className={`mb-4 rounded-xl border px-4 py-3 text-sm ${message.error?"border-error-200 bg-error-50 text-error-700":"border-success-200 bg-success-50 text-success-700"}`}>{message.text}</div>}
    <Panel className="mb-4"><div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between"><div className="flex flex-wrap gap-2">{[
      ["mail", "Радиорубка", `${mailCenter.metrics.threads} цепочек`],
      ["compose", "Написать", "bizdev@offerpsp.com"],
      ["telegram", "Telegram / AIBot", `${captainsBridge.telegram_log.length} сообщений`],
    ].map(([id,label,hint])=><button key={id} onClick={()=>setSection(id as typeof section)} className={`rounded-xl border px-4 py-2.5 text-left transition ${section===id?"border-brand-300 bg-brand-50 text-brand-700 dark:border-brand-500/40 dark:bg-brand-500/10 dark:text-brand-300":"border-gray-200 bg-white text-gray-600 hover:border-gray-300 dark:border-gray-700 dark:bg-transparent dark:text-gray-300"}`}><strong className="block text-sm">{label}</strong><span className="mt-0.5 block text-[11px] text-gray-400">{hint}</span></button>)}</div><div aria-label="Быстрые фильтры почты" className="flex flex-wrap gap-1 text-xs text-gray-500 dark:text-gray-400">{mailQuickFilters.map((item)=>{const active=section==="mail"&&mailScope===item.scope;return <button key={item.scope} type="button" aria-pressed={active} title={`Открыть: ${item.label}`} onClick={()=>openMailScope(item.scope)} className={`group rounded-xl border px-3 py-2 text-left transition ${active?"border-brand-300 bg-brand-50 shadow-theme-xs dark:border-brand-500/40 dark:bg-brand-500/10":"border-transparent hover:border-gray-200 hover:bg-gray-50 dark:hover:border-gray-700 dark:hover:bg-white/5"}`}><strong className={`text-base ${item.numberClass}`}>{item.count}</strong> {item.label}<span aria-hidden="true" className={`ml-1 inline-block transition ${active?"translate-x-0 opacity-100":"-translate-x-1 opacity-0 group-hover:translate-x-0 group-hover:opacity-100"}`}>→</span></button>})}</div></div>
      {pendingDrafts.length>0&&<div className="mt-4 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-4 dark:border-gray-800"><span className="mr-1 text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">Черновики</span>{pendingDrafts.map((draft)=><button key={draft.id} type="button" onClick={()=>setSearchParams({draft:String(draft.id)})} className="max-w-64 rounded-lg border border-gray-200 px-3 py-2 text-left hover:border-brand-300 dark:border-gray-700"><strong className="block truncate text-xs text-gray-800 dark:text-gray-200">{draft.subject || `Черновик #${draft.id}`}</strong><span className="block truncate text-[11px] text-gray-400">{draft.to_email || "нет получателя"}</span></button>)}</div>}
    </Panel>
    {section === "mail" ? <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-[390px_minmax(0,1fr)] 2xl:grid-cols-[190px_350px_minmax(0,1fr)]">
      <Panel className="hidden min-w-0 2xl:block"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Папки</p><nav className="mt-3 space-y-1">{mailFolderOptions.map((folder)=><button key={folder.id} onClick={()=>setMailScope(folder.id)} className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition ${mailScope===folder.id?"bg-brand-50 font-semibold text-brand-700 dark:bg-brand-500/10 dark:text-brand-300":"text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/5"}`}><span>{folder.label}</span><span className="text-xs text-gray-400">{folder.count}</span></button>)}<button onClick={()=>pendingDrafts[0]?setSearchParams({draft:String(pendingDrafts[0].id)}):setSection("compose")} className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/5"><span>Черновики</span><span className="text-xs text-gray-400">{pendingDrafts.length}</span></button></nav></Panel>
      <Panel className="min-w-0"><div className="flex items-center justify-between gap-3"><div><h2 className="text-base font-semibold text-gray-900 dark:text-white">Переписки</h2><p className="mt-1 text-xs text-gray-400">{visibleThreads.length} в текущем списке</p></div><select aria-label="Папка почты" className="h-10 rounded-lg border border-gray-300 bg-transparent px-3 text-xs text-gray-700 outline-none dark:border-gray-700 dark:text-gray-200 2xl:hidden" value={mailScope} onChange={(event)=>setMailScope(event.target.value as typeof mailScope)}>{mailFolderOptions.map((folder)=><option key={folder.id} value={folder.id}>{folder.label} · {folder.count}</option>)}</select></div><input className={`${field} mt-4`} value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="Поиск по теме, email, заметке или тексту…"/><div className="mt-3 max-h-[760px] space-y-1 overflow-y-auto pr-1">{visibleThreads.map((thread)=>{const last=lastMessageByThread.get(thread.id);const outbound=last?.direction==="outbound";const overdue=isOverdueThread(thread);return <button key={thread.id} onClick={()=>void openThread(thread.id)} className={`w-full rounded-xl border px-3 py-3 text-left transition ${selectedThread?.id===thread.id?"border-brand-200 bg-brand-50 dark:border-brand-500/30 dark:bg-brand-500/10":"border-transparent hover:border-gray-200 hover:bg-gray-50 dark:hover:border-gray-700 dark:hover:bg-white/[0.03]"}`}><div className="flex items-start justify-between gap-3"><span className={`text-[11px] font-semibold uppercase tracking-wide ${outbound?"text-brand-600":"text-success-600"}`}>{outbound?"Исходящее →":"← Входящее"}</span><span className="shrink-0 text-[11px] text-gray-400">{formatDate(last ? messageDate(last) : thread.last_message_at)}</span></div><strong className="mt-1.5 block line-clamp-1 text-sm text-gray-900 dark:text-white">{thread.subject || "Без темы"}</strong><span className="mt-1 block truncate text-xs text-gray-500">{thread.participant_email}</span><p className="mt-2 line-clamp-2 text-xs leading-5 text-gray-400">{last?.text_body || (last?.html_body ? "HTML-письмо" : "Сообщений в цепочке пока нет")}</p><div className="mt-2 flex flex-wrap gap-1.5">{thread.is_flagged&&<span className="rounded-full bg-warning-50 px-2 py-0.5 text-[10px] font-semibold text-warning-700">⚑ Флаг</span>}{thread.priority&&!["normal","low"].includes(thread.priority)&&<span className="rounded-full bg-error-50 px-2 py-0.5 text-[10px] font-semibold text-error-700">{priorityLabels[thread.priority]}</span>}{thread.follow_up_at&&<span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${overdue?"bg-error-50 text-error-700":"bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300"}`}>{overdue?"Просрочено":"До"} {formatDate(thread.follow_up_at)}</span>}</div><div className="mt-2 flex items-center justify-between gap-2"><span className="text-[11px] font-medium text-gray-500">{mailThreadLabels[thread.status]?.label || humanizeCode(thread.status)}</span>{thread.unread_count>0&&<span className="rounded-full bg-brand-500 px-2 py-0.5 text-[11px] font-semibold text-white">{thread.unread_count} новых</span>}</div></button>})}{!visibleThreads.length&&<EmptyState title="Писем не найдено" description="Измените папку, поиск или создайте новое письмо."/>}</div></Panel>
      <Panel className="min-w-0">{selectedThread && selectedThreadState ? <>
        <div className="flex flex-col gap-4 border-b border-gray-100 pb-5 dark:border-gray-800 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${lastSelectedMessage?.direction==="outbound"?"border-brand-200 bg-brand-50 text-brand-700 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-300":"border-success-200 bg-success-50 text-success-700 dark:border-success-500/30 dark:bg-success-500/10 dark:text-success-300"}`}>{lastSelectedMessage?.direction==="outbound"?"Последнее: исходящее":"Последнее: входящее"}</span>
              <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${selectedThreadState.className}`}>{selectedThreadState.label}</span>
            </div>
            <h2 className="mt-3 text-xl font-semibold leading-tight text-gray-900 dark:text-white">{selectedThread.subject || "Без темы"}</h2>
            <p className="mt-2 text-sm text-gray-500"><strong className="text-gray-700 dark:text-gray-200">OfferPSP</strong> ↔ {selectedThread.participant_email}</p>
            <p className="mt-1 text-xs text-gray-400">Цепочка · {selectedMessages.length} {selectedMessages.length===1?"письмо":"писем"} · {selectedThreadState.hint}</p>
          </div>
          {selectedThread.status === "trashed"
            ? <button disabled={busy} onClick={()=>void changeThreadState("restore")} className="shrink-0 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">Восстановить</button>
            : <button onClick={startReply} className="shrink-0 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white">{lastSelectedMessage?.direction==="inbound"?"Ответить":"Написать follow-up"}</button>}
        </div>
        {selectedThread.status === "trashed" ? <div className="mt-4 flex flex-col gap-3 rounded-xl border border-error-200 bg-error-50 p-4 text-error-700 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-300 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <strong className="text-sm">Переписка находится в корзине</strong>
            <p className="mt-1 text-xs">{selectedTrashExpiresAt ? `Окончательное удаление: ${formatDate(selectedTrashExpiresAt)}.` : "Она будет окончательно удалена через 15 дней."} Новое письмо от собеседника восстановит цепочку автоматически.</p>
          </div>
          <button disabled={busy} onClick={()=>void changeThreadState("restore")} className="shrink-0 rounded-lg border border-error-300 bg-white px-3 py-2 text-xs font-semibold text-error-700 disabled:opacity-40 dark:bg-transparent dark:text-error-300">Восстановить</button>
        </div> : <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs font-semibold uppercase tracking-[0.12em] text-gray-400">Статус</span>
          <button disabled={busy} onClick={()=>void changeThreadState("open")} className={`rounded-lg border px-3 py-2 text-xs font-semibold ${selectedThread.status==="open"?"border-gray-400 bg-gray-100":"border-gray-200"} dark:border-gray-700`}>В работе</button>
          <button disabled={busy} onClick={()=>void changeThreadState("awaiting_reply")} className={`rounded-lg border px-3 py-2 text-xs font-semibold ${selectedThread.status==="awaiting_reply"?"border-brand-300 bg-brand-50 text-brand-700":"border-gray-200"} dark:border-gray-700`}>Ждём ответ</button>
          <button disabled={busy} onClick={()=>void changeThreadState("follow_up")} className={`rounded-lg border px-3 py-2 text-xs font-semibold ${selectedThread.status==="follow_up"?"border-warning-300 bg-warning-50 text-warning-700":"border-gray-200"} dark:border-gray-700`}>Нужен follow-up</button>
          <button disabled={busy} onClick={()=>void changeThreadState("closed")} className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold dark:border-gray-700">Закрыть</button>
          <button disabled={busy} onClick={()=>void changeThreadState("archived")} className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-500 dark:border-gray-700">В архив</button>
          <button disabled={busy || !selectedMessages.some((entry)=>entry.direction==="inbound")} title={selectedMessages.some((entry)=>entry.direction==="inbound") ? undefined : "В цепочке нет входящего письма"} onClick={()=>void setThreadReadState(selectedThread.unread_count > 0)} className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-500 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-700">{selectedThread.unread_count > 0 ? "Прочитано" : "Вернуть в непрочитанные"}</button>
          <button disabled={busy} title="Переместить в корзину на 15 дней" onClick={()=>void changeThreadState("trashed")} className="rounded-lg border border-error-200 px-3 py-2 text-xs font-semibold text-error-600 hover:bg-error-50 disabled:opacity-40 dark:border-error-500/30 dark:text-error-300 dark:hover:bg-error-500/10">Удалить</button>
        </div>}
        <section className="mt-4 rounded-xl border border-gray-200 bg-gray-50/80 p-4 dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div><h3 className="text-sm font-semibold text-gray-900 dark:text-white">Органайзер цепочки</h3><p className="mt-1 text-xs text-gray-500">Приоритет, срок и следующий шаг остаются рядом с перепиской.</p></div><button disabled={busy} onClick={()=>void saveOrganizer()} className="rounded-lg bg-gray-900 px-4 py-2 text-xs font-semibold text-white disabled:opacity-40 dark:bg-white dark:text-gray-900">Сохранить органайзер</button></div>
          <div className="mt-4 grid gap-3 lg:grid-cols-[140px_160px_minmax(0,1fr)]"><button type="button" onClick={()=>setOrganizerFlagged((value)=>!value)} className={`h-11 rounded-lg border px-3 text-sm font-semibold ${organizerFlagged?"border-warning-300 bg-warning-50 text-warning-700":"border-gray-300 bg-white text-gray-600 dark:border-gray-700 dark:bg-transparent dark:text-gray-300"}`}>{organizerFlagged?"⚑ С флагом":"⚐ Поставить флаг"}</button><select aria-label="Приоритет письма" className={field} value={organizerPriority} onChange={(event)=>setOrganizerPriority(event.target.value as typeof organizerPriority)}><option value="low">Низкий приоритет</option><option value="normal">Обычный приоритет</option><option value="high">Высокий приоритет</option><option value="urgent">Срочно</option></select><input aria-label="Срок follow-up" className={field} type="datetime-local" value={organizerFollowUp} onChange={(event)=>setOrganizerFollowUp(event.target.value)}/></div>
          <div className="mt-2 flex flex-wrap items-center gap-2"><span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-400">Follow-up</span>{[[1,"Завтра"],[3,"+3 дня"],[7,"+7 дней"]].map(([days,label])=><button key={String(days)} type="button" onClick={()=>setFollowUpPreset(Number(days))} className="rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-600 dark:border-gray-700 dark:bg-transparent dark:text-gray-300">{label}</button>)}<button type="button" onClick={()=>setFollowUpPreset(null)} className="rounded-md border border-gray-200 px-2.5 py-1.5 text-xs text-gray-400 dark:border-gray-700">Очистить</button></div>
          <div className="mt-3 grid gap-3 lg:grid-cols-2"><textarea className="min-h-24 w-full rounded-lg border border-gray-300 bg-white px-3 py-3 text-sm text-gray-800 outline-none focus:border-brand-400 dark:border-gray-700 dark:bg-transparent dark:text-white" value={organizerNotes} onChange={(event)=>setOrganizerNotes(event.target.value)} placeholder="Рабочая заметка: о чём договорились, что проверить…"/><div className="space-y-3"><input className={field} value={organizerTags} onChange={(event)=>setOrganizerTags(event.target.value)} placeholder="Теги через запятую: Cyprus, Open Banking…"/><div className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900"><div className="flex items-center justify-between gap-3"><strong className="text-xs text-gray-800 dark:text-gray-200">AI-резюме</strong><div className="flex items-center gap-3">{selectedThread.ai_summary&&<button disabled={summaryBusy || busy} onClick={()=>void saveOrganizer({ai_summary:null}, "AI-резюме удалено.")} className="text-xs font-semibold text-gray-400 disabled:opacity-40">Удалить</button>}<button disabled={summaryBusy || busy || !selectedMessages.length} onClick={()=>void generateAiSummary()} className="text-xs font-semibold text-brand-600 disabled:opacity-40">{summaryBusy?"Анализирую…":selectedThread.ai_summary?"Обновить":"Создать"}</button></div></div><p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-gray-500 dark:text-gray-300">{selectedThread.ai_summary || "Кратко соберёт договорённости, следующий шаг, срок и риски — только из этой цепочки."}</p>{selectedThread.ai_summary_generated_at&&<span className="mt-2 block text-[10px] text-gray-400">Обновлено {formatDate(selectedThread.ai_summary_generated_at)}</span>}</div></div></div>
        </section>
        <details className="mt-4 rounded-xl border border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-white/[0.03]"><summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-gray-700 dark:text-gray-200">Рабочая привязка: {counterpartyLabels[selectedThread.counterparty_type] || humanizeCode(selectedThread.counterparty_type)}</summary><div className="grid gap-3 border-t border-gray-200 p-4 dark:border-gray-800 md:grid-cols-[160px_minmax(0,1fr)_auto]"><select className={field} value={linkType} onChange={(event)=>{setLinkType(event.target.value as typeof linkType);setLinkId("");}}><option value="general">Без привязки</option><option value="merchant">Мерч</option><option value="casino">Казино</option><option value="provider">PSP</option><option value="research_psp">PSP из базы AIBot</option></select><select className={field} value={linkId} disabled={linkType==="general"} onChange={(event)=>setLinkId(event.target.value)}><option value="">Выберите карточку</option>{linkOptions.map((option)=><option key={option.id} value={option.id}>{option.label}</option>)}</select><button disabled={busy} onClick={()=>void saveThreadLink()} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold dark:border-gray-700">Сохранить</button></div></details>
        <div className="mt-5 max-h-[650px] space-y-5 overflow-y-auto pr-1">{selectedMessages.map((entry)=>{const attachments=selectedAttachments.filter((attachment)=>attachment.message_id===entry.id);const outbound=entry.direction==="outbound";return <article key={entry.id} className={`max-w-[94%] rounded-2xl border p-4 ${outbound?"ml-auto border-brand-200 bg-brand-50/70 dark:border-brand-500/25 dark:bg-brand-500/10":"mr-auto border-gray-200 bg-white shadow-theme-xs dark:border-gray-700 dark:bg-gray-900"}`}><header className="flex flex-col gap-2 border-b border-black/5 pb-3 dark:border-white/10 sm:flex-row sm:items-start sm:justify-between"><div><strong className={`text-xs uppercase tracking-[0.12em] ${outbound?"text-brand-600":"text-success-600"}`}>{outbound?"Исходящее письмо →":"← Входящее письмо"}</strong><p className="mt-1 text-xs text-gray-500">От: <span className="font-medium text-gray-700 dark:text-gray-200">{entry.sender_email}</span></p><p className="mt-0.5 text-xs text-gray-500">Кому: <span className="font-medium text-gray-700 dark:text-gray-200">{entry.recipient_emails.join(", ") || "не указано"}</span></p></div><div className="text-left sm:text-right"><span className="block text-xs text-gray-400">{formatDate(messageDate(entry))}</span><span className="mt-1 block text-[11px] text-gray-400">{outbound?`${humanizeCode(entry.delivery_status)} · ${entry.provider}`:entry.is_read?"Прочитано":"Не прочитано"}</span></div></header><p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-gray-700 dark:text-gray-200">{entry.text_body || (entry.html_body ? "HTML-письмо без текстовой версии" : "Пустое письмо")}</p>{attachments.length>0&&<div className="mt-4 space-y-3 border-t border-gray-100 pt-4 dark:border-gray-800">{attachments.map((attachment)=>renderAttachment(attachment))}</div>}</article>})}</div>
      </> : <EmptyState title="Выберите переписку" description="Откройте цепочку слева или создайте новое письмо."/>}</Panel>
    </div> : section === "compose"
        ? <Panel><div className="flex items-start justify-between gap-4"><div><h2 className="text-lg font-semibold text-gray-900 dark:text-white">{activeDraft ? `Черновик #${activeDraft.id}` : selectedThread && to===selectedThread.participant_email ? "Ответ на письмо" : "Новое письмо"}</h2><p className="mt-1 text-sm text-gray-500">Отправитель: <strong className="text-gray-700 dark:text-gray-200">bizdev@offerpsp.com</strong> · доставка через n8n.</p>{activeDraft&&<p className="mt-1 text-xs font-semibold text-brand-500">Редактируется существующая запись — новый черновик создан не будет.</p>}</div><button onClick={activeDraft?closeDraft:()=>setSection("mail")} className="text-sm text-gray-500">{activeDraft?"Закрыть черновик":"К перепискам"}</button></div><div className="mt-5 space-y-4">{mailCenter.templates.length>0&&<div className="rounded-xl border border-brand-100 bg-brand-50/60 p-4 dark:border-brand-500/20 dark:bg-brand-500/5"><label className="text-xs font-semibold uppercase tracking-[0.12em] text-brand-600" htmlFor="mail-template">Рабочий шаблон</label><select id="mail-template" className={`${field} mt-2 bg-white dark:bg-gray-900`} value={templateId} onChange={(event)=>{const template=mailCenter.templates.find((entry)=>entry.id===event.target.value);if(template)applyTemplate(template);else setTemplateId("");}}><option value="">Начать без шаблона</option>{mailCenter.templates.map((template)=><option key={template.id} value={template.id}>{template.name} · {template.language.toUpperCase()}</option>)}</select><p className="mt-2 text-xs text-gray-500">Шаблон подставляет основу, но письмо остаётся редактируемым и не отправляется автоматически.</p></div>}<select className={field} value={leadId} disabled={Boolean(activeDraft)} onChange={(e)=>{setLeadId(e.target.value);const selected=leads.find((lead)=>lead.lead_id===e.target.value);if(selected?.work_email)setTo(selected.work_email);}}><option value="">Без привязки к мерчу</option>{leads.filter((lead)=>lead.record_state!=="archived").map((lead)=><option key={lead.lead_id} value={lead.lead_id}>{lead.company || "Без названия"} · {lead.work_email || "нет email"}</option>)}</select><input className={field} type="email" value={to} onChange={(e)=>setTo(e.target.value)} placeholder="Получатель"/><input className={field} value={subject} onChange={(e)=>setSubject(e.target.value)} placeholder="Тема"/><textarea className={area} value={body} onChange={(e)=>setBody(e.target.value)} placeholder="Текст письма"/><button onClick={()=>void sendEmail(Boolean(selectedThread && to===selectedThread.participant_email))} disabled={busy || activeDraft?.status === "sending"} className="w-full rounded-lg bg-brand-500 px-4 py-3 text-sm font-semibold text-white disabled:opacity-40">{busy?"Отправляю…":activeDraft?"Отправить этот черновик":"Отправить письмо"}</button></div></Panel>
        : <TelegramWorkspace/>}
  </Frame>;
}

export { default as TasksWorkspace } from "./OperationsWorkspace";
export { default as IntegrationsWorkspace } from "./IntegrationsWorkspace";
