import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { ErrorBanner, Metric, Panel } from "./Ui";

type Observation = {
  id: string; engine: string; model?: string; language: string; country: string;
  prompt: string; response_text: string; citations: string[]; evidence_url?: string;
  observed_at: string; mode: string; brand_mentioned: boolean; site_cited: boolean;
};
type Evidence = { totals?: { checks: number; mentions: number; citations: number }; observations?: Observation[] };
const localDateTime = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0,16);

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
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form=event.currentTarget;
    const fields=new FormData(form);
    setBusy(true); setError(null); setNotice(null);
    try {
      const observation={
        engine: fields.get("engine"), model: fields.get("model"),
        country: String(fields.get("country") || "").toUpperCase(), language: fields.get("language"),
        prompt: fields.get("prompt"), response_text: fields.get("response_text"),
        citations: String(fields.get("citations") || "").split(/\n/).map(value=>value.trim()).filter(Boolean),
        evidence_url: fields.get("evidence_url"), observed_at: new Date(String(fields.get("observed_at"))).toISOString(),
      };
      const result=await supabase.rpc("record_offerpsp_geo_observation",{p_observation:observation});
      if (result.error) throw result.error;
      await load(); setNotice("Проверка сохранена. Повторное сохранение тех же доказательств не создаёт дубль.");
      form.reset(); setOpen(false);
    } catch (reason) { setError(reason instanceof Error ? reason.message : String((reason as {message?:string})?.message || reason)); }
    finally { setBusy(false); }
  }
  const inputClass="w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2 dark:border-gray-700";
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
    {open && <form onSubmit={event=>void save(event)} className="mt-4 space-y-3 text-sm text-gray-700 dark:text-gray-300">
      <p>Вставляйте только публичный запрос и ответ. Без данных мерчей, секретов и ссылок с токенами доступа.</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <label>Платформа<select name="engine" className={inputClass}><option value="chatgpt">ChatGPT</option><option value="gemini">Gemini</option><option value="perplexity">Perplexity</option></select></label>
        <label>Модель<input name="model" maxLength={100} className={inputClass}/></label>
        <label>Страна проверки (ISO)<input name="country" defaultValue="US" required pattern="[A-Za-z]{2}" className={inputClass}/></label>
        <label>Язык<select name="language" className={inputClass}><option value="en">English</option><option value="ru">Русский</option></select></label>
        <label>Когда получен ответ<input name="observed_at" type="datetime-local" required defaultValue={localDateTime()} className={inputClass}/></label>
        <label>Публичная ссылка на доказательство<input name="evidence_url" type="url" pattern="https://.*" className={inputClass}/></label>
      </div>
      <label className="block">Точный запрос<textarea name="prompt" required minLength={5} maxLength={2000} className={inputClass}/></label>
      <label className="block">Полный ответ<textarea name="response_text" required minLength={10} maxLength={20000} rows={6} className={inputClass}/></label>
      <label className="block">Ссылки из ответа · по одной HTTPS-ссылке на строку<textarea name="citations" rows={3} className={inputClass}/></label>
      <button disabled={busy} className="rounded-lg bg-brand-500 px-4 py-2 text-white disabled:opacity-50">{busy ? "Сохраняю…" : "Сохранить доказательство"}</button>
    </form>}
    <div className="mt-5 space-y-3">{data?.observations?.map(item=><details key={item.id} className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
      <summary className="cursor-pointer text-sm font-medium">{item.engine} · {item.country}/{item.language} · {new Date(item.observed_at).toLocaleString("ru-RU")} · {item.site_cited ? "есть ссылка" : item.brand_mentioned ? "только упоминание" : "бренд не найден"} · ручная проверка</summary>
      <p className="mt-3 text-sm font-semibold">{item.prompt}</p><p className="mt-2 whitespace-pre-wrap text-sm text-gray-600 dark:text-gray-300">{item.response_text}</p>
      <ul className="mt-3 text-sm">{item.citations.map((url,index)=><li key={index}><a href={url} target="_blank" rel="noopener noreferrer" className="break-all text-brand-500">{url}</a></li>)}</ul>
      {item.evidence_url && <a href={item.evidence_url} target="_blank" rel="noopener noreferrer" className="mt-3 block text-sm text-brand-500">Открыть доказательство ↗</a>}
    </details>)}</div>
    {data && !data.observations?.length && <p className="mt-4 text-sm text-gray-500">Проверок ещё нет. Ноль сохранённых проверок не означает нулевую AI-видимость.</p>}
  </Panel>;
}
