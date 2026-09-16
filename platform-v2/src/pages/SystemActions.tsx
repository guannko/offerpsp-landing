import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useControlBridge } from '../context/ControlBridgeContext';
import { supabase } from '../lib/supabase';
import { intakeSteps, intakeStateLabels, intakeActionLabels, type IntakeSnapshot, type IntakeStep } from '../lib/intakeObservability';
import { chronologicalIntakeEvents, intakeClock, intakeDestination, intakeEventText, intakeNow, intakeStatusName } from '../lib/intakeDisplay';
import PageMeta from '../components/common/PageMeta';

const colors: Record<IntakeStep['state'], string> = {
  done: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  running: 'border-blue-200 bg-blue-50 text-blue-900',
  attention: 'border-amber-300 bg-amber-50 text-amber-950',
  failed: 'border-red-200 bg-red-50 text-red-900',
  unknown: 'border-slate-300 bg-slate-100 text-slate-800',
  stopped: 'border-slate-300 bg-slate-100 text-slate-800',
};
const surface = 'rounded-2xl border border-slate-300 bg-white dark:border-slate-600 dark:bg-gray-950';
const summaryStyle = 'cursor-pointer p-5 text-lg font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500 sm:p-6';
const linkStyle = 'inline-block min-h-11 py-2 font-bold text-brand-700 underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500 dark:text-brand-300';
function Stamp({ value, large = false }: { value?: string | null; large?: boolean }) {
  const clock = intakeClock(value);
  return clock ? <time dateTime={value!} className="block tabular-nums">
    <span className={`block font-bold ${large ? 'text-2xl' : 'text-lg'}`}>{clock.time}</span>
    <span className="block text-base font-medium">{clock.day}</span>
  </time> : <span className="text-base">Время не записано</span>;
}
function Badge({ state }: { state: IntakeStep['state'] }) {
  return <span className={`inline-block rounded-lg border px-3 py-1 text-base font-semibold ${colors[state]}`}>{intakeStateLabels[state]}</span>;
}
export default function SystemActions() {
  const { leads } = useControlBridge();
  const [params, setParams] = useSearchParams();
  const selected = params.get('lead') || leads[0]?.lead_id || '';
  const [data, setData] = useState<IntakeSnapshot | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const sequence = useRef(0);
  const callbacksRef = useRef<HTMLDetailsElement>(null);
  const evidenceRef = useRef<HTMLDetailsElement>(null);
  const load = useCallback(async () => {
    const run = ++sequence.current;
    setData(null); setError('');
    if (!selected) { setLoading(false); return; }
    setLoading(true);
    try {
      const result = await supabase.rpc('get_offerpsp_intake_observability', { p_lead_id: selected });
      if (run !== sequence.current) return;
      if (result.error) throw result.error;
      if (!result.data?.lead) throw new Error('Нет подтверждённых данных.');
      setData(result.data as IntakeSnapshot);
    } catch (e) {
      if (run === sequence.current) setError(e instanceof Error ? e.message : 'Не удалось загрузить журнал.');
    } finally { if (run === sequence.current) setLoading(false); }
  }, [selected]);
  useEffect(() => { const counter = sequence; void load(); return () => { counter.current++; }; }, [load]);
  const now = data ? intakeNow(data) : null;
  const steps = data ? intakeSteps(data) : [];
  const unresolved = steps.filter(s => ['failed', 'attention', 'unknown', 'running'].includes(s.state));
  function destination(key: string) {
    const target = intakeDestination(key, selected);
    if (target) return <Link className={linkStyle} to={target.href}>{target.label} →</Link>;
    return <button className={`${linkStyle} text-left`} onClick={() => {
      const panel = key === 'callbacks' ? callbacksRef.current : evidenceRef.current;
      if (panel) {
        panel.open = true;
        const target = key === 'callbacks' ? panel.querySelector('summary') : panel.querySelector<HTMLElement>(`[data-intake-step="${key}"]`);
        (target || panel).scrollIntoView({ block: 'start' });
        target?.focus({ preventScroll: true });
      }
    }}>{key === 'callbacks' ? 'Показать результаты кнопок' : 'Показать записи о доставке'} ↓</button>;
  }
  return <div className="mx-auto max-w-6xl space-y-6 text-lg leading-relaxed text-slate-900 dark:text-slate-100" data-testid="system-actions">
    <PageMeta title="Действия системы | OfferPSP" description="История обработки заявок OfferPSP" />
    <header>
      <h1 className="text-3xl font-bold">Действия системы</h1>
      <p className="mt-2">Что произошло с заявкой — по порядку. Всё время указано по Кипру.</p>
    </header>
    <div className="flex flex-col gap-3 sm:flex-row">
      <div className="min-w-0 flex-1">
        <label htmlFor="intake-selector" className="mb-2 block text-base font-semibold">Заявка</label>
        <select id="intake-selector" value={selected} onChange={e => setParams({ lead: e.target.value })} className="min-h-14 w-full min-w-0 rounded-xl border border-slate-400 bg-white p-3 text-lg font-medium text-slate-900">
          <option value="" disabled>Выберите заявку</option>
          {!leads.some(l => l.lead_id === selected) && selected && <option value={selected}>{data?.lead.company || 'Заявка по ссылке'}</option>}
          {leads.map(l => <option key={l.lead_id} value={l.lead_id}>{l.company || l.name || l.lead_id} · {intakeStatusName(l.status)}</option>)}
        </select>
      </div>
      <button onClick={() => void load()} disabled={loading || !selected} className="min-h-14 rounded-xl bg-brand-500 px-7 py-3 text-lg font-bold text-white disabled:opacity-50 sm:self-end">{loading ? 'Загружаю…' : 'Обновить'}</button>
    </div>
    {error && <div role="alert" className="rounded-xl border border-red-300 bg-red-50 p-5 text-red-900">{error} Статусы не подтверждены.</div>}
    {loading && <p role="status">Загружаю историю заявки…</p>}
    {!selected && <p>Заявок для отображения нет.</p>}
    {data && now && <>
      <section aria-label="Сейчас" className={`${surface} overflow-hidden border-l-4 border-l-brand-500`}>
        <div className="flex flex-col gap-5 p-5 sm:flex-row sm:justify-between sm:p-6">
          <div className="min-w-0 max-w-3xl">
            <p className="text-base font-semibold uppercase tracking-wide">Сейчас</p>
            <h2 className="mt-1 text-2xl font-bold">{now.title}</h2>
            <p className="mt-2">{now.detail}</p>
            {destination(now.target)}
          </div>
          <div className="shrink-0 border-t border-slate-300 pt-4 sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0">
            <p className="mb-1 text-base font-semibold">Данные обновлены</p><Stamp value={data.observed_at} large />
          </div>
        </div>
        {data.task && !['cancelled', 'done'].includes(data.task.status) && <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-slate-300 bg-slate-50 px-5 py-4 dark:bg-slate-900 sm:px-6">
          <strong>Срок первого ответа</strong><Stamp value={data.task.due_at} />{destination('task')}
        </div>}
      </section>

      {!!unresolved.length && <details className={`${surface} border-amber-300`}>
        <summary className={summaryStyle}>Требует внимания или уточнения · {unresolved.length}</summary>
        <ul className="divide-y divide-slate-300 border-t border-slate-300 px-5 sm:px-6">
          {unresolved.map(step => <li key={step.key} className="py-5">
            <div className="flex flex-wrap items-center gap-3"><h3 className="text-xl font-bold">{step.title}</h3><Badge state={step.state} /></div>
            <p className="mt-2">{step.reason}</p>{destination(step.key)}
          </li>)}
        </ul>
      </details>}

      <section className={`${surface} overflow-hidden`} aria-labelledby="intake-history-title">
        <div className="border-b border-slate-300 p-5 sm:p-6">
          <h2 id="intake-history-title" className="text-2xl font-bold">История обработки</h2>
          <p className="mt-1">От ранних событий к поздним ↓ <strong>{data.events.length} из {data.event_count}</strong></p>
          {data.event_count > data.events.length && <p className="mt-2 text-base">Показаны последние {data.events.length} событий, расположенные по времени.</p>}
        </div>
        {!data.events.length ? <p className="p-6">Событий в журнале пока нет. Это не подтверждает выполнение действий.</p> : <ol className="divide-y divide-slate-300">
          {chronologicalIntakeEvents(data.events).map(event => {
            const text = intakeEventText(event);
            return <li key={event.id} className="grid gap-3 p-5 sm:grid-cols-[155px_minmax(0,1fr)] sm:gap-6 sm:p-6">
              <div className="sm:border-r-2 sm:border-brand-200 sm:pr-5"><Stamp value={event.created_at} large /></div>
              <div className="min-w-0">
                <p className="mb-1 text-base font-semibold text-slate-600 dark:text-slate-300">{event.actor_type === 'staff' ? 'Сотрудник' : event.actor_type === 'aibot' ? 'Бот' : event.actor_type === 'system' ? 'Система' : 'Участник'}{event.outcome ? ` · ${intakeStatusName(event.outcome)}` : ''}</p>
                <h3 className="text-xl font-bold">{text.title}</h3>
                {text.detail && <p className="mt-2">{text.detail}</p>}
              </div>
            </li>;
          })}
        </ol>}
        <p className="border-t border-slate-300 bg-slate-50 px-5 py-4 text-base dark:bg-slate-900 sm:px-6">Записи с одинаковым временем не доказывают причинную последовательность действий.</p>
      </section>

      <details className={surface}>
        <summary className={summaryStyle}>Подробности автопроверки · {data.screening?.checks.length || 0}</summary>
        <div className="space-y-5 border-t border-slate-300 p-5 sm:p-6">
          {!data.screening?.checks.length ? <p>Отдельные результаты не записаны.</p> : data.screening.checks.map(c => <div key={c.key} className="border-l-4 border-slate-300 pl-4"><h3 className="text-xl font-bold">{c.title}</h3><p className="mt-1 font-semibold">{intakeStatusName(c.status)}</p><p className="mt-1">{c.detail || 'Причина не записана.'}</p></div>)}
          {destination('screening')}
        </div>
      </details>
      <details ref={callbacksRef} className={`${surface} scroll-mt-28`}>
        <summary className={summaryStyle}>Результаты кнопок Telegram · {data.actions.length}</summary>
        <div className="space-y-5 border-t border-slate-300 p-5 sm:p-6">
          {!data.actions.length ? <p>Нажатий с сохранённым результатом нет.</p> : data.actions.map(a => <div key={`${a.action}-${a.at}`} className="grid gap-3 sm:grid-cols-[155px_minmax(0,1fr)]"><Stamp value={a.at} large /><div><h3 className="text-xl font-bold">{intakeActionLabels[a.action] || a.action} · {intakeStatusName(a.outcome)}</h3><p className="mt-2">{a.message || 'Причина не записана.'}</p>{a.error_code && <p className="mt-2 text-base">Код ошибки: {a.error_code}</p>}</div></div>)}
          <p className="border-t border-slate-300 pt-4">Это результат на момент нажатия. Позднее черновик мог быть изменён или отменён.</p>
        </div>
      </details>
      <details ref={evidenceRef} className={`${surface} scroll-mt-28`}>
        <summary className={summaryStyle}>Все этапы и технические записи</summary>
        <div className="space-y-5 border-t border-slate-300 p-5 sm:p-6">
          <p>Источник: {data.lead.source || 'не указан'}. Заявка: <span className="break-all">{data.lead.id}</span></p>
          {steps.map(step => <div key={step.key} data-intake-step={step.key} tabIndex={-1} className="scroll-mt-28 border-t border-slate-300 pt-4 focus:outline focus:outline-2 focus:outline-brand-500"><div className="flex flex-wrap items-center gap-3"><h3 className="text-xl font-bold">{step.title}</h3><Badge state={step.state} /></div><p className="mt-2">{step.reason}</p>{step.at && <div className="mt-2"><Stamp value={step.at} /></div>}</div>)}
          <ul className="space-y-3">{data.events.map(e => <li key={e.id} className="break-words border-t border-slate-300 pt-3"><strong>{e.title}</strong><p className="text-base">{e.activity_type}</p><Stamp value={e.created_at} /></li>)}</ul>
        </div>
      </details>
    </>}
  </div>;
}
