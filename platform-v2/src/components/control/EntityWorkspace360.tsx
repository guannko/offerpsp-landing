import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { EmptyState, Panel, StatusPill } from "./Ui";
import { supabase } from "../../lib/supabase";

export type EntityContact = {
  id: string;
  full_name: string;
  role_title?: string | null;
  email?: string | null;
  telegram?: string | null;
  phone?: string | null;
  preferred_channel?: string | null;
  is_primary?: boolean | null;
  active?: boolean | null;
  notes?: string | null;
};

export type EntityDocument = {
  id: string;
  category: string;
  title: string;
  file_name?: string | null;
  document_url?: string | null;
  storage_path?: string | null;
  status: string;
  expires_at?: string | null;
  notes?: string | null;
  updated_at?: string | null;
};

export type EntityActivity = {
  id: string;
  activity_type?: string | null;
  action_type?: string | null;
  title?: string | null;
  summary?: string | null;
  body?: string | null;
  actor_type?: string | null;
  created_at?: string | null;
};

export type EntityTask = {
  id: string;
  title: string;
  details?: string | null;
  status: string;
  priority: string;
  due_at?: string | null;
  created_at?: string | null;
};

type EntityMessage = {
  id: string;
  sender_type?: string | null;
  direction?: string | null;
  body: string;
  sent_at?: string | null;
};

type EntityConversation = {
  id: string;
  channel: string;
  subject?: string | null;
  updated_at?: string | null;
  messages?: EntityMessage[];
};

type EntityEmail = {
  id: number;
  to_email?: string | null;
  subject?: string | null;
  body?: string | null;
  status?: string | null;
  created_at?: string | null;
};

export type EntityWorkspaceSnapshot = {
  contacts: EntityContact[];
  documents: EntityDocument[];
  activities: EntityActivity[];
  tasks: EntityTask[];
  conversations: EntityConversation[];
  emails: EntityEmail[];
};

const emptyWorkspace: EntityWorkspaceSnapshot = {
  contacts: [], documents: [], activities: [], tasks: [], conversations: [], emails: [],
};

const field = "h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 outline-none focus:border-brand-400 dark:border-gray-700 dark:text-white";
const area = "min-h-24 w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2 text-sm text-gray-800 outline-none focus:border-brand-400 dark:border-gray-700 dark:text-white";
const formatDate = (value?: string | null) => value ? new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value)) : "—";

export function useEntityWorkspace(entityType: "merchant" | "provider", entityId?: string) {
  const [data, setData] = useState<EntityWorkspaceSnapshot>(emptyWorkspace);
  const [loading, setLoading] = useState(Boolean(entityId));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!entityId) return;
    setLoading(true);
    const result = await supabase.rpc("get_offerpsp_entity_workspace", { p_entity_type: entityType, p_entity_id: entityId });
    if (result.error) setError(result.error.message);
    else {
      setData({ ...emptyWorkspace, ...(result.data as Partial<EntityWorkspaceSnapshot>) });
      setError(null);
    }
    setLoading(false);
  }, [entityId, entityType]);

  useEffect(() => { void refresh(); }, [refresh]);

  async function execute(name: string, action: () => Promise<{ error: { message: string } | null }>) {
    setBusy(name); setError(null);
    const result = await action();
    if (result.error) { setError(result.error.message); setBusy(null); return false; }
    await refresh(); setBusy(null); return true;
  }

  return {
    data, loading, error, busy, refresh,
    saveContact: (contact: Partial<EntityContact>) => entityId ? execute("contact", async () => {
      const { id, ...payload } = contact;
      const result = await supabase.rpc("save_offerpsp_merchant_contact", { p_lead_id: entityId, p_contact_id: id || null, p_payload: payload });
      return { error: result.error };
    }) : Promise.resolve(false),
    archiveContact: (contactId: string) => execute("contact-archive", async () => {
      const result = await supabase.rpc("archive_offerpsp_merchant_contact", { p_contact_id: contactId });
      return { error: result.error };
    }),
    saveDocument: (document: Partial<EntityDocument>) => entityId ? execute("document", async () => {
      const id = document.id;
      const payload = { ...document };
      delete payload.id;
      delete payload.updated_at;
      const result = await supabase.rpc("save_offerpsp_entity_document", { p_entity_type: entityType, p_entity_id: entityId, p_document_id: id || null, p_payload: payload });
      return { error: result.error };
    }) : Promise.resolve(false),
    archiveDocument: (documentId: string) => execute("document-archive", async () => {
      const result = await supabase.rpc("archive_offerpsp_entity_document", { p_document_id: documentId });
      return { error: result.error };
    }),
    saveTask: (task: Partial<EntityTask>) => entityId ? execute("task", async () => {
      const id = task.id;
      const payload = { ...task };
      delete payload.id;
      delete payload.created_at;
      const result = await supabase.rpc("save_offerpsp_lead_task", { p_lead_id: entityId, p_task_id: id || null, p_payload: payload });
      return { error: result.error };
    }) : Promise.resolve(false),
  };
}

export function ContactsPanel({ contacts, baseContact, busy, onSave, onArchive }: {
  contacts: EntityContact[];
  baseContact?: Partial<EntityContact>;
  busy: string | null;
  onSave: (contact: Partial<EntityContact>) => Promise<boolean>;
  onArchive: (contactId: string) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<Partial<EntityContact>>({ preferred_channel: "telegram", active: true });
  const set = (key: keyof EntityContact, value: unknown) => setDraft({ ...draft, [key]: value });
  const save = async () => {
    if (await onSave(draft)) setDraft({ preferred_channel: "telegram", active: true });
  };
  const visible = contacts.filter((contact) => contact.active !== false);
  return <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.3fr)_380px]">
    <Panel><div className="flex items-center justify-between"><div><h2 className="text-lg font-semibold text-gray-900 dark:text-white">Контакты компании</h2><p className="mt-1 text-sm text-gray-500">Люди, через которых реально двигается сделка.</p></div><span className="text-sm text-gray-400">{visible.length + (baseContact ? 1 : 0)}</span></div>
      <div className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-2">
        {baseContact && <div className="rounded-xl border border-brand-200 bg-brand-25 p-4 dark:border-brand-800 dark:bg-brand-500/5"><div className="flex items-start justify-between gap-3"><div><strong className="text-sm text-gray-900 dark:text-white">{baseContact.full_name || "Анкетный контакт"}</strong><span className="mt-1 block text-xs text-gray-400">Основной контакт из заявки</span></div><span className="rounded-full bg-brand-100 px-2 py-1 text-[10px] font-semibold uppercase text-brand-700">primary</span></div><div className="mt-3 space-y-1 text-sm text-gray-600 dark:text-gray-300">{baseContact.email && <p>{baseContact.email}</p>}{baseContact.telegram && <p>{baseContact.telegram}</p>}{baseContact.phone && <p>{baseContact.phone}</p>}</div></div>}
        {visible.map((contact) => <div key={contact.id} className="rounded-xl border border-gray-200 p-4 dark:border-gray-800"><div className="flex items-start justify-between gap-3"><div><strong className="text-sm text-gray-900 dark:text-white">{contact.full_name}</strong><span className="mt-1 block text-xs text-gray-400">{contact.role_title || "Роль не указана"}</span></div>{contact.is_primary && <span className="rounded-full bg-success-50 px-2 py-1 text-[10px] font-semibold uppercase text-success-700">primary</span>}</div><div className="mt-3 space-y-1 text-sm text-gray-600 dark:text-gray-300">{contact.email && <p>{contact.email}</p>}{contact.telegram && <p>{contact.telegram}</p>}{contact.phone && <p>{contact.phone}</p>}</div><div className="mt-4 flex gap-3"><button onClick={()=>setDraft(contact)} className="text-xs font-semibold text-brand-500">Редактировать</button><button onClick={()=>void onArchive(contact.id)} className="text-xs font-semibold text-error-500">Архив</button></div></div>)}
        {!visible.length && !baseContact && <EmptyState title="Контактов нет" description="Добавьте человека, который отвечает за платёжное подключение."/>}
      </div>
    </Panel>
    <Panel><h2 className="text-lg font-semibold text-gray-900 dark:text-white">{draft.id ? "Редактировать контакт" : "Добавить контакт"}</h2><div className="mt-5 space-y-3"><input className={field} value={draft.full_name || ""} onChange={e=>set("full_name", e.target.value)} placeholder="Имя и фамилия"/><input className={field} value={draft.role_title || ""} onChange={e=>set("role_title", e.target.value)} placeholder="Роль / должность"/><input className={field} type="email" value={draft.email || ""} onChange={e=>set("email", e.target.value)} placeholder="Email"/><input className={field} value={draft.telegram || ""} onChange={e=>set("telegram", e.target.value)} placeholder="Telegram"/><input className={field} value={draft.phone || ""} onChange={e=>set("phone", e.target.value)} placeholder="Телефон"/><select className={field} value={draft.preferred_channel || "telegram"} onChange={e=>set("preferred_channel", e.target.value)}><option value="telegram">Telegram</option><option value="email">Email</option><option value="phone">Телефон</option><option value="other">Другой</option></select><textarea className={area} value={draft.notes || ""} onChange={e=>set("notes", e.target.value)} placeholder="Внутренняя заметка"/><label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300"><input type="checkbox" checked={Boolean(draft.is_primary)} onChange={e=>set("is_primary", e.target.checked)} className="accent-[#ff477d]"/>Основной контакт</label><div className="flex gap-2"><button disabled={!draft.full_name?.trim() || Boolean(busy)} onClick={()=>void save()} className="flex-1 rounded-lg bg-brand-500 px-4 py-3 text-sm font-semibold text-white disabled:opacity-40">{busy === "contact" ? "Сохраняю…" : "Сохранить"}</button>{draft.id && <button onClick={()=>setDraft({preferred_channel:"telegram",active:true})} className="rounded-lg border border-gray-200 px-4 text-sm dark:border-gray-700">Отмена</button>}</div></div></Panel>
  </div>;
}

export function DocumentsPanel({ documents, busy, onSave, onArchive }: {
  documents: EntityDocument[];
  busy: string | null;
  onSave: (document: Partial<EntityDocument>) => Promise<boolean>;
  onArchive: (documentId: string) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<Partial<EntityDocument>>({ category: "other", status: "active" });
  const set = (key: keyof EntityDocument, value: unknown) => setDraft({ ...draft, [key]: value });
  const save = async () => { if (await onSave(draft)) setDraft({ category: "other", status: "active" }); };
  const visible = documents.filter((document) => document.status !== "archived");
  return <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.3fr)_380px]">
    <Panel><div className="flex items-center justify-between"><div><h2 className="text-lg font-semibold text-gray-900 dark:text-white">Документы и ссылки</h2><p className="mt-1 text-sm text-gray-500">Лицензии, KYB, договоры, rate cards и материалы интеграции.</p></div><span className="text-sm text-gray-400">{visible.length}</span></div><div className="mt-5 divide-y divide-gray-100 dark:divide-gray-800">{visible.map((document) => <div key={document.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><strong className="text-sm text-gray-900 dark:text-white">{document.title}</strong><span className="rounded-full bg-gray-100 px-2 py-1 text-[10px] font-semibold uppercase text-gray-600 dark:bg-white/5 dark:text-gray-300">{document.category}</span></div><p className="mt-1 text-xs text-gray-400">{document.expires_at ? `Действует до ${document.expires_at}` : "Без срока"}{document.notes ? ` · ${document.notes}` : ""}</p></div><div className="flex shrink-0 gap-3">{document.document_url && <a href={document.document_url} target="_blank" rel="noreferrer" className="text-xs font-semibold text-brand-500">Открыть</a>}<button onClick={()=>setDraft(document)} className="text-xs font-semibold text-gray-500">Изменить</button><button onClick={()=>void onArchive(document.id)} className="text-xs font-semibold text-error-500">Архив</button></div></div>)}{!visible.length && <EmptyState title="Документов нет" description="Добавьте проверяемую ссылку на лицензию, KYB, договор или rate card."/>}</div></Panel>
    <Panel><h2 className="text-lg font-semibold text-gray-900 dark:text-white">{draft.id ? "Редактировать документ" : "Добавить документ"}</h2><div className="mt-5 space-y-3"><select className={field} value={draft.category || "other"} onChange={e=>set("category", e.target.value)}>{["license","kyb","contract","rate_card","integration","statement","other"].map(value=><option key={value} value={value}>{value}</option>)}</select><input className={field} value={draft.title || ""} onChange={e=>set("title", e.target.value)} placeholder="Название"/><input className={field} type="url" value={draft.document_url || ""} onChange={e=>set("document_url", e.target.value)} placeholder="https://…"/><input className={field} type="date" value={draft.expires_at || ""} onChange={e=>set("expires_at", e.target.value)} /><textarea className={area} value={draft.notes || ""} onChange={e=>set("notes", e.target.value)} placeholder="Комментарий и статус проверки"/><div className="flex gap-2"><button disabled={!draft.title?.trim() || !draft.document_url?.trim() || Boolean(busy)} onClick={()=>void save()} className="flex-1 rounded-lg bg-brand-500 px-4 py-3 text-sm font-semibold text-white disabled:opacity-40">{busy === "document" ? "Сохраняю…" : "Сохранить"}</button>{draft.id && <button onClick={()=>setDraft({category:"other",status:"active"})} className="rounded-lg border border-gray-200 px-4 text-sm dark:border-gray-700">Отмена</button>}</div></div></Panel>
  </div>;
}

export function ActivityPanel({ activities }: { activities: EntityActivity[] }) {
  return <Panel><div><h2 className="text-lg font-semibold text-gray-900 dark:text-white">История действий</h2><p className="mt-1 text-sm text-gray-500">Кто и когда менял профиль, офферы, документы и этапы сделки.</p></div><div className="mt-6 max-h-[720px] space-y-0 overflow-y-auto">{activities.map((activity, index) => <div key={activity.id} className="grid grid-cols-[22px_minmax(0,1fr)] gap-3"><div className="flex flex-col items-center"><span className="mt-1 h-2.5 w-2.5 rounded-full bg-brand-500"/>{index < activities.length - 1 && <span className="mt-1 h-full min-h-12 w-px bg-gray-200 dark:bg-gray-800"/>}</div><div className="pb-6"><div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"><strong className="text-sm text-gray-900 dark:text-white">{activity.title || activity.summary || activity.activity_type || activity.action_type || "Событие"}</strong><span className="text-xs text-gray-400">{formatDate(activity.created_at)}</span></div>{activity.body && <p className="mt-1 text-sm text-gray-500">{activity.body}</p>}<span className="mt-2 block text-[10px] font-semibold uppercase tracking-wide text-gray-400">{activity.activity_type || activity.action_type || activity.actor_type || "system"}</span></div></div>)}{!activities.length && <EmptyState title="История пока пуста" description="Изменения и этапы работы появятся здесь автоматически."/>}</div></Panel>;
}

export function TasksPanel({ tasks, busy, onSave }: { tasks: EntityTask[]; busy: string | null; onSave: (task: Partial<EntityTask>) => Promise<boolean> }) {
  const [draft, setDraft] = useState<Partial<EntityTask>>({ status: "pending", priority: "normal" });
  const set = (key: keyof EntityTask, value: unknown) => setDraft({ ...draft, [key]: value });
  const save = async () => { if (await onSave(draft)) setDraft({status:"pending",priority:"normal"}); };
  return <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.3fr)_380px]"><Panel><div className="flex items-center justify-between"><div><h2 className="text-lg font-semibold text-gray-900 dark:text-white">Задачи по мерчу</h2><p className="mt-1 text-sm text-gray-500">Следующие действия, сроки и ответственность.</p></div><span className="text-sm text-gray-400">{tasks.length}</span></div><div className="mt-5 divide-y divide-gray-100 dark:divide-gray-800">{tasks.map(task=><div key={task.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between"><div><strong className="text-sm text-gray-900 dark:text-white">{task.title}</strong><p className="mt-1 text-xs text-gray-400">{task.details || "Без описания"} · {task.due_at ? formatDate(task.due_at) : "без срока"}</p></div><div className="flex items-center gap-3"><StatusPill status={task.status}/><button onClick={()=>setDraft(task)} className="text-xs font-semibold text-brand-500">Изменить</button></div></div>)}{!tasks.length&&<EmptyState title="Задач нет" description="Добавьте следующее действие, чтобы запрос не завис."/>}</div></Panel><Panel><h2 className="text-lg font-semibold text-gray-900 dark:text-white">{draft.id ? "Редактировать задачу" : "Новая задача"}</h2><div className="mt-5 space-y-3"><input className={field} value={draft.title || ""} onChange={e=>set("title",e.target.value)} placeholder="Что нужно сделать"/><textarea className={area} value={draft.details || ""} onChange={e=>set("details",e.target.value)} placeholder="Описание"/><div className="grid grid-cols-2 gap-3"><select className={field} value={draft.priority || "normal"} onChange={e=>set("priority",e.target.value)}>{["low","normal","high","urgent"].map(value=><option key={value}>{value}</option>)}</select><select className={field} value={draft.status || "pending"} onChange={e=>set("status",e.target.value)}>{["pending","in_progress","done","cancelled","failed"].map(value=><option key={value}>{value}</option>)}</select></div><input className={field} type="datetime-local" value={draft.due_at?.slice(0,16) || ""} onChange={e=>set("due_at",e.target.value ? new Date(e.target.value).toISOString() : null)}/><div className="flex gap-2"><button disabled={!draft.title?.trim() || Boolean(busy)} onClick={()=>void save()} className="flex-1 rounded-lg bg-brand-500 px-4 py-3 text-sm font-semibold text-white disabled:opacity-40">{busy === "task" ? "Сохраняю…" : "Сохранить"}</button>{draft.id&&<button onClick={()=>setDraft({status:"pending",priority:"normal"})} className="rounded-lg border border-gray-200 px-4 text-sm dark:border-gray-700">Отмена</button>}</div></div></Panel></div>;
}

export function CommunicationsPanel({ leadId, conversations, emails }: { leadId: string; conversations: EntityConversation[]; emails: EntityEmail[] }) {
  const messages = conversations.flatMap(conversation => (conversation.messages || []).map(message => ({...message, channel: conversation.channel, subject: conversation.subject})));
  return <div className="grid grid-cols-1 gap-6 xl:grid-cols-2"><Panel><div className="flex items-start justify-between gap-4"><div><h2 className="text-lg font-semibold text-gray-900 dark:text-white">Переписка</h2><p className="mt-1 text-sm text-gray-500">Portal, Telegram и внутренние сообщения в контексте запроса.</p></div><Link to={`/communications?lead=${leadId}`} className="shrink-0 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white">Написать</Link></div><div className="mt-5 max-h-[620px] divide-y divide-gray-100 overflow-y-auto dark:divide-gray-800">{messages.sort((a,b)=>String(b.sent_at||"").localeCompare(String(a.sent_at||""))).map(message=><div key={message.id} className="py-4"><div className="flex items-center justify-between gap-3"><strong className="text-xs uppercase tracking-wide text-brand-500">{message.channel} · {message.direction || message.sender_type}</strong><span className="text-xs text-gray-400">{formatDate(message.sent_at)}</span></div><p className="mt-2 whitespace-pre-wrap text-sm text-gray-600 dark:text-gray-300">{message.body}</p></div>)}{!messages.length&&<EmptyState title="Сообщений пока нет" description="Откройте центр коммуникаций и начните рабочую переписку."/>}</div></Panel><Panel><h2 className="text-lg font-semibold text-gray-900 dark:text-white">Email по запросу</h2><p className="mt-1 text-sm text-gray-500">Письма, отправленные из капитанской рубки.</p><div className="mt-5 max-h-[620px] divide-y divide-gray-100 overflow-y-auto dark:divide-gray-800">{emails.map(email=><div key={email.id} className="py-4"><div className="flex items-start justify-between gap-3"><div><strong className="text-sm text-gray-900 dark:text-white">{email.subject || "Без темы"}</strong><span className="mt-1 block text-xs text-gray-400">{email.to_email || "нет получателя"} · {formatDate(email.created_at)}</span></div><StatusPill status={email.status}/></div><p className="mt-2 line-clamp-3 whitespace-pre-wrap text-xs text-gray-500">{email.body}</p></div>)}{!emails.length&&<EmptyState title="Писем пока нет" description="Исходящие письма, привязанные к мерчу, появятся здесь."/>}</div></Panel></div>;
}
