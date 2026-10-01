import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import listPlugin from "@fullcalendar/list";
import { supabase } from "../../lib/supabase";
import { calendarDay, calendarEventColor, calendarEventLabel, calendarLayer, calendarWindow, mergeCalendarPages } from "../../lib/calendarEvents";
import type { CalendarEvent, CalendarLayer, CalendarPage } from "../../lib/calendarEvents";
import type { WorkTask } from "../../types/offerpsp";
import { EmptyState, ErrorBanner, Panel } from "./Ui";

const layers: Array<{ id: CalendarLayer; title: string; detail: string }> = [
  { id: "past", title: "Было", detail: "История и прошедшие сроки" },
  { id: "now", title: "Сейчас", detail: "События и задачи сегодня" },
  { id: "future", title: "Будет", detail: "Планы со следующего дня" },
];
const filters = [["all", "Всё"], ["mail", "Переписка"], ["offers", "Предложения"], ["tasks", "Задачи"], ["activity", "Действия"]];
const stamp = (value: string) => new Date(value).toLocaleString("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
type ReadCalendarPage = (range: { p_start: string; p_end: string; p_offset: number; p_limit: number }) => Promise<CalendarPage>;
const readCalendarPage: ReadCalendarPage = async (range) => {
  const result = await supabase.rpc("get_offerpsp_calendar_events", range);
  if (result.error) throw new Error(result.error.message);
  return result.data as CalendarPage;
};

export default function OperationsCalendar({ tasks, onEditTask, onNewTask, readPage = readCalendarPage }: {
  tasks: WorkTask[];
  onEditTask: (task: WorkTask) => void;
  onNewTask: (date: string) => void;
  readPage?: ReadCalendarPage;
}) {
  const [layer, setLayer] = useState<CalendarLayer>("now");
  const [now, setNow] = useState(() => new Date());
  const [range, setRange] = useState<{ start: Date; end: Date } | null>(null);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [selected, setSelected] = useState<CalendarEvent | null>(null);
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const generation = useRef(0);
  const loadedRange = useRef("");
  const day = calendarDay(now);
  const window = range ? calendarWindow(range.start, range.end, layer, now) : null;
  const from = window?.start;
  const to = window?.end;

  useEffect(() => {
    const update = () => { setNow(new Date()); setRefresh((value) => value + 1); };
    const timer = globalThis.setInterval(update, 60000);
    const visible = () => { if (document.visibilityState === "visible") update(); };
    document.addEventListener("visibilitychange", visible);
    return () => { globalThis.clearInterval(timer); document.removeEventListener("visibilitychange", visible); };
  }, []);

  useEffect(() => {
    const request = ++generation.current;
    let active = true;
    const rangeKey = `${from}:${to}`;
    if (loadedRange.current !== rangeKey) {
      setEvents([]); setSelected(null); setHasMore(false); setOffset(0); setGeneratedAt(null);
      loadedRange.current = rangeKey;
    }
    setError(null);
    if (!from || !to) { setLoading(false); return; }
    setLoading(true);
    void (async () => {
      try {
        const page = await readPage({ p_start: from, p_end: to, p_offset: 0, p_limit: 200 });
        if (!active || request !== generation.current) return;
        setEvents(page.events); setHasMore(page.has_more); setOffset(page.next_offset); setGeneratedAt(page.generated_at);
        setSelected((current) => current ? page.events.find((event) => event.id === current.id) || current : null);
      } catch (cause) {
        if (active && request === generation.current) setError(cause instanceof Error ? cause.message : "Не удалось загрузить события.");
      } finally { if (active && request === generation.current) setLoading(false); }
    })();
    return () => { active = false; };
  }, [from, to, refresh, readPage]);

  async function loadMore() {
    if (!from || !to || loading || !hasMore) return;
    const request = generation.current;
    setLoading(true); setError(null);
    try {
      const page = await readPage({ p_start: from, p_end: to, p_offset: offset, p_limit: 200 });
      if (request !== generation.current) return;
      setEvents((current) => mergeCalendarPages(current, page.events));
      setHasMore(page.has_more); setOffset(page.next_offset); setGeneratedAt(page.generated_at);
    } catch (cause) {
      if (request === generation.current) setError(cause instanceof Error ? cause.message : "Не удалось загрузить продолжение.");
    } finally { if (request === generation.current) setLoading(false); }
  }

  const visible = useMemo(() => events.filter((event) => calendarLayer(event.occurred_at, now) === layer)
    .filter((event) => filter === "all" || (filter === "mail" && event.kind.startsWith("email_"))
      || (filter === "offers" && event.kind === "shortlist_shared")
      || (filter === "tasks" && ["task_due", "task_done", "follow_up"].includes(event.kind))
      || (filter === "activity" && event.kind === "activity"))
    .filter((event) => [event.person, event.title, event.detail].join(" ").toLowerCase().includes(query.trim().toLowerCase())), [events, now, layer, filter, query]);
  const overdue = tasks.filter((task) => ["pending", "in_progress"].includes(task.status || "")
    && task.due_at && Date.parse(task.due_at) < day.start.getTime());
  const anchor = layer === "past" ? new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
    : layer === "future" ? day.end : day.start;

  function changeLayer(next: CalendarLayer) {
    if (next === layer) return;
    generation.current++; setLayer(next); setRange(null); setSelected(null); setEvents([]); setError(null);
  }

  return <Panel className="mt-5">
    <div className="flex items-start justify-between gap-4"><div><p className="text-xs uppercase tracking-[0.16em] text-gray-500">Рабочая хроника</p><h2 className="mt-1 font-serif text-2xl text-gray-900">Было. Сейчас. Будет.</h2><p className="mt-2 text-sm text-gray-500">Факты и планы на одной линии времени. Дни переходят между слоями автоматически.</p></div><button onClick={() => { setNow(new Date()); setRefresh((value) => value + 1); }} disabled={loading} className="rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:opacity-50">Обновить</button></div>
    <div className="mt-5 grid grid-cols-3 gap-2" role="tablist" aria-label="Слой календаря">{layers.map((item) => <button key={item.id} role="tab" aria-selected={layer === item.id} onClick={() => changeLayer(item.id)} className={`rounded-xl border px-3 py-3 text-left ${layer === item.id ? "border-brand-300 bg-brand-50" : "border-gray-200 bg-white"}`}><strong className="block text-sm text-gray-900">{item.title}</strong><span className="mt-1 hidden text-xs text-gray-500 sm:block">{item.detail}</span></button>)}</div>
    <div className="my-4 flex flex-wrap items-center gap-2">{filters.map(([id, label]) => <button key={id} aria-pressed={filter === id} onClick={() => setFilter(id)} className={`rounded-lg px-3 py-2 text-xs ${filter === id ? "bg-brand-500 text-white" : "bg-gray-100 text-gray-600"}`}>{label}</button>)}<input aria-label="Поиск событий" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Кому, что, какое предложение…" className="ml-auto min-w-48 rounded-lg border border-gray-300 bg-transparent px-3 py-2 text-sm"/></div>
    {error && <ErrorBanner message={`События загружены не полностью: ${error}`}/>}
    <p className="mb-3 text-xs text-gray-500" aria-live="polite">{loading ? "Загружаю записи…" : `Записей по фильтру: ${visible.length} · загружено за период: ${events.length}`}{hasMore ? " · есть ещё записи: загрузите продолжение" : ""}{generatedAt ? ` · обновлено ${stamp(generatedAt)}` : ""}</p>
    {layer === "now" && overdue.length > 0 && <details className="mb-4 rounded-xl border border-warning-200 bg-warning-50 px-4 py-3"><summary className="cursor-pointer text-sm font-semibold text-warning-700">Не потерять: {overdue.length} задач с прошедшим сроком</summary><div className="mt-3 space-y-2">{overdue.map((task) => <button key={task.id} onClick={() => onEditTask(task)} className="block w-full text-left text-sm text-gray-700">{task.title} · {task.merchant_name || "Общая задача"} · {stamp(task.due_at!)}</button>)}</div><p className="mt-3 text-xs text-gray-500">Из рабочей очереди (до 500 задач). Смена дня не завершает задачу.</p></details>}
    <div className={`grid gap-5 ${selected ? "xl:grid-cols-[minmax(0,1fr)_320px]" : ""}`}>
      <div className="offerpsp-calendar min-w-0"><FullCalendar key={`${layer}:${day.key}`} plugins={[dayGridPlugin, listPlugin, interactionPlugin]} initialView={layer === "now" ? "listDay" : "dayGridMonth"} initialDate={anchor} locale="ru" height="auto" firstDay={1} dayMaxEvents={3}
        headerToolbar={layer === "now" ? { left: "", center: "title", right: "" } : { left: "prev,next", center: "title", right: "dayGridMonth,listMonth" }} buttonText={{ month: "Месяц", list: "Список" }} noEventsText={loading ? "Загружаю события…" : error ? "Не удалось подтвердить историю" : "Нет записей по выбранному фильтру"}
        datesSet={(info) => setRange({ start: info.start, end: info.end })} dateClick={(info) => onNewTask(info.dateStr)}
        eventClick={(info) => { const found = visible.find((item) => item.id === info.event.id); if (found) setSelected(found); }}
        events={visible.map((event) => ({ id: event.id, title: `${event.nature === "plan" ? "План: " : ""}${calendarEventLabel(event)} · ${event.person} · ${event.title}`, start: event.occurred_at, color: calendarEventColor(event), classNames: event.nature === "plan" ? ["calendar-planned"] : [] }))}/></div>
      {selected && <aside className="self-start rounded-xl border border-gray-200 bg-gray-50 p-4" aria-label="Контекст события"><div className="flex justify-between gap-3"><p className="text-xs font-semibold uppercase tracking-wide text-brand-600">{selected.nature === "fact" ? "Подтверждённое событие" : "План · ещё не результат"}</p><button aria-label="Свернуть контекст события" onClick={() => setSelected(null)}>×</button></div><h3 className="mt-3 font-serif text-xl text-gray-900">{calendarEventLabel(selected)}</h3><p className="mt-2 break-words text-sm font-semibold text-gray-900">{selected.person}</p><p className="mt-1 text-xs text-gray-500">{stamp(selected.occurred_at)} · {Intl.DateTimeFormat().resolvedOptions().timeZone}</p><p className="mt-4 break-words text-sm text-gray-700">{selected.title}</p><p className="mt-2 whitespace-pre-wrap break-words text-xs leading-5 text-gray-500">{selected.detail}</p>
        {selected.nature === "plan" && Date.parse(selected.occurred_at) < now.getTime() && <p className="mt-3 text-xs text-warning-700">Срок прошёл. Выполнение не подтверждено.</p>}
        {selected.evidence.sender && <p className="mt-3 break-words text-xs text-gray-500">От: {selected.evidence.sender}<br/>Кому: {(selected.evidence.recipients || []).join(", ")}</p>}
        {selected.evidence.options && <div className="mt-4"><p className="text-xs font-semibold text-gray-700">Варианты в подборке v{selected.evidence.version}</p><ul className="mt-2 space-y-2">{selected.evidence.options.map((option, index) => <li key={`${option.code}:${index}`} className="break-words text-xs text-gray-600">{option.code || "Без кода"} · {option.title || "Название не записано"}</li>)}</ul><p className="mt-2 break-all text-[10px] text-gray-400">Запись: {selected.evidence.shortlist_id}</p></div>}
        <div className="mt-5 flex flex-wrap gap-3">{selected.task_id && tasks.some((task) => String(task.id) === selected.task_id)
          ? <button className="text-sm font-semibold text-brand-600" onClick={() => { const task = tasks.find((item) => String(item.id) === selected.task_id); if (task) onEditTask(task); }}>Открыть задачу →</button>
          : <Link className="text-sm font-semibold text-brand-600" to={selected.href}>{selected.kind === "shortlist_shared" ? "Карточка предложений →" : "Открыть источник →"}</Link>}
          {selected.lead_id && <Link className="text-sm text-brand-600" to={`/merchants/${selected.lead_id}`}>Карточка клиента</Link>}</div>
      </aside>}
    </div>
    {!loading && !error && !window && <EmptyState title="В этом месяце нет дат выбранного слоя" description="Перейдите к предыдущему или следующему месяцу."/>}
    {hasMore && <button disabled={loading || offset > 10000} onClick={() => void loadMore()} className="mt-4 rounded-lg border border-gray-300 px-4 py-2 text-sm disabled:opacity-50">{offset > 10000 ? "Сузьте период: достигнут предел выборки" : "Загрузить ещё события"}</button>}
    <p className="mt-5 text-xs leading-5 text-gray-500">Даты — в вашем часовом поясе ({Intl.DateTimeFormat().resolvedOptions().timeZone}). Автообновление раз в минуту. Метка «План» — ещё не результат. Показаны записи рубки: почта, публикация подборок, задачи, follow-up и решения по заявкам. Незарегистрированные действия в Spark/Telegram не придумываются; почта появляется после синхронизации. Черновики и QA исключены.</p>
  </Panel>;
}
