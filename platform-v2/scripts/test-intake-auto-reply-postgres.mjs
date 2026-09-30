import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const owner = "10000000-0000-4000-8000-000000000001";
const lead = "20000000-0000-4000-8000-000000000001";
const oldLead = "20000000-0000-4000-8000-000000000002";
const migration = await readFile(new URL("../../supabase/migrations/20260917150000_offerpsp_intake_auto_reply.sql", import.meta.url), "utf8");
const rows = async (sql, args = []) => (await db.query(sql, args)).rows;

try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth; create schema private;
    create table auth.users(id uuid primary key);
    create function auth.jwt() returns jsonb language sql as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
    create function auth.uid() returns uuid language sql as $$ select nullif(auth.jwt()->>'sub','')::uuid $$;
    create table public.offerpsp_staff_members(user_id uuid primary key,active boolean default true);
    create function public.is_offerpsp_staff() returns boolean language sql as $$ select true $$;
    create table public.offerpsp_leads(
      lead_id uuid primary key,name text not null,work_email text not null,company text not null,company_url text,
      source text,status text not null default 'new',record_state text not null default 'active',consent boolean not null default true,
      telegram text,vertical text,monthly_volume text,geos text,methods text,details text,
      registration_geo text,target_geos text[] default '{}',requested_currencies text[] default '{}',
      requested_flows text[] default '{}',requested_methods text[] default '{}',traffic_types text[] default '{}',
      expected_monthly_volume numeric,volume_currency text,min_transaction_amount numeric,max_transaction_amount numeric,
      transaction_currency text,business_model text,license_status text,license_jurisdiction text,license_number text,
      license_evidence_url text,launch_timeline text,current_processing_setup text,qualification_notes text,
      submitted_at timestamptz not null default now(),updated_at timestamptz not null default now(),client_user_id uuid
    );
    create table public.offerpsp_tasks(
      id uuid primary key default gen_random_uuid(),lead_id uuid,status text default 'pending',automation_ref text,
      due_at timestamptz default now(),created_at timestamptz default now(),completed_at timestamptz,updated_at timestamptz default now(),metadata jsonb default '{}'
    );
    create table public.offerpsp_lead_activities(
      id uuid primary key default gen_random_uuid(),lead_id uuid,actor_type text,activity_type text,title text,metadata jsonb default '{}',created_at timestamptz default now()
    );
    create table private.offerpsp_compliance_cases(
      id uuid primary key default gen_random_uuid(),lead_id uuid unique,case_status text,risk_level text default 'unknown',
      missing_information text[] default '{}',red_flags jsonb default '[]',summary text,last_screened_at timestamptz,
      screening_input_hash text,screening_result_hash text,screening_completed_run_id uuid,updated_at timestamptz default now()
    );
    create table private.offerpsp_compliance_checks(id uuid primary key default gen_random_uuid(),case_id uuid,check_key text,title text,check_status text,detail text);
    create table private.offerpsp_integration_settings(integration_key text primary key,enabled boolean,configuration jsonb default '{}');
    create table private.offerpsp_telegram_intake_deliveries(lead_id uuid,status text,reserved_at timestamptz,completed_at timestamptz);
    create table private.offerpsp_telegram_intake_actions(lead_id uuid,action text,consumed_at timestamptz,receipt jsonb);
    create table private.offerpsp_route_matches(lead_id uuid);
    create table public.email_drafts(
      id bigint generated always as identity primary key,chat_id text not null,lead_internal_id text,to_email text,subject text,body text,status text,created_at timestamptz default now()
    );
    create table public.offerpsp_email_threads(id uuid primary key default gen_random_uuid(),lead_id uuid);
    create table public.offerpsp_email_messages(
      id uuid primary key default gen_random_uuid(),thread_id uuid,direction text,delivery_status text,source_draft_id bigint unique,
      external_message_id text,provider text,recipient_emails text[],subject text,text_body text,sent_at timestamptz,metadata jsonb default '{}'
    );
    create function private.test_sync_draft() returns trigger language plpgsql as $$ declare tid uuid; begin
      insert into public.offerpsp_email_threads(lead_id) values(new.lead_internal_id::uuid) returning id into tid;
      insert into public.offerpsp_email_messages(thread_id,direction,delivery_status,source_draft_id,recipient_emails,subject,text_body)
      values(tid,'outbound',new.status,new.id,array[new.to_email],new.subject,new.body); return new; end; $$;
    create trigger test_sync_draft after insert on public.email_drafts for each row execute function private.test_sync_draft();
    insert into auth.users values('${owner}'); insert into public.offerpsp_staff_members values('${owner}',true);
    insert into private.offerpsp_integration_settings values
      ('email',true,'{"from_name":"OfferPSP","from_email":"bizdev@offerpsp.com","reply_to":"bizdev@offerpsp.com"}'),
      ('n8n',true,'{"operations_enabled":true}');
    select set_config('request.jwt.claim.role','service_role',false);
    select set_config('request.jwt.claims','{"role":"service_role","sub":"${owner}"}',false);
  `);

  // Existing manual-review rows are deliberately not backfilled by the migration.
  await db.exec(`insert into public.offerpsp_leads(lead_id,name,work_email,company,company_url,source,consent)
    values('${oldLead}','Old','old@example.test','Old Co','https://old.example','offerpsp.com',true);
    insert into private.offerpsp_compliance_cases(lead_id,case_status,last_screened_at,screening_input_hash,screening_result_hash,screening_completed_run_id)
    select lead_id,'manual_review',now(),md5(to_jsonb(l)::text),'old',gen_random_uuid() from public.offerpsp_leads l where lead_id='${oldLead}';`);
  await db.exec(migration);
  assert.equal((await rows("select count(*) n from private.offerpsp_intake_auto_replies"))[0].n, 0);

  await db.exec(`insert into public.offerpsp_leads(lead_id,name,work_email,company,company_url,source,consent)
    values('${lead}','New','new@example.test','New Co','https://new.example','offerpsp.com',true);
    insert into public.offerpsp_tasks(lead_id,automation_ref) values('${lead}','intake_response_v1');
    insert into private.offerpsp_compliance_cases(lead_id,case_status,risk_level,missing_information,red_flags)
    values('${lead}','screening','unknown',array['САЙТ КОМПАНИИ / ПРОДУКТА'],'[]');
    update private.offerpsp_compliance_cases c set case_status='manual_review',last_screened_at=now()+interval '1 second',
      screening_input_hash=(select md5(to_jsonb(l)::text) from public.offerpsp_leads l where l.lead_id=c.lead_id)
    where lead_id='${lead}';`);
  assert.equal((await rows("select count(*) n from private.offerpsp_intake_auto_replies where lead_id=$1", [lead]))[0].n, 0);
  await db.exec(`update private.offerpsp_compliance_cases set case_status='manual_review',
    screening_result_hash='result',screening_completed_run_id=gen_random_uuid() where lead_id='${lead}';`);
  assert.equal((await rows("select status from private.offerpsp_intake_auto_replies where lead_id=$1", [lead]))[0].status, "queued");

  // Operational timestamps and task changes must not invalidate a completed screening.
  await db.exec(`update public.offerpsp_leads set updated_at=now()+interval '10 seconds' where lead_id='${lead}';
    update public.offerpsp_tasks set updated_at=now()+interval '10 seconds' where lead_id='${lead}';`);
  let candidate = (await rows("select public.prepare_offerpsp_intake_auto_reply($1) value", [lead]))[0].value;
  assert.equal(candidate.outcome, "ready");
  assert.equal(candidate.reply_class, "missing_information");
  assert.deepEqual(candidate.missing_information, ["Сайт компании / продукта"]);

  // A business-input change does invalidate the row until a new screened run completes.
  await db.exec(`update public.offerpsp_leads set company='Changed Co' where lead_id='${lead}'`);
  assert.equal((await rows("select public.prepare_offerpsp_intake_auto_reply($1) value", [lead]))[0].value.reason_code, "screening_stale");
  await db.exec(`update private.offerpsp_compliance_cases set case_status='screening' where lead_id='${lead}';
    update private.offerpsp_compliance_cases set case_status='manual_review',last_screened_at=now(),
      screening_result_hash='result-2',screening_completed_run_id=gen_random_uuid() where lead_id='${lead}';`);
  candidate = (await rows("select public.prepare_offerpsp_intake_auto_reply($1) value", [lead]))[0].value;
  assert.equal(candidate.outcome, "ready");

  const subject = "A few details for your OfferPSP request";
  const body = "Thank you for contacting OfferPSP. We received your request and need details.\n\n- Company or product website\n\nBest regards,\nOfferPSP team\nhttps://offerpsp.com";
  const tampered = (await rows("select public.claim_offerpsp_intake_auto_reply($1,$2,$3,$4,$5) value", [lead,candidate.source_hash,candidate.reply_class,subject,body]))[0].value;
  assert.equal(tampered.outcome, "review_required");
  assert.equal(tampered.reason_code, "fact_mismatch");
  assert.equal((await rows("select count(*) n from public.email_drafts"))[0].n, 0);

  assert.equal((await rows("select public.prepare_offerpsp_intake_auto_reply($1) value", [lead]))[0].value.outcome, "review_required");
  await db.exec(`update private.offerpsp_compliance_cases set case_status='screening' where lead_id='${lead}';
    update private.offerpsp_compliance_cases set case_status='manual_review',last_screened_at=now(),
      screening_result_hash='result-3',screening_completed_run_id=gen_random_uuid() where lead_id='${lead}';`);
  const retriedCandidate = (await rows("select public.prepare_offerpsp_intake_auto_reply($1) value", [lead]))[0].value;
  assert.equal(retriedCandidate.outcome, "ready");
  const expected = (await rows("select private.offerpsp_intake_auto_reply_expected_message($1) value", [lead]))[0].value;
  const claim = (await rows("select public.claim_offerpsp_intake_auto_reply($1,$2,$3,$4,$5) value", [lead,retriedCandidate.source_hash,retriedCandidate.reply_class,expected.subject,expected.body]))[0].value;
  assert.equal(claim.outcome, "claimed");
  assert.equal((await rows("select count(*) n from public.email_drafts"))[0].n, 1);
  assert.equal((await rows("select count(*) n from public.offerpsp_email_messages"))[0].n, 1);

  const complete = (await rows("select public.complete_offerpsp_intake_auto_reply($1,$2,$3,'smtp','archived',null) value", [claim.draft_id,claim.attempt_id,"<one@example.test>"]))[0].value;
  assert.equal(complete.outcome, "sent");
  assert.equal((await rows("select status from public.offerpsp_tasks where lead_id=$1", [lead]))[0].status, "done");
  assert.equal((await rows("select public.prepare_offerpsp_intake_auto_reply($1) value", [lead]))[0].value.outcome, "already_sent");
  assert.equal((await rows("select count(*) n from public.email_drafts"))[0].n, 1);

  for (const role of ["anon","authenticated"]) {
    const result = (await rows("select has_function_privilege($1,'public.claim_offerpsp_intake_auto_reply(uuid,text,text,text,text)','execute') allowed", [role]))[0];
    assert.equal(result.allowed, false);
  }
  console.log("Intake auto-reply PostgreSQL contract passed");
} finally {
  await db.close();
}
