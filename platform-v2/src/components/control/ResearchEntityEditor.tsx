import { useMemo, useState } from "react";
import type { AgentPspProvider, CasinoLead } from "../../types/offerpsp";
import { supabase } from "../../lib/supabase";

type EntityType = "casino" | "psp";
type ResearchRecord = CasinoLead | AgentPspProvider;

const inputClass = "h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 outline-none focus:border-brand-400 dark:border-gray-700 dark:text-white";
const textareaClass = "min-h-24 w-full rounded-lg border border-gray-300 bg-transparent px-3 py-3 text-sm text-gray-800 outline-none focus:border-brand-400 dark:border-gray-700 dark:text-white";
const csv = (value: unknown) => Array.isArray(value) ? value.join(", ") : "";
const splitCsv = (value: unknown) => String(value || "").split(",").map((item) => item.trim()).filter(Boolean);

function Field({ label, children, wide = false }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return <label className={wide ? "md:col-span-2" : ""}><span className="mb-1.5 block text-xs font-semibold text-gray-500">{label}</span>{children}</label>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="rounded-2xl border border-gray-200 p-4 dark:border-gray-800"><h3 className="mb-4 text-sm font-semibold text-gray-900 dark:text-white">{title}</h3><div className="grid grid-cols-1 gap-4 md:grid-cols-2">{children}</div></section>;
}

export default function ResearchEntityEditor({ entityType, record, onClose, onSaved }: {
  entityType: EntityType;
  record?: ResearchRecord | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
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
  const set = (key: string, value: unknown) => setDraft((current) => ({ ...current, [key]: value }));
  const isNew = !record;
  const archived = record?.record_state === "archived";

  async function save() {
    if (!String(draft.name || "").trim()) { setMessage({ error: true, text: "Название обязательно." }); return; }
    setBusy(true); setMessage(null);
    const payload = { ...draft };
    delete payload.id; delete payload.internal_id; delete payload.created_at; delete payload.updated_at;
    delete payload.archived_at; delete payload.record_state;
    if (entityType === "casino") payload.tags = splitCsv(payload.tags);
    else {
      ["supported_countries", "supported_currencies", "payment_methods", "supported_verticals", "restricted_countries", "integration_types"].forEach((key) => { payload[key] = splitCsv(payload[key]); });
    }
    const result = await supabase.rpc("save_offerpsp_research_entity", {
      p_entity_type: entityType,
      p_record_id: record?.id || null,
      p_payload: payload,
    });
    if (result.error) { setMessage({ error: true, text: result.error.message }); setBusy(false); return; }
    await onSaved(); setBusy(false); onClose();
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

  return <div className="fixed inset-0 z-[100000] flex justify-end bg-gray-950/55 backdrop-blur-sm" role="dialog" aria-modal="true">
    <div className="flex h-full w-full max-w-4xl flex-col bg-white shadow-2xl dark:bg-gray-950">
      <header className="flex items-start justify-between gap-4 border-b border-gray-200 px-5 py-4 dark:border-gray-800">
        <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-500">{entityType === "casino" ? "AIBot · Online casino" : "AIBot · PSP research"}</p><h2 className="mt-1 text-xl font-semibold text-gray-900 dark:text-white">{isNew ? "Новая запись" : `Редактирование · ${String(draft.name || "Без названия")}`}</h2><p className="mt-1 text-xs text-gray-400">Все изменения сохраняются в общей Supabase-базе и журнале аудита.</p></div>
        <button onClick={onClose} className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-500 dark:border-gray-800">Закрыть</button>
      </header>
      <div className="flex-1 space-y-5 overflow-y-auto p-5">
        {message && <div className={`rounded-xl border px-4 py-3 text-sm ${message.error ? "border-error-200 bg-error-50 text-error-700" : "border-success-200 bg-success-50 text-success-700"}`}>{message.text}</div>}
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
          <Field label="Score 0–100"><input type="number" min="0" max="100" className={inputClass} value={String(draft.score ?? 0)} onChange={(event) => set("score", event.target.value)}/></Field>
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
      </div>
      <footer className="flex flex-col-reverse gap-3 border-t border-gray-200 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-gray-800">
        <div>{record && <button disabled={busy} onClick={()=>void changeState()} className={`rounded-lg border px-4 py-2.5 text-sm font-semibold ${archived ? "border-success-300 text-success-700" : "border-error-300 text-error-600"}`}>{archived ? "Восстановить" : "В архив"}</button>}</div>
        <div className="flex gap-3"><button onClick={onClose} className="rounded-lg border border-gray-200 px-4 py-2.5 text-sm text-gray-600 dark:border-gray-800 dark:text-gray-300">Отмена</button><button disabled={busy} onClick={()=>void save()} className="rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Сохраняю…" : "Сохранить"}</button></div>
      </footer>
    </div>
  </div>;
}
