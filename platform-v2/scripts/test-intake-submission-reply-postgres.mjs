import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const lead = "20000000-0000-4000-8000-000000000001";
const submissionA = "30000000-0000-4000-8000-000000000001";
const submissionB = "30000000-0000-4000-8000-000000000002";
const submissionReview = "30000000-0000-4000-8000-000000000003";
const submissionBlocked = "30000000-0000-4000-8000-000000000004";
const migration = await readFile(new URL("../../supabase/migrations/20260919143000_offerpsp_submission_auto_reply.sql", import.meta.url), "utf8");
const observabilityMarker = "create or replace function public.get_offerpsp_intake_observability";
const replyMigration = migration.slice(0, migration.indexOf(observabilityMarker));
assert.ok(replyMigration.length > 0 && replyMigration.length < migration.length);
const rows = async (sql, args = []) => (await db.query(sql, args)).rows;

try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema private;
    create table public.offerpsp_leads(lead_id uuid primary key,company text,work_email text);
    create table public.offerpsp_tasks(
      id uuid primary key default gen_random_uuid(),lead_id uuid,status text default 'pending',
      automation_ref text,completed_at timestamptz,updated_at timestamptz default now(),metadata jsonb default '{}'
    );
    create table public.offerpsp_lead_activities(
      id uuid primary key default gen_random_uuid(),lead_id uuid,actor_type text,activity_type text,
      title text,metadata jsonb default '{}',client_visible boolean default false,created_at timestamptz default now()
    );
    create table public.email_drafts(
      id bigint generated always as identity primary key,chat_id text not null,lead_internal_id text,
      to_email text,subject text,body text,status text,created_at timestamptz default now()
    );
    create table public.offerpsp_email_threads(id uuid primary key default gen_random_uuid(),lead_id uuid);
    create table public.offerpsp_email_messages(
      id uuid primary key default gen_random_uuid(),thread_id uuid,direction text,delivery_status text,
      source_draft_id bigint unique,external_message_id text,provider text,recipient_emails text[],
      subject text,text_body text,sent_at timestamptz,metadata jsonb default '{}'
    );
    create function private.test_sync_draft() returns trigger language plpgsql as $$
      declare tid uuid; begin
        insert into public.offerpsp_email_threads(lead_id) values(new.lead_internal_id::uuid) returning id into tid;
        insert into public.offerpsp_email_messages(
          thread_id,direction,delivery_status,source_draft_id,recipient_emails,subject,text_body
        ) values(tid,'outbound',new.status,new.id,array[new.to_email],new.subject,new.body);
        return new;
      end;
    $$;
    create trigger test_sync_draft after insert on public.email_drafts
      for each row execute function private.test_sync_draft();
    create table private.offerpsp_integration_settings(
      integration_key text primary key,enabled boolean,configuration jsonb default '{}'
    );
    create table private.offerpsp_merchant_contacts(id uuid primary key default gen_random_uuid());
    create table private.offerpsp_intake_submissions(
      id uuid primary key default gen_random_uuid(),lead_id uuid not null references public.offerpsp_leads(lead_id),
      contact_id uuid references private.offerpsp_merchant_contacts(id),request_hash text not null,
      disposition text not null,match_strategy text not null,submitted_name text not null,
      submitted_email text not null,submitted_company text not null,submitted_domain text,payload jsonb not null,
      created_at timestamptz not null default now()
    );
    create table private.offerpsp_intake_auto_replies(
      lead_id uuid primary key references public.offerpsp_leads(lead_id),source_hash text not null,
      reply_class text,status text,reason_code text,draft_id bigint,delivery_attempt_id uuid,
      claimed_at timestamptz,sent_at timestamptz,updated_at timestamptz default now(),metadata jsonb default '{}'
    );
    create table private.offerpsp_compliance_cases(
      lead_id uuid primary key,case_status text,screening_completed_run_id uuid,screening_result_hash text,
      missing_information text[] default '{}'
    );
    create function private.offerpsp_intake_auto_reply_source_hash(uuid)
      returns text language sql as $$ select 'legacy'::text $$;
    insert into public.offerpsp_leads values('${lead}','Acme Ltd','owner@acme.example');
    insert into private.offerpsp_integration_settings values
      ('email',true,'{"from_name":"OfferPSP","from_email":"bizdev@offerpsp.com","reply_to":"bizdev@offerpsp.com"}'),
      ('n8n',true,'{"operations_enabled":true}');
    select set_config('request.jwt.claim.role','service_role',false);
    select set_config('request.jwt.claims','{"role":"service_role"}',false);
  `);
  await db.exec(replyMigration);

  const insertSubmission = async (id, email, disposition = "merged", source = "offerpsp.com") => db.query(`
    insert into private.offerpsp_intake_submissions(
      id,lead_id,request_hash,disposition,match_strategy,submitted_name,submitted_email,
      submitted_company,submitted_domain,payload
    ) values($1,$2,$3,$4,'verified_company_email_domain','Manager',$5,'Acme Ltd','acme.example',
      jsonb_build_object('source',$6::text,'consent',true))`, [id, lead, `hash-${id}`, disposition, email, source]);

  await insertSubmission(submissionA, "first@acme.example", "created");
  await insertSubmission(submissionB, "second@acme.example");
  await insertSubmission(submissionReview, "third@acme.example", "review_required");
  assert.equal((await rows("select count(*) n from private.offerpsp_intake_submission_replies"))[0].n, 3);

  const expected = (await rows("select private.offerpsp_intake_submission_reply_expected_message() value"))[0].value;
  const prepareA = (await rows("select public.prepare_offerpsp_intake_submission_reply($1) value", [submissionA]))[0].value;
  assert.equal(prepareA.outcome, "ready");
  assert.equal(prepareA.to_email, "first@acme.example");
  const claimA = (await rows(
    "select public.claim_offerpsp_intake_submission_reply($1,$2,$3,$4,$5) value",
    [submissionA, prepareA.source_hash, "acknowledgement", expected.subject, expected.body],
  ))[0].value;
  assert.equal(claimA.outcome, "claimed");
  await db.query(
    "insert into public.offerpsp_tasks(lead_id,automation_ref) values($1,'intake_response_v1')",
    [lead],
  );
  const replayClaim = (await rows(
    "select public.claim_offerpsp_intake_submission_reply($1,$2,$3,$4,$5) value",
    [submissionA, prepareA.source_hash, "acknowledgement", expected.subject, expected.body],
  ))[0].value;
  assert.equal(replayClaim.outcome, "claimed");
  assert.equal((await rows("select count(*) n from public.email_drafts where chat_id=$1", [`autopilot:intake-submission:${submissionA}`]))[0].n, 1);

  const completeA = (await rows(
    "select public.complete_offerpsp_intake_submission_reply($1,$2,$3,'smtp','archived',null) value",
    [claimA.draft_id, claimA.attempt_id, "<first@offerpsp.com>"],
  ))[0].value;
  assert.equal(completeA.outcome, "sent");
  assert.equal(
    (await rows("select status from public.offerpsp_tasks where automation_ref='intake_response_v1'"))[0].status,
    "done",
  );
  const replayComplete = (await rows(
    "select public.complete_offerpsp_intake_submission_reply($1,$2,$3,'smtp','archived',null) value",
    [claimA.draft_id, claimA.attempt_id, "<first@offerpsp.com>"],
  ))[0].value;
  assert.equal(replayComplete.outcome, "already_sent");

  const prepareB = (await rows("select public.prepare_offerpsp_intake_submission_reply($1) value", [submissionB]))[0].value;
  const claimB = (await rows(
    "select public.claim_offerpsp_intake_submission_reply($1,$2,$3,$4,$5) value",
    [submissionB, prepareB.source_hash, "acknowledgement", expected.subject, expected.body],
  ))[0].value;
  assert.equal(claimB.outcome, "claimed");
  assert.equal(claimB.lead_id, lead);
  assert.equal((await rows("select count(*) n from public.email_drafts"))[0].n, 2);

  const prepareReview = (await rows("select public.prepare_offerpsp_intake_submission_reply($1) value", [submissionReview]))[0].value;
  assert.equal(prepareReview.outcome, "ready");
  assert.equal(prepareReview.to_email, "third@acme.example");
  await db.query(
    "insert into public.offerpsp_tasks(lead_id,automation_ref) values($1,$2)",
    [lead, `intake_submission:${submissionReview}`],
  );
  const claimReview = (await rows(
    "select public.claim_offerpsp_intake_submission_reply($1,$2,$3,$4,$5) value",
    [submissionReview, prepareReview.source_hash, "acknowledgement", expected.subject, expected.body],
  ))[0].value;
  assert.equal(claimReview.outcome, "claimed");
  assert.equal((await rows(
    "select public.complete_offerpsp_intake_submission_reply($1,$2,$3,'smtp','archived',null) value",
    [claimReview.draft_id, claimReview.attempt_id, "<review@offerpsp.com>"],
  ))[0].value.outcome, "sent");
  assert.equal(
    (await rows("select status from public.offerpsp_tasks where automation_ref=$1", [`intake_submission:${submissionReview}`]))[0].status,
    "pending",
  );

  await insertSubmission(submissionBlocked, "blocked@acme.example", "review_required", "other.example");
  const blocked = (await rows("select public.prepare_offerpsp_intake_submission_reply($1) value", [submissionBlocked]))[0].value;
  assert.equal(blocked.outcome, "review_required");
  assert.equal(blocked.reason_code, "source_not_allowlisted");

  for (const role of ["anon", "authenticated"]) {
    const privilege = (await rows(
      "select has_function_privilege($1,'public.claim_offerpsp_intake_submission_reply(uuid,text,text,text,text)','execute') allowed",
      [role],
    ))[0];
    assert.equal(privilege.allowed, false);
  }
  console.log("Intake submission auto-reply PostgreSQL contract passed");
} finally {
  await db.close();
}
