// Actual UI with a synthetic, no-network reader. Not included in production entry.
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import OperationsCalendar from "../../src/components/control/OperationsCalendar";
import type { CalendarEvent } from "../../src/lib/calendarEvents";
import "../../src/index.css";
import "../../src/layout/BridgePaper.css";

const now = new Date();
const at = (day: number, hour = 9) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + day, hour).toISOString();
const base = { person: "Synthetic partner", title: "Синтетический сценарий — не production", href: "/", detail: "Только визуальная проверка. Ничего не отправляется.", task_id: null, lead_id: null, status: null, evidence: {} };
const fixtures: CalendarEvent[] = [
  { ...base, id: "past-mail", nature: "fact", kind: "email_sent", occurred_at: at(-1) },
  { ...base, id: "reply", nature: "fact", kind: "email_received", occurred_at: new Date(now.getTime()-5000).toISOString(), evidence: { reply_confirmed: true } },
  { ...base, id: "offer", nature: "fact", kind: "shortlist_shared", occurred_at: new Date(now.getTime()-10000).toISOString(), evidence: { version: 2, options: [{ code: "OP-LOCAL", title: "USA CashApp — synthetic" }] } },
  { ...base, id: "today-plan", nature: "plan", kind: "task_due", occurred_at: at(0, 23) },
  { ...base, id: "future-plan", nature: "plan", kind: "follow_up", occurred_at: at(1) },
];
const readPage = async ({ p_start, p_end }: { p_start: string; p_end: string }) => ({ events: fixtures.filter((e) => Date.parse(e.occurred_at) >= Date.parse(p_start) && Date.parse(e.occurred_at) < Date.parse(p_end)), has_more: false, next_offset: 200, generated_at: new Date().toISOString() });
createRoot(document.getElementById("root")!).render(<BrowserRouter><main className="bridge-paper mx-auto max-w-6xl p-6"><p className="text-sm text-gray-500">Синтетическая проверка трёх слоёв · без сетевых запросов и записей</p><OperationsCalendar tasks={[]} onEditTask={() => {}} onNewTask={() => {}} readPage={readPage}/></main></BrowserRouter>);
