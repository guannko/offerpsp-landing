import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import OperationsCalendar from "../components/control/OperationsCalendar";
import AibotQueue from "../components/control/AibotQueue";
import { aibotTaskGroup } from "../lib/aibotTaskPresentation";
import PageMeta from "../components/common/PageMeta";
import { EmptyState, ErrorBanner, Metric, PageHeading, Panel, SkeletonPage, StatusPill } from "../components/control/Ui";
import { useControlBridge } from "../context/ControlBridgeContext";
import { isQaFixtureLead, isQaFixtureTask } from "../lib/qaFixtures";
import { supabase } from "../lib/supabase";
import { taskEntityPatch } from "../lib/taskEntityPatch";
import type { OperationsWorkspaceSnapshot, WorkTask } from "../types/offerpsp";

const field = "h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 outline-none focus:border-brand-400 dark:border-gray-700 dark:text-white";
const area = "min-h-28 w-full rounded-lg border border-gray-300 bg-transparent px-3 py-3 text-sm text-gray-800 outline-none focus:border-brand-400 dark:border-gray-700 dark:text-white";
const emptyWorkspace: OperationsWorkspaceSnapshot = { tasks: [], aibot_tasks: [], staff: [] };
const toLocalInput = (value?: string | null) => value ? new Date(new Date(value).getTime() - new Date(value).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "";
const priorityLabel: Record<string, string> = { low: "Низкий", normal: "Обычный", high: "Высокий", urgent: "Срочный" };

type TaskDraft = {
  id?: string;
  title: string;
  details: string;
  status: string;
  priority: string;
  due_at: string;
  assigned_to: string;
  lead_id: string;
  entity_type?: string | null;
  entity_id?: string | null;
  source?: string | null;
  automation_ref?: string | null;
};

const blankTask = (): TaskDraft => ({ title: "", details: "", status: "pending", priority: "normal", due_at: "", assigned_to: "", lead_id: "" });
const taskDraft = (task: WorkTask): TaskDraft => ({
  id: String(task.id), title: task.title || "", details: task.details || "",
  status: task.status || "pending", priority: String(task.priority || "normal"),
  due_at: toLocalInput(task.due_at), assigned_to: task.assigned_to || "",
  lead_id: task.lead_id || "", source: task.source, automation_ref: task.automation_ref,
  entity_type: task.entity_type, entity_id: task.entity_id,
});

export default function OperationsWorkspace() {
  const bridgeData = useControlBridge();
  const bridge = { ...bridgeData, leads: bridgeData.leads.filter((lead) => !isQaFixtureLead(lead)) };
  const [workspace, setWorkspace] = useState<OperationsWorkspaceSnapshot>(emptyWorkspace);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [mode, setMode] = useState<"tasks" | "calendar" | "aibot">("tasks");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("open");
  const [priority, setPriority] = useState("all");
  const [draft, setDraft] = useState<TaskDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTaskId = searchParams.get("task");
  const operationalTasks = useMemo(() => workspace.tasks.filter((task) => !isQaFixtureTask(task)), [workspace.tasks]);
  const operationalAibotTasks = useMemo(() => workspace.aibot_tasks.filter((task) => !isQaFixtureTask(task)), [workspace.aibot_tasks]);
  const activeAibotCount = operationalAibotTasks.filter((task) => aibotTaskGroup(task) === "active").length;

  async function load() {
    setLoading(true); setError(null);
    const result = await supabase.rpc("get_offerpsp_operations_workspace");
    if (result.error) setError(result.error.message);
    else setWorkspace((result.data || emptyWorkspace) as OperationsWorkspaceSnapshot);
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  useEffect(() => {
    if (loading || !requestedTaskId) return;
    const task = operationalTasks.find((item) => String(item.id) === requestedTaskId);
    if (task) setDraft(taskDraft(task));
    else setError("Задача не найдена в рабочей выборке или недоступна.");
    const next = new URLSearchParams(searchParams);
    next.delete("task");
    setSearchParams(next, { replace: true });
  }, [loading, operationalTasks, requestedTaskId, searchParams, setSearchParams]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return operationalTasks.filter((task) => {
      const statusMatch = status === "all" || (status === "open" ? !["done", "cancelled", "failed"].includes(task.status || "") : task.status === status);
      const priorityMatch = priority === "all" || task.priority === priority;
      const searchMatch = !needle || [task.title, task.details, task.merchant_name, task.assignee_name].filter(Boolean).join(" ").toLowerCase().includes(needle);
      return statusMatch && priorityMatch && searchMatch;
    });
  }, [operationalTasks, query, status, priority]);

  const openCount = operationalTasks.filter((task) => !["done", "cancelled", "failed"].includes(task.status || "")).length;
  const overdueCount = operationalTasks.filter((task) => task.due_at && new Date(task.due_at) < new Date() && !["done", "cancelled"].includes(task.status || "")).length;
  const dueToday = operationalTasks.filter((task) => task.due_at && new Date(task.due_at).toDateString() === new Date().toDateString() && !["done", "cancelled"].includes(task.status || "")).length;

  function editTask(task?: WorkTask, date?: string) {
    setNotice(null);
    if (!task) { setDraft({ ...blankTask(), due_at: date ? `${date}T10:00` : "" }); return; }
    setDraft(taskDraft(task));
  }

  async function saveTask() {
    if (!draft?.title.trim()) { setError("Название задачи обязательно."); return; }
    setBusy(true); setError(null);
    const result = await supabase.rpc("save_offerpsp_task", {
      p_task_id: draft.id || null,
      p_payload: {
        title: draft.title.trim(), details: draft.details.trim() || null,
        status: draft.status, priority: draft.priority,
        due_at: draft.due_at ? new Date(draft.due_at).toISOString() : null,
        assigned_to: draft.assigned_to || null, lead_id: draft.lead_id || null,
        ...taskEntityPatch(draft, draft.lead_id || null),
      },
    });
    if (result.error) setError(result.error.message);
    else { setDraft(null); setNotice(draft.id ? "Задача обновлена." : "Задача создана."); await load(); }
    setBusy(false);
  }

  async function removeTask() {
    if (!draft?.id || !window.confirm("Удалить эту ручную задачу? Действие будет записано в аудит.")) return;
    setBusy(true); setError(null);
    const result = await supabase.rpc("delete_offerpsp_task", { p_task_id: draft.id });
    if (result.error) setError(result.error.message);
    else { setDraft(null); setNotice("Задача удалена."); await load(); }
    setBusy(false);
  }

  if (bridge.loading || loading) return <SkeletonPage/>;
  return <>
    <PageMeta title="Задачи и календарь | OfferPSP" description="Рабочие задачи и история событий OfferPSP: было, сейчас и будет."/>
    <PageHeading eyebrow="Operations manager" title="Задачи и календарь" description="Ручные задачи управляются здесь. Миссии AIBot показаны отдельно и не редактируются, чтобы не сломать автоматизацию."/>
    {(bridge.error || error) && <ErrorBanner message={bridge.error || error || "Ошибка"}/>}
    {notice && <div className="mb-5 rounded-xl border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-700">{notice}</div>}
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4"><Metric label="Открыто" value={openCount} hint="рабочие задачи"/><Metric label="На сегодня" value={dueToday} hint="срок сегодня"/><Metric label="Просрочено" value={overdueCount} hint="требуют внимания" tone={overdueCount ? "success" : undefined}/><Metric label="Миссии AIBot" value={activeAibotCount} hint={`${operationalAibotTasks.length} всего · история отдельно`}/></div>
    <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="inline-flex w-fit rounded-xl bg-gray-100 p-1 dark:bg-white/5">{[
        ["tasks", "Задачи"], ["calendar", "Календарь"], ["aibot", "Миссии AIBot"],
      ].map(([id, label]) => <button key={id} onClick={()=>setMode(id as typeof mode)} className={`rounded-lg px-4 py-2 text-sm font-semibold ${mode===id?"bg-white text-gray-900 shadow-sm dark:bg-gray-800 dark:text-white":"text-gray-500"}`}>{label}</button>)}</div>
      <button onClick={()=>editTask()} className="rounded-lg bg-brand-500 px-5 py-3 text-sm font-semibold text-white">+ Новая задача</button>
    </div>

    {mode === "tasks" && <Panel className="mt-5"><div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_190px_180px]"><input className={field} value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="Поиск по задаче, мерчу или ответственному…"/><select className={field} value={status} onChange={(event)=>setStatus(event.target.value)}><option value="open">Открытые</option><option value="all">Все статусы</option><option value="pending">Ожидают</option><option value="in_progress">В работе</option><option value="done">Готово</option><option value="cancelled">Отменено</option><option value="failed">Ошибка</option></select><select className={field} value={priority} onChange={(event)=>setPriority(event.target.value)}><option value="all">Все приоритеты</option><option value="urgent">Срочные</option><option value="high">Высокие</option><option value="normal">Обычные</option><option value="low">Низкие</option></select></div><div className="mt-5 divide-y divide-gray-100 dark:divide-gray-800">{filtered.map((task)=><button key={task.id} onClick={()=>editTask(task)} className="grid w-full gap-3 py-4 text-left hover:bg-gray-50/70 md:grid-cols-[minmax(0,1fr)_150px_130px_150px] dark:hover:bg-white/[0.02]"><div><strong className="text-sm text-gray-900 dark:text-white">{task.title}</strong><span className="mt-1 block text-xs text-gray-400">{task.merchant_name || "Общая задача"}{task.details ? ` · ${task.details}` : ""}</span></div><span className="text-sm text-gray-600 dark:text-gray-300">{task.assignee_name || "Не назначен"}</span><span className="text-xs font-semibold text-gray-500">{priorityLabel[String(task.priority)] || task.priority}</span><div className="flex items-center justify-between gap-2 md:justify-end"><StatusPill status={task.status}/><span className="text-xs text-gray-400">{task.due_at ? new Intl.DateTimeFormat("ru-RU", { day:"2-digit", month:"short", hour:"2-digit", minute:"2-digit" }).format(new Date(task.due_at)) : "Без срока"}</span></div></button>)}{!filtered.length&&<EmptyState title="Задач не найдено" description="Измените фильтры или создайте новую задачу."/>}</div></Panel>}

    {mode === "calendar" && <OperationsCalendar tasks={operationalTasks} onEditTask={(task)=>editTask(task)} onNewTask={(date)=>editTask(undefined,date)}/>}

    {mode === "aibot" && <AibotQueue tasks={operationalAibotTasks}/>}

    {draft && <div className="fixed inset-0 z-[100000] flex items-center justify-center bg-gray-950/60 p-4" onMouseDown={(event)=>{if(event.target===event.currentTarget&&!busy)setDraft(null);}}><div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl dark:bg-gray-900"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-500">{draft.id?"Редактирование":"Новая задача"}</p><h2 className="mt-1 text-xl font-semibold text-gray-900 dark:text-white">Рабочая задача OfferPSP</h2></div><button disabled={busy} onClick={()=>setDraft(null)} className="text-2xl text-gray-400">×</button></div><div className="mt-6 space-y-4"><input className={field} value={draft.title} onChange={(event)=>setDraft({...draft,title:event.target.value})} placeholder="Что нужно сделать?"/><textarea className={area} value={draft.details} onChange={(event)=>setDraft({...draft,details:event.target.value})} placeholder="Описание и ожидаемый результат"/><div className="grid gap-4 md:grid-cols-2"><select className={field} value={draft.status} onChange={(event)=>setDraft({...draft,status:event.target.value})}><option value="pending">Ожидает</option><option value="in_progress">В работе</option><option value="done">Готово</option><option value="cancelled">Отменено</option><option value="failed">Ошибка</option></select><select className={field} value={draft.priority} onChange={(event)=>setDraft({...draft,priority:event.target.value})}><option value="low">Низкий приоритет</option><option value="normal">Обычный приоритет</option><option value="high">Высокий приоритет</option><option value="urgent">Срочно</option></select><input className={field} type="datetime-local" value={draft.due_at} onChange={(event)=>setDraft({...draft,due_at:event.target.value})}/><select className={field} value={draft.assigned_to} onChange={(event)=>setDraft({...draft,assigned_to:event.target.value})}><option value="">Не назначено</option>{workspace.staff.map((member)=><option key={member.user_id} value={member.user_id}>{member.display_name}</option>)}</select></div><select className={field} value={draft.lead_id} onChange={(event)=>setDraft({...draft,lead_id:event.target.value})}><option value="">Общая задача без мерча</option>{bridge.leads.filter((lead)=>lead.record_state!=="archived").map((lead)=><option key={lead.lead_id} value={lead.lead_id}>{lead.company || lead.name || lead.work_email}</option>)}</select>{draft.id && draft.source !== "staff" && <p className="rounded-xl bg-warning-50 px-4 py-3 text-sm text-warning-700">Автоматическую задачу можно изменить или отменить, но удалить нельзя.</p>}<div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">{draft.id && draft.source === "staff" && !draft.automation_ref ? <button disabled={busy} onClick={()=>void removeTask()} className="rounded-lg border border-error-200 px-4 py-3 text-sm font-semibold text-error-600">Удалить</button>:<span/>}<div className="flex gap-3"><button disabled={busy} onClick={()=>setDraft(null)} className="rounded-lg border border-gray-300 px-4 py-3 text-sm font-semibold dark:border-gray-700">Отмена</button><button disabled={busy} onClick={()=>void saveTask()} className="rounded-lg bg-brand-500 px-5 py-3 text-sm font-semibold text-white disabled:opacity-40">{busy?"Сохраняю…":"Сохранить"}</button></div></div></div></div></div>}
  </>;
}
