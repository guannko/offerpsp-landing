import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import PageMeta from "../components/common/PageMeta";
import { EmptyState, ErrorBanner, Panel, SkeletonPage, StatusPill, statusLabels } from "../components/control/Ui";
import { QuickStatusSelect, type QuickStatusOption } from "../components/control/QuickStatusSelect";
import { VisibilityToggleButton } from "../components/control/VisibilityToggleButton";
import { useControlBridge } from "../context/ControlBridgeContext";
import { supabase } from "../lib/supabase";
import type { Organization } from "../types/offerpsp";

type AgentDraft = Pick<Organization, "name" | "legal_name" | "status" | "relationship_tier" | "relationship_notes">;
type MarginDraft = { merchantId: string; flow: string; mode: string; percent: string; fixed: string; currency: string; notes: string };
type OrganizationMember = { id: string; organization_id: string; user_id: string; email: string; role: "owner" | "admin" | "manager" | "viewer"; active: boolean; updated_at?: string };
type MemberDraft = { id?: string; email: string; role: OrganizationMember["role"]; active: boolean };
type AgentCommission = { id: string; merchant_organization_id?: string | null; merchant_name?: string | null; lead_company?: string | null; basis: string; basis_amount?: number | null; commission_percent?: number | null; commission_fixed?: number | null; currency?: string | null; amount?: number | null; status: "projected" | "approved" | "earned" | "paid" | "void"; period_start?: string | null; period_end?: string | null; notes?: string | null; created_at: string };
type CommissionDraft = { merchantId: string; basis: string; basisAmount: string; percent: string; fixed: string; amount: string; currency: string; periodStart: string; periodEnd: string; notes: string };
type AgentBrandDraft = {
  co_brand_enabled: boolean;
  brand_display_name: string;
  brand_tagline_ru: string;
  brand_tagline_en: string;
  brand_logo_url: string;
  brand_accent_color: string;
  brand_support_email: string;
};

const fieldClass = "w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-800 outline-none focus:border-brand-400 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:text-white";
const emptyAgent: AgentDraft = { name: "", legal_name: "", status: "active", relationship_tier: "standard", relationship_notes: "" };
const emptyMargin: MarginDraft = { merchantId: "", flow: "all", mode: "percentage_points", percent: "", fixed: "", currency: "", notes: "" };
const emptyMember: MemberDraft = { email: "", role: "manager", active: true };
const emptyCommission: CommissionDraft = { merchantId: "", basis: "revenue_share", basisAmount: "", percent: "", fixed: "", amount: "", currency: "EUR", periodStart: "", periodEnd: "", notes: "" };
const emptyBrand: AgentBrandDraft = { co_brand_enabled: false, brand_display_name: "", brand_tagline_ru: "", brand_tagline_en: "", brand_logo_url: "", brand_accent_color: "#FF477D", brand_support_email: "" };
const nextCommissionStatus = (status: AgentCommission["status"]): AgentCommission["status"] | null => ({ projected: "approved", approved: "earned", earned: "paid", paid: null, void: null }[status] as AgentCommission["status"] | null);
const agentStatusOptions: QuickStatusOption[] = [
  { value: "pending", label: "Новый / переговоры" },
  { value: "active", label: "Активный" },
  { value: "paused", label: "Пауза" },
  { value: "archived", label: "Архив" },
];

export default function AgentWorkspace() {
  const { agentId } = useParams();
  const isNew = agentId === "new";
  const navigate = useNavigate();
  const { organizations, assignments, agentMarginPolicies, loading, refresh } = useControlBridge();
  const agent = organizations.find((item) => item.id === agentId && item.organization_type === "agent");
  const merchants = organizations.filter((item) => item.organization_type === "merchant" && item.status !== "archived");
  const [draft, setDraft] = useState<AgentDraft>(emptyAgent);
  const [merchantId, setMerchantId] = useState("");
  const [assignmentStatus, setAssignmentStatus] = useState("active");
  const [margin, setMargin] = useState<MarginDraft>(emptyMargin);
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [member, setMember] = useState<MemberDraft>(emptyMember);
  const [commissions, setCommissions] = useState<AgentCommission[]>([]);
  const [commission, setCommission] = useState<CommissionDraft>(emptyCommission);
  const [brand, setBrand] = useState<AgentBrandDraft>(emptyBrand);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (agent) setDraft({ name: agent.name, legal_name: agent.legal_name || "", status: agent.status || "active", relationship_tier: agent.relationship_tier || "standard", relationship_notes: agent.relationship_notes || "" });
  }, [agent]);

  const execute = useCallback(async (name: string, action: () => Promise<{ data?: unknown; error: { message: string } | null }>, success: string) => {
    setBusy(name); setMessage(null);
    const result = await action();
    if (result.error) { setMessage({ tone: "error", text: result.error.message }); setBusy(null); return null; }
    await refresh();
    setMessage({ tone: "success", text: success }); setBusy(null);
    return result.data;
  }, [refresh]);

  const loadMembers = useCallback(async () => {
    if (!agentId || isNew) return;
    const result = await supabase.rpc("get_offerpsp_organization_members", { p_organization_id: agentId });
    if (result.error) {
      setMessage({ tone: "error", text: result.error.message });
      return;
    }
    setMembers(Array.isArray(result.data) ? result.data as OrganizationMember[] : []);
  }, [agentId, isNew]);

  useEffect(() => { void loadMembers(); }, [loadMembers]);

  const loadCommissions = useCallback(async () => {
    if (!agentId || isNew) return;
    const result = await supabase.rpc("list_offerpsp_agent_commissions", { p_agent_organization_id: agentId });
    if (result.error) { setMessage({ tone: "error", text: result.error.message }); return; }
    setCommissions(Array.isArray(result.data) ? result.data as AgentCommission[] : []);
  }, [agentId, isNew]);

  useEffect(() => { void loadCommissions(); }, [loadCommissions]);

  const loadBrand = useCallback(async () => {
    if (!agentId || isNew) return;
    const result = await supabase.rpc("get_offerpsp_agent_brand_settings", { p_organization_id: agentId });
    if (result.error) { setMessage({ tone: "error", text: result.error.message }); return; }
    const value = (result.data || {}) as Partial<AgentBrandDraft>;
    setBrand({
      co_brand_enabled: Boolean(value.co_brand_enabled),
      brand_display_name: value.brand_display_name || "",
      brand_tagline_ru: value.brand_tagline_ru || "",
      brand_tagline_en: value.brand_tagline_en || "",
      brand_logo_url: value.brand_logo_url || "",
      brand_accent_color: value.brand_accent_color || "#FF477D",
      brand_support_email: value.brand_support_email || "",
    });
  }, [agentId, isNew]);

  useEffect(() => { void loadBrand(); }, [loadBrand]);

  async function saveAgent() {
    const data = await execute("agent", async () => { const result = await supabase.rpc("save_offerpsp_organization", { p_organization_id: isNew ? null : agentId, p_organization_type: "agent", p_payload: draft }); return { data: result.data, error: result.error }; }, "Карточка субагента сохранена.");
    if (isNew && data && typeof data === "object" && "id" in data) navigate(`/agents/${String((data as { id: unknown }).id)}`, { replace: true });
  }

  async function changeAgentStatus(nextStatus: string) {
    if (!agentId || isNew || !agent || nextStatus === agent.status) return;
    if (nextStatus === "archived" && !window.confirm("Переместить субагента в архив? Изменение будет записано в историю.")) return;
    const nextDraft = { ...draft, status: nextStatus };
    const saved = await execute("agent-status", async () => {
      const result = await supabase.rpc("save_offerpsp_organization", {
        p_organization_id: agentId,
        p_organization_type: "agent",
        p_payload: nextDraft,
      });
      return { data: result.data, error: result.error };
    }, "Статус субагента обновлён.");
    if (saved) setDraft(nextDraft);
  }

  async function saveAssignment() {
    if (!agentId || !merchantId) return;
    await execute("assignment", async () => { const result = await supabase.rpc("set_offerpsp_agent_assignment", { p_agent_organization_id: agentId, p_merchant_organization_id: merchantId, p_status: assignmentStatus }); return { data: result.data, error: result.error }; }, "Закрепление мерча обновлено.");
  }

  async function saveBrand() {
    if (!agentId) return;
    const saved = await execute("brand", async () => {
      const result = await supabase.rpc("save_offerpsp_agent_brand_settings", {
        p_organization_id: agentId,
        p_payload: brand,
      });
      return { data: result.data, error: result.error };
    }, "Co-brand кабинет субагента обновлён.");
    if (saved) await loadBrand();
  }

  async function saveMargin() {
    if (!agentId) return;
    await execute("margin", async () => { const result = await supabase.rpc("set_offerpsp_agent_margin_policy", { p_agent_organization_id: agentId, p_merchant_organization_id: margin.merchantId || null, p_flow: margin.flow, p_mode: margin.mode, p_percent_value: margin.percent === "" ? null : Number(margin.percent), p_fixed_value: margin.fixed === "" ? null : Number(margin.fixed), p_fixed_currency: margin.currency || null, p_notes: margin.notes || null }); return { data: result.data, error: result.error }; }, "Новая версия агентской маржи сохранена.");
    setMargin(emptyMargin);
  }

  async function saveMember() {
    if (!agentId || !member.email.trim()) return;
    const saved = await execute("member", async () => {
      const result = await supabase.rpc("save_offerpsp_organization_member", {
        p_organization_id: agentId,
        p_member_id: member.id || null,
        p_email: member.email.trim().toLowerCase(),
        p_role: member.role,
        p_active: member.active,
      });
      return { data: result.data, error: result.error };
    }, member.id ? "Роль и доступ участника обновлены." : "Участник добавлен в организацию.");
    if (saved) {
      setMember(emptyMember);
      await loadMembers();
    }
  }

  async function inviteMember() {
    if (!agentId || !member.email.trim() || member.id) return;
    setBusy("invite");
    setMessage(null);
    const result = await supabase.functions.invoke("offerpsp-invite-member", {
      body: {
        organization_id: agentId,
        email: member.email.trim().toLowerCase(),
        role: member.role,
      },
    });
    if (result.error || result.data?.success === false) {
      setMessage({ tone: "error", text: result.data?.error || result.error?.message || "Не удалось отправить приглашение." });
      setBusy(null);
      return;
    }
    setMember(emptyMember);
    await loadMembers();
    setMessage({ tone: "success", text: result.data?.invited ? "Приглашение отправлено, роль назначена." : "Пользователь уже зарегистрирован, роль назначена." });
    setBusy(null);
  }

  async function saveCommission() {
    if (!agentId || !commission.amount || !commission.currency.trim()) return;
    const saved = await execute("commission", async () => {
      const result = await supabase.rpc("save_offerpsp_agent_commission", {
        p_agent_organization_id: agentId,
        p_commission_id: null,
        p_payload: {
          merchant_organization_id: commission.merchantId || null,
          basis: commission.basis,
          basis_amount: commission.basisAmount || null,
          commission_percent: commission.percent || null,
          commission_fixed: commission.fixed || null,
          amount: commission.amount,
          currency: commission.currency,
          period_start: commission.periodStart || null,
          period_end: commission.periodEnd || null,
          notes: commission.notes || null,
        },
      });
      return { data: result.data, error: result.error };
    }, "Начисление добавлено как projected.");
    if (saved) { setCommission(emptyCommission); await loadCommissions(); }
  }

  async function advanceCommission(item: AgentCommission, status: AgentCommission["status"]) {
    const saved = await execute(`commission-${item.id}`, async () => {
      const result = await supabase.rpc("set_offerpsp_agent_commission_status", { p_commission_id: item.id, p_status: status, p_notes: null });
      return { data: result.data, error: result.error };
    }, `Статус начисления: ${status}.`);
    if (saved) await loadCommissions();
  }

  function downloadCommissionStatement() {
    const header = ["period_start", "period_end", "merchant", "basis", "basis_amount", "commission_percent", "commission_fixed", "amount", "currency", "status", "notes"];
    const cell = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const rows = commissions.map((item) => [item.period_start, item.period_end, item.merchant_name || item.lead_company, item.basis, item.basis_amount, item.commission_percent, item.commission_fixed, item.amount, item.currency, item.status, item.notes].map(cell).join(","));
    const blob = new Blob([[header.join(","), ...rows].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = `offerpsp-${agent?.internal_code || "agent"}-commissions.csv`; anchor.click();
    URL.revokeObjectURL(url);
  }

  if (loading) return <SkeletonPage/>;
  if (!isNew && !agent) return <ErrorBanner message="Субагент не найден или находится вне доступного реестра."/>;
  const agentAssignments = assignments.filter((item) => item.agent_organization_id === agentId);
  const policies = agentMarginPolicies.filter((item) => item.agent_organization_id === agentId);

  return <>
    <PageMeta title={`${isNew ? "Новый субагент" : agent?.name} | OfferPSP`} description="Agent workspace"/>
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><Link to="/agents" className="text-sm font-medium text-gray-500 hover:text-brand-500">← Реестр субагентов</Link><div className="mt-3 flex flex-wrap items-center gap-3"><h1 className="text-3xl font-semibold text-gray-900 dark:text-white">{isNew ? "Новый субагент" : agent?.name}</h1>{agent && <QuickStatusSelect value={agent.status} options={agentStatusOptions} busy={busy === "agent-status"} onChange={changeAgentStatus}/>}</div><p className="mt-2 text-sm text-gray-500">Портфель мерчей, персональная наценка и история условий.</p></div>{agent && <VisibilityToggleButton hidden={agent.status === "archived"} busy={busy === "agent-status"} onToggle={() => changeAgentStatus(agent.status === "archived" ? "active" : "archived")}/>}</div>
    {message && (message.tone === "error" ? <ErrorBanner message={message.text}/> : <div className="mb-5 rounded-xl border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-700 dark:border-success-500/20 dark:bg-success-500/10 dark:text-success-300">{message.text}</div>)}
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
      <Panel><h2 className="text-lg font-semibold text-gray-900 dark:text-white">Профиль</h2><div className="mt-5 space-y-4"><Field label="Название"><input className={fieldClass} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })}/></Field><Field label="Юридическое имя"><input className={fieldClass} value={draft.legal_name || ""} onChange={(event) => setDraft({ ...draft, legal_name: event.target.value })}/></Field><div className="grid grid-cols-2 gap-3"><Field label="Статус"><select className={fieldClass} value={draft.status || "active"} onChange={(event) => setDraft({ ...draft, status: event.target.value })}>{["pending", "active", "paused", "archived"].map((value) => <option key={value} value={value}>{statusLabels[value] || value}</option>)}</select></Field><Field label="Категория"><select className={fieldClass} value={draft.relationship_tier || "standard"} onChange={(event) => setDraft({ ...draft, relationship_tier: event.target.value })}>{["top", "core", "standard", "watchlist"].map((value) => <option key={value} value={value}>{statusLabels[value] || value}</option>)}</select></Field></div><Field label="Заметки"><textarea className={fieldClass} value={draft.relationship_notes || ""} onChange={(event) => setDraft({ ...draft, relationship_notes: event.target.value })}/></Field><button disabled={!draft.name.trim() || Boolean(busy)} onClick={() => void saveAgent()} className="w-full rounded-lg bg-brand-500 px-4 py-3 text-sm font-semibold text-white disabled:opacity-40">{busy === "agent" ? "Сохраняю…" : "Сохранить субагента"}</button></div></Panel>
      {!isNew && <div className="space-y-6">
        <Panel>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-500">Co-branded workspace</p><h2 className="mt-2 text-lg font-semibold text-gray-900 dark:text-white">Бренд кабинета агента</h2><p className="mt-1 text-sm text-gray-500">Клиент видит бренд агента вместе с подписью Powered by OfferPSP. Внутренние PSP и слои маржи не раскрываются.</p></div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-300"><input type="checkbox" checked={brand.co_brand_enabled} onChange={(event) => setBrand({ ...brand, co_brand_enabled: event.target.checked })} className="accent-[#ff477d]"/>Включить</label>
          </div>
          <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="space-y-3">
              <Field label="Название бренда"><input maxLength={80} className={fieldClass} value={brand.brand_display_name} onChange={(event) => setBrand({ ...brand, brand_display_name: event.target.value })} placeholder={agent?.name || "Partner"}/></Field>
              <Field label="Подпись RU"><input maxLength={180} className={fieldClass} value={brand.brand_tagline_ru} onChange={(event) => setBrand({ ...brand, brand_tagline_ru: event.target.value })} placeholder="Ваш платёжный партнёр"/></Field>
              <Field label="Подпись EN"><input maxLength={180} className={fieldClass} value={brand.brand_tagline_en} onChange={(event) => setBrand({ ...brand, brand_tagline_en: event.target.value })} placeholder="Your payment partner"/></Field>
              <Field label="Логотип (HTTPS URL)"><input type="url" className={fieldClass} value={brand.brand_logo_url} onChange={(event) => setBrand({ ...brand, brand_logo_url: event.target.value })} placeholder="https://…/logo.png"/></Field>
              <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-3"><Field label="Акцент"><input type="color" className={`${fieldClass} h-11 p-1`} value={brand.brand_accent_color || "#FF477D"} onChange={(event) => setBrand({ ...brand, brand_accent_color: event.target.value.toUpperCase() })}/></Field><Field label="Email поддержки"><input type="email" className={fieldClass} value={brand.brand_support_email} onChange={(event) => setBrand({ ...brand, brand_support_email: event.target.value })} placeholder="support@partner.com"/></Field></div>
              <button disabled={Boolean(busy) || (brand.co_brand_enabled && !brand.brand_display_name.trim())} onClick={() => void saveBrand()} className="w-full rounded-lg bg-brand-500 px-4 py-3 text-sm font-semibold text-white disabled:opacity-40">{busy === "brand" ? "Сохраняю…" : "Сохранить оформление"}</button>
            </div>
            <div className="rounded-2xl border border-gray-200 p-5 dark:border-gray-800" style={{ borderColor: brand.brand_accent_color || undefined }}>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">Предпросмотр для мерча</p>
              <div className="mt-5 flex items-center gap-4">{brand.brand_logo_url ? <img src={brand.brand_logo_url} alt="" className="h-12 w-12 rounded-xl object-contain"/> : <span className="grid h-12 w-12 place-items-center rounded-xl text-sm font-bold text-white" style={{ background: brand.brand_accent_color || "#FF477D" }}>{(brand.brand_display_name || agent?.name || "A").slice(0, 2).toUpperCase()}</span>}<div><strong className="block text-lg text-gray-900 dark:text-white">{brand.brand_display_name || agent?.name}</strong><span className="text-sm text-gray-500">{brand.brand_tagline_ru || "Агентский платёжный кабинет"}</span></div></div>
              <div className="mt-5 border-t border-gray-100 pt-4 text-xs text-gray-400 dark:border-gray-800">Powered by <strong className="text-gray-600 dark:text-gray-300">OfferPSP</strong>{brand.brand_support_email ? ` · ${brand.brand_support_email}` : ""}</div>
            </div>
          </div>
        </Panel>
        <Panel><div className="flex items-start justify-between gap-4"><div><h2 className="text-lg font-semibold text-gray-900 dark:text-white">Участники и роли</h2><p className="mt-1 text-sm text-gray-500">Owner управляет организацией, admin — командой, manager — мерчами, viewer имеет только просмотр.</p></div><span className="text-xs text-gray-400">{members.filter((item) => item.active).length} активных</span></div><div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]"><div className="space-y-2">{members.map((item) => <button key={item.id} onClick={() => setMember({ id: item.id, email: item.email, role: item.role, active: item.active })} className={`flex w-full items-center justify-between rounded-xl border p-3 text-left ${member.id === item.id ? "border-brand-300 bg-brand-50/50 dark:border-brand-500/40 dark:bg-brand-500/10" : "border-gray-200 dark:border-gray-800"}`}><div className="min-w-0"><strong className="block truncate text-sm text-gray-900 dark:text-white">{item.email}</strong><span className="mt-1 block text-xs text-gray-400">{item.role}</span></div><StatusPill status={item.active ? "active" : "archived"}/></button>)}{!members.length && <EmptyState title="Команда не добавлена" description="Пригласите участника по email и назначьте ему роль."/>}</div><div className="space-y-3 rounded-xl bg-gray-50 p-4 dark:bg-white/[0.03]"><Field label="Google / рабочий email"><input type="email" disabled={Boolean(member.id)} className={fieldClass} value={member.email} onChange={(event) => setMember({ ...member, email: event.target.value })} placeholder="partner@company.com"/></Field><Field label="Роль"><select className={fieldClass} value={member.role} onChange={(event) => setMember({ ...member, role: event.target.value as MemberDraft["role"] })}><option value="owner">Owner</option><option value="admin">Admin</option><option value="manager">Manager</option><option value="viewer">Viewer</option></select></Field><label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300"><input type="checkbox" checked={member.active} onChange={(event) => setMember({ ...member, active: event.target.checked })} className="accent-[#ff477d]"/>Доступ активен</label><p className="text-xs leading-5 text-gray-400">Новый пользователь получит защищённое приглашение на email. Уже зарегистрированному участнику роль назначится сразу.</p><div className="flex gap-2"><button disabled={!member.email.trim() || Boolean(busy)} onClick={() => void (member.id ? saveMember() : inviteMember())} className="flex-1 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">{busy === "member" || busy === "invite" ? "Сохраняю…" : member.id ? "Обновить доступ" : "Пригласить и добавить"}</button>{member.id && <button onClick={() => setMember(emptyMember)} className="rounded-lg border border-gray-200 px-4 text-sm dark:border-gray-700">Новый</button>}</div></div></div></Panel>
        <Panel><div className="flex items-center justify-between"><h2 className="text-lg font-semibold text-gray-900 dark:text-white">Закреплённые мерчи</h2><span className="text-xs text-gray-400">{agentAssignments.length}</span></div><div className="mt-4 space-y-2">{agentAssignments.map((item) => <div key={item.id} className="flex items-center justify-between rounded-xl border border-gray-200 p-3 dark:border-gray-800"><div><strong className="text-sm text-gray-900 dark:text-white">{item.merchant_name}</strong><span className="block text-xs text-gray-400">атрибуция и защита лида</span></div><StatusPill status={item.status}/></div>)}{!agentAssignments.length && <EmptyState title="Мерчи не закреплены" description="Добавьте существующего мерча к портфелю субагента."/>}</div><div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_180px_auto]"><select className={fieldClass} value={merchantId} onChange={(event) => setMerchantId(event.target.value)}><option value="">Выберите мерча</option>{merchants.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><select className={fieldClass} value={assignmentStatus} onChange={(event) => setAssignmentStatus(event.target.value)}>{["pending", "active", "paused", "ended"].map((value) => <option key={value} value={value}>{statusLabels[value] || value}</option>)}</select><button disabled={!merchantId || Boolean(busy)} onClick={() => void saveAssignment()} className="rounded-lg bg-brand-500 px-5 text-sm font-semibold text-white disabled:opacity-40">Закрепить</button></div></Panel>
        <Panel><div className="flex items-center justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-500">Цепочка цены</p><h2 className="mt-2 text-lg font-semibold text-gray-900 dark:text-white">Наценка субагента</h2></div><span className="text-xs text-gray-400">версий: {policies.length}</span></div><div className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-3"><select className={fieldClass} value={margin.merchantId} onChange={(event) => setMargin({ ...margin, merchantId: event.target.value })}><option value="">Для всех мерчей</option>{merchants.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><select className={fieldClass} value={margin.flow} onChange={(event) => setMargin({ ...margin, flow: event.target.value })}>{["all", "payin", "payout", "settlement", "refund", "chargeback"].map((value) => <option key={value} value={value}>{statusLabels[value] || value}</option>)}</select><select className={fieldClass} value={margin.mode} onChange={(event) => setMargin({ ...margin, mode: event.target.value })}>{["percentage_points", "relative_percent", "fixed", "hybrid", "override"].map((value) => <option key={value} value={value}>{statusLabels[value] || value}</option>)}</select><input type="number" step="0.01" className={fieldClass} value={margin.percent} onChange={(event) => setMargin({ ...margin, percent: event.target.value })} placeholder="Процент"/><input type="number" step="0.01" className={fieldClass} value={margin.fixed} onChange={(event) => setMargin({ ...margin, fixed: event.target.value })} placeholder="Фиксированная сумма"/><input className={fieldClass} value={margin.currency} onChange={(event) => setMargin({ ...margin, currency: event.target.value })} placeholder="Валюта"/></div><div className="mt-3 flex gap-3"><input className={fieldClass} value={margin.notes} onChange={(event) => setMargin({ ...margin, notes: event.target.value })} placeholder="Причина новой версии"/><button disabled={Boolean(busy) || (margin.mode !== "override" && !margin.percent && !margin.fixed)} onClick={() => void saveMargin()} className="shrink-0 rounded-lg bg-brand-500 px-5 text-sm font-semibold text-white disabled:opacity-40">Применить</button></div><div className="mt-5 flex flex-wrap gap-2">{policies.filter((item) => item.active).map((item) => <span key={item.id} className="rounded-full bg-gray-100 px-3 py-1.5 text-xs text-gray-700 dark:bg-white/5 dark:text-gray-300">{merchants.find((merchant) => merchant.id === item.merchant_organization_id)?.name || "Все мерчи"} · {statusLabels[item.flow] || item.flow} · {item.percent_value ?? item.fixed_value ?? statusLabels[item.mode] ?? item.mode}</span>)}</div></Panel>
        <Panel><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-500">Реестр комиссий</p><h2 className="mt-2 text-lg font-semibold text-gray-900 dark:text-white">Начисления субагента</h2><p className="mt-1 text-sm text-gray-500">Расчёт → подтверждение → заработано → выплачено. Оплаченные записи не перезаписываются.</p></div><button disabled={!commissions.length} onClick={downloadCommissionStatement} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 disabled:opacity-40 dark:border-gray-700 dark:text-gray-300">Скачать CSV</button></div><div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4"><select className={fieldClass} value={commission.merchantId} onChange={(event) => setCommission({ ...commission, merchantId: event.target.value })}><option value="">Без привязки к мерчу</option>{agentAssignments.map((item) => <option key={item.merchant_organization_id} value={item.merchant_organization_id}>{item.merchant_name}</option>)}</select><select className={fieldClass} value={commission.basis} onChange={(event) => setCommission({ ...commission, basis: event.target.value })}>{["processing_volume", "revenue_share", "fixed_referral", "manual"].map((value) => <option key={value} value={value}>{statusLabels[value] || value}</option>)}</select><input type="number" step="0.01" className={fieldClass} value={commission.basisAmount} onChange={(event) => setCommission({ ...commission, basisAmount: event.target.value })} placeholder="База расчёта"/><input type="number" step="0.01" className={fieldClass} value={commission.percent} onChange={(event) => setCommission({ ...commission, percent: event.target.value })} placeholder="Комиссия, %"/><input type="number" step="0.01" className={fieldClass} value={commission.fixed} onChange={(event) => setCommission({ ...commission, fixed: event.target.value })} placeholder="Фиксированная комиссия"/><input type="number" step="0.01" min="0" className={fieldClass} value={commission.amount} onChange={(event) => setCommission({ ...commission, amount: event.target.value })} placeholder="Итого к начислению"/><input className={fieldClass} value={commission.currency} onChange={(event) => setCommission({ ...commission, currency: event.target.value.toUpperCase() })} placeholder="EUR"/><div className="grid grid-cols-2 gap-2"><input type="date" className={fieldClass} value={commission.periodStart} onChange={(event) => setCommission({ ...commission, periodStart: event.target.value })}/><input type="date" className={fieldClass} value={commission.periodEnd} onChange={(event) => setCommission({ ...commission, periodEnd: event.target.value })}/></div></div><div className="mt-3 flex gap-3"><input className={fieldClass} value={commission.notes} onChange={(event) => setCommission({ ...commission, notes: event.target.value })} placeholder="Основание или комментарий"/><button disabled={!commission.amount || !commission.currency.trim() || Boolean(busy)} onClick={() => void saveCommission()} className="shrink-0 rounded-lg bg-brand-500 px-5 text-sm font-semibold text-white disabled:opacity-40">Добавить расчёт</button></div><div className="mt-6 space-y-2">{commissions.map((item) => <div key={item.id} className="flex flex-col gap-3 rounded-xl border border-gray-200 p-4 md:flex-row md:items-center md:justify-between dark:border-gray-800"><div><div className="flex flex-wrap items-center gap-2"><strong className="text-sm text-gray-900 dark:text-white">{item.merchant_name || item.lead_company || "Без мерча"}</strong><StatusPill status={item.status}/></div><span className="mt-1 block text-xs text-gray-400">{item.period_start || "—"} → {item.period_end || "—"} · {statusLabels[item.basis] || item.basis}</span></div><div className="flex flex-wrap items-center gap-2"><strong className="mr-2 text-base text-gray-900 dark:text-white">{Number(item.amount || 0).toLocaleString("ru-RU")} {item.currency}</strong>{nextCommissionStatus(item.status) && <button disabled={Boolean(busy)} onClick={() => void advanceCommission(item, nextCommissionStatus(item.status)!)} className="rounded-lg bg-brand-500 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">→ {statusLabels[nextCommissionStatus(item.status)!] || nextCommissionStatus(item.status)}</button>}{!["paid", "void"].includes(item.status) && <button disabled={Boolean(busy)} onClick={() => void advanceCommission(item, "void")} className="rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-500 disabled:opacity-40 dark:border-gray-700">Аннулировать</button>}</div></div>)}{!commissions.length && <EmptyState title="Начислений пока нет" description="Добавьте первый расчёт после согласования агентского вознаграждения."/>}</div></Panel>
      </div>}
    </div>
  </>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-1.5 block text-xs font-medium text-gray-500">{label}</span>{children}</label>; }
