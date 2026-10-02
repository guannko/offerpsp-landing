import { useMemo, useState } from "react";
import { aibotTaskGroup, aibotTaskPresentation, safeAibotPayload } from "../../lib/aibotTaskPresentation";
import type { AibotTaskGroup } from "../../lib/aibotTaskPresentation";
import type { WorkTask } from "../../types/offerpsp";
import { EmptyState, Panel } from "./Ui";

export default function AibotQueue({ tasks }: { tasks: WorkTask[] }) {
  const [group, setGroup] = useState<AibotTaskGroup>("active");
  const [query, setQuery] = useState("");
  const counts = { active: 0, history: 0, test: 0 };
  for (const task of tasks) counts[aibotTaskGroup(task)]++;
  const rows = useMemo(() => tasks.filter((task) => aibotTaskGroup(task) === group)
    .map((task) => ({ task, view: aibotTaskPresentation(task) }))
    .filter(({ view }) => !query.trim() || `${view.title} ${view.description} ${view.label}`.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => (group === "active" ? 1 : -1) * ((a.view.date ? Date.parse(a.view.date) : 0) - (b.view.date ? Date.parse(b.view.date) : 0))), [tasks, group, query]);
  return <Panel className="mt-5">
    <h2 className="text-lg text-gray-900">Миссии AIBot</h2>
    <p className="mt-1 text-sm text-gray-500">Текущая очередь отдельно от истории. Это просмотр: задания не запускаются и не меняются здесь.</p>
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
      <div role="group" aria-label="Раздел миссий AIBot" className="flex flex-wrap gap-2">
        {([['active', 'Текущие'], ['history', 'История'], ['test', 'Тестовые']] as const).map(([id, label]) => <button key={id} type="button" aria-pressed={group === id} onClick={() => setGroup(id)} className={`rounded-lg border px-4 py-2 text-sm ${group === id ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-600'}`}>{label} · {counts[id]}</button>)}
      </div>
      <input aria-label="Поиск миссий AIBot" placeholder="Поиск по заданию или компании…" value={query} onChange={(e) => setQuery(e.target.value)} className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 sm:w-80"/>
    </div>
    <div className="mt-4 divide-y divide-gray-200">{rows.map(({ task, view }) => <article key={task.id} className="grid items-start gap-3 py-4 lg:grid-cols-[minmax(0,1fr)_210px_170px]">
      <div className="min-w-0"><h3 className="text-sm font-semibold text-gray-900">{view.title}</h3><p className="mt-1 whitespace-pre-wrap break-words text-sm text-gray-500">{view.description}</p>
        <details className="mt-2 text-xs text-gray-500"><summary className="w-fit cursor-pointer">Технические данные</summary><p className="mt-2 break-all">Тип: {task.task_type || 'не записан'} · ID: {task.id} · статус: {task.status || 'не записан'}</p><pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-gray-50 p-3 text-xs">{safeAibotPayload(task.payload)}</pre></details>
      </div>
      <span className={`inline-flex h-fit w-fit self-start rounded-full px-3 py-1 text-xs font-medium ${['failed', 'error'].includes(view.status) ? 'bg-error-50 text-error-700' : 'bg-gray-100 text-gray-700'}`}>{view.label}</span>
      <div className="text-xs text-gray-500 lg:text-right"><span className="block">{view.dateLabel}</span>{view.date ? <time dateTime={view.date}>{new Date(view.date).toLocaleString('ru-RU')}</time> : 'Дата не записана'}</div>
    </article>)}</div>
    {!rows.length && <div className="mt-4"><EmptyState title={group === 'active' && !query ? 'Текущих миссий нет' : 'Миссий по отбору нет'} description={group === 'active' ? 'Завершённые и пропущенные задания сохранены в истории; тестовые выделены отдельно.' : 'Измените поиск или раздел. Записи не удалены.'}/></div>}
    <p className="mt-3 text-xs text-gray-500">Счётчики относятся к загруженной выборке. «Пропущено» не означает выполнение; неизвестный статус остаётся в текущих для проверки.</p>
  </Panel>;
}
