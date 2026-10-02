import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { aibotTaskGroup, aibotTaskPresentation, safeAibotPayload } from "../src/lib/aibotTaskPresentation.ts";
import { mailFollowUpPresentation } from "../src/lib/mailFollowUpPresentation.ts";

const task = (status, overrides = {}) => ({ id: "fixture", status, ...overrides });
for (const status of ["done", "completed", "closed", "skipped", "cancelled", "canceled", "archived"]) assert.equal(aibotTaskGroup(task(status)), "history");
for (const status of ["pending", "queued", "processing", "failed", "error", "brand_new_state", null]) assert.equal(aibotTaskGroup(task(status)), "active", "unknown/error states must not disappear");
assert.equal(aibotTaskGroup(task("skipped", {task_type:"reminder", payload:{message:"Тест: проверить сводку секретаря"}})), "test");
assert.equal(aibotTaskGroup(task("pending", {task_type:"reminder", payload:{message:"Проверить тест клиента"}})), "active");
assert.equal(aibotTaskGroup(task("pending", {metadata:{test_fixture:true}})), "test");
const research = task("skipped", {task_type:"psp_contact_research", payload:{batch:6, companies:[{name:"WayForPay"},{name:"Payvision"},{name:"Nuvei"},null]}});
assert.equal(aibotTaskPresentation(research).title, "Поиск контактов PSP · пакет №6");
assert.equal(aibotTaskPresentation(research).description, "WayForPay, Payvision, Nuvei");
assert.equal(aibotTaskPresentation(research).label, "Пропущено");
assert.equal(aibotTaskPresentation(task("new_state")).label, "Неизвестный статус — нужна проверка");
assert.equal(aibotTaskPresentation(task("done", {completed_at:"2026-10-01T08:00:00Z",scheduled_for:"2026-09-01"})).date, "2026-10-01T08:00:00Z");
assert.equal(aibotTaskPresentation(task("pending", {scheduled_for:"nonsense"})).date, null);
assert.match(aibotTaskPresentation(task("pending", {task_type:"reminder",payload:[]})).description, /не записано/);
const source = {chat_id:"private", nested:{secret:"dont-show",api_key:"dont-show",authorization:"dont-show"},message:"Public synthetic description"};
const frozen = structuredClone(source);
const safe = safeAibotPayload(source);
assert.doesNotMatch(safe, /private|dont-show/);
assert.deepEqual(source, frozen, "presentation must not mutate canonical payload");
const cycle = {};cycle.self = cycle;
assert.match(safeAibotPayload(cycle), /circular/);
assert.ok(safeAibotPayload({note:"x".repeat(500000)}).length < 20050);
const now = Date.parse("2026-10-02T09:00:00Z");
assert.equal(mailFollowUpPresentation({status:"open",follow_up_at:"2026-10-02T08:00:00Z"},now), null);
assert.match(mailFollowUpPresentation({status:"follow_up",follow_up_at:"2026-10-03T09:00:00Z"},now).hint, /ещё не наступил/);
assert.equal(mailFollowUpPresentation({status:"follow_up",follow_up_at:new Date(now).toISOString()},now).label, "Нужен follow-up");
assert.match(mailFollowUpPresentation({status:"follow_up",follow_up_at:"garbage"},now).hint, /некорректна/);
assert.match(mailFollowUpPresentation({status:"follow_up"},now).hint, /не задана/);
const ops = await readFile(new URL('../src/pages/OperationsWorkspace.tsx', import.meta.url),'utf8');
const queue = await readFile(new URL('../src/components/control/AibotQueue.tsx', import.meta.url),'utf8');
assert.match(ops, /<AibotQueue tasks=\{operationalAibotTasks\}/);
assert.doesNotMatch(ops, /JSON\.stringify\(task\.payload\)/);
assert.match(queue, /items-start/);
assert.match(queue, /h-fit w-fit self-start/);
assert.doesNotMatch(queue, /supabase|fetch\(|\.rpc\(/);
assert.match(queue, /aria-pressed/);
assert.doesNotMatch(queue, /role="tab"/);
const paper = await readFile(new URL('../src/layout/BridgePaper.css', import.meta.url), 'utf8');
const muted = paper.match(/--bridge-muted:\s*(#[0-9a-f]{6})/i)[1];
function luminance(hex) {
  const channels = hex.replace('#', '').match(/../g).map((c) => parseInt(c, 16) / 255).map((v) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}
for (const token of ['paper', 'surface', 'warm', 'active']) {
  const background = paper.match(new RegExp(`--bridge-${token}:\\s*(#[0-9a-f]{6})`, 'i'))[1];
  const contrast = (luminance(background) + 0.05) / (luminance(muted) + 0.05);
  assert.ok(contrast >= 4.5, `muted text contrast ${contrast} on ${token}`);
}
assert.match(paper, /--color-gray-400: var\(--bridge-muted\)/);
console.log("PASS operations presentation: honest states, separate fixtures/history, compact pills, safe details and date-aware follow-up");
