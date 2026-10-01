import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { initialCoursePlan, validateCoursePlan, moveDirection, directionWork, orderPlanTasks, leadStage } from '../src/lib/coursePlan.ts';
import { isCourseBusinessLead, isCourseBusinessTask, isCourseBusinessThread } from '../src/lib/courseVisibility.ts';

const migration = await readFile(new URL('../../supabase/migrations/20261001165903_offerpsp_course_organizer.sql', import.meta.url), 'utf8');
const staff = '00000000-0000-4000-8000-000000000001';
const outsider = '00000000-0000-4000-8000-000000000002';
const lead = '00000000-0000-4000-8000-000000000011';
const task = '00000000-0000-4000-8000-000000000021';
const claims = (id = staff, email = 'guannko@gmail.com', provider = 'google') => ({ sub: id, email, role: 'authenticated', app_metadata: { provider } });
async function withDb(fn) {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema private; create schema auth;
      create table auth.users(id uuid primary key);
      insert into auth.users values ('${staff}'),('${outsider}');
      create table public.offerpsp_staff_members(user_id uuid primary key,active boolean);
      insert into public.offerpsp_staff_members values ('${staff}',true);
      create table public.offerpsp_leads(lead_id uuid primary key);
      create table public.offerpsp_tasks(id uuid primary key);
      insert into public.offerpsp_leads values ('${lead}');
      insert into public.offerpsp_tasks values ('${task}');
      create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt()->>'sub','')::uuid $$;
      create function public.is_offerpsp_staff() returns boolean language sql stable security definer set search_path=public as $$
        select coalesce(auth.jwt()->>'role','')='service_role' or (
          lower(coalesce(auth.jwt()->>'email',''))='guannko@gmail.com'
          and coalesce(auth.jwt()->'app_metadata'->>'provider','')='google'
          and exists(select 1 from public.offerpsp_staff_members where user_id=auth.uid() and active=true)) $$;`);
    await db.exec(migration);
    await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify(claims())]);
    await fn(db);
  } finally { await db.close(); }
}
const get = async (db) => (await db.query('select public.get_offerpsp_course_plan() result')).rows[0].result;
const save = async (db, plan, rev = 0) => (await db.query('select public.save_offerpsp_course_plan($1,$2::jsonb) result', [rev, JSON.stringify(plan)])).rows[0].result;

test('initial suggestions are not persisted by reading; first save and history are atomic', () => withDb(async (db) => {
  assert.deepEqual(await get(db), { revision: 0, plan: null, updated_at: null });
  const first = await save(db, initialCoursePlan());
  assert.equal(first.outcome, 'saved'); assert.equal(first.revision, 1);
  assert.deepEqual((await get(db)).plan, initialCoursePlan());
  assert.equal((await db.query('select count(*)::int n from private.offerpsp_course_plan_history')).rows[0].n, 1);
}));
test('stale first creation / second tab cannot overwrite a newer plan or add history', () => withDb(async (db) => {
  await save(db, initialCoursePlan());
  const stale = await save(db, { ...initialCoursePlan(), course: 'Stale overwrite' });
  assert.equal(stale.outcome, 'conflict'); assert.equal(stale.revision, 1);
  assert.equal((await get(db)).plan.course, initialCoursePlan().course);
  const changed = await save(db, { ...initialCoursePlan(), course: 'Updated course' }, 1);
  assert.equal(changed.revision, 2);
  assert.equal((await save(db, initialCoursePlan(), 1)).outcome, 'conflict');
  assert.equal((await db.query('select count(*)::int n from private.offerpsp_course_plan_history')).rows[0].n, 2);
}));
test('anonymous, non-staff, wrong provider, removed staff and service-without-user are denied', () => withDb(async (db) => {
  for (const jwt of [{}, claims(outsider), claims(staff, 'wrong@example.test'), claims(staff, 'guannko@gmail.com', 'email'), { role: 'service_role' }]) {
    await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify(jwt)]);
    await assert.rejects(get(db), /staff access required/);
    await assert.rejects(save(db, initialCoursePlan()), /staff access required/);
  }
  await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify(claims())]);
  await db.exec('update public.offerpsp_staff_members set active=false');
  await assert.rejects(get(db), /staff access required/);
}));
test('private tables have RLS and no client grants; RPC grants exclude anon and service', () => withDb(async (db) => {
  const { rows } = await db.query(`select relrowsecurity from pg_class where oid in ('private.offerpsp_course_plan'::regclass,'private.offerpsp_course_plan_history'::regclass)`);
  assert.equal(rows.length, 2); assert.ok(rows.every((row) => row.relrowsecurity));
  for (const role of ['anon', 'authenticated', 'service_role']) {
    const [access] = (await db.query(`select has_table_privilege($1,'private.offerpsp_course_plan','SELECT') allowed`, [role])).rows;
    assert.equal(access.allowed, false);
  }
  for (const role of ['anon', 'service_role']) {
    const [access] = (await db.query(`select has_function_privilege($1,'public.get_offerpsp_course_plan()','EXECUTE') r,
      has_function_privilege($1,'public.save_offerpsp_course_plan(integer,jsonb)','EXECUTE') w`, [role])).rows;
    assert.deepEqual(access, { r: false, w: false });
  }
  await db.exec('set role authenticated');
  assert.equal((await save(db, initialCoursePlan())).outcome, 'saved');
  await assert.rejects(db.query('select * from private.offerpsp_course_plan'), /permission denied/);
  await db.exec('reset role; set role anon');
  await assert.rejects(get(db), /permission denied/);
}));
test('server rejects malformed, oversized, duplicate and forged links; no partial writes', () => withDb(async (db) => {
  const valid = initialCoursePlan();
  for (const plan of [
    null, [], {}, { ...valid, course: '' }, { ...valid, course: 'x'.repeat(2001) },
    { ...valid, directions: 'invalid' }, { ...valid, extra: 'not accepted' },
    { ...valid, directions: Array(13).fill(valid.directions[0]) },
    { ...valid, directions: [valid.directions[0], valid.directions[0]] },
    { ...valid, directions: [{ ...valid.directions[0], paused: 'true' }] },
    { ...valid, directions: [{ ...valid.directions[0], lead_ids: [outsider] }] },
    { ...valid, directions: [{ ...valid.directions[0], task_ids: [outsider] }] },
    { ...valid, directions: [{ ...valid.directions[0], lead_ids: [lead, lead] }] },
    { ...valid, directions: [{ ...valid.directions[0], task_ids: [123] }] },
  ]) await assert.rejects(save(db, plan));
  assert.equal((await get(db)).revision, 0);
  const linked = { ...valid, directions: [{ ...valid.directions[0], lead_ids: [lead], task_ids: [task] }] };
  assert.deepEqual((await save(db, linked)).plan, linked);
}));
test('pause and reorder only change the planning record, not clients or task lifecycles', () => withDb(async (db) => {
  const plan = initialCoursePlan(); plan.directions[0].lead_ids = [lead]; plan.directions[0].task_ids = [task];
  await save(db, plan);
  const reordered = moveDirection(plan, 'usa', 0); reordered.directions.find((d) => d.id === 'cis').paused = true;
  await save(db, reordered, 1);
  assert.equal((await db.query('select count(*)::int n from public.offerpsp_tasks')).rows[0].n, 1);
  assert.equal((await db.query('select count(*)::int n from public.offerpsp_leads')).rows[0].n, 1);
}));
test('direction projection: explicit cases pull tasks and mail, task-only links do not claim client ownership', () => {
  const direction = { ...initialCoursePlan().directions[0], lead_ids: ['lead-1'], task_ids: ['task-2'] };
  const leads = [{ lead_id: 'lead-1', status: 'provider_reviewing' }, { lead_id: 'lead-2', status: 'won' }];
  const tasks = [{ id: 'task-1', lead_id: 'lead-1', status: 'pending' }, { id: 'task-2', lead_id: 'lead-2', status: 'done' }, { id: 'task-3', lead_id: 'lead-2', status: 'failed' }];
  const threads = [{ id: 'mail-1', lead_id: 'lead-1' }, { id: 'mail-2', lead_id: 'lead-2' }];
  const work = directionWork(direction, leads, tasks, threads);
  assert.deepEqual(work.tasks.map((t) => t.id), ['task-1', 'task-2']);
  assert.equal(work.threads.length, 1); assert.equal(work.leads.length, 1); assert.equal(work.launched.length, 0);
  assert.deepEqual(work.results.map((t) => t.id), ['task-2']);
});
test('first-priority / pause change the visible plan order, do not mutate canonical task priority', () => {
  const plan = initialCoursePlan(); plan.directions[0].task_ids = ['a']; plan.directions[1].task_ids = ['b', 'a'];
  const tasks = [{ id: 'a', status: 'pending', priority: 'normal' }, { id: 'b', status: 'failed', priority: 'urgent' }];
  const changed = moveDirection(plan, 'usa', 0);
  assert.deepEqual(orderPlanTasks(changed, [], tasks, []).map((t) => t.id), ['a', 'b']);
  // Preserve canonical task ordering within each direction, deduplicate cross-direction links.
  changed.directions[0].paused = true;
  assert.deepEqual(orderPlanTasks(changed, [], tasks, []).map((t) => t.id), ['a']);
  assert.equal(tasks[0].priority, 'normal');
  assert.equal(validateCoursePlan(initialCoursePlan()), null);
});
test('no stage is fabricated for unknown/terminal cases; matching is not acceptance or launch', () => {
  assert.equal(leadStage({ lead_id: 'a', status: 'matched' }), 1);
  assert.equal(leadStage({ lead_id: 'a', status: 'provider_accepted' }), 3);
  assert.equal(leadStage({ lead_id: 'a', status: 'won' }), 4);
  for (const status of ['lost', 'closed', 'future_status']) assert.equal(leadStage({ lead_id: 'a', status }), null);
});
test('homepage integrates existing gated routes, read-only mail and task deep links, no local persistence', async () => {
  const page = await readFile(new URL('../src/pages/CoursePage.tsx', import.meta.url), 'utf8');
  const organizer = await readFile(new URL('../src/components/control/CourseOrganizer.tsx', import.meta.url), 'utf8');
  const ops = await readFile(new URL('../src/pages/OperationsWorkspace.tsx', import.meta.url), 'utf8');
  assert.match(page, /leads.filter\(isCourseBusinessLead\)/); assert.match(page, /isCourseBusinessTask\(task, excludedLeadIds\)/);
  assert.match(page, /isCourseBusinessThread\(thread, excludedLeadIds\)/);
  assert.match(page, /outcome === "conflict"/); assert.match(page, /outcome !== "saved"/);
  assert.match(ops, /searchParams.get\("task"\)/); assert.match(ops, /setDraft\(taskDraft\(task\)\)/);
  const mail = await readFile(new URL('../src/pages/CaptainPages.tsx', import.meta.url), 'utf8');
  assert.match(mail, /const selectedThread = threadId \? mailCenter.threads.find/);
  assert.match(mail, /searchParams.get\("thread"\)/);
  assert.match(mail, /if \(!mailCenter.threads.some\(\(thread\) => thread.id === requestedThread\)\) return/);
  assert.ok(!/localStorage|service_role|setSession|send_email|p_mark_read/.test(page + organizer));
  assert.match(organizer, /не меняя очереди автоматизаций/);
});
test('QA fixtures, old E2E, archived cases and their tasks/mail cannot leak into organizer', () => {
  for (const record of [
    { lead_id: 'a', company: 'WinPiski' }, { lead_id: 'a', company: 'OfferPSP Intake E2E 20261001' },
    { lead_id: 'a', work_email: 'sample@qa.invalid' }, { lead_id: 'a', record_state: 'archived' },
  ]) assert.equal(isCourseBusinessLead(record), false);
  assert.equal(isCourseBusinessLead({ lead_id: 'a', company: 'Real partner' }), true);
  assert.equal(isCourseBusinessTask({ id: 't', lead_id: 'excluded' }, new Set(['excluded'])), false);
  assert.equal(isCourseBusinessTask({ id: 't', title: 'WinPiski verification' }, new Set()), false);
  assert.equal(isCourseBusinessThread({ id: 'mail', lead_id: 'excluded' }, new Set(['excluded'])), false);
  assert.equal(isCourseBusinessThread({ id: 'mail', status: 'trashed' }, new Set()), false);
});
