import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useControlBridge } from '../context/ControlBridgeContext';
import { supabase } from '../lib/supabase';
import { intakeSteps, intakeStateLabels, intakeActionLabels, type IntakeSnapshot, type IntakeStep } from '../lib/intakeObservability';
import { Panel } from '../components/control/Ui';
import PageMeta from '../components/common/PageMeta';

const colors: Record<IntakeStep['state'],string>={done:'bg-emerald-50 text-emerald-800',running:'bg-blue-50 text-blue-800',attention:'bg-amber-50 text-amber-900',failed:'bg-red-50 text-red-800',unknown:'bg-gray-100 text-gray-700',stopped:'bg-gray-100 text-gray-700'};
const date=(s?:string|null)=>s&&Number.isFinite(Date.parse(s))?new Intl.DateTimeFormat('ru-RU',{timeZone:'Asia/Nicosia',dateStyle:'short',timeStyle:'medium'}).format(new Date(s)):'—';
export default function SystemActions(){
  const {leads}=useControlBridge();
  const [params,setParams]=useSearchParams();
  const selected=params.get('lead')||leads[0]?.lead_id||'';
  const [data,setData]=useState<IntakeSnapshot|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(false);
  const sequence=useRef(0);
  const load=useCallback(async()=>{
    const run=++sequence.current;
    setData(null);setError('');
    if(!selected){setLoading(false);return;}
    setLoading(true);
    try{
      const result=await supabase.rpc('get_offerpsp_intake_observability',{p_lead_id:selected});
      if(run!==sequence.current)return;
      if(result.error)throw result.error;
      if(!result.data?.lead)throw new Error('Нет подтверждённых данных.');
      setData(result.data as IntakeSnapshot);
    }catch(e){if(run===sequence.current)setError(e instanceof Error?e.message:'Не удалось загрузить журнал.');}
    finally{if(run===sequence.current)setLoading(false);}
  },[selected]);
  useEffect(()=>{const counter=sequence;void load();return()=>{counter.current++;};},[load]);
  return <div className="space-y-6" data-testid="system-actions">
    <PageMeta title="Действия системы | OfferPSP" description="Проверяемый журнал обработки заявок OfferPSP"/>
    <header><h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Действия системы</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-gray-600 dark:text-gray-300">Обработка новых заявок: сохранённые результаты, незавершённые этапы и причины. Это проверяемый снимок, не анимация работы бота. Время — Кипр.</p></header>
    <div className="flex flex-wrap gap-3"><select aria-label="Заявка" value={selected} onChange={e=>setParams({lead:e.target.value})} className="min-w-0 flex-1 rounded-xl border border-gray-300 bg-white p-3 text-gray-900"><option value="" disabled>Выберите заявку</option>{leads.map(l=><option key={l.lead_id} value={l.lead_id}>{l.company||l.name||l.lead_id} · {l.status}</option>)}</select><button onClick={()=>void load()} disabled={loading||!selected} className="rounded-xl bg-brand-500 px-5 py-3 font-semibold text-white disabled:opacity-50">{loading?'Проверяю…':'Обновить'}</button></div>
    {error&&<div role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">{error} Статусы не подтверждены.</div>}
    {!selected&&<p>Заявок для отображения нет.</p>}
    {data&&<>
      <div className="flex flex-wrap justify-between gap-3 text-sm text-gray-600 dark:text-gray-300"><span>Снимок: {date(data.observed_at)} · источник заявки: {data.lead.source||'не указан'}</span><Link className="font-semibold text-brand-600" to={`/merchants/${data.lead.id}`}>Открыть мерчанта →</Link></div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{intakeSteps(data).map(step=><Panel key={step.key}><div className="flex flex-wrap items-start justify-between gap-2"><h2 className="font-semibold text-gray-900 dark:text-white">{step.title}</h2><span className={`rounded-full px-3 py-1 text-xs font-semibold ${colors[step.state]}`}>{intakeStateLabels[step.state]}</span></div><p className="mt-3 text-sm leading-6 text-gray-700 dark:text-gray-200">{step.reason}</p><p className="mt-3 text-xs text-gray-500">{date(step.at)}</p>{step.key==='task'&&data.task&&<p className="mt-2 text-sm font-medium">Срок ответа: {date(data.task.due_at)}</p>}</Panel>)}</div>
      <Panel><h2 className="text-lg font-semibold">Результаты кнопок бота</h2>{!data.actions.length?<p className="mt-3 text-gray-600">Действий пока не зарегистрировано.</p>:data.actions.map(a=><div key={`${a.action}-${a.at}`} className="mt-3 rounded-xl border border-gray-200 p-4"><strong>{intakeActionLabels[a.action]||a.action} · {a.outcome}</strong><p className="mt-2">{a.message||'Причина не записана.'}</p><p className="mt-2 text-xs text-gray-500">{date(a.at)}{a.error_code?` · код: ${a.error_code}`:''}</p></div>)}</Panel>
      <Panel><h2 className="text-lg font-semibold">Что проверялось</h2>{!data.screening?.checks.length?<p className="mt-3 text-gray-600">Результаты отдельных проверок отсутствуют.</p>:data.screening.checks.map(c=><div key={c.key} className="mt-3 border-b border-gray-100 pb-3"><strong>{c.title} · {c.status}</strong><p className="mt-1 text-sm leading-6 text-gray-700 dark:text-gray-200">{c.detail||'Причина не записана.'}</p></div>)}</Panel>
      <Panel><h2 className="text-lg font-semibold">Хронология событий</h2><p className="mt-2 text-sm text-gray-500">Новые сверху. Показано {data.events.length} из {data.event_count}. Нет записи — нет доказательства выполнения.</p><ol className="mt-4 space-y-4">{data.events.map(e=><li key={e.id} className="border-l-2 border-brand-300 pl-4"><p className="text-xs text-gray-500">{date(e.created_at)} · {e.actor_type}</p><p className="mt-1 font-medium">{e.title}</p>{e.detail&&<p className="mt-1 text-sm">{e.detail}</p>}<p className="mt-1 text-xs text-gray-500">{e.activity_type}{e.outcome?` · ${e.outcome}`:''}</p></li>)}</ol></Panel>
    </>}
  </div>;
}
