import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const migration = await readFile(new URL("../../supabase/migrations/20260930135804_offerpsp_mailbox_consistency.sql", import.meta.url), "utf8");
const mailFoundation = await readFile(new URL("../../supabase/migrations/20260805161000_offerpsp_mail_center.sql", import.meta.url), "utf8");
const timelineFoundation = await readFile(new URL("../../supabase/migrations/20260812192420_offerpsp_contact_timeline.sql", import.meta.url), "utf8");
const ingest = async (payload) => (await db.query("select public.aibot_n8n_ingest_email($1::jsonb) result", [JSON.stringify(payload)])).rows[0].result;
const rows = async (sql) => (await db.query(sql)).rows;
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema private;
    create table public.offerpsp_leads(lead_id uuid,work_email text,submitted_at timestamptz);
    create table public.casino_leads(id bigint,email text,updated_at timestamptz);
    create table public.psp_providers(id bigint,email text,website text,record_state text,updated_at timestamptz);
    create table private.offerpsp_providers(id uuid,legacy_psp_id integer);
    create table public.offerpsp_organizations(id uuid,organization_type text);
    create table public.email_drafts(id uuid,lead_internal_id text);
    create table private.offerpsp_integration_settings(integration_key text,configuration jsonb);
    insert into private.offerpsp_integration_settings values('email','{"from_email":"bizdev@offerpsp.com"}');
    insert into public.psp_providers values(83,'hello@presspay.example','https://www.presspay.example/','active',now());
    create function private.offerpsp_mail_extract_email(t text) returns text language sql as $$ select lower(trim(t)) $$;
    create function private.offerpsp_mail_normalize_subject(t text) returns text language sql as $$ select lower(regexp_replace(t,'^(re:|fwd:)\\s*','','i')) $$;
    create function private.offerpsp_jsonb_text_array(j jsonb) returns text[] language sql as $$ select coalesce(array_agg(value),'{}') from jsonb_array_elements_text(coalesce(j,'[]')) $$;
    create table public.offerpsp_email_threads(
      id uuid primary key default gen_random_uuid(),thread_key text unique,subject text,participant_email text,
      counterparty_type text,counterparty_id text,lead_id uuid,status text,unread_count int,last_message_at timestamptz,
      follow_up_at timestamptz,metadata jsonb default '{}',updated_at timestamptz default now()
    );
    create table public.offerpsp_email_messages(
      id uuid primary key default gen_random_uuid(),thread_id uuid references public.offerpsp_email_threads,
      direction text,sender_email text,recipient_emails text[],cc_emails text[],subject text,text_body text,html_body text,
      external_message_id text,in_reply_to text,message_references text[],provider text,delivery_status text,is_read boolean,
      sent_at timestamptz,received_at timestamptz,raw_headers jsonb,metadata jsonb,created_at timestamptz,source_draft_id uuid
    );
    select set_config('request.jwt.claim.role','service_role',false);
  `);
  await db.exec(mailFoundation.slice(mailFoundation.indexOf("create or replace function private.offerpsp_mail_resolve_counterparty"), mailFoundation.indexOf("create or replace function private.offerpsp_sync_email_draft")));
  // Real canonical identity, event upsert and existing message trigger participate.
  await db.exec(timelineFoundation.slice(0, timelineFoundation.indexOf("create or replace function private.offerpsp_contact_event_from_email_draft")));
  await db.exec("create trigger tg_offerpsp_contact_email_message after insert or update on public.offerpsp_email_messages for each row execute function private.offerpsp_contact_event_from_email_message()");
  await db.exec(migration);
  const initial = { from_email: "assaf@presspay.example", to: ["bizdev@offerpsp.com"], subject: "Partnership", message_id: "<first@presspay.example>", in_reply_to: "<old-outreach@offerpsp.com>", received_at: "2026-09-30T10:00:00Z", text: "Can we discuss?" };
  const first = await ingest(initial);
  assert.equal(first.counterparty_type, "general", "a domain suggestion must not automatically bind a person to a company");
  await db.exec("update public.offerpsp_email_threads set counterparty_type='research_psp',counterparty_id='83'");
  assert.equal((await rows("select count(*) n from private.offerpsp_contact_events where entity_id='83'"))[0].n, 1, "manual linking must reconcile existing mail into company history");
  await db.exec("update public.offerpsp_email_threads set counterparty_type='research_psp',counterparty_id='83'");
  assert.equal((await rows("select count(*) n from private.offerpsp_contact_events"))[0].n, 1, "repeated linking must not duplicate timeline evidence");
  assert.equal((await rows("select unread_count from public.offerpsp_email_threads"))[0].unread_count, 1);
  assert.equal((await ingest(initial)).duplicate, true);
  assert.equal((await rows("select unread_count from public.offerpsp_email_threads"))[0].unread_count, 1, "duplicate must not increment unread");

  const sent = { direction: "outbound", mailbox_account: "bizdev@offerpsp.com", from_email: "bizdev@offerpsp.com", to: ["assaf@presspay.example"], subject: "Changed subject", message_id: "<spark-sent@offerpsp.com>", in_reply_to: initial.message_id, received_at: "2026-09-30T11:18:00Z", text: "Only email please." };
  const outgoing = await ingest(sent);
  assert.equal(outgoing.thread_id, first.thread_id, "In-Reply-To must win over a changed subject");
  let message = (await rows("select * from public.offerpsp_email_messages where direction='outbound'"))[0];
  assert.equal(message.delivery_status, "sent");
  assert.equal(message.is_read, true);
  assert.equal(message.received_at, null);
  assert.equal(message.sent_at.toISOString(), "2026-09-30T11:18:00.000Z");
  assert.equal((await rows("select status from public.offerpsp_email_threads"))[0].status, "open", "import cannot invent a response expectation");
  assert.equal((await ingest(sent)).duplicate, true, "Spark and controlled sender must deduplicate on Message-ID");
  const oldOutreach = await ingest({ ...sent, to: ["hello@presspay.example"], message_id: initial.in_reply_to, in_reply_to: null, subject: "Partnership", received_at: "2026-09-24T10:00:00Z" });
  assert.equal(oldOutreach.thread_id, first.thread_id, "reverse References must reconnect an earlier Sent message after company association is confirmed");
  assert.equal((await rows("select count(*) n from private.offerpsp_contact_events where entity_id='83'"))[0].n, 3,
    "existing message trigger and association reconciliation must produce one canonical event per real email");
  const newTopic = await ingest({ ...initial, subject: "New topic", message_id: "<new-topic@presspay.example>", is_read: true });
  assert.equal(newTopic.counterparty_id, "83", "an exact-address confirmed association must carry across topics");
  await db.exec("delete from public.offerpsp_email_messages where thread_id=(select id from public.offerpsp_email_threads where subject='New topic'); delete from public.offerpsp_email_threads where subject='New topic'");
  await assert.rejects(() => ingest({ ...sent, message_id: "<spoof@external.test>", from_email: "external@example.test" }), /configured OfferPSP account/);
  await assert.rejects(() => ingest({ ...sent, message_id: "<wrong-account@offerpsp.com>", mailbox_account: "external@example.test" }), /configured OfferPSP account/);

  await db.exec("update public.offerpsp_email_threads set status='awaiting_reply',follow_up_at='2026-10-03',unread_count=0");
  await ingest({ ...initial, message_id: "<old-backfill@presspay.example>", received_at: "2026-09-01T10:00:00Z", is_read: true });
  assert.equal((await rows("select status from public.offerpsp_email_threads"))[0].status, "awaiting_reply", "old backfill cannot rewind a newer state");
  assert.equal((await rows("select unread_count from public.offerpsp_email_threads"))[0].unread_count, 0);
  for (const status of ["closed", "archived", "trashed"]) {
    await db.exec(`update public.offerpsp_email_threads set status='${status}'`);
    await ingest({ ...initial, message_id: `<new-${status}@presspay.example>`, received_at: "2026-10-01T10:00:00Z" });
    assert.equal((await rows("select status from public.offerpsp_email_threads"))[0].status, status);
  }
  const cross = await ingest({ ...initial, from_email: "stranger@elsewhere.example", message_id: "<unrelated@elsewhere.example>", in_reply_to: initial.message_id });
  assert.notEqual(cross.thread_id, first.thread_id, "a foreign sender cannot hijack a known thread by Message-ID");
  await db.exec("select set_config('request.jwt.claim.role','authenticated',false)");
  await assert.rejects(() => ingest({ ...initial, message_id: "<forbidden@presspay.example>" }), /service access required/);
  assert.equal((await db.query("select has_function_privilege('authenticated','public.aibot_n8n_ingest_email(jsonb)','EXECUTE') allowed")).rows[0].allowed, false);
  console.log("PASS Postgres INBOX/Sent idempotency, ownership, headers, company association, chronology, terminal state and role fences");
} finally { await db.close(); }
