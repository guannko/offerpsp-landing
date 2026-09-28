import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import PageMeta from "../components/common/PageMeta";
import { EmptyState, ErrorBanner, PageHeading, Panel, SkeletonPage } from "../components/control/Ui";
import { useControlBridge } from "../context/ControlBridgeContext";
import { isQaFixtureLead, isQaFixtureLeadId } from "../lib/qaFixtures";
import { supabase } from "../lib/supabase";
import { useStoredState } from "../lib/uiPreferences";
import type { EmailThread, WorkTask } from "../types/offerpsp";

type QueueScope = "now" | "waiting" | "later" | "done";
type QueueItem = {
  id: string;
  scope: QueueScope;
  kind: "mail" | "task" | "lead" | "compliance" | "offer" | "integration";
  title: string;
  detail: string;
  path: string;
  timestamp?: string | null;
  priority: number;
};

const activeTask = (task: WorkTask) => !["done", "completed", "closed", "cancelled", "canceled"].includes(String(task.status || "").toLowerCase());
const doneTask = (task: WorkTask) => ["done", "completed", "closed"].includes(String(task.status || "").toLowerCase());
const botTaskNeedsIntervention = (task: WorkTask) => ["failed", "blocked"].includes(String(task.status || "").toLowerCase());
const dueTime = (task: WorkTask) => task.due_at || task.scheduled_for || task.updated_at || task.created_at || null;
const readableDate = (value?: string | null) => value ? new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value)) : "без срока";
const kindMeta: Record<QueueItem["kind"], { icon: string; label: string; className: string }> = {
  mail: { icon: "✉", label: "Почта", className: "bg-blue-light-50 text-blue-light-700 dark:bg-blue-light-500/15 dark:text-blue-light-300" },
  task: { icon: "✓", label: "Задача", className: "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300" },
  lead: { icon: "●", label: "Заявка", className: "bg-warning-50 text-warning-700 dark:bg-warning-500/15 dark:text-warning-300" },
  compliance: { icon: "◆", label: "Проверка", className: "bg-orange-50 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300" },
  offer: { icon: "▣", label: "Оффер", className: "bg-theme-purple-50 text-theme-purple-700 dark:bg-theme-purple-500/15 dark:text-theme-purple-300" },
  integration: { icon: "!", label: "Интеграция", className: "bg-error-50 text-error-700 dark:bg-error-500/15 dark:text-error-300" },
};

type ConnectorHealth = { configured: boolean; reachable: boolean; authenticated: boolean; detail?: string | null };
type IntegrationIssue = { key: string; title: string; detail: string; checkedAt: string };

function mailItem(thread: EmailThread, scope: QueueScope, priority: number, detail: string): QueueItem {
  return {
    id: `mail:${thread.id}`,
    scope,
    kind: "mail",
    title: thread.subject || "Переписка без темы",
    detail: `${thread.participant_email || "контрагент не определён"} · ${detail}`,
    path: `/communications?thread=${encodeURIComponent(thread.id)}`,
    timestamp: thread.follow_up_at || thread.last_message_at,
    priority,
  };
}

export default function TodayWorkspace() {
  const bridge = useControlBridge();
  const [scope, setScope] = useStoredState<QueueScope>("offerpsp.today.scope", "now");
  const [query, setQuery] = useState("");
  const [integrationIssues, setIntegrationIssues] = useState<IntegrationIssue[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8_000);
    const labels: Record<string, string> = { supabase: "Supabase", n8n: "n8n / AIBot", email: "Email gateway", telegram: "Telegram" };
    void (async () => {
      try {
        const session = await supabase.auth.getSession();
        const response = await fetch("/api/integration-health", {
          headers: { Authorization: `Bearer ${session.data.session?.access_token || ""}` },
          signal: controller.signal,
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.success || !result.checks) throw new Error(result.error || "health-check не ответил");
        const checkedAt = String(result.checked_at || new Date().toISOString());
        const issues = Object.entries(result.checks as Record<string, ConnectorHealth>)
          .filter(([, connector]) => connector.configured && (!connector.reachable || !connector.authenticated))
          .map(([key, connector]) => ({
            key,
            title: `${labels[key] || key}: требуется проверка`,
            detail: connector.detail || (!connector.reachable ? "Нет подтверждённого соединения" : "Авторизация не подтверждена"),
            checkedAt,
          }));
        setIntegrationIssues(issues);
      } catch (error) {
        if (controller.signal.aborted) return;
        setIntegrationIssues([{ key: "health-check", title: "Не удалось проверить интеграции", detail: error instanceof Error ? error.message : "Откройте раздел интеграций", checkedAt: new Date().toISOString() }]);
      } finally {
        window.clearTimeout(timeout);
      }
    })();
    return () => { window.clearTimeout(timeout); controller.abort(); };
  }, []);
  const now = Date.now();
  const todayStartedAt = new Date().setHours(0, 0, 0, 0);
  const items = useMemo(() => {
    const queue: QueueItem[] = [];
    const visibleThreads = bridge.mailCenter.threads.filter((thread) => thread.status !== "trashed" && !isQaFixtureLeadId(thread.lead_id));
    visibleThreads.forEach((thread) => {
      const followUp = thread.follow_up_at ? new Date(thread.follow_up_at).getTime() : null;
      if (thread.status === "closed" && new Date(thread.updated_at || thread.last_message_at).getTime() >= todayStartedAt) queue.push(mailItem(thread, "done", 0, "закрыта сегодня"));
      else if (thread.status === "awaiting_reply") queue.push(mailItem(thread, "waiting", thread.priority === "urgent" ? 5 : 2, "ждём ответ партнёра"));
      else if (followUp && followUp > now) queue.push(mailItem(thread, "later", 1, `follow-up ${readableDate(thread.follow_up_at)}`));
      else if (thread.unread_count > 0) queue.push(mailItem(thread, "now", 6, `${thread.unread_count} непрочитанных`));
      else if (thread.status === "follow_up" || (followUp && followUp <= now)) queue.push(mailItem(thread, "now", 5, "нужен follow-up"));
      else if (thread.is_flagged) queue.push(mailItem(thread, "now", 4, "установлен флаг"));
    });

    const tasks = [
      ...bridge.captainsBridge.offerpsp_tasks.map((task) => ({ task, source: "operator" as const })),
      ...bridge.captainsBridge.bot_tasks.filter(botTaskNeedsIntervention).map((task) => ({ task, source: "aibot" as const })),
    ];
    tasks.forEach(({ task, source }) => {
      const timestamp = dueTime(task);
      const future = timestamp && new Date(timestamp).getTime() > now;
      const waiting = source === "operator" && ["waiting", "blocked", "pending_external"].includes(String(task.status || "").toLowerCase());
      if (doneTask(task) && new Date(task.completed_at || task.updated_at || task.created_at || 0).getTime() < todayStartedAt) return;
      const taskScope: QueueScope = doneTask(task) ? "done" : source === "aibot" ? "now" : waiting ? "waiting" : future ? "later" : "now";
      if (!activeTask(task) && taskScope !== "done") return;
      queue.push({
        id: `task:${source}:${task.id}`,
        scope: taskScope,
        kind: "task",
        title: task.title || task.task_type || "Рабочая задача",
        detail: [source === "aibot" ? "AIBot требует вмешательства" : null, task.merchant_name, task.assignee_name, task.details].filter(Boolean).join(" · ") || "Открыть карточку задачи",
        path: task.lead_id ? `/merchants/${task.lead_id}` : "/operations",
        timestamp,
        priority: source === "aibot" ? 7 : typeof task.priority === "number" ? task.priority : /urgent|high/i.test(String(task.priority || "")) ? 5 : 2,
      });
    });

    const visibleLeads = bridge.leads.filter((lead) => !isQaFixtureLead(lead) && lead.record_state !== "archived");
    visibleLeads.filter((lead) => !lead.assigned_to && !["won", "lost", "closed", "spam"].includes(lead.status || "")).forEach((lead) => queue.push({
      id: `lead:${lead.lead_id}`,
      scope: "now",
      kind: "lead",
      title: lead.company || lead.name || "Заявка без названия",
      detail: "Нет ответственного · назначить владельца",
      path: `/merchants/${lead.lead_id}`,
      timestamp: lead.updated_at || lead.submitted_at,
      priority: 4,
    }));

    bridge.complianceCases.filter((item) => !isQaFixtureLeadId(item.lead_id) && ["pending", "screening", "manual_review", "needs_info", "hold"].includes(item.case_status)).forEach((item) => {
      const lead = visibleLeads.find((entry) => entry.lead_id === item.lead_id);
      queue.push({ id: `compliance:${item.lead_id}`, scope: "now", kind: "compliance", title: lead?.company || "Проверка лида", detail: `Статус: ${item.case_status}`, path: `/merchants/${item.lead_id}?tab=compliance`, priority: 5 });
    });

    bridge.ingestionJobs.filter((job) => ["review", "failed", "duplicate"].includes(job.status) || Number(job.blocking_anomaly_count || 0) > 0).forEach((job) => queue.push({
      id: `offer:${job.id}`,
      scope: "now",
      kind: "offer",
      title: job.provider_name || "Источник оффера",
      detail: job.error_message || `${job.route_count || 0} маршрутов · требуется решение`,
      path: "/offers?workspace=intake",
      timestamp: job.received_at,
      priority: job.status === "failed" ? 6 : 3,
    }));

    integrationIssues.forEach((issue) => queue.push({
      id: `integration:${issue.key}`,
      scope: "now",
      kind: "integration",
      title: issue.title,
      detail: issue.detail,
      path: "/integrations",
      timestamp: issue.checkedAt,
      priority: 7,
    }));

    return queue.sort((left, right) => right.priority - left.priority || new Date(left.timestamp || 0).getTime() - new Date(right.timestamp || 0).getTime());
  }, [bridge.captainsBridge.bot_tasks, bridge.captainsBridge.offerpsp_tasks, bridge.complianceCases, bridge.ingestionJobs, bridge.leads, bridge.mailCenter.threads, integrationIssues, now, todayStartedAt]);

  if (bridge.loading) return <SkeletonPage />;
  const counts = { now: items.filter((item) => item.scope === "now").length, waiting: items.filter((item) => item.scope === "waiting").length, later: items.filter((item) => item.scope === "later").length, done: items.filter((item) => item.scope === "done").length };
  const needle = query.trim().toLowerCase();
  const visible = items.filter((item) => item.scope === scope && (!needle || `${item.title} ${item.detail}`.toLowerCase().includes(needle))).slice(0, scope === "done" ? 20 : 100);
  const views: Array<{ id: QueueScope; label: string; hint: string }> = [
    { id: "now", label: "Сейчас", hint: "требует действия" },
    { id: "waiting", label: "Ждём", hint: "ответ или внешнее событие" },
    { id: "later", label: "Позже", hint: "есть будущий срок" },
    { id: "done", label: "Готово", hint: "последние закрытые" },
  ];

  return <>
    <PageMeta title="Сегодня | OfferPSP" description="Единая рабочая очередь OfferPSP."/>
    {bridge.error && <ErrorBanner message={bridge.error}/>} 
    <PageHeading eyebrow="Daily workspace" title="Сегодня" description="Только реальные письма, задачи и блокировки. Всё, что не требует действия сейчас, вынесено из фокуса." action={<div className="flex flex-wrap gap-2"><Link to="/psps/new" className="rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:border-brand-300 hover:text-brand-600 dark:border-gray-700 dark:text-gray-300">+ Добавить PSP</Link><button onClick={() => void bridge.refresh()} disabled={bridge.refreshing} className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{bridge.refreshing ? "Обновляю…" : "Обновить"}</button></div>}/>
    <Panel className="!p-0">
      <div className="overflow-x-auto border-b border-gray-100 px-4 pt-3 dark:border-gray-800"><div className="flex min-w-max gap-1">{views.map((view) => <button key={view.id} onClick={() => setScope(view.id)} title={view.hint} className={`border-b-2 px-4 py-3 text-sm transition ${scope === view.id ? "border-brand-500 text-brand-600 dark:text-brand-300" : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white"}`}>{view.label}<strong className={`ml-2 rounded-full px-2 py-0.5 text-xs ${scope === view.id ? "bg-brand-50 dark:bg-brand-500/15" : "bg-gray-100 dark:bg-white/5"}`}>{counts[view.id]}</strong></button>)}</div></div>
      <div className="flex flex-col gap-3 border-b border-gray-100 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-gray-800"><div><strong className="text-sm text-gray-800 dark:text-white">{views.find((view) => view.id === scope)?.label}</strong><span className="ml-2 text-xs text-gray-400">{views.find((view) => view.id === scope)?.hint}</span></div><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Найти в текущей очереди…" className="h-10 w-full rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-brand-400 dark:border-gray-700 dark:bg-gray-900 dark:text-white sm:max-w-sm"/></div>
      <div className="divide-y divide-gray-100 dark:divide-gray-800">{visible.map((item) => { const meta = kindMeta[item.kind]; return <Link key={item.id} to={item.path} className="group flex items-start gap-4 px-4 py-4 transition hover:bg-gray-50/80 dark:hover:bg-white/[0.03]"><span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-bold ${meta.className}`}>{meta.icon}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><strong className="truncate text-sm text-gray-900 dark:text-white">{item.title}</strong><span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{meta.label}</span></div><p className="mt-1 line-clamp-2 text-sm text-gray-500 dark:text-gray-400">{item.detail}</p></div><div className="shrink-0 text-right"><span className="block text-xs text-gray-400">{readableDate(item.timestamp)}</span><span className="mt-1 block text-sm font-semibold text-brand-500 opacity-0 transition group-hover:opacity-100">Открыть →</span></div></Link>; })}{!visible.length && <div className="p-6"><EmptyState title="Очередь пуста" description={query ? "По текущему фильтру ничего не найдено." : "В этом представлении сейчас нет рабочих объектов."}/></div>}</div>
    </Panel>
  </>;
}
