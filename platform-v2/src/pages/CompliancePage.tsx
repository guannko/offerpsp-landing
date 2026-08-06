import { useMemo, useState } from "react";
import { Link } from "react-router";
import PageMeta from "../components/common/PageMeta";
import { EmptyState, Metric, PageHeading, Panel, SkeletonPage, StatusPill } from "../components/control/Ui";
import { useControlBridge } from "../context/ControlBridgeContext";

const filters = [
  ["active", "Требуют решения"],
  ["pending", "Новые"],
  ["manual_review", "Ручная проверка"],
  ["needs_info", "Нужны данные"],
  ["cleared", "Допущены"],
  ["blocked", "Отклонены / спам"],
] as const;

const score = (value?: number | null) => value == null ? "—" : value;

export default function CompliancePage() {
  const { loading, complianceCases, moduleEntitlements } = useControlBridge();
  const [filter, setFilter] = useState<(typeof filters)[number][0]>("active");
  const [search, setSearch] = useState("");
  const entitlement = moduleEntitlements.find((item) => item.module_key === "pre_compliance");

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return complianceCases.filter((item) => {
      const statusMatch = filter === "active"
        ? ["pending", "screening", "manual_review", "needs_info", "hold"].includes(item.case_status)
        : filter === "blocked"
          ? ["rejected", "spam"].includes(item.case_status)
          : item.case_status === filter;
      const searchMatch = !query || [item.company, item.work_email, item.company_url, item.vertical, item.geos, item.classification]
        .filter(Boolean).join(" ").toLowerCase().includes(query);
      return statusMatch && searchMatch;
    });
  }, [complianceCases, filter, search]);

  if (loading) return <SkeletonPage/>;
  if (!entitlement?.enabled) return <Panel><EmptyState title="Модуль не входит в тариф" description="Lead Intelligence / Pre-Compliance доступен как отдельный PRO-модуль."/></Panel>;

  const pending = complianceCases.filter((item) => ["pending", "screening"].includes(item.case_status)).length;
  const manualReview = complianceCases.filter((item) => item.case_status === "manual_review").length;
  const needsInfo = complianceCases.filter((item) => item.case_status === "needs_info").length;
  const cleared = complianceCases.filter((item) => item.case_status === "cleared").length;
  const blocked = complianceCases.filter((item) => ["rejected", "spam"].includes(item.case_status)).length;

  return <>
    <PageMeta title="Проверка лидов | OfferPSP" description="Предварительная проверка входящих заявок до matching."/>
    <PageHeading eyebrow="PRO · Lead Intelligence" title="Проверка входящих лидов" description="Подлинность, роль компании, коммерческая ценность и готовность досье. Автоматизация собирает доказательства, финальный допуск всегда делает человек."/>
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
      <Metric label="Автопроверка" value={pending} hint="новые или обрабатываются" tone={pending ? "warning" : "default"}/>
      <Metric label="Ручная проверка" value={manualReview} hint="автомат уже закончил" tone={manualReview ? "danger" : "default"}/>
      <Metric label="Нужны данные" value={needsInfo} hint="нужно запросить у заявителя" tone={needsInfo ? "danger" : "default"}/>
      <Metric label="Допущены" value={cleared} hint="matching разблокирован" tone="success"/>
      <Metric label="Заблокированы" value={blocked} hint="спам или отказ"/>
    </div>
    <Panel className="mt-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap gap-2">{filters.map(([value, label]) => <button key={value} onClick={() => setFilter(value)} className={`rounded-lg px-3 py-2 text-sm font-semibold ${filter === value ? "bg-brand-500 text-white" : "bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-300"}`}>{label}</button>)}</div>
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Компания, email, GEO, роль…" className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 text-sm outline-none focus:border-brand-400 dark:border-gray-700 xl:max-w-sm"/>
      </div>
      <div className="mt-5 overflow-x-auto">
        {visible.length ? <table className="w-full min-w-[980px] text-left"><thead><tr className="border-b border-gray-100 text-[11px] uppercase tracking-[0.14em] text-gray-400 dark:border-gray-800"><th className="px-3 py-3">Компания</th><th className="px-3 py-3">Роль / риск</th><th className="px-3 py-3">Подлинность</th><th className="px-3 py-3">Готовность</th><th className="px-3 py-3">Ценность</th><th className="px-3 py-3">Полнота</th><th className="px-3 py-3">Статус</th><th/></tr></thead><tbody>{visible.map((item) => <tr key={item.case_id} className="border-b border-gray-100 text-sm dark:border-gray-800"><td className="px-3 py-4"><strong className="block text-gray-900 dark:text-white">{item.company}</strong><span className="mt-1 block text-xs text-gray-400">{item.work_email || item.company_url || "контакт не указан"}</span></td><td className="px-3 py-4"><span className="font-medium text-gray-700 dark:text-gray-300">{item.classification}</span><span className={`ml-2 rounded-full px-2 py-1 text-[10px] font-bold ${["high", "critical"].includes(item.risk_level) ? "bg-error-50 text-error-600" : item.risk_level === "medium" ? "bg-warning-50 text-warning-700" : "bg-success-50 text-success-700"}`}>{item.risk_level}</span></td><td className="px-3 py-4 font-semibold">{score(item.authenticity_score)}</td><td className="px-3 py-4 font-semibold">{score(item.compliance_readiness_score)}</td><td className="px-3 py-4 font-semibold">{score(item.commercial_value_score)}</td><td className="px-3 py-4 font-semibold">{score(item.completeness_score)}</td><td className="px-3 py-4"><StatusPill status={item.case_status}/></td><td className="px-3 py-4 text-right"><Link to={`/merchants/${item.lead_id}?tab=compliance`} className="rounded-lg bg-gray-900 px-3 py-2 text-xs font-semibold text-white dark:bg-white dark:text-gray-900">Открыть досье</Link></td></tr>)}</tbody></table> : <EmptyState title="В этой очереди ничего нет" description="Новые заявки появятся здесь автоматически до запуска matching."/>}
      </div>
    </Panel>
  </>;
}
