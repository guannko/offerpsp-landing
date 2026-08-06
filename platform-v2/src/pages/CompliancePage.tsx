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

const classificationLabels: Record<string, string> = {
  merchant: "Мерч",
  subagent: "Субагент",
  psp: "PSP",
  consultant: "Консультант",
  other: "Другое",
  unknown: "Не определено",
};

const riskLabels: Record<string, string> = {
  low: "Низкий риск",
  medium: "Средний риск",
  high: "Высокий риск",
  critical: "Критический риск",
  unknown: "Риск не определён",
};

const riskClassName = (riskLevel: string) => ["high", "critical"].includes(riskLevel)
  ? "bg-error-50 text-error-600 dark:bg-error-500/15 dark:text-error-300"
  : riskLevel === "medium"
    ? "bg-warning-50 text-warning-700 dark:bg-warning-500/15 dark:text-warning-300"
    : "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-300";

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
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
      <Metric label="Автопроверка" value={pending} hint="новые или обрабатываются" tone={pending ? "warning" : "default"}/>
      <Metric label="Ручная проверка" value={manualReview} hint="автомат уже закончил" tone={manualReview ? "danger" : "default"}/>
      <Metric label="Нужны данные" value={needsInfo} hint="нужно запросить у заявителя" tone={needsInfo ? "danger" : "default"}/>
      <Metric label="Допущены" value={cleared} hint="matching разблокирован" tone="success"/>
      <Metric label="Заблокированы" value={blocked} hint="спам или отказ"/>
    </div>
    <Panel className="mt-6">
      <div className="flex min-w-0 flex-col gap-4 2xl:flex-row 2xl:items-center 2xl:justify-between">
        <div className="-mx-1 min-w-0 overflow-x-auto px-1 pb-1">
          <div className="flex w-max gap-2">{filters.map(([value, label]) => <button key={value} onClick={() => setFilter(value)} className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold ${filter === value ? "bg-brand-500 text-white" : "bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-300"}`}>{label}</button>)}</div>
        </div>
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Компания, email, GEO, роль…" className="h-11 w-full shrink-0 rounded-lg border border-gray-200 bg-transparent px-4 text-sm outline-none focus:border-brand-400 dark:border-gray-700 2xl:w-80"/>
      </div>
      {visible.length ? <>
        <div className="mt-5 grid gap-4 xl:hidden">
          {visible.map((item) => <article key={item.case_id} className="rounded-xl border border-gray-100 bg-white p-4 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.02] sm:p-5">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0">
                <strong className="block truncate text-base text-gray-900 dark:text-white">{item.company}</strong>
                <span className="mt-1 block truncate text-xs text-gray-400">{item.work_email || item.company_url || "контакт не указан"}</span>
              </div>
              <StatusPill status={item.case_status}/>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-700 dark:bg-white/5 dark:text-gray-300">{classificationLabels[item.classification] || item.classification}</span>
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${riskClassName(item.risk_level)}`}>{riskLabels[item.risk_level] || item.risk_level}</span>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                ["Подлинность", item.authenticity_score],
                ["Готовность", item.compliance_readiness_score],
                ["Ценность", item.commercial_value_score],
                ["Полнота", item.completeness_score],
              ].map(([label, value]) => <div key={label} className="rounded-lg bg-gray-50 px-3 py-3 dark:bg-white/[0.03]">
                <dt className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{label}</dt>
                <dd className="mt-1 text-lg font-bold text-gray-900 dark:text-white">{score(value as number | null | undefined)}</dd>
              </div>)}
            </dl>
            <Link to={`/merchants/${item.lead_id}?tab=compliance`} className="mt-4 flex h-11 w-full items-center justify-center whitespace-nowrap rounded-lg bg-gray-900 px-4 text-sm font-semibold text-white transition hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100">Открыть досье</Link>
          </article>)}
        </div>
        <div className="mt-5 hidden overflow-x-auto xl:block">
          <table className="w-full min-w-[1120px] table-fixed text-left">
            <colgroup><col className="w-[22%]"/><col className="w-[15%]"/><col className="w-[9%]"/><col className="w-[9%]"/><col className="w-[9%]"/><col className="w-[9%]"/><col className="w-[15%]"/><col className="w-[140px]"/></colgroup>
            <thead><tr className="border-b border-gray-100 text-[11px] uppercase tracking-[0.14em] text-gray-400 dark:border-gray-800"><th className="px-3 py-3">Компания</th><th className="px-3 py-3">Роль / риск</th><th className="px-3 py-3">Подлинность</th><th className="px-3 py-3">Готовность</th><th className="px-3 py-3">Ценность</th><th className="px-3 py-3">Полнота</th><th className="px-3 py-3">Статус</th><th className="px-3 py-3"/></tr></thead>
            <tbody>{visible.map((item) => <tr key={item.case_id} className="border-b border-gray-100 text-sm dark:border-gray-800">
              <td className="px-3 py-4"><strong className="block truncate text-gray-900 dark:text-white">{item.company}</strong><span className="mt-1 block truncate text-xs text-gray-400">{item.work_email || item.company_url || "контакт не указан"}</span></td>
              <td className="px-3 py-4"><div className="flex flex-wrap items-center gap-2"><span className="font-medium text-gray-700 dark:text-gray-300">{classificationLabels[item.classification] || item.classification}</span><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${riskClassName(item.risk_level)}`}>{riskLabels[item.risk_level] || item.risk_level}</span></div></td>
              <td className="px-3 py-4 font-semibold">{score(item.authenticity_score)}</td><td className="px-3 py-4 font-semibold">{score(item.compliance_readiness_score)}</td><td className="px-3 py-4 font-semibold">{score(item.commercial_value_score)}</td><td className="px-3 py-4 font-semibold">{score(item.completeness_score)}</td><td className="px-3 py-4"><StatusPill status={item.case_status}/></td>
              <td className="px-3 py-4 text-right"><Link to={`/merchants/${item.lead_id}?tab=compliance`} className="inline-flex whitespace-nowrap rounded-lg bg-gray-900 px-3 py-2 text-xs font-semibold text-white dark:bg-white dark:text-gray-900">Открыть досье</Link></td>
            </tr>)}</tbody>
          </table>
        </div>
      </> : <div className="mt-5"><EmptyState title="В этой очереди ничего нет" description="Новые заявки появятся здесь автоматически до запуска matching."/></div>}
    </Panel>
  </>;
}
