import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { calendarDay, calendarLayer, calendarWindow, calendarEventLabel, mergeCalendarPages } from '../src/lib/calendarEvents.ts';

process.env.TZ = 'Asia/Nicosia';
const migration = await readFile(new URL('../../supabase/migrations/20261001215049_offerpsp_calendar_events.sql', import.meta.url), 'utf8');
const identityMigration = await readFile(new URL('../../supabase/migrations/20261001220320_offerpsp_calendar_task_identity_types.sql', import.meta.url), 'utf8');
const hygiene = await readFile(new URL('../../supabase/migrations/20260927090000_offerpsp_operational_qa_and_mail_hygiene.sql', import.meta.url), 'utf8');
const classifier = hygiene.match(/create or replace function private\.offerpsp_mail_non_operational_reason\([\s\S]*?\$\$;/)[0];
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const staff = id(1), merchant = id(100), qa = id(101), provider = id(200), qaProvider = id(201);
let db;
async function setup() {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema private; create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.sub',true),'')::uuid $$;
    create function public.is_offerpsp_staff() returns boolean language sql stable as $$ select auth.uid()='${staff}'::uuid $$;
    create table public.offerpsp_leads(lead_id uuid primary key, company text, name text, work_email text, company_url text);
    create function private.offerpsp_is_qa_lead(p public.offerpsp_leads) returns boolean language sql stable as $$ select p.company='PaySiski' or p.work_email like '%.invalid' $$;
    create table private.offerpsp_providers(id uuid primary key, legacy_psp_id integer, brand_name text, legal_name text, internal_code text, website text);
    create table public.offerpsp_email_threads(id uuid primary key,subject text,participant_email text,counterparty_type text,counterparty_id text,lead_id uuid,status text,metadata jsonb default '{}',tags text[] default '{}',follow_up_at timestamptz);
    create table public.offerpsp_email_messages(id uuid primary key,thread_id uuid,direction text,sender_email text,recipient_emails text[],subject text,external_message_id text,in_reply_to text,message_references text[],delivery_status text,sent_at timestamptz,received_at timestamptz,created_at timestamptz);
    create table public.offerpsp_tasks(id uuid primary key,lead_id uuid,entity_type text,entity_id text,title text,details text,automation_ref text,metadata jsonb default '{}',status text,due_at timestamptz,completed_at timestamptz);
    create table public.offerpsp_shortlists(id uuid primary key,lead_id uuid,title text,status text,version integer,shared_at timestamptz);
    create table public.offerpsp_shortlist_items(id uuid primary key,shortlist_id uuid,public_code text,client_snapshot jsonb,rank integer);
    create table private.offerpsp_contact_events(id uuid primary key,entity_type text,entity_id text,event_type text,occurred_at timestamptz,title text,summary text,result_status text);
    insert into public.offerpsp_leads values ('${merchant}','Real Company','Employee','real@example.com','https://example.com'),('${qa}','OfferPSP Intake E2E','QA','hello@qa.invalid','https://qa.invalid');
    insert into private.offerpsp_providers values ('${provider}',10,'MerchantPayd',null,null,null),('${qaProvider}',11,'PaySiski',null,null,null);`);
  await db.exec(classifier); await db.exec(migration); await db.exec(identityMigration);
  await db.query("select set_config('request.jwt.sub',$1,false)", [staff]);
}
async function thread(n, overrides = {}) {
  const row = { subject: 'Payment conditions', participant_email: 'danil@example.com', counterparty_type: 'merchant', counterparty_id: merchant, lead_id: merchant, status: 'open', metadata: {}, tags: [], follow_up_at: null, ...overrides };
  await db.query('insert into public.offerpsp_email_threads values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', [id(n), row.subject, row.participant_email, row.counterparty_type, row.counterparty_id, row.lead_id, row.status, JSON.stringify(row.metadata), row.tags, row.follow_up_at]);
}
async function message(n, threadId, overrides = {}) {
  const row = { direction: 'outbound', sender_email: 'bizdev@offerpsp.com', recipient_emails: ['danil@example.com'], subject: 'Conditions', external_message_id: `message-${n}`, in_reply_to: null, message_references: [], delivery_status: 'sent', sent_at: '2026-10-01T08:00:00Z', received_at: null, created_at: '2026-10-02T19:00:00Z', ...overrides };
  await db.query('insert into public.offerpsp_email_messages values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)', [id(n), id(threadId), row.direction, row.sender_email, row.recipient_emails, row.subject, row.external_message_id, row.in_reply_to, row.message_references, row.delivery_status, row.sent_at, row.received_at, row.created_at]);
}
async function task(n, overrides = {}) {
  const row = { lead_id: merchant, entity_type: null, entity_id: null, title: 'Review conditions', details: null, automation_ref: null, metadata: {}, status: 'pending', due_at: '2026-10-01T09:00:00Z', completed_at: null, ...overrides };
  await db.query('insert into public.offerpsp_tasks values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)', [id(n), row.lead_id, row.entity_type, row.entity_id, row.title, row.details, row.automation_ref, JSON.stringify(row.metadata), row.status, row.due_at, row.completed_at]);
}
const read = async (start = '2026-10-01T00:00:00Z', end = '2026-10-03T00:00:00Z', offset = 0, limit = 200) => (await db.query('select public.get_offerpsp_calendar_events($1,$2,$3,$4) result', [start,end,offset,limit])).rows[0].result;

test('Bыло / сейчас / будет follow local midnight; next-day plans become today, facts become history', () => {
  const evening = new Date('2026-10-01T20:59:59Z'); // 23:59 Cyprus
  const midnight = new Date('2026-10-01T21:00:00Z');
  assert.equal(calendarLayer('2026-10-01T08:00:00Z', evening), 'now');
  assert.equal(calendarLayer('2026-10-01T08:00:00Z', midnight), 'past');
  assert.equal(calendarLayer('2026-10-02T08:00:00Z', evening), 'future');
  assert.equal(calendarLayer('2026-10-02T08:00:00Z', midnight), 'now');
  assert.equal(calendarLayer('invalid', evening), null);
  assert.equal(calendarDay(midnight).key, '2026-10-02');
  const dst = calendarDay(new Date('2026-03-29T10:00:00Z'));
  assert.equal(dst.end - dst.start, 23 * 3600000);
  assert.deepEqual(calendarWindow(new Date('2026-10-01'), new Date('2026-11-01'), 'now', midnight), { start: '2026-10-01T21:00:00.000Z', end: '2026-10-02T21:00:00.000Z' });
  assert.equal(calendarWindow(new Date('2026-11-01'), new Date('2026-12-01'), 'past', midnight), null);
});

test('actual journals, timestamps, replies, QA isolation, plans and staff boundary (real Postgres)', async () => {
  await setup();
  try {
    await thread(300, { follow_up_at: '2026-10-02T10:00:00Z' });
    await thread(301, { participant_email: 'bizdev@offerpsp.com' });
    await thread(302, { metadata: { operational_visibility: 'excluded' } });
    await thread(303, { status: 'archived', participant_email: 'john@example.com' });
    await thread(304, { status: 'trashed' }); await thread(305, { tags: ['system:spam'] });
    await thread(306, { lead_id: qa }); await thread(307, { participant_email: 'spark@readdle.com' });
    await message(400, 300);
    await message(401, 300, { direction: 'inbound', delivery_status: 'received', sent_at: null, received_at: '2026-10-01T10:00:00Z', in_reply_to: 'message-400' });
    await message(402, 300, { sent_at: '2026-10-01T11:00:00Z', message_references: ['message-401'] });
    await message(403, 300, { delivery_status: 'draft' }); await message(404, 300, { sent_at: null });
    await message(405, 303); await message(406, 304); await message(407, 301); await message(408, 302);
    await message(409, 305); await message(410, 306); await message(411, 307);
    await message(412, 300, { delivery_status: 'cancelled' });
    await message(413, 300, { sent_at: '2030-10-01T10:00:00Z' });
    await task(500, { status: 'done', due_at: '2026-09-01T00:00:00Z', completed_at: '2026-10-01T10:45:00Z' });
    await task(501, { status: 'done' }); await task(502, { status: 'cancelled' });
    await task(503); await task(504, { due_at: '2026-10-02T10:00:00Z' });
    await task(505, { lead_id: qa }); await task(506, { metadata: { qa_fixture_suppressed: true } });
    await task(507, { lead_id: null, entity_type: 'provider', entity_id: qaProvider });
    await task(508, { lead_id: null, title: 'OfferPSP Intake E2E — NO ACTION REQUIRED' });
    await task(509, { due_at: '2026-09-30T10:00:00Z' });
    await db.exec(`insert into public.offerpsp_shortlists values
      ('${id(600)}','${merchant}','Options','shared',1,'2026-10-01T12:00:00Z'),
      ('${id(601)}','${merchant}','Old shared options','archived',2,'2026-10-01T13:00:00Z'),
      ('${id(602)}','${merchant}','Draft','draft',3,null),
      ('${id(603)}','${qa}','QA options','shared',1,'2026-10-01T12:00:00Z');
      insert into public.offerpsp_shortlist_items values ('${id(610)}','${id(600)}','OP-CLIENT','{"title":"USA CashApp","source_rate":1}',1);
      insert into private.offerpsp_contact_events values
        ('${id(700)}','merchant','${merchant}','lead_submitted','2026-10-01T07:00:00Z','New request',null,null),
        ('${id(701)}','merchant','${merchant}','email_sent','2026-10-01T08:00:00Z','Ledger email copy',null,null),
        ('${id(702)}','merchant','${merchant}','task_done','2026-10-01T10:45:00Z','Ledger task copy',null,null),
        ('${id(703)}','merchant','${qa}','lead_submitted','2026-10-01T07:00:00Z','QA request',null,null);`);
    const result = await read();
    assert.equal(result.has_more, false);
    assert.deepEqual(result.events.map((e) => e.id).sort(), ['mail:400','mail:401','mail:402','mail:405','task-done:500','task-plan:503','task-plan:504','follow-up:300','shortlist:600','shortlist:601','activity:700'].map((label) => `${label.split(':')[0]}:${id(Number(label.split(':')[1]))}`).sort());
    const mail = result.events.find((e) => e.id === `mail:${id(400)}`);
    assert.equal(new Date(mail.occurred_at).toISOString(), '2026-10-01T08:00:00.000Z');
    assert.equal(calendarEventLabel(mail), 'Мы написали');
    assert.equal(calendarEventLabel(result.events.find((e) => e.id === `mail:${id(401)}`)), 'Нам ответили');
    assert.equal(calendarEventLabel(result.events.find((e) => e.id === `mail:${id(402)}`)), 'Мы ответили');
    assert.equal(new Date(result.events.find((e) => e.kind === 'task_done').occurred_at).toISOString(), '2026-10-01T10:45:00.000Z');
    const offers = result.events.find((e) => e.id === `shortlist:${id(600)}`);
    assert.match(offers.detail, /не подтверждение/); assert.equal(offers.nature, 'fact');
    assert.deepEqual(offers.evidence.options, [{ code: 'OP-CLIENT', title: 'USA CashApp' }]);
    assert.equal(JSON.stringify(result).includes('source_rate'), false);
    assert.equal(result.events.filter((e) => e.nature === 'plan').length, 3);
    const yesterday = await read('2026-09-30T00:00:00Z','2026-10-01T00:00:00Z');
    assert.equal(yesterday.events[0].kind, 'task_due'); assert.equal(yesterday.events[0].nature, 'plan');
    const pages = []; let offset = 0;
    do { const page = await read(undefined,undefined,offset,2); pages.push(...page.events); offset = page.next_offset; if (!page.has_more) break; } while (offset < 100);
    assert.deepEqual(pages, result.events); assert.equal(new Set(pages.map((e) => e.id)).size, pages.length);
    assert.equal(mergeCalendarPages(pages, pages).length, pages.length);
    for (const [start,end,offset] of [[null,'2026-10-03',0],['2026-10-03','2026-10-01',0],['2026-01-01','2026-12-31',0],['2026-10-01','2026-10-03',-1],['2026-10-01','2026-10-03',10001],['infinity','infinity',0]]) await assert.rejects(read(start,end,offset), /Invalid calendar/);
    for (const sub of ['', id(2)]) { await db.query("select set_config('request.jwt.sub',$1,false)", [sub]); await assert.rejects(read(), /staff access required/); }
    await db.query("select set_config('request.jwt.sub',$1,false)", [staff]);
    for (const role of ['anon','service_role']) assert.equal((await db.query("select has_function_privilege($1,'public.get_offerpsp_calendar_events(timestamptz,timestamptz,integer,integer)','EXECUTE') allowed",[role])).rows[0].allowed,false);
    assert.equal((await db.query("select has_function_privilege('authenticated','public.get_offerpsp_calendar_events(timestamptz,timestamptz,integer,integer)','EXECUTE') allowed")).rows[0].allowed,true);
    const before = (await db.query('select count(*)::int n from public.offerpsp_tasks')).rows[0].n;
    await read(); assert.equal((await db.query('select count(*)::int n from public.offerpsp_tasks')).rows[0].n, before);
    assert.match(migration, /auth\.uid\(\) is null or not public\.is_offerpsp_staff\(\)/);
    assert.match(migration, /security definer set search_path = ''/);
  } finally { await db.close(); }
});
