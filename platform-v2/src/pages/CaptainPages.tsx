import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import PageMeta from "../components/common/PageMeta";
import { EmptyState, ErrorBanner, Metric, PageHeading, Panel, SkeletonPage, StatusPill, humanizeCode, statusLabels } from "../components/control/Ui";
import ResearchEntityEditor from "../components/control/ResearchEntityEditor";
import TelegramWorkspace from "../components/control/TelegramWorkspace";
import { useControlBridge } from "../context/ControlBridgeContext";
import { supabase } from "../lib/supabase";
import type { CasinoLead, EmailAttachment } from "../types/offerpsp";

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
  const { captainsBridge, mailCenter, leads, providers, refresh } = useControlBridge();
  const [searchParams] = useSearchParams();
  const [to, setTo] = useState(""); const [subject, setSubject] = useState(""); const [body, setBody] = useState("");
  const [leadId, setLeadId] = useState(""); const [busy, setBusy] = useState(false); const [message, setMessage] = useState<{error?:boolean;text:string}|null>(null);
  const [section, setSection] = useState<"mail" | "compose" | "telegram">("mail");
  const [threadId, setThreadId] = useState("");
  const [query, setQuery] = useState("");
  const [mailScope, setMailScope] = useState<"active" | "follow_up" | "archived" | "all">("active");
  const [linkType, setLinkType] = useState<"merchant" | "provider" | "casino" | "research_psp" | "general">("general");
  const [linkId, setLinkId] = useState("");
  const [attachmentTypes, setAttachmentTypes] = useState<Record<string, "offer" | "contract" | "">>({});
  const [attachmentTargetTypes, setAttachmentTargetTypes] = useState<Record<string, "provider" | "merchant">>({});
  const [attachmentTargets, setAttachmentTargets] = useState<Record<string, string>>({});

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
  const selectedMessageIds = new Set(selectedMessages.map((entry) => entry.id));
  const selectedAttachments = mailCenter.attachments.filter((entry) => selectedMessageIds.has(entry.message_id));

  useEffect(() => {
    if (!selectedThread) return;
    setLinkType(selectedThread.counterparty_type === "casino" || selectedThread.counterparty_type === "research_psp" || selectedThread.counterparty_type === "provider" || selectedThread.counterparty_type === "merchant" ? selectedThread.counterparty_type : "general");
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
    if (!Number.isFinite(draftId)) { setMessage({ error: true, text: "Черновик создан без корректного ID. Отправка остановлена, чтобы не потерять историю." }); setBusy(false); return; }
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
      setSubject(""); setBody("");
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

  async function changeThreadState(status: "open" | "awaiting_reply" | "follow_up" | "closed" | "archived") {
    if (!selectedThread) return;
    setBusy(true);
    const result = await supabase.rpc("set_offerpsp_email_thread_state", { p_thread_id: selectedThread.id, p_status: status, p_mark_read: null });
    setMessage(result.error ? { error: true, text: result.error.message } : { text: "Статус переписки обновлён." });
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

  return <Frame title="Коммуникации" description="Почтовый центр и журнал Telegram AIBot."><PageHeading eyebrow="Omnichannel desk" title="Коммуникации" description="Работа с почтой bizdev@offerpsp.com и просмотр фактического Telegram‑журнала AIBot в одной панели."/>
    {message&&<div className={`mb-5 rounded-xl border px-4 py-3 text-sm ${message.error?"border-error-200 bg-error-50 text-error-700":"border-success-200 bg-success-50 text-success-700"}`}>{message.text}</div>}
    <div className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-5"><Metric label="Переписки" value={mailCenter.metrics.threads} hint="активные цепочки"/><Metric label="Непрочитано" value={mailCenter.metrics.unread} hint="требуют просмотра" tone={mailCenter.metrics.unread ? "success" : undefined}/><Metric label="Ждём ответ" value={mailCenter.metrics.awaiting_reply} hint="наш ход сделан"/><Metric label="Follow-up" value={mailCenter.metrics.follow_up} hint="нужно напомнить"/><Metric label="Файлы на разбор" value={mailCenter.metrics.attachments_to_review || 0} hint="нужно привязать или распознать"/></div>
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[250px_minmax(0,1fr)]">
      <Panel className="h-fit"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-500">Каналы</p><div className="mt-4 space-y-2">{[
        ["mail", "Почтовый центр", `${mailCenter.metrics.unread} непрочитано`],
        ["compose", "Новое письмо", "bizdev@offerpsp.com"],
        ["telegram", "Telegram / AIBot", `${captainsBridge.telegram_log.length} сообщений`],
      ].map(([id,label,hint])=><button key={id} onClick={()=>setSection(id as typeof section)} className={`w-full rounded-xl px-4 py-3 text-left ${section===id?"bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300":"hover:bg-gray-50 dark:hover:bg-white/5"}`}><strong className="block text-sm">{label}</strong><span className="mt-1 block text-xs text-gray-400">{hint}</span></button>)}</div></Panel>
      {section === "mail" ? <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
        <Panel className="min-w-0"><div className="space-y-3"><input className={field} value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="Тема, email, статус…"/><select className={field} value={mailScope} onChange={(event)=>setMailScope(event.target.value as typeof mailScope)}><option value="active">Активные</option><option value="follow_up">Только follow-up</option><option value="archived">Архив</option><option value="all">Все</option></select></div><div className="mt-4 max-h-[720px] divide-y divide-gray-100 overflow-y-auto dark:divide-gray-800">{visibleThreads.map((thread)=><button key={thread.id} onClick={()=>void openThread(thread.id)} className={`w-full px-2 py-4 text-left ${selectedThread?.id===thread.id?"bg-brand-50 dark:bg-brand-500/10":"hover:bg-gray-50 dark:hover:bg-white/[0.03]"}`}><div className="flex items-start justify-between gap-3"><strong className="line-clamp-1 text-sm text-gray-900 dark:text-white">{thread.subject}</strong>{thread.unread_count>0&&<span className="rounded-full bg-brand-500 px-2 py-0.5 text-xs font-semibold text-white">{thread.unread_count}</span>}</div><span className="mt-1 block truncate text-xs text-gray-500">{thread.participant_email}</span><div className="mt-2 flex items-center justify-between gap-2"><StatusPill status={thread.status}/><span className="text-xs text-gray-400">{formatDate(thread.last_message_at)}</span></div></button>)}{!visibleThreads.length&&<EmptyState title="Писем не найдено" description="Входящие и исходящие цепочки появятся здесь."/>}</div></Panel>
        <Panel className="min-w-0">{selectedThread ? <><div className="flex flex-col gap-4 border-b border-gray-100 pb-5 dark:border-gray-800 md:flex-row md:items-start md:justify-between"><div><h2 className="text-xl font-semibold text-gray-900 dark:text-white">{selectedThread.subject}</h2><p className="mt-1 text-sm text-gray-500">{selectedThread.participant_email} · {counterpartyLabels[selectedThread.counterparty_type] || humanizeCode(selectedThread.counterparty_type)}</p></div><button onClick={startReply} className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white">Ответить</button></div><div className="mt-4 flex flex-wrap gap-2"><button disabled={busy} onClick={()=>void changeThreadState("open")} className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold dark:border-gray-700">Открыто</button><button disabled={busy} onClick={()=>void changeThreadState("follow_up")} className="rounded-lg border border-warning-200 bg-warning-50 px-3 py-2 text-xs font-semibold text-warning-700">Follow-up</button><button disabled={busy} onClick={()=>void changeThreadState("closed")} className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold dark:border-gray-700">Закрыть</button><button disabled={busy} onClick={()=>void changeThreadState("archived")} className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-500 dark:border-gray-700">В архив</button><button disabled={busy || !selectedMessages.some((entry)=>entry.direction==="inbound")} title={selectedMessages.some((entry)=>entry.direction==="inbound") ? undefined : "В цепочке нет входящего письма"} onClick={()=>void setThreadReadState(selectedThread.unread_count > 0)} className="rounded-lg border border-brand-200 px-3 py-2 text-xs font-semibold text-brand-600 disabled:cursor-not-allowed disabled:opacity-40 dark:border-brand-500/40 dark:text-brand-300">{selectedThread.unread_count > 0 ? "Пометить прочитанным" : "Пометить непрочитанным"}</button></div><div className="mt-4 grid gap-3 rounded-xl bg-gray-50 p-4 dark:bg-white/[0.03] md:grid-cols-[160px_minmax(0,1fr)_auto]"><select className={field} value={linkType} onChange={(event)=>{setLinkType(event.target.value as typeof linkType);setLinkId("");}}><option value="general">Без привязки</option><option value="merchant">Мерч</option><option value="casino">Казино</option><option value="provider">PSP</option><option value="research_psp">PSP из базы AIBot</option></select><select className={field} value={linkId} disabled={linkType==="general"} onChange={(event)=>setLinkId(event.target.value)}><option value="">Выберите карточку</option>{linkOptions.map((option)=><option key={option.id} value={option.id}>{option.label}</option>)}</select><button disabled={busy} onClick={()=>void saveThreadLink()} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold dark:border-gray-700">Привязать</button></div><div className="mt-5 max-h-[560px] space-y-4 overflow-y-auto pr-1">{selectedMessages.map((entry)=>{const attachments=selectedAttachments.filter((attachment)=>attachment.message_id===entry.id);return <div key={entry.id} className={`max-w-[92%] rounded-2xl border p-4 ${entry.direction==="outbound"?"ml-auto border-brand-100 bg-brand-50 dark:border-brand-500/20 dark:bg-brand-500/10":"border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900"}`}><div className="flex items-center justify-between gap-4"><strong className="text-xs uppercase tracking-wide text-brand-500">{entry.direction==="outbound"?"OfferPSP →":"← Входящее"}</strong><span className="text-xs text-gray-400">{formatDate(entry.sent_at || entry.received_at || entry.created_at)}</span></div><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-gray-700 dark:text-gray-200">{entry.text_body || (entry.html_body ? "HTML-письмо без текстовой версии" : "Пустое письмо")}</p>{attachments.length>0&&<div className="mt-4 space-y-3 border-t border-gray-100 pt-4 dark:border-gray-800">{attachments.map((attachment)=>renderAttachment(attachment))}</div>}<span className="mt-3 block text-xs text-gray-400">{humanizeCode(entry.delivery_status)} · {entry.provider}</span></div>})}</div></> : <EmptyState title="Выберите переписку" description="Откройте цепочку слева или создайте новое письмо."/>}</Panel>
      </div> : section === "compose"
        ? <Panel><div className="flex items-start justify-between gap-4"><div><h2 className="text-lg font-semibold text-gray-900 dark:text-white">{selectedThread && to===selectedThread.participant_email ? "Ответ на письмо" : "Новое письмо"}</h2><p className="mt-1 text-sm text-gray-500">Отправитель: <strong className="text-gray-700 dark:text-gray-200">bizdev@offerpsp.com</strong> · доставка через n8n.</p></div><button onClick={()=>setSection("mail")} className="text-sm text-gray-500">К перепискам</button></div><div className="mt-5 space-y-4"><select className={field} value={leadId} onChange={(e)=>{setLeadId(e.target.value);const selected=leads.find((lead)=>lead.lead_id===e.target.value);if(selected?.work_email)setTo(selected.work_email);}}><option value="">Без привязки к мерчу</option>{leads.filter((lead)=>lead.record_state!=="archived").map((lead)=><option key={lead.lead_id} value={lead.lead_id}>{lead.company || "Без названия"} · {lead.work_email || "нет email"}</option>)}</select><input className={field} type="email" value={to} onChange={(e)=>setTo(e.target.value)} placeholder="Получатель"/><input className={field} value={subject} onChange={(e)=>setSubject(e.target.value)} placeholder="Тема"/><textarea className={area} value={body} onChange={(e)=>setBody(e.target.value)} placeholder="Текст письма"/><button onClick={()=>void sendEmail(Boolean(selectedThread && to===selectedThread.participant_email))} disabled={busy} className="w-full rounded-lg bg-brand-500 px-4 py-3 text-sm font-semibold text-white disabled:opacity-40">{busy?"Отправляю…":"Отправить письмо"}</button></div></Panel>
        : <TelegramWorkspace/>}
    </div>
  </Frame>;
}

export { default as TasksWorkspace } from "./OperationsWorkspace";
export { default as IntegrationsWorkspace } from "./IntegrationsWorkspace";
