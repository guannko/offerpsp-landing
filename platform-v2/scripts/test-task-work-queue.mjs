import assert from "node:assert/strict";
import { taskWorkScope } from "../src/lib/taskWorkQueue.ts";
import { taskEntityPatch } from "../src/lib/taskEntityPatch.ts";
const now = Date.parse("2026-09-30T12:00:00Z");
const today = Date.parse("2026-09-30T00:00:00Z");
const scope = (task, source = "operator") => taskWorkScope(task, source, now, today);
assert.equal(scope({ status: "pending", due_at: "2026-10-01" }), "now", "a future deadline does not defer manual review");
assert.equal(scope({ status: "pending", scheduled_for: "2026-10-01" }), "later");
assert.equal(scope({ status: "waiting" }), "waiting");
assert.equal(scope({ status: "done", completed_at: "2026-09-30T10:00:00Z" }), "done");
assert.equal(scope({ status: "done", completed_at: "2026-09-29" }), null);
assert.equal(scope({ status: "cancelled" }), null);
assert.equal(scope({ status: "failed", scheduled_for: "2026-10-01" }, "aibot"), "now");
console.log("PASS work deadline versus deferred start, waiting and terminal task state");
assert.deepEqual(taskEntityPatch({ entity_type: "provider", entity_id: "provider-id" }, null),
  { entity_type: "provider", entity_id: "provider-id" });
assert.deepEqual(taskEntityPatch({ entity_type: "research_psp", entity_id: "12" }, null),
  { entity_type: "research_psp", entity_id: "12" });
assert.deepEqual(taskEntityPatch({ entity_type: "merchant", entity_id: "old" }, "new"),
  { entity_type: "merchant", entity_id: "new" });
assert.deepEqual(taskEntityPatch({ entity_type: "merchant", entity_id: "old" }, null),
  { entity_type: null, entity_id: null });
assert.deepEqual(taskEntityPatch({}, "lead-id"), { entity_type: null, entity_id: null });
console.log("PASS Operations edits preserve PSP/research bindings and align merchant linkage");
