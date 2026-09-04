import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { EmptyState, Panel, StatusPill } from "./Ui";

type CompanyProfile = {
  id: string;
  internal_code?: string;
  name?: string;
  legal_name?: string;
  registration_number?: string;
  registration_jurisdiction?: string;
  registered_address?: string;
  operating_address?: string;
  website_url?: string;
  description?: string;
  license_status?: string;
  license_jurisdiction?: string;
  license_number?: string;
  verification_status?: string;
  verified_at?: string;
  updated_at?: string;
};

type CompanyDocument = {
  id: string;
  document_type: string;
  title: string;
  file_name: string;
  storage_path: string;
  mime_type?: string | null;
  size_bytes?: number | null;
  status: string;
  expires_at?: string | null;
  client_note?: string | null;
  review_note?: string | null;
  updated_at: string;
};

type CompanyWorkspace = {
  organization: CompanyProfile | null;
  profile_completion: number;
  documents: CompanyDocument[];
};

type Draft = Omit<CompanyProfile, "id" | "internal_code" | "verified_at" | "updated_at">;

const blankDraft: Draft = {
  name: "", legal_name: "", registration_number: "", registration_jurisdiction: "",
  registered_address: "", operating_address: "", website_url: "", description: "",
  license_status: "unknown", license_jurisdiction: "", license_number: "", verification_status: "unverified",
};

const fieldClass = "w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-900 outline-none focus:border-brand-400 dark:border-gray-700 dark:bg-gray-900 dark:text-white";
const labelClass = "grid gap-1.5 text-xs font-semibold text-gray-500";
const documentTypes = [
  ["license", "Лицензия"], ["corporate", "Корпоративный документ"], ["ownership", "Структура владения"],
  ["kyb", "KYB"], ["compliance", "Compliance"], ["financial", "Финансовый документ"],
  ["processing_statement", "Processing statement"], ["contract", "Договор"], ["other", "Другое"],
];

function fileSize(value?: number | null) {
  if (!value) return "";
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

export default function MerchantCompanyWorkspace({ leadId, onChanged }: { leadId: string; onChanged?: () => Promise<void> }) {
  const [workspace, setWorkspace] = useState<CompanyWorkspace | null>(null);
  const [draft, setDraft] = useState<Draft>(blankDraft);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [documentType, setDocumentType] = useState("corporate");
  const [documentTitle, setDocumentTitle] = useState("");
  const [documentExpiry, setDocumentExpiry] = useState("");
  const [documentNote, setDocumentNote] = useState("");
  const [pendingUpload, setPendingUpload] = useState<{ id: string; path: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    const ensured = await supabase.rpc("ensure_offerpsp_company_workspace", { p_lead_id: leadId });
    if (ensured.error) {
      setMessage({ tone: "error", text: ensured.error.message });
      setLoading(false);
      return;
    }
    const result = await supabase.rpc("get_offerpsp_company_workspace", { p_lead_id: leadId });
    if (result.error) {
      setMessage({ tone: "error", text: result.error.message });
      setLoading(false);
      return;
    }
    const next = result.data as CompanyWorkspace;
    setWorkspace(next);
    const profile = next.organization;
    setDraft(profile ? {
      name: profile.name || "", legal_name: profile.legal_name || "", registration_number: profile.registration_number || "",
      registration_jurisdiction: profile.registration_jurisdiction || "", registered_address: profile.registered_address || "",
      operating_address: profile.operating_address || "", website_url: profile.website_url || "", description: profile.description || "",
      license_status: profile.license_status || "unknown", license_jurisdiction: profile.license_jurisdiction || "",
      license_number: profile.license_number || "", verification_status: profile.verification_status || "unverified",
    } : blankDraft);
    setLoading(false);
  }, [leadId]);

  useEffect(() => { void load(); }, [load]);

  const set = (key: keyof Draft, value: string) => setDraft((current) => ({ ...current, [key]: value }));

  async function save() {
    const organizationId = workspace?.organization?.id;
    if (!organizationId) return;
    setBusy("profile"); setMessage(null);
    const result = await supabase.rpc("save_offerpsp_company_profile", { p_organization_id: organizationId, p_payload: draft });
    if (result.error) setMessage({ tone: "error", text: result.error.message });
    else {
      await load();
      if (onChanged) await onChanged();
      setMessage({ tone: "success", text: "Постоянный профиль компании сохранён." });
    }
    setBusy(null);
  }

  async function upload() {
    const organizationId = workspace?.organization?.id;
    if (!organizationId || !file || !documentTitle.trim()) return;
    if (file.size > 10 * 1024 * 1024) {
      setMessage({ tone: "error", text: "Файл превышает лимит 10 МБ." });
      return;
    }
    setBusy("upload"); setMessage(null);
    const id = pendingUpload?.id || crypto.randomUUID();
    const safeName = file.name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "document";
    const path = pendingUpload?.path || `${organizationId}/${id}/${safeName}`;
    if (!pendingUpload) {
      const uploaded = await supabase.storage.from("offerpsp-merchant-documents").upload(path, file, {
        cacheControl: "3600", contentType: file.type || undefined, upsert: false,
      });
      if (uploaded.error) {
        setMessage({ tone: "error", text: uploaded.error.message }); setBusy(null); return;
      }
      setPendingUpload({ id, path });
    }
    const registered = await supabase.rpc("register_offerpsp_company_document", {
      p_organization_id: organizationId,
      p_document_id: id,
      p_payload: {
        document_type: documentType, title: documentTitle.trim(), file_name: file.name, storage_path: path,
        mime_type: file.type || null, size_bytes: file.size, expires_at: documentExpiry || null,
        client_note: documentNote.trim() || null,
      },
    });
    if (registered.error) {
      setMessage({ tone: "error", text: `${registered.error.message}. Файл уже загружен — исправьте данные и повторите сохранение.` });
      setBusy(null); return;
    }
    setFile(null); setDocumentTitle(""); setDocumentExpiry(""); setDocumentNote(""); setPendingUpload(null);
    const input = document.getElementById("merchant-company-document-file") as HTMLInputElement | null;
    if (input) input.value = "";
    await load();
    setMessage({ tone: "success", text: "Документ загружен и поставлен на проверку." });
    setBusy(null);
  }

  async function download(item: CompanyDocument) {
    setBusy(`download:${item.id}`); setMessage(null);
    const result = await supabase.storage.from("offerpsp-merchant-documents").download(item.storage_path);
    if (result.error) setMessage({ tone: "error", text: result.error.message });
    else {
      const url = URL.createObjectURL(result.data);
      const anchor = document.createElement("a");
      anchor.href = url; anchor.download = item.file_name; anchor.target = "_blank";
      document.body.appendChild(anchor); anchor.click(); anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 30000);
    }
    setBusy(null);
  }

  async function review(item: CompanyDocument, status: string, note: string) {
    setBusy(`review:${item.id}`); setMessage(null);
    const result = await supabase.rpc("review_offerpsp_company_document", { p_document_id: item.id, p_status: status, p_review_note: note || null });
    if (result.error) setMessage({ tone: "error", text: result.error.message });
    else { await load(); setMessage({ tone: "success", text: "Статус документа обновлён." }); }
    setBusy(null);
  }

  async function archive(item: CompanyDocument) {
    setBusy(`archive:${item.id}`); setMessage(null);
    const result = await supabase.rpc("archive_offerpsp_company_document", { p_document_id: item.id });
    if (result.error) setMessage({ tone: "error", text: result.error.message });
    else { await load(); setMessage({ tone: "success", text: "Документ перемещён в архив." }); }
    setBusy(null);
  }

  if (loading) return <Panel><p className="text-sm text-gray-400">Загружаю постоянный профиль компании…</p></Panel>;
  if (!workspace?.organization) return <Panel><EmptyState title="Карточка компании не создана" description="Для карточки нужны название компании и рабочий email в заявке."/></Panel>;

  const visibleDocuments = workspace.documents.filter((item) => item.status !== "archived");
  return <div className="space-y-6">
    {message && <div className={`rounded-xl border px-4 py-3 text-sm ${message.tone === "error" ? "border-error-200 bg-error-50 text-error-700 dark:border-error-500/20 dark:bg-error-500/10 dark:text-error-300" : "border-success-200 bg-success-50 text-success-700 dark:border-success-500/20 dark:bg-success-500/10 dark:text-success-300"}`}>{message.text}</div>}
    <Panel>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div><p className="text-xs font-semibold uppercase tracking-[.18em] text-brand-500">Merchant identity</p><h2 className="mt-2 text-xl font-semibold text-gray-900 dark:text-white">Постоянный профиль компании</h2><p className="mt-1 max-w-2xl text-sm text-gray-500">Общие реквизиты для всех платёжных запросов. GEO, методы и объёмы редактируются отдельно в конкретной заявке.</p></div>
        <div className="flex items-center gap-3"><StatusPill status={draft.verification_status || "unverified"}/><strong className="text-2xl text-brand-500">{workspace.profile_completion}%</strong></div>
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <label className={labelClass}>Название бренда<input className={fieldClass} value={draft.name} onChange={(event)=>set("name", event.target.value)}/></label>
        <label className={labelClass}>Юридическое название<input className={fieldClass} value={draft.legal_name} onChange={(event)=>set("legal_name", event.target.value)}/></label>
        <label className={labelClass}>Регистрационный номер<input className={fieldClass} value={draft.registration_number} onChange={(event)=>set("registration_number", event.target.value)}/></label>
        <label className={labelClass}>Страна регистрации<input className={fieldClass} value={draft.registration_jurisdiction} onChange={(event)=>set("registration_jurisdiction", event.target.value)}/></label>
        <label className={`${labelClass} md:col-span-2`}>Юридический адрес<input className={fieldClass} value={draft.registered_address} onChange={(event)=>set("registered_address", event.target.value)}/></label>
        <label className={`${labelClass} md:col-span-2`}>Рабочий адрес<input className={fieldClass} value={draft.operating_address} onChange={(event)=>set("operating_address", event.target.value)}/></label>
        <label className={labelClass}>Сайт<input className={fieldClass} value={draft.website_url} onChange={(event)=>set("website_url", event.target.value)}/></label>
        <label className={labelClass}>Статус лицензии<select className={fieldClass} value={draft.license_status} onChange={(event)=>set("license_status", event.target.value)}><option value="unknown">Не указано</option><option value="licensed">Есть лицензия</option><option value="unlicensed">Без лицензии</option><option value="pending">В процессе</option><option value="not_required">Не требуется</option></select></label>
        <label className={labelClass}>Юрисдикция лицензии<input className={fieldClass} value={draft.license_jurisdiction} onChange={(event)=>set("license_jurisdiction", event.target.value)}/></label>
        <label className={labelClass}>Номер лицензии<input className={fieldClass} value={draft.license_number} onChange={(event)=>set("license_number", event.target.value)}/></label>
        <label className={labelClass}>Статус проверки<select className={fieldClass} value={draft.verification_status} onChange={(event)=>set("verification_status", event.target.value)}><option value="unverified">Не проверен</option><option value="in_review">На проверке</option><option value="verified">Проверен</option><option value="needs_information">Нужны данные</option><option value="rejected">Отклонён</option></select></label>
        <label className={`${labelClass} md:col-span-2 xl:col-span-3`}>Описание<textarea className={`${fieldClass} min-h-24`} value={draft.description} onChange={(event)=>set("description", event.target.value)}/></label>
      </div>
      <button disabled={Boolean(busy) || !draft.name?.trim()} onClick={()=>void save()} className="mt-5 rounded-lg bg-brand-500 px-5 py-3 text-sm font-semibold text-white disabled:opacity-40">{busy === "profile" ? "Сохраняю…" : "Сохранить профиль"}</button>
    </Panel>

    <Panel>
      <div><p className="text-xs font-semibold uppercase tracking-[.18em] text-brand-500">Document vault</p><h2 className="mt-2 text-xl font-semibold text-gray-900 dark:text-white">Документы компании</h2><p className="mt-1 text-sm text-gray-500">Приватные файлы до 10 МБ. Клиент видит статус и причину отклонения, но не внутренние заметки.</p></div>
      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <select className={fieldClass} value={documentType} onChange={(event)=>setDocumentType(event.target.value)}>{documentTypes.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>
        <input className={fieldClass} value={documentTitle} onChange={(event)=>setDocumentTitle(event.target.value)} placeholder="Название документа"/>
        <input className={fieldClass} type="date" value={documentExpiry} onChange={(event)=>setDocumentExpiry(event.target.value)}/>
        <input id="merchant-company-document-file" className={fieldClass} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx" onChange={(event)=>{ setPendingUpload(null); const selected=event.target.files?.[0]||null; setFile(selected); if(selected&&!documentTitle)setDocumentTitle(selected.name.replace(/\.[^.]+$/, "")); }}/>
        <input className={`${fieldClass} md:col-span-2 xl:col-span-3`} value={documentNote} onChange={(event)=>setDocumentNote(event.target.value)} placeholder="Комментарий клиента или администратора"/>
        <button disabled={Boolean(busy) || !file || !documentTitle.trim()} onClick={()=>void upload()} className="rounded-lg border border-brand-300 px-4 py-2.5 text-sm font-semibold text-brand-600 disabled:opacity-40">{busy === "upload" ? "Загружаю…" : "Загрузить"}</button>
      </div>
      <div className="mt-6 space-y-3">
        {visibleDocuments.map((item)=><DocumentReviewCard key={item.id} item={item} busy={busy} onDownload={()=>void download(item)} onReview={(status,note)=>void review(item,status,note)} onArchive={()=>void archive(item)}/>) }
        {!visibleDocuments.length && <EmptyState title="Документов пока нет" description="Клиент или администратор может загрузить лицензию, корпоративные документы, KYB и processing statements."/>}
      </div>
    </Panel>
  </div>;
}

function DocumentReviewCard({ item, busy, onDownload, onReview, onArchive }: {
  item: CompanyDocument; busy: string | null; onDownload: () => void; onReview: (status: string, note: string) => void; onArchive: () => void;
}) {
  const [status, setStatus] = useState(item.status);
  const [note, setNote] = useState(item.review_note || "");
  useEffect(() => { setStatus(item.status); setNote(item.review_note || ""); }, [item.status, item.review_note]);
  return <article className="rounded-2xl border border-gray-200 p-4 dark:border-gray-800">
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><strong className="text-sm text-gray-900 dark:text-white">{item.title}</strong><StatusPill status={item.status}/></div><p className="mt-1 truncate text-xs text-gray-400">{item.file_name}{item.size_bytes ? ` · ${fileSize(item.size_bytes)}` : ""}{item.expires_at ? ` · до ${new Date(item.expires_at).toLocaleDateString("ru-RU")}` : ""}</p>{item.client_note && <p className="mt-2 text-sm text-gray-500">Комментарий: {item.client_note}</p>}</div>
      <div className="flex flex-wrap gap-2"><button disabled={Boolean(busy)} onClick={onDownload} className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-600 dark:border-gray-700 dark:text-gray-300">Открыть</button><button disabled={Boolean(busy)} onClick={onArchive} className="rounded-lg border border-error-200 px-3 py-2 text-xs font-semibold text-error-600 dark:border-error-500/20">В архив</button></div>
    </div>
    <div className="mt-4 grid gap-3 md:grid-cols-[180px_minmax(0,1fr)_auto]">
      <select className={fieldClass} value={status} onChange={(event)=>setStatus(event.target.value)}><option value="pending">Ожидает проверки</option><option value="reviewing">Проверяется</option><option value="verified">Проверен</option><option value="rejected">Отклонён</option><option value="expired">Истёк</option></select>
      <input className={fieldClass} value={note} onChange={(event)=>setNote(event.target.value)} placeholder="Причина отклонения или внутренняя пометка"/>
      <button disabled={Boolean(busy)} onClick={()=>onReview(status,note)} className="rounded-lg bg-gray-900 px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-40 dark:bg-white dark:text-gray-900">Сохранить статус</button>
    </div>
  </article>;
}
