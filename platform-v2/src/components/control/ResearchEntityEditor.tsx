import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import type { AgentPspProvider, CasinoLead, EmailDraft, EmailMessage, EmailThread, WorkTask } from "../../types/offerpsp";
import { supabase } from "../../lib/supabase";
import { QuickStatusSelect, type QuickStatusOption } from "./QuickStatusSelect";
import { VisibilityToggleButton } from "./VisibilityToggleButton";

type EntityType = "casino" | "psp";
type ResearchRecord = CasinoLead | AgentPspProvider;
type Note = { id: string; body: string; created_at: string; created_by?: string | null };
type AuditEntry = { id: string; action_type: string; created_at: string; actor_user_id?: string | null };
type ResearchWorkspace = {
  notes: Note[];
  tasks: WorkTask[];
  email_drafts: EmailDraft[];
  email_threads: EmailThread[];
  email_messages: EmailMessage[];
  audit: AuditEntry[];
};
type WorkspaceTab = "overview" | "edit" | "notes" | "tasks" | "mail" | "history";

const inputClass = "h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 outline-none focus:border-brand-400 dark:border-gray-700 dark:text-white";
const textareaClass = "min-h-24 w-full rounded-lg border border-gray-300 bg-transparent px-3 py-3 text-sm text-gray-800 outline-none focus:border-brand-400 dark:border-gray-700 dark:text-white";
const csv = (value: unknown) => Array.isArray(value) ? value.join(", ") : "";
const splitCsv = (value: unknown) => String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
const text = (value: unknown) => Array.isArray(value) ? value.filter(Boolean).join(", ") : String(value || "").trim();
const dateTime = (value?: string | null) => value ? new Date(value).toLocaleString("ru-RU") : "—";
const statusLabels: Record<string, string> = {
  active: "Активна", archived: "В архиве", research: "Исследование", qualified: "Проверен",
  partner: "Партнёр", paused: "На паузе", rejected: "Отклонён", not_contacted: "Не связывались",
  researching: "Ищем контакт", ready: "Готов к контакту", contacted: "Связались", replied: "Ответил",
  negotiating: "Переговоры", pending: "Ожидает", done: "Выполнено", cancelled: "Отменено",
  draft: "Черновик", sent: "Отправлено", open: "Открыта", awaiting_reply: "Ждём ответ",
  follow_up: "Нужен follow-up", closed: "Закрыта",
};
const casinoStatusOptions: QuickStatusOption[] = [
  { value: "not_contacted", label: "Новый" },
  { value: "researching", label: "Исследование" },
  { value: "ready", label: "Готов к контакту" },
  { value: "contacted", label: "Связались" },
  { value: "replied", label: "Ответил" },
  { value: "negotiating", label: "Переговоры" },
  { value: "partner", label: "Работаем" },
  { value: "rejected", label: "Отказ / не подходит" },
  { value: "paused", label: "Пауза" },
];

function withProtocol(value: string) {
  if (!value) return "";
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

function telegramLink(value: string) {
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  const username = value.replace(/^@/, "").trim();
  return username && !/\s/.test(username) ? `https://t.me/${username}` : "";
}

function linkedinLink(value: string) {
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  return value.includes("linkedin.com") ? withProtocol(value) : "";
}

function Field({ label, children, wide = false }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return <label className={wide ? "md:col-span-2" : ""}><span className="mb-1.5 block text-xs font-semibold text-gray-500">{label}</span>{children}</label>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="rounded-2xl border border-gray-200 p-4 dark:border-gray-800"><h3 className="mb-4 text-sm font-semibold text-gray-900 dark:text-white">{title}</h3><div className="grid grid-cols-1 gap-4 md:grid-cols-2">{children}</div></section>;
}

function Detail({ label, value, wide = false }: { label: string; value: unknown; wide?: boolean }) {
  const rendered = text(value);
  return <div className={wide ? "md:col-span-2" : ""}><span className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-400">{label}</span><p className="mt-1.5 whitespace-pre-wrap text-sm leading-6 text-gray-800 dark:text-gray-200">{rendered || "—"}</p></div>;
}

function ContactRow({ label, value, href, onCopy }: { label: string; value: unknown; href?: string; onCopy: (value: string) => void }) {
  const rendered = text(value);
  if (!rendered) return null;
  return <div className="flex flex-col gap-3 border-b border-gray-100 py-3 last:border-0 sm:flex-row sm:items-center dark:border-gray-800">
    <span className="w-24 shrink-0 text-xs font-semibold text-gray-400">{label}</span>
    <div className="min-w-0 flex-1">
      {href ? <a href={href} target={href.startsWith("http") ? "_blank" : undefined} rel={href.startsWith("http") ? "noreferrer" : undefined} className="break-all text-sm font-semibold text-brand-500 hover:underline">{rendered}</a> : <span className="break-all text-sm text-gray-800 dark:text-gray-200">{rendered}</span>}
    </div>
    <button type="button" onClick={() => onCopy(rendered)} className="self-start rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-500 hover:border-brand-300 hover:text-brand-500 dark:border-gray-700 dark:text-gray-300">Копировать</button>
  </div>;
}

function OverviewPanel({ title, count, action, onOpen, children }: { title: string; count: number; action: string; onOpen: () => void; children: React.ReactNode }) {
  return <section className="rounded-2xl border border-gray-200 p-4 dark:border-gray-800">
    <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><h3 className="text-sm font-semibold text-gray-900 dark:text-white">{title}</h3><span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-500 dark:bg-white/5">{count}</span></div><button type="button" onClick={onOpen} className="text-xs font-semibold text-brand-500 hover:underline">{action}</button></div>
    <div className="mt-4">{children}</div>
  </section>;
}

export default function ResearchEntityEditor({ entityType, record, onClose, onSaved }: {
  entityType: EntityType;
  record?: ResearchRecord | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const navigate = useNavigate();
  const source = useMemo(() => (record || {}) as Record<string, unknown>, [record]);
  const [draft, setDraft] = useState<Record<string, unknown>>(() => ({
    ...source,
    tags: csv(source.tags),
    supported_countries: csv(source.supported_countries),
    supported_currencies: csv(source.supported_currencies),
    payment_methods: csv(source.payment_methods),
    supported_verticals: csv(source.supported_verticals),
    restricted_countries: csv(source.restricted_countries),
    integration_types: csv(source.integration_types),
    capabilities_verified: Boolean(source.capabilities_verified_at),
  }));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ error?: boolean; text: string } | null>(null);
  const [tab, setTab] = useState<WorkspaceTab>(record ? "overview" : "edit");
  const [workspace, setWorkspace] = useState<ResearchWorkspace>({ notes: [], tasks: [], email_drafts: [], email_threads: [], email_messages: [], audit: [] });
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [noteBody, setNoteBody] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDueAt, setTaskDueAt] = useState("");
  const [taskPriority, setTaskPriority] = useState("normal");
  const [mailTo, setMailTo] = useState(String(source.email || ""));
  const [mailSubject, setMailSubject] = useState("");
  const [mailBody, setMailBody] = useState("");
  const set = (key: string, value: unknown) => setDraft((current) => ({ ...current, [key]: value }));
  const isNew = !record;
  const archived = record?.record_state === "archived";
  const openTasks = workspace.tasks.filter((item) => !["done", "cancelled"].includes(item.status || ""));
  const mailCount = workspace.email_threads.length + workspace.email_drafts.length;

  const loadWorkspace = useCallback(async () => {
    if (!record) return;
    setWorkspaceLoading(true);
    const result = await supabase.rpc("get_offerpsp_research_workspace", {
      p_entity_type: entityType,
      p_record_id: record.id,
    });
    if (result.error) setMessage({ error: true, text: result.error.message });
    else setWorkspace({ notes: [], tasks: [], email_drafts: [], email_threads: [], email_messages: [], audit: [], ...((result.data || {}) as Partial<ResearchWorkspace>) });
    setWorkspaceLoading(false);
  }, [entityType, record]);

  useEffect(() => { void loadWorkspace(); }, [loadWorkspace]);

  async function copyValue(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setMessage({ text: "Скопировано в буфер обмена." });
    } catch {
      setMessage({ error: true, text: "Не удалось скопировать. Выделите значение вручную." });
    }
  }

  async function addNote() {
    if (!record || !noteBody.trim()) return;
    setBusy(true); setMessage(null);
    const result = await supabase.rpc("save_offerpsp_research_note", { p_entity_type: entityType, p_record_id: record.id, p_body: noteBody });
    if (result.error) setMessage({ error: true, text: result.error.message });
    else { setNoteBody(""); setMessage({ text: "Заметка сохранена." }); await loadWorkspace(); }
    setBusy(false);
  }

  async function removeNote(id: string) {
    if (!window.confirm("Удалить эту заметку?")) return;
    setBusy(true);
    const result = await supabase.rpc("delete_offerpsp_research_note", { p_note_id: id });
    if (result.error) setMessage({ error: true, text: result.error.message });
    else await loadWorkspace();
    setBusy(false);
  }

  async function createTask() {
    if (!record || !taskTitle.trim()) return;
    setBusy(true); setMessage(null);
    const result = await supabase.rpc("save_offerpsp_task", { p_task_id: null, p_payload: {
      title: taskTitle.trim(), status: "pending", priority: taskPriority,
      due_at: taskDueAt ? new Date(taskDueAt).toISOString() : null,
      entity_type: entityType === "casino" ? "research_casino" : "research_psp",
      entity_id: String(record.id), metadata: { entrypoint: "counterparty_organizer" },
    }});
    if (result.error) setMessage({ error: true, text: result.error.message });
    else { setTaskTitle(""); setTaskDueAt(""); setMessage({ text: "Задача создана." }); await loadWorkspace(); }
    setBusy(false);
  }

  async function completeTask(task: WorkTask) {
    setBusy(true); setMessage(null);
    const result = await supabase.rpc("save_offerpsp_task", { p_task_id: task.id, p_payload: {
      title: task.title, details: task.details, status: "done", priority: task.priority || "normal",
      due_at: task.due_at, assigned_to: task.assigned_to,
      entity_type: entityType === "casino" ? "research_casino" : "research_psp",
      entity_id: String(record?.id), metadata: task.metadata || {},
    }});
    if (result.error) setMessage({ error: true, text: result.error.message });
    else await loadWorkspace();
    setBusy(false);
  }

  async function createMailDraft() {
    if (!record || !mailTo.trim() || !mailSubject.trim() || !mailBody.trim()) {
      setMessage({ error: true, text: "Заполните получателя, тему и текст письма." }); return;
    }
    setBusy(true); setMessage(null);
    const result = await supabase.rpc("create_offerpsp_research_email_draft", {
      p_entity_type: entityType, p_record_id: record.id, p_to_email: mailTo,
      p_subject: mailSubject, p_body: mailBody,
    });
    if (result.error) setMessage({ error: true, text: result.error.message });
    else { setMailSubject(""); setMailBody(""); setMessage({ text: "Черновик письма сохранён. Отправка выполняется после проверки в центре коммуникаций." }); await loadWorkspace(); }
    setBusy(false);
  }

  async function save() {
    if (!String(draft.name || "").trim()) { setMessage({ error: true, text: "Название обязательно." }); return; }
    if (entityType === "casino") {
      const score = Number(draft.score ?? 0);
      if (!Number.isFinite(score) || score < 0 || score > 10) { setMessage({ error: true, text: "Score должен быть числом от 0 до 10." }); return; }
    }
    setBusy(true); setMessage(null);
    const payload = { ...draft };
    delete payload.id; delete payload.internal_id; delete payload.created_at; delete payload.updated_at;
    delete payload.archived_at; delete payload.record_state;
    if (entityType === "casino") {
      payload.tags = splitCsv(payload.tags);
      payload.score = Number(payload.score ?? 0);
    }
    else {
      ["supported_countries", "supported_currencies", "payment_methods", "supported_verticals", "restricted_countries", "integration_types"].forEach((key) => { payload[key] = splitCsv(payload[key]); });
    }
    const result = await supabase.rpc("save_offerpsp_research_entity", {
      p_entity_type: entityType,
      p_record_id: record?.id || null,
      p_payload: payload,
    });
    if (result.error) {
      const text = result.error.code === "23505" ? "Запись с таким внутренним ID уже существует. Обновите страницу и повторите." : result.error.message;
      setMessage({ error: true, text }); setBusy(false); return;
    }
    await onSaved(); setBusy(false);
    if (isNew) onClose();
    else { setMessage({ text: "Изменения сохранены." }); setTab("overview"); }
  }

  async function changeState() {
    if (!record) return;
    const next = archived ? "active" : "archived";
    if (!archived && !window.confirm("Переместить запись в архив? Она останется в истории и её можно будет восстановить.")) return;
    setBusy(true); setMessage(null);
    const result = await supabase.rpc("set_offerpsp_research_entity_state", {
      p_entity_type: entityType,
      p_record_id: record.id,
      p_record_state: next,
    });
    if (result.error) { setMessage({ error: true, text: result.error.message }); setBusy(false); return; }
    await onSaved(); setBusy(false); onClose();
  }

  async function changeCasinoStatus(nextStatus: string) {
    if (!record || entityType !== "casino" || nextStatus === String(draft.contact_status || "not_contacted")) return;
    if (nextStatus === "rejected" && !window.confirm("Перевести казино в статус «Отказ / не подходит»? Изменение будет записано в историю.")) return;
    const nextDraft: Record<string, unknown> = { ...draft, contact_status: nextStatus };
    const payload: Record<string, unknown> = { ...nextDraft };
    delete payload.id; delete payload.internal_id; delete payload.created_at; delete payload.updated_at;
    delete payload.archived_at; delete payload.record_state;
    payload.tags = splitCsv(payload.tags);
    payload.score = Number(payload.score ?? 0);
    setBusy(true); setMessage(null);
    const result = await supabase.rpc("save_offerpsp_research_entity", {
      p_entity_type: "casino",
      p_record_id: record.id,
      p_payload: payload,
    });
    if (result.error) setMessage({ error: true, text: result.error.message });
    else {
      setDraft(nextDraft);
      setMessage({ text: "Статус казино обновлён." });
      await onSaved();
      await loadWorkspace();
    }
    setBusy(false);
  }

  return <div className="fixed inset-0 z-[100000] flex justify-end bg-gray-950/55 backdrop-blur-sm" role="dialog" aria-modal="true">
    <div className="flex h-full w-full max-w-4xl flex-col bg-white shadow-2xl dark:bg-gray-950">
      <header className="flex flex-col gap-4 border-b border-gray-200 px-5 py-4 sm:flex-row sm:items-start sm:justify-between dark:border-gray-800">
        <div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-500">{entityType === "casino" ? "Casino organizer" : "PSP organizer"}</p><div className="mt-1 flex flex-wrap items-center gap-3"><h2 className="break-words text-xl font-semibold text-gray-900 dark:text-white">{isNew ? "Новая запись" : String(draft.name || "Без названия")}</h2>{!isNew && entityType === "casino" && <QuickStatusSelect value={String(draft.contact_status || "not_contacted")} options={casinoStatusOptions} busy={busy} onChange={changeCasinoStatus}/>}</div><p className="mt-1 max-w-2xl text-xs text-gray-400">Карточка показывает текущее состояние. Изменения выполняются в отдельных рабочих вкладках.</p></div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:shrink-0">{record && <VisibilityToggleButton hidden={archived} busy={busy} onToggle={changeState}/>} {!isNew && tab !== "edit" && <button onClick={() => setTab("edit")} className="flex-1 rounded-lg bg-brand-500 px-3 py-2 text-sm font-semibold text-white sm:flex-none">Редактировать</button>}<button onClick={onClose} className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-500 sm:flex-none dark:border-gray-800">Закрыть</button></div>
      </header>
      {!isNew && <nav className="flex gap-1 overflow-x-auto border-b border-gray-200 px-4 py-2 dark:border-gray-800">{[
        ["overview","Карточка"], ["edit","Редактирование"], ["notes",`Заметки · ${workspace.notes.length}`], ["tasks",`Задачи · ${openTasks.length}`],
        ["mail",`Почта · ${mailCount}`], ["history","История"],
      ].map(([value,label])=><button key={value} onClick={()=>setTab(value as WorkspaceTab)} className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold ${tab===value?"bg-brand-50 text-brand-600 dark:bg-brand-500/10":"text-gray-500 hover:bg-gray-50 dark:hover:bg-white/5"}`}>{label}</button>)}</nav>}
      <div className="flex-1 space-y-5 overflow-y-auto p-5">
        {message && <div className={`rounded-xl border px-4 py-3 text-sm ${message.error ? "border-error-200 bg-error-50 text-error-700" : "border-success-200 bg-success-50 text-success-700"}`}>{message.text}</div>}
        {workspaceLoading && tab !== "edit" && <div className="rounded-xl bg-gray-50 px-4 py-6 text-center text-sm text-gray-400 dark:bg-white/[0.03]">Загружаю рабочую карточку…</div>}
        {tab === "overview" && !workspaceLoading && <>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-600 dark:bg-brand-500/10">{statusLabels[String(draft.contact_status || "not_contacted")] || text(draft.contact_status)}</span>
            {entityType === "psp" && <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600 dark:bg-white/5 dark:text-gray-300">{statusLabels[String(draft.provider_status || "research")] || text(draft.provider_status)}</span>}
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${archived ? "bg-error-50 text-error-600" : "bg-success-50 text-success-700"}`}>{statusLabels[String(record?.record_state || "active")] || text(record?.record_state)}</span>
          </div>
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)]">
            <Section title="Основная информация">
              <Detail label="Название" value={draft.name}/>
              <Detail label="GEO" value={draft.geo}/>
              {entityType === "casino" ? <>
                <Detail label="Город" value={draft.city}/><Detail label="Вертикаль / сфера" value={draft.sphere}/>
                <Detail label="Лицензия" value={draft.license}/><Detail label="Платформа / software" value={draft.software}/>
                <Detail label="Affiliate program" value={draft.affiliate_program}/><Detail label="Score" value={draft.score}/>
                <Detail label="Описание" value={draft.description} wide/>
              </> : <>
                <Detail label="Кластер" value={draft.cluster}/><Detail label="Специализация" value={draft.specialization}/>
                <Detail label="Risk appetite" value={draft.risk_appetite}/><Detail label="Страны" value={draft.supported_countries}/>
                <Detail label="Валюты" value={draft.supported_currencies}/><Detail label="Методы" value={draft.payment_methods || draft.methods}/>
                <Detail label="Вертикали" value={draft.supported_verticals}/><Detail label="Интеграции" value={draft.integration_types}/>
                <Detail label="Коммерческие условия" value={draft.commission_terms} wide/>
              </>}
            </Section>
            <section className="rounded-2xl border border-gray-200 p-4 dark:border-gray-800">
              <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold text-gray-900 dark:text-white">Контакты</h3><button type="button" onClick={() => setTab("edit")} className="text-xs font-semibold text-brand-500 hover:underline">Изменить</button></div>
              <div className="mt-3">
                {(text(draft.contact_name) || text(draft.contact_title)) && <div className="border-b border-gray-100 py-3 dark:border-gray-800"><span className="text-xs font-semibold text-gray-400">Контакт</span><p className="mt-1 text-sm font-semibold text-gray-800 dark:text-gray-200">{text(draft.contact_name) || "—"}{text(draft.contact_title) ? ` · ${text(draft.contact_title)}` : ""}</p></div>}
                <ContactRow label="Сайт" value={draft.website} href={withProtocol(text(draft.website))} onCopy={(value) => void copyValue(value)}/>
                <ContactRow label="Email" value={draft.email} href={text(draft.email) ? `mailto:${text(draft.email)}` : ""} onCopy={(value) => void copyValue(value)}/>
                <ContactRow label="Telegram" value={draft.telegram} href={telegramLink(text(draft.telegram))} onCopy={(value) => void copyValue(value)}/>
                <ContactRow label="Телефон" value={draft.phone} href={text(draft.phone) ? `tel:${text(draft.phone).replace(/[^+\d]/g, "")}` : ""} onCopy={(value) => void copyValue(value)}/>
                <ContactRow label="LinkedIn" value={draft.linkedin} href={linkedinLink(text(draft.linkedin))} onCopy={(value) => void copyValue(value)}/>
                <ContactRow label="Другие" value={draft.other_contacts} onCopy={(value) => void copyValue(value)}/>
                {!text(draft.website) && !text(draft.email) && !text(draft.telegram) && !text(draft.phone) && !text(draft.linkedin) && !text(draft.other_contacts) && <p className="py-8 text-center text-sm text-gray-400">Контакты пока не заполнены.</p>}
              </div>
            </section>
          </div>
          <div className="grid gap-5 xl:grid-cols-3">
            <OverviewPanel title="Последние заметки" count={workspace.notes.length} action="Работать с заметками" onOpen={() => setTab("notes")}>
              <div className="space-y-3">{workspace.notes.slice(0, 3).map((note) => <article key={note.id}><p className="line-clamp-3 text-sm leading-6 text-gray-700 dark:text-gray-300">{note.body}</p><time className="mt-1 block text-xs text-gray-400">{dateTime(note.created_at)}</time></article>)}{!workspace.notes.length && <p className="text-sm text-gray-400">Заметок пока нет.</p>}</div>
            </OverviewPanel>
            <OverviewPanel title="Открытые задачи" count={openTasks.length} action="Работать с задачами" onOpen={() => setTab("tasks")}>
              <div className="space-y-3">{openTasks.slice(0, 3).map((task) => <article key={String(task.id)}><div className="flex items-start justify-between gap-3"><strong className="text-sm text-gray-800 dark:text-gray-200">{task.title}</strong><span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-500 dark:bg-white/5">{String(task.priority || "normal")}</span></div><p className="mt-1 text-xs text-gray-400">{task.due_at ? `Срок: ${dateTime(task.due_at)}` : "Без срока"}</p></article>)}{!openTasks.length && <p className="text-sm text-gray-400">Открытых задач нет.</p>}</div>
            </OverviewPanel>
            <OverviewPanel title="Почта" count={mailCount} action="Работать с почтой" onOpen={() => setTab("mail")}>
              <div className="space-y-3">{workspace.email_threads.slice(0, 2).map((thread) => <article key={thread.id}><div className="flex items-start justify-between gap-3"><strong className="line-clamp-2 text-sm text-gray-800 dark:text-gray-200">{thread.subject || "Без темы"}</strong>{thread.unread_count > 0 && <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-600">{thread.unread_count} новых</span>}</div><p className="mt-1 truncate text-xs text-gray-400">{thread.participant_email} · {statusLabels[thread.status] || thread.status}</p></article>)}{!workspace.email_threads.length && workspace.email_drafts.slice(0, 2).map((item) => <article key={item.id}><strong className="line-clamp-2 text-sm text-gray-800 dark:text-gray-200">{item.subject || "Без темы"}</strong><p className="mt-1 truncate text-xs text-gray-400">{item.to_email} · {statusLabels[String(item.status || "draft")] || item.status}</p></article>)}{!mailCount && <p className="text-sm text-gray-400">Связанной переписки пока нет.</p>}</div>
            </OverviewPanel>
          </div>
          {workspace.audit.length > 0 && <OverviewPanel title="Последнее действие" count={workspace.audit.length} action="Открыть историю" onOpen={() => setTab("history")}><div className="flex items-center justify-between gap-4"><strong className="text-sm text-gray-800 dark:text-gray-200">{workspace.audit[0].action_type}</strong><time className="text-xs text-gray-400">{dateTime(workspace.audit[0].created_at)}</time></div></OverviewPanel>}
        </>}
        {tab === "edit" && <>
        <Section title="Основная информация">
          <Field label="Название"><input className={inputClass} value={String(draft.name || "")} onChange={(event) => set("name", event.target.value)}/></Field>
          <Field label="Сайт"><input className={inputClass} value={String(draft.website || "")} onChange={(event) => set("website", event.target.value)} placeholder="https://…"/></Field>
          <Field label="GEO"><input className={inputClass} value={String(draft.geo || "")} onChange={(event) => set("geo", event.target.value)}/></Field>
          {entityType === "casino" ? <>
            <Field label="Город"><input className={inputClass} value={String(draft.city || "")} onChange={(event) => set("city", event.target.value)}/></Field>
            <Field label="Вертикаль / сфера"><input className={inputClass} value={String(draft.sphere || "")} onChange={(event) => set("sphere", event.target.value)}/></Field>
            <Field label="Лицензия"><input className={inputClass} value={String(draft.license || "")} onChange={(event) => set("license", event.target.value)}/></Field>
            <Field label="Платформа / software"><input className={inputClass} value={String(draft.software || "")} onChange={(event) => set("software", event.target.value)}/></Field>
            <Field label="Affiliate program"><input className={inputClass} value={String(draft.affiliate_program || "")} onChange={(event) => set("affiliate_program", event.target.value)}/></Field>
            <Field label="Описание" wide><textarea className={textareaClass} value={String(draft.description || "")} onChange={(event) => set("description", event.target.value)}/></Field>
          </> : <>
            <Field label="Кластер"><input className={inputClass} value={String(draft.cluster || "")} onChange={(event) => set("cluster", event.target.value)}/></Field>
            <Field label="Специализация"><input className={inputClass} value={String(draft.specialization || "")} onChange={(event) => set("specialization", event.target.value)}/></Field>
            <Field label="Статус PSP"><select className={inputClass} value={String(draft.provider_status || "research")} onChange={(event) => set("provider_status", event.target.value)}>{["research", "qualified", "partner", "paused", "rejected"].map((value)=><option key={value}>{value}</option>)}</select></Field>
            <Field label="Risk appetite"><input className={inputClass} value={String(draft.risk_appetite || "")} onChange={(event) => set("risk_appetite", event.target.value)}/></Field>
          </>}
        </Section>
        <Section title="Контакты и коммуникация">
          <Field label="Контакт"><input className={inputClass} value={String(draft.contact_name || "")} onChange={(event) => set("contact_name", event.target.value)}/></Field>
          {entityType === "casino" && <Field label="Должность"><input className={inputClass} value={String(draft.contact_title || "")} onChange={(event) => set("contact_title", event.target.value)}/></Field>}
          <Field label="Email"><input type="email" className={inputClass} value={String(draft.email || "")} onChange={(event) => set("email", event.target.value)}/></Field>
          <Field label="Telegram"><input className={inputClass} value={String(draft.telegram || "")} onChange={(event) => set("telegram", event.target.value)}/></Field>
          <Field label="Телефон"><input className={inputClass} value={String(draft.phone || "")} onChange={(event) => set("phone", event.target.value)}/></Field>
          <Field label="LinkedIn"><input className={inputClass} value={String(draft.linkedin || "")} onChange={(event) => set("linkedin", event.target.value)}/></Field>
          <Field label="Состояние контакта"><select className={inputClass} value={String(draft.contact_status || "not_contacted")} onChange={(event) => set("contact_status", event.target.value)}>{["not_contacted", "researching", "ready", "contacted", "replied", "negotiating", "partner", "rejected", "paused"].map((value)=><option key={value}>{value}</option>)}</select></Field>
          {entityType === "casino" ? <Field label="Следующий follow-up"><input type="date" className={inputClass} value={String(draft.next_follow_up || "")} onChange={(event) => set("next_follow_up", event.target.value)}/></Field> : <Field label="Другие контакты"><input className={inputClass} value={String(draft.other_contacts || "")} onChange={(event) => set("other_contacts", event.target.value)}/></Field>}
        </Section>
        {entityType === "casino" ? <Section title="Квалификация и работа">
          <Field label="Score 0–10"><input type="number" min="0" max="10" className={inputClass} value={String(draft.score ?? 0)} onChange={(event) => set("score", event.target.value)}/></Field>
          <Field label="Источник"><input className={inputClass} value={String(draft.source || "")} onChange={(event) => set("source", event.target.value)}/></Field>
          <Field label="Статус ответа"><input className={inputClass} value={String(draft.reply_status || "")} onChange={(event) => set("reply_status", event.target.value)}/></Field>
          <Field label="Теги через запятую"><input className={inputClass} value={String(draft.tags || "")} onChange={(event) => set("tags", event.target.value)}/></Field>
          <Field label="Заметки" wide><textarea className={textareaClass} value={String(draft.notes || "")} onChange={(event) => set("notes", event.target.value)}/></Field>
        </Section> : <Section title="Покрытие, условия и возможности">
          <Field label="Страны через запятую"><input className={inputClass} value={String(draft.supported_countries || "")} onChange={(event) => set("supported_countries", event.target.value)}/></Field>
          <Field label="Ограниченные страны"><input className={inputClass} value={String(draft.restricted_countries || "")} onChange={(event) => set("restricted_countries", event.target.value)}/></Field>
          <Field label="Валюты"><input className={inputClass} value={String(draft.supported_currencies || "")} onChange={(event) => set("supported_currencies", event.target.value)}/></Field>
          <Field label="Платёжные методы"><input className={inputClass} value={String(draft.payment_methods || draft.methods || "")} onChange={(event) => set("payment_methods", event.target.value)}/></Field>
          <Field label="Вертикали"><input className={inputClass} value={String(draft.supported_verticals || "")} onChange={(event) => set("supported_verticals", event.target.value)}/></Field>
          <Field label="Интеграции"><input className={inputClass} value={String(draft.integration_types || "")} onChange={(event) => set("integration_types", event.target.value)}/></Field>
          <Field label="Мин. месячный объём"><input type="number" className={inputClass} value={String(draft.min_monthly_volume ?? "")} onChange={(event) => set("min_monthly_volume", event.target.value)}/></Field>
          <Field label="Макс. месячный объём"><input type="number" className={inputClass} value={String(draft.max_monthly_volume ?? "")} onChange={(event) => set("max_monthly_volume", event.target.value)}/></Field>
          <Field label="Коммерческие условия" wide><textarea className={textareaClass} value={String(draft.commission_terms || "")} onChange={(event) => set("commission_terms", event.target.value)}/></Field>
          <Field label="Источник проверки"><input className={inputClass} value={String(draft.capabilities_source || "")} onChange={(event) => set("capabilities_source", event.target.value)}/></Field>
          <Field label="Возможности подтверждены"><label className="flex h-11 items-center gap-3 rounded-lg border border-gray-300 px-3 text-sm dark:border-gray-700"><input type="checkbox" checked={Boolean(draft.capabilities_verified)} onChange={(event) => set("capabilities_verified", event.target.checked)}/> Подтверждено вручную</label></Field>
          <Field label="Заметки" wide><textarea className={textareaClass} value={String(draft.notes || "")} onChange={(event) => set("notes", event.target.value)}/></Field>
        </Section>}
        </>}
        {tab === "notes" && <section className="space-y-4"><div className="rounded-2xl border border-gray-200 p-4 dark:border-gray-800"><h3 className="text-sm font-semibold text-gray-900 dark:text-white">Новая рабочая заметка</h3><textarea className={`${textareaClass} mt-3`} value={noteBody} onChange={(event)=>setNoteBody(event.target.value)} placeholder="Что произошло, о чём договорились, что проверить…"/><button disabled={busy || !noteBody.trim()} onClick={()=>void addNote()} className="mt-3 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">Добавить заметку</button></div><div className="space-y-3">{workspace.notes.map((note)=><article key={note.id} className="rounded-2xl border border-gray-200 p-4 dark:border-gray-800"><div className="flex items-start justify-between gap-4"><p className="whitespace-pre-wrap text-sm leading-6 text-gray-700 dark:text-gray-300">{note.body}</p><button onClick={()=>void removeNote(note.id)} className="shrink-0 text-xs font-semibold text-error-500">Удалить</button></div><time className="mt-3 block text-xs text-gray-400">{new Date(note.created_at).toLocaleString("ru-RU")}</time></article>)}{!workspace.notes.length && <p className="rounded-2xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-400 dark:border-gray-700">Заметок пока нет.</p>}</div></section>}
        {tab === "tasks" && <section className="space-y-4"><div className="rounded-2xl border border-gray-200 p-4 dark:border-gray-800"><h3 className="text-sm font-semibold text-gray-900 dark:text-white">Задача или напоминание</h3><div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_190px_130px]"><input className={inputClass} value={taskTitle} onChange={(event)=>setTaskTitle(event.target.value)} placeholder="Например: запросить свежие условия"/><input type="datetime-local" className={inputClass} value={taskDueAt} onChange={(event)=>setTaskDueAt(event.target.value)}/><select className={inputClass} value={taskPriority} onChange={(event)=>setTaskPriority(event.target.value)}><option value="low">Низкий</option><option value="normal">Обычный</option><option value="high">Высокий</option><option value="urgent">Срочно</option></select></div><button disabled={busy || !taskTitle.trim()} onClick={()=>void createTask()} className="mt-3 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">Создать задачу</button></div><div className="space-y-3">{workspace.tasks.map((task)=><article key={String(task.id)} className="flex flex-col gap-3 rounded-2xl border border-gray-200 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-gray-800"><div><div className="flex flex-wrap items-center gap-2"><strong className="text-sm text-gray-900 dark:text-white">{task.title}</strong><span className="rounded-full bg-gray-100 px-2 py-1 text-[11px] text-gray-500 dark:bg-white/5">{String(task.priority || "normal")}</span><span className="rounded-full bg-gray-100 px-2 py-1 text-[11px] text-gray-500 dark:bg-white/5">{task.status}</span></div><p className="mt-1 text-xs text-gray-400">{task.due_at ? `Срок: ${new Date(task.due_at).toLocaleString("ru-RU")}` : "Без срока"}</p></div>{!["done","cancelled"].includes(task.status || "") && <button disabled={busy} onClick={()=>void completeTask(task)} className="rounded-lg border border-success-300 px-3 py-2 text-xs font-semibold text-success-600">Выполнено</button>}</article>)}{!workspace.tasks.length && <p className="rounded-2xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-400 dark:border-gray-700">Задач пока нет.</p>}</div></section>}
        {tab === "mail" && <section className="space-y-5"><div className="rounded-2xl border border-gray-200 p-4 dark:border-gray-800"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-sm font-semibold text-gray-900 dark:text-white">Подготовить письмо</h3><p className="mt-1 text-xs text-gray-400">Сначала создаётся черновик. Отправка — только после проверки.</p></div><button onClick={()=>{onClose();navigate("/communications");}} className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-600 dark:border-gray-700 dark:text-gray-300">Открыть почтовый центр</button></div><div className="mt-4 grid gap-3 md:grid-cols-2"><input type="email" className={inputClass} value={mailTo} onChange={(event)=>setMailTo(event.target.value)} placeholder="Получатель"/><input className={inputClass} value={mailSubject} onChange={(event)=>setMailSubject(event.target.value)} placeholder="Тема"/></div><textarea className={`${textareaClass} mt-3 min-h-40`} value={mailBody} onChange={(event)=>setMailBody(event.target.value)} placeholder="Текст письма…"/><button disabled={busy} onClick={()=>void createMailDraft()} className="mt-3 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">Сохранить черновик</button></div><div className="grid gap-4 lg:grid-cols-2"><div><h3 className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">Черновики и отправления</h3><div className="space-y-2">{workspace.email_drafts.map((item)=><article key={item.id} className="rounded-xl border border-gray-200 p-3 dark:border-gray-800"><div className="flex justify-between gap-3"><strong className="truncate text-sm text-gray-900 dark:text-white">{item.subject || "Без темы"}</strong><span className="text-xs text-gray-400">{item.status || "draft"}</span></div><p className="mt-1 truncate text-xs text-gray-400">{item.to_email}</p></article>)}{!workspace.email_drafts.length&&<p className="text-sm text-gray-400">Нет черновиков.</p>}</div></div><div><h3 className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">Переписка</h3><div className="space-y-2">{workspace.email_threads.map((thread)=><article key={thread.id} className="rounded-xl border border-gray-200 p-3 dark:border-gray-800"><div className="flex justify-between gap-3"><strong className="truncate text-sm text-gray-900 dark:text-white">{thread.subject}</strong><span className="text-xs text-gray-400">{thread.status}</span></div><p className="mt-1 truncate text-xs text-gray-400">{thread.participant_email} · {thread.unread_count} непрочитано</p></article>)}{!workspace.email_threads.length&&<p className="text-sm text-gray-400">Связанных писем пока нет.</p>}</div></div></div></section>}
        {tab === "history" && <section className="space-y-3">{workspace.audit.map((entry)=><article key={entry.id} className="flex items-center justify-between gap-4 rounded-xl border border-gray-200 p-4 dark:border-gray-800"><strong className="text-sm text-gray-800 dark:text-gray-200">{entry.action_type}</strong><time className="text-xs text-gray-400">{new Date(entry.created_at).toLocaleString("ru-RU")}</time></article>)}{!workspace.audit.length&&<p className="rounded-2xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-400 dark:border-gray-700">История действий пока пуста.</p>}</section>}
      </div>
      <footer className="flex flex-col-reverse gap-3 border-t border-gray-200 p-4 sm:flex-row sm:items-center sm:justify-end dark:border-gray-800">
        <div className="flex gap-3"><button onClick={onClose} className="rounded-lg border border-gray-200 px-4 py-2.5 text-sm text-gray-600 dark:border-gray-800 dark:text-gray-300">Закрыть</button>{tab === "edit" && <button disabled={busy} onClick={()=>void save()} className="rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Сохраняю…" : isNew ? "Создать запись" : "Сохранить изменения"}</button>}</div>
      </footer>
    </div>
  </div>;
}
