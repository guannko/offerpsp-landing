import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { ErrorBanner, Metric, Panel } from "./Ui";
import GeoObservationForm from "./GeoObservationForm";
import type { GeoObservationInput } from "../../lib/geoObservationForm";

type Observation = {
  id: string; engine: string; model?: string; language: string; country: string;
  prompt: string; response_text: string; citations: string[]; evidence_url?: string;
  observed_at: string; mode: string; brand_mentioned: boolean; site_cited: boolean;
};
type Evidence = { totals?: { checks: number; mentions: number; citations: number }; observations?: Observation[] };

export default function GeoVisibilityPanel() {
  const [data,setData]=useState<Evidence | null>(null);
  const [error,setError]=useState<string | null>(null);
  const [busy,setBusy]=useState(false);
  const [open,setOpen]=useState(false);
  const [notice,setNotice]=useState<string | null>(null);
  const load=useCallback(async () => {
    const result=await supabase.rpc("get_offerpsp_geo_observations");
    if (result.error) setError(result.error.message);
    else { setData(result.data as Evidence); setError(null); }
  },[]);
  useEffect(()=>{ void load(); },[load]);
  async function save(observation: GeoObservationInput) {
    setBusy(true); setError(null); setNotice(null);
    try {
      const result=await supabase.rpc("record_offerpsp_geo_observation",{p_observation:observation});
      if (result.error) throw result.error;
      await load(); setNotice("Проверка сохранена. Повторное сохранение тех же доказательств не создаёт дубль.");
      setOpen(false);
    } catch (reason) {
      const message=reason instanceof Error ? reason.message : String((reason as {message?:string})?.message || reason);
      setError(message);
      throw new Error(message);
    }
    finally { setBusy(false); }
  }
  return <Panel className="mt-6">
    <h2 className="text-lg font-semibold text-gray-900 dark:text-white">GEO · фактическая AI-видимость</h2>
    <p className="mt-2 text-sm text-gray-500">Отдельные проверки ответов ChatGPT, Gemini и Perplexity. Упоминание бренда, ссылка на сайт и переход с AI-платформы — разные сигналы. Здесь только сохранённые ответы, не оценка общего рынка.</p>
    <p className="mt-2 text-sm text-warning-700">Автоматический API-мониторинг пока не подключён. Ручная проверка — доказательство конкретного ответа, а не автоматическое измерение всех пользователей.</p>
    {error && <ErrorBanner message={error}/>} {notice && <p className="mt-3 text-sm text-success-700">{notice}</p>}
    <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
      <Metric label="Проверок · 30 дней" value={data ? data.totals?.checks ?? 0 : "—"} hint="сохранённые ручные наблюдения"/>
      <Metric label="Упоминаний бренда" value={data ? data.totals?.mentions ?? 0 : "—"} hint="OfferPSP в тексте ответа"/>
      <Metric label="Ответов со ссылкой" value={data ? data.totals?.citations ?? 0 : "—"} hint="точный домен offerpsp.com в источниках"/>
    </div>
    <button className="mt-4 rounded-lg bg-brand-500 px-4 py-2 text-sm text-white" onClick={()=>setOpen(!open)}>{open ? "Скрыть форму" : "Сохранить реальную GEO-проверку"}</button>
    {open && <GeoObservationForm busy={busy} onSave={save}/>}
    <div className="mt-5 space-y-3">{data?.observations?.map(item=><details key={item.id} className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
      <summary className="cursor-pointer text-sm font-medium">{item.engine} · {item.country}/{item.language} · {new Date(item.observed_at).toLocaleString("ru-RU")} · {item.site_cited ? "есть ссылка" : item.brand_mentioned ? "только упоминание" : "бренд не найден"} · ручная проверка</summary>
      <p className="mt-3 text-sm font-semibold">{item.prompt}</p><p className="mt-2 whitespace-pre-wrap text-sm text-gray-600 dark:text-gray-300">{item.response_text}</p>
      <ul className="mt-3 text-sm">{item.citations.map((url,index)=><li key={index}><a href={url} target="_blank" rel="noopener noreferrer" className="break-all text-brand-500">{url}</a></li>)}</ul>
      {item.evidence_url && <a href={item.evidence_url} target="_blank" rel="noopener noreferrer" className="mt-3 block text-sm text-brand-500">Открыть доказательство ↗</a>}
    </details>)}</div>
    {data && !data.observations?.length && <p className="mt-4 text-sm text-gray-500">Проверок ещё нет. Ноль сохранённых проверок не означает нулевую AI-видимость.</p>}
  </Panel>;
}
