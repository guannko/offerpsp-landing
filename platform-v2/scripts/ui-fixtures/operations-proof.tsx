// Actual component, synthetic records only. No network, mutations or outbound sends.
import { createRoot } from "react-dom/client";
import AibotQueue from "../../src/components/control/AibotQueue";
import { mailFollowUpPresentation } from "../../src/lib/mailFollowUpPresentation";
import type { WorkTask } from "../../src/types/offerpsp";
import "../../src/index.css";
import "../../src/layout/BridgePaper.css";

const tasks: WorkTask[] = [
  ...Array.from({ length: 10 }, (_, index) => ({ id: `batch-${index}`, task_type: "psp_contact_research", status: "skipped", scheduled_for: "2026-05-21T15:14:28Z", payload: { batch: index + 1, companies: [{ name: "Synthetic PSP One" }, { name: "Synthetic PSP Two" }] } })),
  { id: "test-reminder", task_type: "reminder", status: "skipped", payload: { message: "Тест: проверить сводку секретаря", chat_id: "REDACT_ME" } },
  { id: "done-a", task_type: "reminder", status: "done", completed_at: "2026-07-02T09:00:00Z", payload: { message: "Позвонить в Synthetic Casino" } },
  { id: "done-b", task_type: "reminder", status: "done", completed_at: "2026-07-02T10:00:00Z", payload: { message: "Проверить оплату Synthetic Partner" } },
];
const followUp = mailFollowUpPresentation({ status: "follow_up", follow_up_at: new Date(Date.now() + 86400000).toISOString() }, Date.now());
createRoot(document.getElementById("root")!).render(<main className="bridge-paper min-h-screen p-5"><div className="mx-auto max-w-6xl"><h1 className="text-xl text-gray-900">Задачи и календарь — визуальная проверка</h1><p className="mt-2 text-sm text-gray-400">Только синтетические записи. Реальные задания и переписка не изменяются.</p><section className="mt-4 rounded-lg bg-gray-100 p-4"><h2 className="text-sm text-gray-700">{followUp?.label}</h2><p className="text-xs text-gray-500">{followUp?.hint}</p></section><AibotQueue tasks={tasks}/></div></main>);
