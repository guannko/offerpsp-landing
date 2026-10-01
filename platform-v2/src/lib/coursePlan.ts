import type { EmailThread, Lead, WorkTask } from "../types/offerpsp";

export type CourseDirection = {
  id: string;
  title: string;
  outcome: string;
  paused: boolean;
  lead_ids: string[];
  task_ids: string[];
};
export type CoursePlan = { course: string; directions: CourseDirection[] };
export type CourseSnapshot = { revision: number; plan: CoursePlan; updated_at: string | null };

// Initial suggestions are a draft, not existing work or an instruction to a worker.
export const initialCoursePlan = (): CoursePlan => ({
  course: "Сначала RU / СНГ для знакомых PSP. USA — точечно, под профиль клиента.",
  directions: [
    { id: "cis", title: "RU / СНГ", outcome: "Подтверждённые каналы и согласованные условия для PSP-партнёров.", paused: false, lead_ids: [], task_ids: [] },
    { id: "usa", title: "USA", outcome: "Первый клиентский кейс MerchantPayd с индивидуальным расчётом.", paused: false, lead_ids: [], task_ids: [] },
    { id: "intake", title: "Заявки", outcome: "Полное досье, проверка и понятный следующий шаг по новым клиентам.", paused: false, lead_ids: [], task_ids: [] },
  ],
});

export function validateCoursePlan(plan: CoursePlan): string | null {
  if (!plan.course.trim() || plan.course.length > 2000) return "Укажи курс — до 2000 символов.";
  if (plan.directions.length > 12) return "Не больше 12 направлений: остальное лучше вести в задачах.";
  const ids = new Set<string>();
  for (const direction of plan.directions) {
    if (!direction.id || ids.has(direction.id)) return "Направления должны иметь разные идентификаторы.";
    ids.add(direction.id);
    if (!direction.title.trim() || direction.title.length > 120) return "Название направления — от 1 до 120 символов.";
    if (!direction.outcome.trim() || direction.outcome.length > 2000) return "Укажи ожидаемый результат — до 2000 символов.";
    if (direction.lead_ids.length > 60 || direction.task_ids.length > 60) return "Слишком много связей у одного направления.";
  }
  return null;
}

export function moveDirection(plan: CoursePlan, id: string, position: number): CoursePlan {
  const current = plan.directions.find((item) => item.id === id);
  if (!current) return plan;
  const directions = plan.directions.filter((item) => item.id !== id);
  directions.splice(Math.max(0, Math.min(position, directions.length)), 0, current);
  return { ...plan, directions };
}

export function directionWork(direction: CourseDirection, leads: Lead[], tasks: WorkTask[], threads: EmailThread[]) {
  const linkedLeads = leads.filter((lead) => direction.lead_ids.includes(lead.lead_id));
  const linkedTasks = tasks.filter((task) => direction.task_ids.includes(String(task.id))
    || Boolean(task.lead_id && linkedLeads.some((lead) => lead.lead_id === task.lead_id)));
  const linkedThreads = threads.filter((thread) => thread.lead_id && linkedLeads.some((lead) => lead.lead_id === thread.lead_id));
  const openTasks = linkedTasks.filter((task) => !["done", "cancelled"].includes(task.status || ""));
  const results = linkedTasks.filter((task) => task.status === "done").sort((a, b) => timestamp(b.completed_at) - timestamp(a.completed_at));
  const launched = linkedLeads.filter((lead) => lead.status === "won");
  // Order influences the captain's plan, never n8n execution or the canonical task priority.
  return { leads: linkedLeads, tasks: linkedTasks, threads: linkedThreads, openTasks, results, launched };
}

export function leadStage(lead: Lead): number | null {
  const status = lead.status || "";
  if (["new", "qualifying", "needs_clarification"].includes(status)) return 0;
  if (["matching", "matched", "shortlist_ready"].includes(status)) return 1;
  if (["shared", "option_selected", "dossier_ready"].includes(status)) return 2;
  if (["provider_reviewing", "provider_needs_info", "provider_accepted", "provider_declined", "negotiating", "telegram_created", "zoom_scheduled"].includes(status)) return 3;
  if (status === "won") return 4;
  return null;
}

const timestamp = (value?: string | null) => value && Number.isFinite(Date.parse(value)) ? Date.parse(value) : 0;
export function orderPlanTasks(plan: CoursePlan, leads: Lead[], tasks: WorkTask[], threads: EmailThread[]) {
  const result: WorkTask[] = [];
  const seen = new Set<string>();
  for (const direction of plan.directions.filter((item) => !item.paused)) {
    for (const task of directionWork(direction, leads, tasks, threads).openTasks) {
      if (seen.has(String(task.id))) continue;
      result.push(task);
      seen.add(String(task.id));
    }
  }
  return result;
}
