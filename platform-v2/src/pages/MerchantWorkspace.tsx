import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import PageMeta from "../components/common/PageMeta";
import { EmptyState, ErrorBanner, Panel, SkeletonPage, StatusPill } from "../components/control/Ui";
import { QuickStatusSelect, type QuickStatusOption } from "../components/control/QuickStatusSelect";
import { VisibilityToggleButton } from "../components/control/VisibilityToggleButton";
import { useControlBridge } from "../context/ControlBridgeContext";
import { supabase } from "../lib/supabase";
import DealDeskPanel, { type DealWorkspace } from "./DealDeskPanel";
import MerchantProfileEditor from "../components/control/MerchantProfileEditor";
import MerchantCompanyWorkspace from "../components/control/MerchantCompanyWorkspace";
import {
  ActivityPanel,
  CommunicationsPanel,
  ContactsPanel,
  DocumentsPanel,
  TasksPanel,
  useEntityWorkspace,
} from "../components/control/EntityWorkspace360";

type Match = {
  match_id: string;
  provider_name?: string;
  route_id: string;
  route_code?: string;
  client_title?: string;
  geos?: string[];
  currencies?: string[];
  flow?: string;
  methods?: string[];
  score?: number;
  client_pricing?: Array<{ flow?: string; client_percent?: number; client_fixed?: number; client_fixed_currency?: string }>;
};

type ClientSnapshot = {
  title?: string;
  coverage_scope?: string;
  geos?: string[];
  currencies?: string[];
  methods?: string[];
  flow?: string;
  traffic_types?: string[];
  card_brands?: string[];
  card_issue?: string | string[] | null;
  integrations?: string[];
  client_fees?: Array<{ flow?: string; client_percent?: number; client_fixed?: number; client_fixed_currency?: string }>;
  limits?: Array<{
    flow?: string;
    minimum_amount?: number;
    maximum_amount?: number;
    currency?: string;
    method_scope?: string[];
  }>;
  settlement?: Array<{
    currency?: string;
    fee_percent?: number;
    fee_fixed?: number;
    period?: string;
    minimum_amount?: number;
    exchange_rule?: string;
  }>;
  risk_terms?: Record<string, unknown>;
};

type ShortlistItem = {
  id: string;
  private_provider_id?: string | null;
  offer_route_id?: string | null;
  client_snapshot?: ClientSnapshot | null;
  route_staleness_status?: string | null;
};

type Shortlist = {
  id: string;
  version: number;
  title: string;
  status: string;
  shared_at?: string | null;
  offerpsp_shortlist_items?: ShortlistItem[];
};

type ComplianceCase = {
  id: string;
  case_status: string;
  classification: string;
  authenticity_score?: number | null;
  compliance_readiness_score?: number | null;
  commercial_value_score?: number | null;
  completeness_score?: number | null;
  risk_level?: string | null;
  summary?: string | null;
  missing_information?: string[] | null;
  red_flags?: Array<{ title?: string; detail?: string } | string>;
  yellow_flags?: Array<{ title?: string; detail?: string } | string>;
  source_links?: Array<{ url?: string; label?: string; kind?: string }>;
  last_screened_at?: string | null;
};

type ComplianceWorkspace = {
  case: ComplianceCase;
  signals?: Record<string, unknown>;
  checks?: Array<{ id: string; check_key: string; check_status: string; title: string; detail?: string | null; score?: number | null; source_url?: string | null }>;
  decisions?: Array<{ id: string; decision: string; classification: string; notes?: string | null; created_at: string }>;
};

type Tab = "overview" | "compliance" | "company" | "profile" | "contacts" | "matching" | "preview" | "deal" | "communications" | "documents" | "tasks" | "activity";

const tabs: Array<{ id: Tab; label: string }> = [
  { id: "company", label: "Компания" },
  { id: "profile", label: "Платёжный запрос" },
  { id: "contacts", label: "Контакты" },
  { id: "matching", label: "Офферы" },
  { id: "preview", label: "Кабинет клиента" },
  { id: "communications", label: "Сделка и связь" },
  { id: "documents", label: "Документы" },
  { id: "tasks", label: "Задачи" },
  { id: "activity", label: "История" },
];

const normalizeTab = (tab: string | null): Tab | null => {
  if (tab === "overview") return "company";
  if (tab === "deal") return "communications";
  if (tab && (["compliance", ...tabs.map((item) => item.id)] as string[]).includes(tab)) return tab as Tab;
  return null;
};

const merchantStatusOptions: QuickStatusOption[] = [
  { value: "new", label: "Новый" },
  { value: "qualifying", label: "Квалификация" },
  { value: "needs_clarification", label: "Ожидаем данные" },
  { value: "matching", label: "Подбор офферов" },
  { value: "matched", label: "Офферы подобраны" },
  { value: "shortlist_ready", label: "Shortlist готов" },
  { value: "shared", label: "Отправлено клиенту" },
  { value: "option_selected", label: "Клиент выбрал оффер" },
  { value: "dossier_ready", label: "Досье готово" },
  { value: "provider_reviewing", label: "Передан PSP" },
  { value: "provider_needs_info", label: "PSP запросил данные" },
  { value: "provider_accepted", label: "PSP принял" },
  { value: "provider_declined", label: "PSP отказал" },
  { value: "telegram_created", label: "Общий Telegram создан" },
  { value: "zoom_scheduled", label: "Zoom назначен" },
  { value: "negotiating", label: "Переговоры" },
  { value: "won", label: "Запущен / работает" },
  { value: "lost", label: "Сделка потеряна" },
  { value: "closed", label: "Закрыт" },
  { value: "spam", label: "Спам" },
];

const textList = (value: unknown) => Array.isArray(value) && value.length ? value.join(", ") : typeof value === "string" && value.trim() ? value : "—";

function feeText(fee?: { client_percent?: number; client_fixed?: number; client_fixed_currency?: string }) {
  if (!fee) return "—";
  return [
    fee.client_percent != null ? `${fee.client_percent}%` : "",
    fee.client_fixed != null ? `${fee.client_fixed} ${fee.client_fixed_currency || ""}`.trim() : "",
  ].filter(Boolean).join(" + ") || "—";
}

function isShareable(shortlist?: Shortlist) {
  const items = shortlist?.offerpsp_shortlist_items;
  if (!items?.length) return false;
  return items.every((item) => {
    const snapshot = item.client_snapshot;
    const hasGeos = snapshot?.coverage_scope !== "specific" || Boolean(snapshot?.geos?.length);
    return Boolean(
      item.private_provider_id
      && item.offer_route_id
      && snapshot?.title?.trim()
      && snapshot.currencies?.length
      && snapshot.methods?.length
      && snapshot.client_fees?.length
      && hasGeos,
    );
  });
}

function shortlistEmailBody(shortlist: Shortlist, locale: "ru" | "en") {
  const items = shortlist.offerpsp_shortlist_items || [];
  const lines = items.flatMap((item, index) => {
    const snapshot = item.client_snapshot || {};
    const fees = (snapshot.client_fees || []).map((fee) => `${String(fee.flow || "fee").toUpperCase()}: ${feeText(fee)}`);
    const limits = (snapshot.limits || []).map((limit) => {
      const flow = String(limit.flow || "limit").toUpperCase();
      const scope = limit.method_scope?.length ? ` (${limit.method_scope.join(", ")})` : "";
      return `${flow}${scope}: ${amount(limit.minimum_amount)}–${amount(limit.maximum_amount)} ${limit.currency || snapshot.currencies?.[0] || ""}`.trim();
    });
    const settlement = (snapshot.settlement || []).map((term) => [
      term.currency,
      term.fee_percent != null ? `${term.fee_percent}%` : term.fee_fixed != null ? `${term.fee_fixed}` : "",
      term.period,
    ].filter(Boolean).join(" · "));
    return [
      `${index + 1}. ${snapshot.title || (locale === "ru" ? "Платёжное решение" : "Payment option")}`,
      `${locale === "ru" ? "GEO" : "GEO"}: ${textList(snapshot.geos)}`,
      `${locale === "ru" ? "Валюта" : "Currency"}: ${textList(snapshot.currencies)}`,
      `${locale === "ru" ? "Метод" : "Method"}: ${textList(snapshot.methods)}`,
      ...fees,
      ...limits,
      ...(settlement.length ? [`${locale === "ru" ? "Расчёты" : "Settlement"}: ${settlement.join("; ")}`] : []),
      "",
    ];
  });
  const intro = locale === "ru"
    ? `Мы подготовили ${items.length} ${items.length === 1 ? "вариант оплаты" : "варианта оплаты"} по вашему запросу.`
    : `We prepared ${items.length} payment ${items.length === 1 ? "option" : "options"} for your request.`;
  const portal = locale === "ru"
    ? "Открыть рабочее пространство и выбрать решение: https://offerpsp.com/portal/"
    : "Open your workspace and choose an option: https://offerpsp.com/portal/";
  const footer = locale === "ru"
    ? "Ответьте на это письмо или напишите нам в кабинете, если нужны уточнения."
    : "Reply to this email or message us in the workspace if you need any clarification.";
  return [intro, "", ...lines, portal, "", footer].join("\n");
}

export default function MerchantWorkspace() {
  const { leadId } = useParams();
  const [searchParams] = useSearchParams();
  const { leads, routes, moduleEntitlements, loading: bridgeLoading, refresh } = useControlBridge();
  const lead = leads.find((candidate) => candidate.lead_id === leadId);
  const [tab, setTab] = useState<Tab>("company");
  const [matches, setMatches] = useState<Match[]>([]);
  const [shortlists, setShortlists] = useState<Shortlist[]>([]);
  const [dealWorkspace, setDealWorkspace] = useState<DealWorkspace | null>(null);
  const [complianceWorkspace, setComplianceWorkspace] = useState<ComplianceWorkspace | null>(null);
  const [selectedMatches, setSelectedMatches] = useState<string[]>([]);
  const [selectedRoutes, setSelectedRoutes] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const entityWorkspace = useEntityWorkspace("merchant", leadId);

  const loadWorkspace = useCallback(async () => {
    if (!leadId) return;
    setLoading(true);
    const complianceEnabled = moduleEntitlements.some((item) => item.module_key === "pre_compliance" && item.enabled);
    const [matchesResult, shortlistsResult, dealResult, historyResult, complianceResult] = await Promise.all([
      supabase.rpc("list_offerpsp_route_matches", { p_lead_id: leadId }),
      supabase
        .from("offerpsp_shortlists")
        .select("id, lead_id, version, title, status, shared_at, created_at, offerpsp_shortlist_items(id, offer_route_id, private_provider_id, client_snapshot, route_staleness_status)")
        .eq("lead_id", leadId)
        .neq("status", "archived")
        .order("version", { ascending: false }),
      supabase.rpc("get_offerpsp_staff_request_workspace", { p_lead_id: leadId }),
      supabase.rpc("get_offerpsp_deal_history", { p_lead_id: leadId }),
      complianceEnabled ? supabase.rpc("get_offerpsp_pre_compliance_case", { p_lead_id: leadId }) : Promise.resolve({ data: null, error: null }),
    ]);
    const error = matchesResult.error || shortlistsResult.error || dealResult.error || historyResult.error || complianceResult.error;
    if (error) setMessage({ tone: "error", text: error.message });
    setMatches(Array.isArray(matchesResult.data) ? matchesResult.data as Match[] : []);
    setShortlists(Array.isArray(shortlistsResult.data) ? shortlistsResult.data as Shortlist[] : []);
    const dealData = dealResult.data && typeof dealResult.data === "object" ? dealResult.data as DealWorkspace : null;
    const historyData = historyResult.data && typeof historyResult.data === "object" ? historyResult.data as Pick<DealWorkspace, "metrics" | "outcomes" | "history"> : null;
    setDealWorkspace(dealData ? { ...dealData, ...(historyData || {}) } : historyData);
    setComplianceWorkspace(complianceResult.data && typeof complianceResult.data === "object" ? complianceResult.data as ComplianceWorkspace : null);
    setLoading(false);
  }, [leadId, moduleEntitlements]);

  useEffect(() => {
    if (!bridgeLoading && lead) void loadWorkspace();
  }, [bridgeLoading, lead, loadWorkspace]);

  useEffect(() => {
    const requestedTab = normalizeTab(searchParams.get("tab"));
    if (requestedTab) setTab(requestedTab);
  }, [searchParams]);

  const latest = shortlists[0];
  const publishedRoutes = useMemo(() => {
    const query = search.trim().toLowerCase();
    return routes.filter((route) => {
      if (route.status !== "published" || route.open_error_count || !route.margin_ready) return false;
      if (!query) return true;
      return [route.provider_name, route.provider_code, route.route_code, route.client_title, route.flow, ...(route.geos || []), ...(route.currencies || []), ...(route.methods || [])]
        .join(" ").toLowerCase().includes(query);
    });
  }, [routes, search]);

  async function runAction(name: string, action: () => Promise<{ error: { message: string } | null }>, success: string) {
    setBusy(name);
    setMessage(null);
    const result = await action();
    if (result.error) {
      setMessage({ tone: "error", text: result.error.message });
      setBusy(null);
      return false;
    }
    await Promise.all([loadWorkspace(), refresh(), entityWorkspace.refresh()]);
    setMessage({ tone: "success", text: success });
    setBusy(null);
    return true;
  }

  async function runMatching() {
    if (!leadId) return;
    await runAction("matching", async () => {
      const result = await supabase.rpc("rebuild_offerpsp_route_matches", { p_lead_id: leadId });
      return { error: result.error };
    }, "Подбор обновлён. Теперь выберите маршруты для клиента.");
  }

  async function changeMerchantStatus(nextStatus: string) {
    if (!leadId || !lead || nextStatus === lead.status) return;
    if (["won", "lost", "closed", "spam"].includes(nextStatus)) {
      const label = merchantStatusOptions.find((item) => item.value === nextStatus)?.label || nextStatus;
      if (!window.confirm(`Перевести мерча в статус «${label}»? Изменение будет записано в историю.`)) return;
    }
    await runAction("merchant-status", async () => {
      const result = await supabase.rpc("save_offerpsp_managed_merchant", {
        p_lead_id: leadId,
        p_payload: { status: nextStatus },
      });
      return { error: result.error };
    }, "Статус мерча обновлён.");
  }

  async function changeMerchantVisibility() {
    if (!leadId || !lead) return;
    const hidden = lead.record_state === "archived";
    let reason: string | null = null;
    if (!hidden) {
      reason = window.prompt("Почему скрываем мерча? Причина сохранится в истории.", "Больше не в работе");
      if (reason === null) return;
      if (!reason.trim()) {
        setMessage({ tone: "error", text: "Укажите причину скрытия — она нужна для истории." });
        return;
      }
    }
    await runAction("merchant-visibility", async () => {
      const result = await supabase.rpc("set_offerpsp_merchant_record_state", {
        p_lead_id: leadId,
        p_record_state: hidden ? "active" : "archived",
        p_reason: reason,
      });
      return { error: result.error };
    }, hidden ? "Мерч возвращён в рабочий список." : "Мерч скрыт из рабочего списка и сохранён в истории.");
  }

  async function createMatchedShortlist() {
    if (!leadId || !selectedMatches.length) return;
    const created = await runAction("matched-shortlist", async () => {
      const result = await supabase.rpc("create_offerpsp_route_shortlist", {
        p_lead_id: leadId,
        p_route_match_ids: selectedMatches,
        p_title: "Recommended payment routes",
        p_introduction: "OfferPSP selected these payment routes for your review.",
      });
      return { error: result.error };
    }, "Предпросмотр shortlist создан. Проверьте его перед отправкой.");
    if (created) {
      setSelectedMatches([]);
      setTab("preview");
    }
  }

  async function createManualShortlist() {
    if (!leadId || !selectedRoutes.length) return;
    const created = await runAction("manual-shortlist", async () => {
      const result = await supabase.rpc("create_offerpsp_manual_shortlist", {
        p_lead_id: leadId,
        p_route_ids: selectedRoutes,
        p_title: "Selected payment routes",
        p_introduction: "OfferPSP selected these payment routes for your review.",
        p_client_note: "Selected manually by OfferPSP for your review.",
      });
      return { error: result.error };
    }, "Ручной shortlist создан. Проверьте его перед отправкой.");
    if (created) {
      setSelectedRoutes([]);
      setTab("preview");
    }
  }

  async function shareLatest() {
    if (!latest) return;
    await runAction("share", async () => {
      const result = await supabase.rpc("share_offerpsp_shortlist", { p_shortlist_id: latest.id });
      return { error: result.error };
    }, "Shortlist отправлен в кабинет клиента.");
  }

  async function emailLatest(locale: "ru" | "en") {
    if (!lead || !latest || !lead.work_email || !isShareable(latest)) return;
    setBusy("email-shortlist");
    setMessage(null);
    let shared = latest.status === "shared";
    if (!shared) {
      const shareResult = await supabase.rpc("share_offerpsp_shortlist", { p_shortlist_id: latest.id });
      if (shareResult.error) {
        setMessage({ tone: "error", text: shareResult.error.message });
        setBusy(null);
        return;
      }
      shared = true;
    }

    const subject = locale === "ru" ? "Ваши варианты оплаты готовы — OfferPSP" : "Your payment options are ready — OfferPSP";
    const body = shortlistEmailBody(latest, locale);
    const draftResult = await supabase.rpc("create_offerpsp_email_draft", {
      p_lead_id: lead.lead_id,
      p_to_email: lead.work_email,
      p_subject: subject,
      p_body: body,
    });
    if (draftResult.error) {
      await Promise.all([loadWorkspace(), refresh(), entityWorkspace.refresh()]);
      setMessage({ tone: "error", text: `${shared ? "Shortlist опубликован в ЛК, но " : ""}не удалось создать email: ${draftResult.error.message}` });
      setBusy(null);
      return;
    }

    const draftId = Number((draftResult.data as { id?: number } | null)?.id);
    if (Number.isFinite(draftId)) await supabase.rpc("set_offerpsp_email_draft_status", { p_draft_id: draftId, p_status: "sending" });
    const session = await supabase.auth.getSession();
    try {
      const response = await fetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.data.session?.access_token || ""}` },
        body: JSON.stringify({ to: lead.work_email, subject, body, lead_id: lead.lead_id }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.success !== true) throw new Error(result.error || result.message || "Email sender returned an error");
      if (Number.isFinite(draftId)) await supabase.rpc("set_offerpsp_email_draft_status", { p_draft_id: draftId, p_status: "sent" });
      await Promise.all([loadWorkspace(), refresh(), entityWorkspace.refresh()]);
      setMessage({ tone: "success", text: `Shortlist отправлен в ЛК и на ${lead.work_email}.` });
      setTab("communications");
    } catch (error) {
      if (Number.isFinite(draftId)) await supabase.rpc("set_offerpsp_email_draft_status", { p_draft_id: draftId, p_status: "failed" });
      await Promise.all([loadWorkspace(), refresh(), entityWorkspace.refresh()]);
      setMessage({ tone: "error", text: `Shortlist опубликован в ЛК, но email не отправлен: ${error instanceof Error ? error.message : "неизвестная ошибка"}` });
    }
    setBusy(null);
  }

  async function saveComplianceDecision(input: { decision: string; classification: string; notes: string; summary: string; missing: string[] }) {
    if (!leadId) return;
    await runAction("compliance", async () => {
      const result = await supabase.rpc("save_offerpsp_pre_compliance_decision", {
        p_lead_id: leadId,
        p_decision: input.decision,
        p_classification: input.classification,
        p_notes: input.notes || null,
        p_missing_information: input.missing,
        p_summary: input.summary || null,
      });
      return { error: result.error };
    }, input.decision === "cleared" ? "Лид допущен. Matching разблокирован." : "Решение сохранено в истории проверки.");
  }

  if (bridgeLoading) return <SkeletonPage />;
  if (!lead) return <><PageMeta title="Мерч не найден | OfferPSP" description="Merchant workspace"/><ErrorBanner message="Мерч не найден или заявка находится в архиве."/><Link className="text-sm font-medium text-brand-500" to="/merchants">← Вернуться к мерчам</Link></>;

  return <>
    <PageMeta title={`${lead.company || "Мерч"} | OfferPSP`} description="Merchant operations workspace"/>
    <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div>
        <Link to="/merchants" className="text-sm font-medium text-gray-500 hover:text-brand-500">← Все мерчи</Link>
        <div className="mt-3 flex flex-wrap items-center gap-3"><h1 className="text-2xl font-semibold text-gray-900 dark:text-white sm:text-3xl">{lead.company || "Без названия"}</h1><QuickStatusSelect value={lead.status} options={merchantStatusOptions} busy={busy === "merchant-status"} onChange={changeMerchantStatus}/></div>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{lead.name || "Контакт не указан"} · {lead.work_email || lead.telegram || "нет контакта"}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button onClick={() => void Promise.all([loadWorkspace(), entityWorkspace.refresh()])} disabled={loading || entityWorkspace.loading || Boolean(busy)} className="rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 hover:border-brand-300 hover:text-brand-500 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300">Обновить</button>
        <VisibilityToggleButton hidden={lead.record_state === "archived"} busy={busy === "merchant-visibility"} onToggle={changeMerchantVisibility}/>
        <button onClick={() => setTab("compliance")} className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-600">Проверить заявку</button>
      </div>
    </div>

    {message && <div className={`mb-5 rounded-xl border px-4 py-3 text-sm ${message.tone === "error" ? "border-error-200 bg-error-50 text-error-700 dark:border-error-500/20 dark:bg-error-500/10 dark:text-error-300" : "border-success-200 bg-success-50 text-success-700 dark:border-success-500/20 dark:bg-success-500/10 dark:text-success-300"}`}>{message.text}</div>}
    {entityWorkspace.error && <ErrorBanner message={entityWorkspace.error}/>}

    <div className="mb-6 flex gap-1 overflow-x-auto rounded-xl border border-gray-200 bg-white p-1 dark:border-gray-800 dark:bg-gray-900 lg:flex-wrap lg:overflow-visible">
      {tabs.map((item) => <button key={item.id} onClick={() => setTab(item.id)} className={`whitespace-nowrap rounded-lg px-4 py-2.5 text-sm font-medium ${tab === item.id ? "bg-brand-500 text-white" : "text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/5"}`}>{item.label}</button>)}
    </div>

    {loading ? <SkeletonPage/> : tab === "compliance"
        ? <CompliancePanel workspace={complianceWorkspace} busy={busy} onSave={(input) => void saveComplianceDecision(input)}/>
      : tab === "company" || tab === "overview"
        ? <div className="space-y-6"><Overview lead={lead} matches={matches} shortlist={latest}/><MerchantCompanyWorkspace leadId={lead.lead_id} onChanged={async () => { await Promise.all([loadWorkspace(), refresh(), entityWorkspace.refresh()]); }}/></div>
      : tab === "profile"
        ? <MerchantProfileEditor lead={lead} onChanged={async () => { await Promise.all([loadWorkspace(), refresh(), entityWorkspace.refresh()]); }}/>
      : tab === "contacts"
        ? (entityWorkspace.loading ? <SkeletonPage/> : <ContactsPanel contacts={entityWorkspace.data.contacts} baseContact={{ full_name: lead.name || "Анкетный контакт", email: lead.work_email, telegram: lead.telegram, is_primary: true }} busy={entityWorkspace.busy} onSave={entityWorkspace.saveContact} onArchive={entityWorkspace.archiveContact}/>)
      : tab === "matching"
        ? <MatchingPanel
            matches={matches}
            selectedMatches={selectedMatches}
            setSelectedMatches={setSelectedMatches}
            publishedRoutes={publishedRoutes}
            selectedRoutes={selectedRoutes}
            setSelectedRoutes={setSelectedRoutes}
            search={search}
            setSearch={setSearch}
            busy={busy}
            runMatching={() => void runMatching()}
            createMatched={() => void createMatchedShortlist()}
            createManual={() => void createManualShortlist()}
            complianceReady={complianceWorkspace?.case.case_status === "cleared"}
          />
      : tab === "preview"
          ? <Preview shortlist={latest} recipient={lead.work_email} busy={busy} onShare={() => void shareLatest()} onEmail={(locale) => void emailLatest(locale)}/>
      : tab === "communications" || tab === "deal"
          ? (entityWorkspace.loading ? <SkeletonPage/> : <div className="space-y-6"><DealDeskPanel workspace={dealWorkspace} reload={async () => { await Promise.all([loadWorkspace(), refresh(), entityWorkspace.refresh()]); }}/><CommunicationsPanel leadId={lead.lead_id} conversations={entityWorkspace.data.conversations} emails={entityWorkspace.data.emails}/></div>)
      : tab === "documents"
          ? (entityWorkspace.loading ? <SkeletonPage/> : <DocumentsPanel documents={entityWorkspace.data.documents} busy={entityWorkspace.busy} onSave={entityWorkspace.saveDocument} onArchive={entityWorkspace.archiveDocument}/>)
      : tab === "tasks"
          ? (entityWorkspace.loading ? <SkeletonPage/> : <TasksPanel tasks={entityWorkspace.data.tasks} busy={entityWorkspace.busy} onSave={entityWorkspace.saveTask}/>)
          : (entityWorkspace.loading ? <SkeletonPage/> : <ActivityPanel activities={entityWorkspace.data.activities}/>)}
  </>;
}

function CompliancePanel({ workspace, busy, onSave }: {
  workspace: ComplianceWorkspace | null;
  busy: string | null;
  onSave: (input: { decision: string; classification: string; notes: string; summary: string; missing: string[] }) => void;
}) {
  const [classification, setClassification] = useState("unknown");
  const [summary, setSummary] = useState("");
  const [missing, setMissing] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    setClassification(workspace?.case.classification || "unknown");
    setSummary(workspace?.case.summary || "");
    setMissing((workspace?.case.missing_information || []).join("\n"));
  }, [workspace]);

  if (!workspace) return <Panel><EmptyState title="Досье проверки ещё не создано" description="Обновите данные. Если модуль только что подключён, сначала должна быть применена его миграция."/></Panel>;
  const item = workspace.case;
  const scores = [
    ["Подлинность", item.authenticity_score],
    ["Готовность досье", item.compliance_readiness_score],
    ["Коммерческая ценность", item.commercial_value_score],
    ["Полнота заявки", item.completeness_score],
  ] as const;
  const submit = (decision: string) => onSave({
    decision,
    classification,
    notes,
    summary,
    missing: missing.split("\n").map((value) => value.trim()).filter(Boolean),
  });

  return <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
    <div className="space-y-6 xl:col-span-3">
      <Panel>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-500">PRO · Pre-Compliance</p><h2 className="mt-2 text-xl font-semibold text-gray-900 dark:text-white">Предварительное досье</h2><p className="mt-1 text-sm text-gray-500">После автопроверки заявка обязательно попадает сюда на ручное решение. Без допуска matching закрыт.</p></div><div className="flex items-center gap-2"><StatusPill status={item.case_status}/><span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-600 dark:bg-white/5 dark:text-gray-300">риск: {item.risk_level || "unknown"}</span></div></div>
        <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">{scores.map(([label, value]) => <div key={label} className="rounded-xl bg-gray-50 p-4 dark:bg-white/[0.03]"><strong className="text-2xl text-gray-900 dark:text-white">{value ?? "—"}</strong><span className="mt-1 block text-xs text-gray-500">{label}</span></div>)}</div>
      </Panel>
      <Panel>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Проверки и доказательства</h3>
        <div className="mt-4 space-y-3">{workspace.checks?.length ? workspace.checks.map((check) => <div key={check.id} className="rounded-xl border border-gray-200 p-4 dark:border-gray-800"><div className="flex items-start justify-between gap-3"><div><strong className="text-sm text-gray-900 dark:text-white">{check.title}</strong><p className="mt-1 text-sm text-gray-500">{check.detail || check.check_key}</p>{check.source_url && <a href={check.source_url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs font-semibold text-brand-500">Открыть источник ↗</a>}</div><StatusPill status={check.check_status}/></div></div>) : <EmptyState title="Автопроверка ещё не запускалась" description="После подключения workflow здесь появятся домен, сайт, email, сеть, лицензия, санкционные и репутационные сигналы."/>}</div>
      </Panel>
      {!!workspace.decisions?.length && <Panel><h3 className="text-lg font-semibold text-gray-900 dark:text-white">История решений</h3><div className="mt-4 divide-y divide-gray-100 dark:divide-gray-800">{workspace.decisions.map((decision) => <div key={decision.id} className="py-3"><div className="flex items-center justify-between gap-3"><StatusPill status={decision.decision}/><span className="text-xs text-gray-400">{new Date(decision.created_at).toLocaleString("ru-RU")}</span></div><p className="mt-2 text-sm text-gray-600 dark:text-gray-300">{decision.notes || `Классификация: ${decision.classification}`}</p></div>)}</div></Panel>}
    </div>
    <Panel className="h-fit xl:col-span-2">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Решение по заявке</h3>
      <label className="mt-5 block text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Кто перед нами</label>
      <select value={classification} onChange={(event) => setClassification(event.target.value)} className="mt-2 h-11 w-full rounded-lg border border-gray-200 bg-transparent px-3 text-sm dark:border-gray-700">{[["unknown","Не определено"],["merchant","Мерч"],["subagent","Субагент"],["psp","PSP"],["consultant","Консультант"],["other","Другое"]].map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select>
      <label className="mt-4 block text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Вывод проверки</label>
      <textarea value={summary} onChange={(event) => setSummary(event.target.value)} rows={4} className="mt-2 w-full rounded-lg border border-gray-200 bg-transparent p-3 text-sm dark:border-gray-700" placeholder="Что подтверждено, какие риски и почему лид полезен"/>
      <label className="mt-4 block text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Что запросить у заявителя</label>
      <textarea value={missing} onChange={(event) => setMissing(event.target.value)} rows={5} className="mt-2 w-full rounded-lg border border-gray-200 bg-transparent p-3 text-sm dark:border-gray-700" placeholder={"Один пункт на строку\nСайты операторов\nЛицензии\nPayIn / PayOut"}/>
      <label className="mt-4 block text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Внутренняя заметка</label>
      <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} className="mt-2 w-full rounded-lg border border-gray-200 bg-transparent p-3 text-sm dark:border-gray-700" placeholder="Почему принято это решение"/>
      <div className="mt-5 grid grid-cols-2 gap-2"><button onClick={() => submit("cleared")} disabled={busy === "compliance"} className="rounded-lg bg-success-600 px-3 py-3 text-sm font-semibold text-white disabled:opacity-50">Допустить</button><button onClick={() => submit("needs_info")} disabled={busy === "compliance"} className="rounded-lg bg-warning-500 px-3 py-3 text-sm font-semibold text-white disabled:opacity-50">Запросить данные</button><button onClick={() => submit("hold")} disabled={busy === "compliance"} className="rounded-lg border border-gray-200 px-3 py-3 text-sm font-semibold text-gray-700 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300">На паузу</button><button onClick={() => submit("rejected")} disabled={busy === "compliance"} className="rounded-lg bg-error-600 px-3 py-3 text-sm font-semibold text-white disabled:opacity-50">Отклонить</button><button onClick={() => submit("spam")} disabled={busy === "compliance"} className="col-span-2 rounded-lg border border-error-200 px-3 py-3 text-sm font-semibold text-error-600 disabled:opacity-50">Пометить как спам</button></div>
    </Panel>
  </div>;
}

function toggle(values: string[], value: string) {
  return values.includes(value) ? values.filter((candidate) => candidate !== value) : [...values, value];
}

function MatchingPanel({ matches, selectedMatches, setSelectedMatches, publishedRoutes, selectedRoutes, setSelectedRoutes, search, setSearch, busy, runMatching, createMatched, createManual, complianceReady }: {
  matches: Match[];
  selectedMatches: string[];
  setSelectedMatches: (value: string[]) => void;
  publishedRoutes: ReturnType<typeof useControlBridge>["routes"];
  selectedRoutes: string[];
  setSelectedRoutes: (value: string[]) => void;
  search: string;
  setSearch: (value: string) => void;
  busy: string | null;
  runMatching: () => void;
  createMatched: () => void;
  createManual: () => void;
  complianceReady: boolean;
}) {
  return <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
    <Panel>
      {!complianceReady && <div className="mb-5 rounded-xl border border-warning-200 bg-warning-50 px-4 py-3 text-sm text-warning-700">Matching заблокирован: сначала откройте вкладку «Проверка» и примите решение по заявке.</div>}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-500">Автоподбор</p><h2 className="mt-2 text-lg font-semibold text-gray-900 dark:text-white">Офферы по запросу мерча</h2><p className="mt-1 text-sm text-gray-500">Matching — подсказка. Финальное решение всегда за нами.</p></div>
        <button onClick={runMatching} disabled={Boolean(busy) || !complianceReady} className="shrink-0 rounded-lg border border-brand-200 px-3 py-2 text-sm font-medium text-brand-600 hover:bg-brand-50 disabled:opacity-50 dark:border-brand-800 dark:text-brand-300">{busy === "matching" ? "Подбираю…" : "Запустить подбор"}</button>
      </div>
      <div className="mt-5 space-y-3">{matches.length ? matches.map((match) => <SelectionCard key={match.match_id} selected={selectedMatches.includes(match.match_id)} onChange={() => setSelectedMatches(toggle(selectedMatches, match.match_id))} title={`${match.provider_name || "PSP"} · ${match.client_title || match.route_code || "Маршрут"}`} meta={`${textList(match.geos)} · ${textList(match.currencies)} · ${textList(match.methods)} · ${String(match.flow || "—").toUpperCase()}`} aside={`${match.score ?? "—"}`} detail={(match.client_pricing || []).map((fee) => `${fee.flow || "fee"}: ${feeText(fee)}`).join(" · ") || "Ставка требует проверки"}/>) : <EmptyState title="Кандидатов пока нет" description="Запустите matching или выберите любой опубликованный оффер справа."/>}</div>
      {matches.length > 0 && <button onClick={createMatched} disabled={!selectedMatches.length || Boolean(busy) || !complianceReady} className="mt-5 w-full rounded-lg bg-brand-500 px-4 py-3 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-40">{busy === "matched-shortlist" ? "Создаю…" : `Создать shortlist из выбранных (${selectedMatches.length})`}</button>}
    </Panel>

    <Panel>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-500">Ручной выбор</p><h2 className="mt-2 text-lg font-semibold text-gray-900 dark:text-white">Любой актуальный оффер</h2>
      <p className="mt-1 text-sm text-gray-500">Можно отправить решение вне исходного запроса. Клиент увидит анонимный Telegram‑формат, а настоящий PSP останется внутри системы.</p>
      <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Поиск: GEO, валюта, метод, PSP…" className="mt-5 h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 outline-none focus:border-brand-400 dark:border-gray-700 dark:text-white"/>
      <div className="mt-4 max-h-[520px] space-y-3 overflow-y-auto pr-1">{publishedRoutes.length ? publishedRoutes.map((route) => <SelectionCard key={route.route_id} selected={selectedRoutes.includes(route.route_id)} onChange={() => setSelectedRoutes(toggle(selectedRoutes, route.route_id))} title={route.client_title || route.route_code || "Оффер"} meta={`${textList(route.geos)} · ${textList(route.currencies)} · ${textList(route.methods)} · ${String(route.flow || "—").toUpperCase()}`} detail={`${route.provider_name || "PSP"} · ${route.provider_code || ""}`} aside="готов"/>) : <EmptyState title="Подходящих опубликованных офферов нет" description="Проверьте фильтр, публикацию и наличие клиентской маржи."/>}</div>
      <button onClick={createManual} disabled={!selectedRoutes.length || Boolean(busy) || !complianceReady} className="mt-5 w-full rounded-lg bg-gray-900 px-4 py-3 text-sm font-semibold text-white hover:bg-black disabled:opacity-40 dark:bg-white dark:text-gray-900">{busy === "manual-shortlist" ? "Создаю…" : `Создать ручной shortlist (${selectedRoutes.length})`}</button>
    </Panel>
  </div>;
}

function SelectionCard({ selected, onChange, title, meta, detail, aside }: { selected: boolean; onChange: () => void; title: string; meta: string; detail: string; aside: string }) {
  return <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition ${selected ? "border-brand-400 bg-brand-25 dark:border-brand-700 dark:bg-brand-500/5" : "border-gray-200 hover:border-brand-200 dark:border-gray-800"}`}>
    <input type="checkbox" checked={selected} onChange={onChange} className="mt-1 h-4 w-4 accent-[#ff477d]"/>
    <span className="min-w-0 flex-1"><strong className="block text-sm text-gray-900 dark:text-white">{title}</strong><span className="mt-1 block text-xs text-gray-500">{meta}</span><span className="mt-2 block text-xs text-gray-400">{detail}</span></span>
    <span className="rounded-lg bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-700 dark:bg-white/5 dark:text-gray-300">{aside}</span>
  </label>;
}

function Overview({ lead, matches, shortlist }: { lead: ReturnType<typeof useControlBridge>["leads"][number]; matches: Match[]; shortlist?: Shortlist }) {
  const fields = [["Сайт", lead.company_url || "—"], ["Вертикаль", lead.vertical || "—"], ["Категория бизнеса", lead.risk_segment === "low" ? "Low-risk" : lead.risk_segment === "high" ? "High-risk" : "Не определена"], ["GEO", textList(lead.geos)], ["Валюты", textList(lead.currencies)], ["Методы", textList(lead.methods)], ["Оборот", lead.monthly_volume || (lead.expected_monthly_volume ? String(lead.expected_monthly_volume) : "—")]];
  return <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
    <Panel className="xl:col-span-2"><div className="flex items-center justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-500">Merchant profile</p><h2 className="mt-2 text-lg font-semibold text-gray-900 dark:text-white">Данные запроса</h2></div><span className="font-mono text-xs text-gray-400">{lead.lead_id.slice(0, 8)}</span></div><div className="mt-6 grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2">{fields.map(([label, value]) => <div key={label} className="border-b border-gray-100 pb-4 dark:border-gray-800"><span className="text-xs uppercase tracking-wide text-gray-400">{label}</span><strong className="mt-1 block text-sm text-gray-800 dark:text-white/90">{value}</strong></div>)}</div></Panel>
    <div className="space-y-6"><Panel><h2 className="text-lg font-semibold text-gray-900 dark:text-white">Следующее действие</h2><p className="mt-2 text-sm text-gray-500">{shortlist?.status === "shared" ? "Shortlist уже отправлен. Ждём реакцию клиента." : shortlist ? "Проверьте созданный shortlist и отправьте его клиенту." : matches.length ? "Выберите подходящие маршруты и создайте shortlist." : "Запустите подбор или выберите офферы вручную."}</p></Panel><Panel><div className="grid grid-cols-3 gap-3 text-center"><div><strong className="block text-2xl text-gray-900 dark:text-white">{matches.length}</strong><span className="text-xs text-gray-400">matches</span></div><div><strong className="block text-2xl text-gray-900 dark:text-white">{shortlist?.offerpsp_shortlist_items?.length || 0}</strong><span className="text-xs text-gray-400">офферов</span></div><div><strong className="block text-2xl text-gray-900 dark:text-white">v{shortlist?.version || 0}</strong><span className="text-xs text-gray-400">shortlist</span></div></div></Panel></div>
  </div>;
}

function Preview({ shortlist, recipient, busy, onShare, onEmail }: { shortlist?: Shortlist; recipient?: string | null; busy: string | null; onShare: () => void; onEmail: (locale: "ru" | "en") => void }) {
  const [locale, setLocale] = useState<"ru" | "en">("ru");
  if (!shortlist) return <Panel><EmptyState title="Предпросмотра ещё нет" description="Сначала выберите matched или ручные офферы и создайте shortlist."/></Panel>;
  const shareable = isShareable(shortlist);
  return <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
    <Panel><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-500">Client-safe preview</p><h2 className="mt-2 text-xl font-semibold text-gray-900 dark:text-white">{shortlist.title} · v{shortlist.version}</h2><p className="mt-1 text-sm text-gray-500">Telegram‑стандарт: PayIn и PayOut показаны раздельно, PSP и внутренняя маржа скрыты.</p></div><div className="flex items-center gap-2"><div className="flex rounded-lg bg-gray-100 p-1 dark:bg-white/5">{(["ru", "en"] as const).map((value) => <button key={value} onClick={() => setLocale(value)} className={`rounded-md px-2.5 py-1 text-xs font-semibold uppercase ${locale === value ? "bg-white text-gray-900 shadow-theme-xs dark:bg-gray-800 dark:text-white" : "text-gray-400"}`}>{value}</button>)}</div><StatusPill status={shortlist.status}/></div></div><div className="mt-6 grid grid-cols-1 gap-4 2xl:grid-cols-2">{(shortlist.offerpsp_shortlist_items || []).map((item, index) => <OfferPreview key={item.id} snapshot={item.client_snapshot || {}} index={index} locale={locale} staleness={item.route_staleness_status}/>)}</div></Panel>
    <Panel><h2 className="text-lg font-semibold text-gray-900 dark:text-white">Проверка перед отправкой</h2><div className="mt-5 space-y-3 text-sm">{[["Есть нормализованный маршрут", shareable],["Ставки и методы заполнены", shareable],["Настоящий PSP скрыт", true],["Email клиента указан", Boolean(recipient)]].map(([label, ok]) => <div key={String(label)} className="flex items-center justify-between gap-3"><span className="text-gray-500">{label}</span><strong className={ok ? "text-success-600" : "text-error-600"}>{ok ? "Да" : "Нет"}</strong></div>)}</div>{shortlist.status === "shared" && <div className="mt-5 rounded-lg bg-success-50 p-3 text-sm text-success-700 dark:bg-success-500/10 dark:text-success-300">Shortlist уже доступен клиенту в ЛК.</div>}<div className="mt-5 space-y-2">{shortlist.status !== "shared" && <button onClick={onShare} disabled={!shareable || Boolean(busy)} className="w-full rounded-lg bg-brand-500 px-4 py-3 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-40">{busy === "share" ? "Отправляю…" : "Отправить в ЛК клиента"}</button>}<button onClick={() => onEmail(locale)} disabled={!shareable || !recipient || Boolean(busy)} className="w-full rounded-lg border border-brand-300 px-4 py-3 text-sm font-semibold text-brand-600 hover:bg-brand-50 disabled:opacity-40 dark:border-brand-700 dark:text-brand-300 dark:hover:bg-brand-500/10">{busy === "email-shortlist" ? "Отправляю email…" : "Отправить на почту"}</button></div>{recipient ? <p className="mt-3 break-all text-xs text-gray-400">Получатель: {recipient}</p> : <p className="mt-3 text-xs text-error-500">Добавьте рабочий email во вкладке «Контакты».</p>}</Panel>
  </div>;
}

function countryFlag(code?: string) {
  if (!code || !/^[A-Z]{2}$/i.test(code)) return "🌍";
  return code.toUpperCase().replace(/./g, (letter) => String.fromCodePoint(127397 + letter.charCodeAt(0)));
}

function countryName(code: string | undefined, locale: "ru" | "en") {
  if (!code) return locale === "ru" ? "Не указано" : "Not specified";
  try { return new Intl.DisplayNames([locale], { type: "region" }).of(code.toUpperCase()) || code; }
  catch { return code; }
}

function amount(value?: number) {
  return value == null ? "—" : new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value).replace(/,/g, " ");
}

function flowLimits(snapshot: ClientSnapshot, flow: "payin" | "payout") {
  return (snapshot.limits || []).filter((limit) => limit.flow === flow);
}

function FlowBlock({ snapshot, flow, locale }: { snapshot: ClientSnapshot; flow: "payin" | "payout"; locale: "ru" | "en" }) {
  const fee = snapshot.client_fees?.find((item) => item.flow === flow);
  const limits = flowLimits(snapshot, flow);
  const label = flow === "payin" ? "PayIn" : "PayOut";
  const hasFlow = snapshot.flow === "both" || snapshot.flow === flow || Boolean(fee) || limits.length > 0;
  if (!hasFlow) return null;
  return <section className="border-t border-gray-200 pt-4 first:border-0 first:pt-0">
    <strong className="text-base text-gray-950">{label}</strong>
    <div className="mt-2 space-y-1.5">
      {limits.length ? limits.map((limit, index) => <p key={`${flow}-${index}`}>Min/Max {locale === "ru" ? "транзакции" : "per transaction"} {label}{limit.method_scope?.length ? ` (${limit.method_scope.join(", ")})` : ""} {amount(limit.minimum_amount)}–{amount(limit.maximum_amount)} {limit.currency || snapshot.currencies?.[0] || ""}</p>) : <p>Min/Max {locale === "ru" ? "транзакции" : "per transaction"} {label} — {locale === "ru" ? "не указано" : "not specified"}</p>}
      <p>MDR {label} — <strong>{feeText(fee)}</strong></p>
    </div>
  </section>;
}

const STALENESS_BADGE: Record<string, { label: string; cls: string }> = {
  updated: { label: "условия обновлены", cls: "bg-warning-50 text-warning-700 border-warning-200 dark:bg-warning-500/10 dark:text-warning-300 dark:border-warning-500/20" },
  paused: { label: "оффер приостановлен", cls: "bg-warning-50 text-warning-700 border-warning-200 dark:bg-warning-500/10 dark:text-warning-300 dark:border-warning-500/20" },
  unavailable: { label: "оффер больше недоступен", cls: "bg-error-50 text-error-700 border-error-200 dark:bg-error-500/10 dark:text-error-300 dark:border-error-500/20" },
  expired: { label: "срок действия истёк", cls: "bg-gray-100 text-gray-600 border-gray-200 dark:bg-white/5 dark:text-gray-400 dark:border-gray-700" },
};

function OfferPreview({ snapshot, index, locale, staleness }: { snapshot: ClientSnapshot; index: number; locale: "ru" | "en"; staleness?: string | null }) {
  const geo = snapshot.geos?.[0];
  const settlement = snapshot.settlement || [];
  const riskTerms = Object.entries(snapshot.risk_terms || {}).filter(([, value]) => value != null && String(value).trim());
  const t = locale === "ru" ? {
    offer: "Оффер", currency: "Валюта", traffic: "Тип трафика", cards: "Карты", method: "Метод",
    cardIssue: "Страна выпуска карты", openGeo: "Открытые GEO", settlement: "Расчёты",
    settlementCurrency: "Валюта расчётов", settlementFee: "Комиссия за расчёт", period: "Период расчётов",
    integration: "Интеграция", notSpecified: "Не указано",
  } : {
    offer: "Offer", currency: "Currency", traffic: "Type of traffic", cards: "Card brands", method: "Method",
    cardIssue: "Card issue", openGeo: "Open GEO", settlement: "Settlement",
    settlementCurrency: "Settlement currency", settlementFee: "Settlement fee", period: "Settlement period",
    integration: "Integration", notSpecified: "Not specified",
  };
  const badge = staleness ? STALENESS_BADGE[staleness] : null;
  return <article className={`overflow-hidden rounded-2xl border bg-[#f8f8f5] text-gray-950 shadow-theme-xs ${badge ? "border-warning-300 dark:border-warning-500/30" : "border-gray-200"}`}>
    <div className="flex items-center justify-between gap-3 border-b border-gray-200 bg-white px-5 py-3">
      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-500">{t.offer} {index + 1}</span>
      {badge && <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${badge.cls}`}>{badge.label}</span>}
    </div>
    <div className="space-y-5 p-5 text-sm leading-6">
      <div><h3 className="text-xl font-semibold">{countryFlag(geo)} GEO — {countryName(geo, locale)} ({textList(snapshot.methods)})</h3></div>
      <div className="space-y-1">
        <p>{t.currency} — {textList(snapshot.currencies)}</p>
        <p>{t.traffic} — {textList(snapshot.traffic_types)}</p>
        {snapshot.card_brands?.length ? <p>{t.cards}: {snapshot.card_brands.join(" / ")}</p> : null}
        <p><strong>{t.method}: {textList(snapshot.methods)}</strong></p>
        {snapshot.card_issue ? <p>{t.cardIssue}: {textList(snapshot.card_issue)}</p> : null}
        <p>{t.openGeo}: {textList(snapshot.geos)}</p>
        {snapshot.integrations?.length ? <p>{t.integration}: {snapshot.integrations.join(", ")}</p> : null}
      </div>
      <div className="space-y-4"><FlowBlock snapshot={snapshot} flow="payin" locale={locale}/><FlowBlock snapshot={snapshot} flow="payout" locale={locale}/></div>
      <section className="border-t border-gray-200 pt-4"><strong className="text-base">{t.settlement}:</strong>{settlement.length ? <div className="mt-2 space-y-1.5">{settlement.map((term, termIndex) => <div key={termIndex} className="space-y-1"><p>{t.settlementCurrency}: {term.currency || t.notSpecified}</p><p>{t.settlementFee}: {term.fee_percent != null ? `${term.fee_percent}%` : term.fee_fixed != null ? `${term.fee_fixed} ${term.currency || ""}`.trim() : t.notSpecified}</p><p>{t.period}: {term.period || t.notSpecified}</p>{term.minimum_amount != null ? <p>Minimum settlement: {amount(term.minimum_amount)} {term.currency || ""}</p> : null}{term.exchange_rule ? <p>{term.exchange_rule}</p> : null}</div>)}</div> : <p className="mt-2">{t.notSpecified}</p>}</section>
      {riskTerms.length ? <section className="border-t border-gray-200 pt-4">{riskTerms.map(([key, value]) => <p key={key}>{String(value)}</p>)}</section> : null}
    </div>
  </article>;
}
