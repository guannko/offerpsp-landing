import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const migration = await readFile(new URL("../../supabase/migrations/20260930140822_offerpsp_intake_review_task_separation.sql", import.meta.url), "utf8");
const receiptMigration = await readFile(new URL("../../supabase/migrations/20260920191500_offerpsp_keep_identity_review_open.sql", import.meta.url), "utf8");
const lead = "10000000-0000-4000-8000-000000000001";
const qa = "10000000-0000-4000-8000-000000000002";
const attempt = "20000000-0000-4000-8000-000000000001";
const rows = async (sql) => (await db.query(sql)).rows;
const review = async () => (await rows("select * from public.offerpsp_tasks where automation_ref='intake_review_v1'"))[0];
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role; create schema private;
    create table public.offerpsp_leads(lead_id uuid primary key,company text,assigned_to uuid,record_state text,status text);
    create table private.offerpsp_compliance_cases(id uuid default gen_random_uuid(),lead_id uuid unique,case_status text);
    create table public.offerpsp_tasks(id uuid default gen_random_uuid(),lead_id uuid,assigned_to uuid,source text,title text,details text,
      priority text,due_at timestamptz,automation_ref text,metadata jsonb default '{}',status text default 'pending',completed_at timestamptz,updated_at timestamptz default now());
    create function private.offerpsp_task_is_qa_fixture(id uuid,title text,details text) returns boolean language sql as $$ select title ilike '%WinPiski%' $$;
    create table public.email_drafts(id bigint,status text);
    create table public.offerpsp_email_messages(id uuid default gen_random_uuid(),source_draft_id bigint,metadata jsonb,
      external_message_id text,provider text,delivery_status text,sent_at timestamptz);
    create table private.offerpsp_intake_submission_replies(submission_id uuid default gen_random_uuid(),lead_id uuid,draft_id bigint,
      delivery_attempt_id uuid,status text,sent_at timestamptz,updated_at timestamptz,reason_code text);
    create table public.offerpsp_lead_activities(lead_id uuid,actor_type text,activity_type text,title text,metadata jsonb,client_visible boolean);
    insert into public.offerpsp_leads values('${lead}','Railon',null,'active','needs_clarification'),('${qa}','WinPiski',null,'active','needs_clarification');
    insert into private.offerpsp_compliance_cases(lead_id,case_status) values('${lead}','manual_review'),('${qa}','manual_review');
    insert into public.offerpsp_tasks(lead_id,source,title,automation_ref,status,metadata) values
      ('${lead}','system','Review intake: Railon','intake_response_v1','pending','{}');
    select set_config('request.jwt.claim.role','service_role',false);
  `);
  await db.exec(migration);
  assert.equal((await review()).status, "pending", "existing manual review must have its own work item");
  assert.equal((await rows("select count(*) n from public.offerpsp_tasks where lead_id='" + qa + "'"))[0].n, 0, "QA must not generate operational review work");
  await db.exec(receiptMigration);
  await db.exec(`insert into public.email_drafts values(1,'sending');
    insert into public.offerpsp_email_messages(source_draft_id,metadata,delivery_status) values(1,'{"delivery_attempt_id":"${attempt}"}','sending');
    insert into private.offerpsp_intake_submission_replies(lead_id,draft_id,delivery_attempt_id,status) values('${lead}',1,'${attempt}','claimed');`);
  const receipt = (await db.query("select public.complete_offerpsp_intake_submission_reply(1,$1::uuid,'<receipt@offerpsp.com>','smtp','archived',null) result", [attempt])).rows[0].result;
  assert.equal(receipt.outcome, "sent");
  assert.equal((await rows("select status from public.offerpsp_tasks where automation_ref='intake_response_v1'"))[0].status, "done");
  assert.equal((await review()).status, "pending", "a real acknowledgement delivery receipt must not complete review");
  assert.equal((await rows("select title from public.offerpsp_tasks where automation_ref='intake_response_v1'"))[0].title, "First response: Railon");
  const reviewId = (await review()).id;
  await db.exec(`update private.offerpsp_compliance_cases set case_status='needs_info' where lead_id='${lead}'`);
  assert.equal((await review()).id, reviewId, "repeat screening must not duplicate work");
  await db.exec(`update private.offerpsp_compliance_cases set case_status='cleared' where lead_id='${lead}'`);
  assert.equal((await review()).status, "done");
  await db.exec(`update private.offerpsp_compliance_cases set case_status='manual_review' where lead_id='${lead}'`);
  assert.equal((await review()).status, "pending", "a renewed blocker must reopen an automatically-cleared review");
  await db.exec("update public.offerpsp_tasks set status='done' where automation_ref='intake_review_v1'");
  await db.exec(`update private.offerpsp_compliance_cases set case_status='hold' where lead_id='${lead}'`);
  assert.equal((await review()).status, "done", "a human task decision must not be reset");
  await db.exec("update public.offerpsp_tasks set status='pending' where automation_ref='intake_review_v1'");
  await db.exec(`update public.offerpsp_leads set record_state='archived' where lead_id='${lead}'`);
  assert.equal((await review()).status, "cancelled");
  assert.equal((await db.query("select has_function_privilege('authenticated','private.offerpsp_sync_intake_review_task(uuid)','EXECUTE') allowed")).rows[0].allowed, false);
  console.log("PASS real acknowledgement receipt does not close review; dedup, QA exclusion, compliance resolution and terminal lifecycle");
} finally { await db.close(); }
