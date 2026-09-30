import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import PageMeta from "../components/common/PageMeta";
import { ErrorBanner, PageHeading, Panel, SkeletonPage } from "../components/control/Ui";
import { supabase } from "../lib/supabase";

type QaFixtureEntity = { entity_type: "merchant" | "provider"; entity_id: string; label?: string | null };
type QaFixtureCheck = { key: string; label: string; passed: boolean; detail: string };
type QaFixtureStatus = {
  scenario_key: string;
  contract_version?: number;
  healthy?: boolean;
  merchant_count: number;
  provider_count: number;
  published_route_count: number;
  eligible_match_count: number;
  checks?: QaFixtureCheck[];
  issues?: string[];
  entities: QaFixtureEntity[];
};

export default function QaDiagnosticsPage() {
  const [fixtures, setFixtures] = useState<QaFixtureStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await supabase.rpc("list_offerpsp_qa_fixture_status");
    if (result.error) setError(result.error.message);
    else setFixtures((result.data || []) as QaFixtureStatus[]);
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);
  if (loading) return <SkeletonPage label="Проверяем изолированные QA-сценарии…"/>;
  return <>
    <PageMeta title="QA-диагностика | OfferPSP" description="Скрытая диагностика синтетических сценариев OfferPSP."/>
    <PageHeading eyebrow="Hidden diagnostics" title="QA-диагностика" description="Скрытый staff-раздел. Здесь показаны только синтетические данные; они не являются рабочими мерчантами, PSP или офферами." action={<button type="button" onClick={()=>void load()} className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-semibold dark:border-gray-700">Перепроверить</button>}/>
    {error && <ErrorBanner message={error}/>} 
    <div className="mb-5 rounded-xl border border-warning-200 bg-warning-50 px-4 py-3 text-sm text-warning-800 dark:border-warning-500/30 dark:bg-warning-500/10 dark:text-warning-200">Синтетический стенд. Не использовать показатели этого раздела в рабочей Радиорубке, аналитике или отчётности.</div>
    <div className="grid gap-4 lg:grid-cols-2">
      {fixtures.map((fixture) => {
        const healthy = fixture.healthy ?? (fixture.merchant_count > 0 && fixture.provider_count > 0 && fixture.published_route_count > 0 && fixture.eligible_match_count > 0);
        return <Panel key={fixture.scenario_key}>
          <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">{fixture.scenario_key}{fixture.contract_version ? ` · contract v${fixture.contract_version}` : ""}</p><h2 className="mt-1 font-semibold text-gray-900 dark:text-white">Изолированный QA-контракт</h2></div><span className={`rounded-full px-3 py-1 text-xs font-semibold ${healthy ? "bg-success-50 text-success-700" : "bg-error-50 text-error-700"}`}>{healthy ? "Проверен" : "Ошибка"}</span></div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-sm text-gray-600 dark:text-gray-300"><p>Мерчей: <strong>{fixture.merchant_count}</strong></p><p>PSP: <strong>{fixture.provider_count}</strong></p><p>Маршрутов: <strong>{fixture.published_route_count}</strong></p><p>Совпадений: <strong>{fixture.eligible_match_count}</strong></p></div>
          {fixture.checks?.length ? <div className="mt-4 space-y-2 border-t border-gray-200 pt-4 dark:border-gray-700">{fixture.checks.map((check) => <div key={check.key} className="flex gap-2 text-sm"><span className={check.passed ? "text-success-600" : "text-error-600"}>{check.passed ? "✓" : "!"}</span><div><p className="font-medium">{check.label}</p><p className="text-xs text-gray-400">{check.detail}</p></div></div>)}</div> : null}
          {fixture.issues?.length ? <p className="mt-4 rounded-lg bg-error-50 px-3 py-2 text-xs text-error-700">{fixture.issues.join(" · ")}</p> : null}
          <div className="mt-4 flex flex-wrap gap-2">{fixture.entities.map((entity) => <Link key={`${entity.entity_type}-${entity.entity_id}`} to={`/${entity.entity_type === "merchant" ? "merchants" : "psps"}/${entity.entity_id}`} className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-brand-600 dark:border-gray-700">{entity.label || entity.entity_type}</Link>)}</div>
        </Panel>;
      })}
      {!fixtures.length && !error ? <Panel><p className="text-sm text-gray-500">QA-контракты не зарегистрированы.</p></Panel> : null}
    </div>
  </>;
}
