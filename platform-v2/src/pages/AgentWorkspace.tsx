import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import PageMeta from "../components/common/PageMeta";
import { EmptyState, ErrorBanner, Panel, SkeletonPage, StatusPill } from "../components/control/Ui";
import { useControlBridge } from "../context/ControlBridgeContext";
import { supabase } from "../lib/supabase";
import type { Organization } from "../types/offerpsp";

type AgentDraft = Pick<Organization, "name" | "legal_name" | "status" | "relationship_tier" | "relationship_notes">;
type MarginDraft = { merchantId: string; flow: string; mode: string; percent: string; fixed: string; currency: string; notes: string };

const fieldClass = "w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-800 outline-none focus:border-brand-400 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:text-white";
const emptyAgent: AgentDraft = { name: "", legal_name: "", status: "active", relationship_tier: "standard", relationship_notes: "" };
const emptyMargin: MarginDraft = { merchantId: "", flow: "all", mode: "percentage_points", percent: "", fixed: "", currency: "", notes: "" };

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

  async function saveAgent() {
    const data = await execute("agent", async () => { const result = await supabase.rpc("save_offerpsp_organization", { p_organization_id: isNew ? null : agentId, p_organization_type: "agent", p_payload: draft }); return { data: result.data, error: result.error }; }, "Карточка субагента сохранена.");
    if (isNew && data && typeof data === "object" && "id" in data) navigate(`/agents/${String((data as { id: unknown }).id)}`, { replace: true });
  }

  async function saveAssignment() {
    if (!agentId || !merchantId) return;
    await execute("assignment", async () => { const result = await supabase.rpc("set_offerpsp_agent_assignment", { p_agent_organization_id: agentId, p_merchant_organization_id: merchantId, p_status: assignmentStatus }); return { data: result.data, error: result.error }; }, "Закрепление мерча обновлено.");
  }

  async function saveMargin() {
    if (!agentId) return;
    await execute("margin", async () => { const result = await supabase.rpc("set_offerpsp_agent_margin_policy", { p_agent_organization_id: agentId, p_merchant_organization_id: margin.merchantId || null, p_flow: margin.flow, p_mode: margin.mode, p_percent_value: margin.percent === "" ? null : Number(margin.percent), p_fixed_value: margin.fixed === "" ? null : Number(margin.fixed), p_fixed_currency: margin.currency || null, p_notes: margin.notes || null }); return { data: result.data, error: result.error }; }, "Новая версия агентской маржи сохранена.");
    setMargin(emptyMargin);
  }

  if (loading) return <SkeletonPage/>;
  if (!isNew && !agent) return <ErrorBanner message="Субагент не найден или находится вне доступного реестра."/>;
  const agentAssignments = assignments.filter((item) => item.agent_organization_id === agentId);
  const policies = agentMarginPolicies.filter((item) => item.agent_organization_id === agentId);

  return <>
    <PageMeta title={`${isNew ? "Новый субагент" : agent?.name} | OfferPSP`} description="Agent workspace"/>
    <div className="mb-6"><Link to="/agents" className="text-sm font-medium text-gray-500 hover:text-brand-500">← Реестр субагентов</Link><div className="mt-3 flex flex-wrap items-center gap-3"><h1 className="text-3xl font-semibold text-gray-900 dark:text-white">{isNew ? "Новый субагент" : agent?.name}</h1>{agent && <StatusPill status={agent.status}/>}</div><p className="mt-2 text-sm text-gray-500">Портфель мерчей, персональная наценка и история условий.</p></div>
    {message && (message.tone === "error" ? <ErrorBanner message={message.text}/> : <div className="mb-5 rounded-xl border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-700 dark:border-success-500/20 dark:bg-success-500/10 dark:text-success-300">{message.text}</div>)}
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
      <Panel><h2 className="text-lg font-semibold text-gray-900 dark:text-white">Профиль</h2><div className="mt-5 space-y-4"><Field label="Название"><input className={fieldClass} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })}/></Field><Field label="Юридическое имя"><input className={fieldClass} value={draft.legal_name || ""} onChange={(event) => setDraft({ ...draft, legal_name: event.target.value })}/></Field><div className="grid grid-cols-2 gap-3"><Field label="Статус"><select className={fieldClass} value={draft.status || "active"} onChange={(event) => setDraft({ ...draft, status: event.target.value })}>{["pending", "active", "paused", "archived"].map((value) => <option key={value}>{value}</option>)}</select></Field><Field label="Tier"><select className={fieldClass} value={draft.relationship_tier || "standard"} onChange={(event) => setDraft({ ...draft, relationship_tier: event.target.value })}>{["top", "core", "standard", "watchlist"].map((value) => <option key={value}>{value}</option>)}</select></Field></div><Field label="Заметки"><textarea className={fieldClass} value={draft.relationship_notes || ""} onChange={(event) => setDraft({ ...draft, relationship_notes: event.target.value })}/></Field><button disabled={!draft.name.trim() || Boolean(busy)} onClick={() => void saveAgent()} className="w-full rounded-lg bg-brand-500 px-4 py-3 text-sm font-semibold text-white disabled:opacity-40">{busy === "agent" ? "Сохраняю…" : "Сохранить субагента"}</button></div></Panel>
      {!isNew && <div className="space-y-6">
        <Panel><div className="flex items-center justify-between"><h2 className="text-lg font-semibold text-gray-900 dark:text-white">Закреплённые мерчи</h2><span className="text-xs text-gray-400">{agentAssignments.length}</span></div><div className="mt-4 space-y-2">{agentAssignments.map((item) => <div key={item.id} className="flex items-center justify-between rounded-xl border border-gray-200 p-3 dark:border-gray-800"><div><strong className="text-sm text-gray-900 dark:text-white">{item.merchant_name}</strong><span className="block text-xs text-gray-400">атрибуция и защита лида</span></div><StatusPill status={item.status}/></div>)}{!agentAssignments.length && <EmptyState title="Мерчи не закреплены" description="Добавьте существующую merchant organization к портфелю агента."/>}</div><div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_180px_auto]"><select className={fieldClass} value={merchantId} onChange={(event) => setMerchantId(event.target.value)}><option value="">Выберите мерча</option>{merchants.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><select className={fieldClass} value={assignmentStatus} onChange={(event) => setAssignmentStatus(event.target.value)}>{["pending", "active", "paused", "ended"].map((value) => <option key={value}>{value}</option>)}</select><button disabled={!merchantId || Boolean(busy)} onClick={() => void saveAssignment()} className="rounded-lg bg-brand-500 px-5 text-sm font-semibold text-white disabled:opacity-40">Закрепить</button></div></Panel>
        <Panel><div className="flex items-center justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-500">Pricing chain</p><h2 className="mt-2 text-lg font-semibold text-gray-900 dark:text-white">Наценка субагента</h2></div><span className="text-xs text-gray-400">версий: {policies.length}</span></div><div className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-3"><select className={fieldClass} value={margin.merchantId} onChange={(event) => setMargin({ ...margin, merchantId: event.target.value })}><option value="">Для всех мерчей</option>{merchants.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><select className={fieldClass} value={margin.flow} onChange={(event) => setMargin({ ...margin, flow: event.target.value })}>{["all", "payin", "payout", "settlement", "refund", "chargeback"].map((value) => <option key={value}>{value}</option>)}</select><select className={fieldClass} value={margin.mode} onChange={(event) => setMargin({ ...margin, mode: event.target.value })}>{["percentage_points", "relative_percent", "fixed", "hybrid", "override"].map((value) => <option key={value}>{value}</option>)}</select><input type="number" step="0.01" className={fieldClass} value={margin.percent} onChange={(event) => setMargin({ ...margin, percent: event.target.value })} placeholder="Процент"/><input type="number" step="0.01" className={fieldClass} value={margin.fixed} onChange={(event) => setMargin({ ...margin, fixed: event.target.value })} placeholder="Fixed"/><input className={fieldClass} value={margin.currency} onChange={(event) => setMargin({ ...margin, currency: event.target.value })} placeholder="Currency"/></div><div className="mt-3 flex gap-3"><input className={fieldClass} value={margin.notes} onChange={(event) => setMargin({ ...margin, notes: event.target.value })} placeholder="Причина новой версии"/><button disabled={Boolean(busy) || (margin.mode !== "override" && !margin.percent && !margin.fixed)} onClick={() => void saveMargin()} className="shrink-0 rounded-lg bg-brand-500 px-5 text-sm font-semibold text-white disabled:opacity-40">Применить</button></div><div className="mt-5 flex flex-wrap gap-2">{policies.filter((item) => item.active).map((item) => <span key={item.id} className="rounded-full bg-gray-100 px-3 py-1.5 text-xs text-gray-700 dark:bg-white/5 dark:text-gray-300">{merchants.find((merchant) => merchant.id === item.merchant_organization_id)?.name || "Все мерчи"} · {item.flow} · {item.percent_value ?? item.fixed_value ?? item.mode}</span>)}</div></Panel>
      </div>}
    </div>
  </>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-1.5 block text-xs font-medium text-gray-500">{label}</span>{children}</label>; }
