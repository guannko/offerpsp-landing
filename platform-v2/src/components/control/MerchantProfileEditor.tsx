import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { supabase } from "../../lib/supabase";
import type { Lead, StaffMember } from "../../types/offerpsp";
import { Panel } from "./Ui";

const field = "mt-2 h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 outline-none focus:border-brand-400 dark:border-gray-700 dark:text-white";
const area = "mt-2 min-h-28 w-full rounded-lg border border-gray-300 bg-transparent px-3 py-3 text-sm text-gray-800 outline-none focus:border-brand-400 dark:border-gray-700 dark:text-white";
const statuses = ["new", "qualifying", "needs_clarification", "matching", "matched", "shortlist_ready", "shared", "option_selected", "dossier_ready", "provider_reviewing", "provider_needs_info", "provider_accepted", "provider_declined", "telegram_created", "zoom_scheduled", "negotiating", "won", "lost", "closed", "spam"];
const csv = (value?: string[] | null) => (value || []).join(", ");
const split = (value: string) => value.split(/[,;\n]/).map((item) => item.trim()).filter(Boolean);
const numberOrNull = (value: string) => value.trim() === "" ? null : Number(value);

type Draft = Record<string, string>;

function initial(lead: Lead): Draft {
  return {
    company: lead.company || "", name: lead.name || "", work_email: lead.work_email || "",
    telegram: lead.telegram || "", company_url: lead.company_url || "", vertical: lead.vertical || "",
    status: lead.status || "new", assigned_to: lead.assigned_to || "", quality_score: lead.quality_score?.toString() || "",
    quality_grade: lead.quality_grade || "", registration_geo: lead.registration_geo || "",
    target_geos: csv(lead.target_geos), requested_currencies: csv(lead.requested_currencies),
    requested_flows: csv(lead.requested_flows), requested_methods: csv(lead.requested_methods),
    traffic_types: csv(lead.traffic_types), expected_monthly_volume: lead.expected_monthly_volume?.toString() || "",
    volume_currency: lead.volume_currency || "", min_transaction_amount: lead.min_transaction_amount?.toString() || "",
    max_transaction_amount: lead.max_transaction_amount?.toString() || "", transaction_currency: lead.transaction_currency || "",
    business_model: lead.business_model || "", license_status: lead.license_status || "",
    license_jurisdiction: lead.license_jurisdiction || "", license_number: lead.license_number || "",
    license_evidence_url: lead.license_evidence_url || "", launch_timeline: lead.launch_timeline || "",
    current_processing_setup: lead.current_processing_setup || "", qualification_notes: lead.qualification_notes || "",
    details: lead.details || "", utm_source: lead.utm_source || "", utm_campaign: lead.utm_campaign || "",
  };
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-xs font-medium uppercase tracking-wide text-gray-500">{label}{children}</label>;
}

export default function MerchantProfileEditor({ lead, onChanged }: { lead: Lead; onChanged: () => Promise<void> }) {
  const navigate = useNavigate();
  const [draft, setDraft] = useState(() => initial(lead));
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ error?: boolean; text: string } | null>(null);
  const archived = lead.record_state === "archived";
  const deletePhrase = useMemo(() => `DELETE ${lead.company || ""}`, [lead.company]);

  useEffect(() => { setDraft(initial(lead)); }, [lead]);
  useEffect(() => {
    void supabase.from("offerpsp_staff_members").select("user_id,display_name,role,active").eq("active", true)
      .then(({ data }) => setStaff((data || []) as StaffMember[]));
  }, []);

  const set = (key: string, value: string) => setDraft((current) => ({ ...current, [key]: value }));

  async function save() {
    setBusy("save"); setMessage(null);
    const payload = {
      ...draft,
      assigned_to: draft.assigned_to || null,
      quality_score: numberOrNull(draft.quality_score),
      target_geos: split(draft.target_geos), requested_currencies: split(draft.requested_currencies),
      requested_flows: split(draft.requested_flows), requested_methods: split(draft.requested_methods),
      traffic_types: split(draft.traffic_types), expected_monthly_volume: numberOrNull(draft.expected_monthly_volume),
      min_transaction_amount: numberOrNull(draft.min_transaction_amount), max_transaction_amount: numberOrNull(draft.max_transaction_amount),
    };
    const result = await supabase.rpc("save_offerpsp_managed_merchant", { p_lead_id: lead.lead_id, p_payload: payload });
    if (result.error) setMessage({ error: true, text: result.error.message });
    else { await onChanged(); setMessage({ text: "Профиль мерча сохранён." }); }
    setBusy(null);
  }

  async function setRecordState(next: "active" | "archived") {
    const reason = next === "archived" ? window.prompt("Причина переноса в архив:") : null;
    if (next === "archived" && !reason?.trim()) return;
    setBusy(next); setMessage(null);
    const result = await supabase.rpc("set_offerpsp_merchant_record_state", { p_lead_id: lead.lead_id, p_record_state: next, p_reason: reason });
    if (result.error) setMessage({ error: true, text: result.error.message });
    else { await onChanged(); setMessage({ text: next === "archived" ? "Мерч перемещён в архив." : "Мерч восстановлен в работу." }); }
    setBusy(null);
  }

  async function purge() {
    const confirmation = window.prompt(`Безвозвратное удаление. Введите точно:\n${deletePhrase}`);
    if (confirmation !== deletePhrase) { if (confirmation !== null) setMessage({ error: true, text: "Подтверждение не совпало. Удаление отменено." }); return; }
    setBusy("purge"); setMessage(null);
    const result = await supabase.rpc("purge_offerpsp_merchant", { p_lead_id: lead.lead_id, p_confirmation: confirmation });
    if (result.error) { setMessage({ error: true, text: result.error.message }); setBusy(null); return; }
    await onChanged(); navigate("/merchants", { replace: true });
  }

  return <div className="space-y-6">
    {message && <div className={`rounded-xl border px-4 py-3 text-sm ${message.error ? "border-error-200 bg-error-50 text-error-700 dark:border-error-500/20 dark:bg-error-500/10 dark:text-error-300" : "border-success-200 bg-success-50 text-success-700 dark:border-success-500/20 dark:bg-success-500/10 dark:text-success-300"}`}>{message.text}</div>}
    <Panel><h2 className="text-lg font-semibold text-gray-900 dark:text-white">Компания и контакт</h2><div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      <Field label="Компания"><input className={field} value={draft.company} onChange={(e)=>set("company",e.target.value)}/></Field>
      <Field label="Контакт"><input className={field} value={draft.name} onChange={(e)=>set("name",e.target.value)}/></Field>
      <Field label="Email"><input type="email" className={field} value={draft.work_email} onChange={(e)=>set("work_email",e.target.value)}/></Field>
      <Field label="Telegram"><input className={field} value={draft.telegram} onChange={(e)=>set("telegram",e.target.value)}/></Field>
      <Field label="Сайт"><input className={field} value={draft.company_url} onChange={(e)=>set("company_url",e.target.value)}/></Field>
      <Field label="Вертикаль"><input className={field} value={draft.vertical} onChange={(e)=>set("vertical",e.target.value)}/></Field>
    </div></Panel>
    <Panel><h2 className="text-lg font-semibold text-gray-900 dark:text-white">Платёжный запрос</h2><div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      <Field label="GEO регистрации"><input className={field} value={draft.registration_geo} onChange={(e)=>set("registration_geo",e.target.value)}/></Field>
      <Field label="Целевые GEO"><input className={field} value={draft.target_geos} onChange={(e)=>set("target_geos",e.target.value)}/></Field>
      <Field label="Валюты"><input className={field} value={draft.requested_currencies} onChange={(e)=>set("requested_currencies",e.target.value)}/></Field>
      <Field label="PayIn / PayOut"><input className={field} value={draft.requested_flows} onChange={(e)=>set("requested_flows",e.target.value)}/></Field>
      <Field label="Методы"><input className={field} value={draft.requested_methods} onChange={(e)=>set("requested_methods",e.target.value)}/></Field>
      <Field label="Тип трафика"><input className={field} value={draft.traffic_types} onChange={(e)=>set("traffic_types",e.target.value)}/></Field>
      <Field label="Месячный оборот"><input type="number" className={field} value={draft.expected_monthly_volume} onChange={(e)=>set("expected_monthly_volume",e.target.value)}/></Field>
      <Field label="Валюта оборота"><input className={field} value={draft.volume_currency} onChange={(e)=>set("volume_currency",e.target.value)}/></Field>
      <Field label="Валюта транзакции"><input className={field} value={draft.transaction_currency} onChange={(e)=>set("transaction_currency",e.target.value)}/></Field>
      <Field label="Min транзакции"><input type="number" className={field} value={draft.min_transaction_amount} onChange={(e)=>set("min_transaction_amount",e.target.value)}/></Field>
      <Field label="Max транзакции"><input type="number" className={field} value={draft.max_transaction_amount} onChange={(e)=>set("max_transaction_amount",e.target.value)}/></Field>
    </div></Panel>
    <Panel><h2 className="text-lg font-semibold text-gray-900 dark:text-white">Квалификация и лицензия</h2><div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      <Field label="Бизнес-модель"><input className={field} value={draft.business_model} onChange={(e)=>set("business_model",e.target.value)}/></Field>
      <Field label="Статус лицензии"><input className={field} value={draft.license_status} onChange={(e)=>set("license_status",e.target.value)}/></Field>
      <Field label="Юрисдикция"><input className={field} value={draft.license_jurisdiction} onChange={(e)=>set("license_jurisdiction",e.target.value)}/></Field>
      <Field label="Номер лицензии"><input className={field} value={draft.license_number} onChange={(e)=>set("license_number",e.target.value)}/></Field>
      <Field label="Подтверждение лицензии"><input className={field} value={draft.license_evidence_url} onChange={(e)=>set("license_evidence_url",e.target.value)}/></Field>
      <Field label="План запуска"><input className={field} value={draft.launch_timeline} onChange={(e)=>set("launch_timeline",e.target.value)}/></Field>
    </div><div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2"><Field label="Текущий процессинг"><textarea className={area} value={draft.current_processing_setup} onChange={(e)=>set("current_processing_setup",e.target.value)}/></Field><Field label="Внутренние заметки"><textarea className={area} value={draft.qualification_notes} onChange={(e)=>set("qualification_notes",e.target.value)}/></Field></div></Panel>
    <Panel><h2 className="text-lg font-semibold text-gray-900 dark:text-white">Управление записью</h2><div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      <Field label="Статус"><select className={field} value={draft.status} onChange={(e)=>set("status",e.target.value)}>{statuses.map((value)=><option key={value} value={value}>{value}</option>)}</select></Field>
      <Field label="Ответственный"><select className={field} value={draft.assigned_to} onChange={(e)=>set("assigned_to",e.target.value)}><option value="">Не назначен</option>{staff.map((member)=><option key={member.user_id} value={member.user_id}>{member.display_name || member.user_id} · {member.role}</option>)}</select></Field>
      <Field label="Оценка 0–100"><input type="number" min="0" max="100" className={field} value={draft.quality_score} onChange={(e)=>set("quality_score",e.target.value)}/></Field>
      <Field label="Категория"><input className={field} value={draft.quality_grade} onChange={(e)=>set("quality_grade",e.target.value)}/></Field>
    </div><div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2"><Field label="Источник"><input className={field} value={draft.utm_source} onChange={(e)=>set("utm_source",e.target.value)}/></Field><Field label="Кампания"><input className={field} value={draft.utm_campaign} onChange={(e)=>set("utm_campaign",e.target.value)}/></Field></div>
      <div className="mt-6 flex flex-wrap gap-3"><button onClick={()=>void save()} disabled={Boolean(busy) || archived} className="rounded-lg bg-brand-500 px-5 py-3 text-sm font-semibold text-white disabled:opacity-40">{busy === "save" ? "Сохраняю…" : "Сохранить все изменения"}</button>{archived ? <><button onClick={()=>void setRecordState("active")} disabled={Boolean(busy)} className="rounded-lg border border-success-300 px-5 py-3 text-sm font-semibold text-success-700 disabled:opacity-40">Восстановить</button><button onClick={()=>void purge()} disabled={Boolean(busy)} className="rounded-lg border border-error-300 px-5 py-3 text-sm font-semibold text-error-700 disabled:opacity-40">Удалить безвозвратно</button></> : <button onClick={()=>void setRecordState("archived")} disabled={Boolean(busy)} className="rounded-lg border border-warning-300 px-5 py-3 text-sm font-semibold text-warning-700 disabled:opacity-40">В архив</button>}</div>
      <p className="mt-3 text-xs text-gray-400">Безвозвратное удаление доступно только владельцу, только после архива и запрещено для won/commission history.</p>
    </Panel>
  </div>;
}
