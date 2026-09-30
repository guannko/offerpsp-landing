import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const db = new PGlite();
const migration = await readFile(new URL('../../supabase/migrations/20260930194640_offerpsp_mail_index_and_thread_reads.sql', import.meta.url), 'utf8');
const thread = '10000000-0000-4000-8000-000000000001';
const other = '10000000-0000-4000-8000-000000000002';
const rpc = async (name, value) => (await db.query(`select public.${name}($1) result`, [value])).rows[0].result;
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema private;
    create function public.is_offerpsp_staff() returns boolean language sql as $$ select current_setting('test.staff')='true' $$;
    select set_config('test.staff','true',false);
    create table public.offerpsp_email_threads(id uuid,subject text,participant_email text,counterparty_type text,counterparty_id text,
      lead_id uuid,status text,unread_count int,assigned_to uuid,last_message_at timestamptz,tags text[],priority text,is_flagged boolean,
      follow_up_at timestamptz,organizer_notes text,ai_summary text,ai_summary_generated_at timestamptz,last_organized_at timestamptz,
      trashed_at timestamptz,trashed_from_status text,metadata jsonb,created_at timestamptz,updated_at timestamptz);
    create table public.offerpsp_email_messages(id uuid,thread_id uuid,direction text,sender_email text,recipient_emails text[],cc_emails text[],
      subject text,text_body text,html_body text,external_message_id text,in_reply_to text,message_references text[],provider text,
      delivery_status text,is_read boolean,source_draft_id bigint,sent_at timestamptz,received_at timestamptz,created_at timestamptz);
    create table public.offerpsp_email_attachments(id uuid,message_id uuid,filename text,content_type text,size_bytes bigint,
      storage_bucket text,storage_path text,extraction_method text,extraction_error text,extracted_text text,provider_id uuid,
      document_type text,document_id uuid,target_entity_type text,target_entity_id uuid,ingestion_job_id uuid,status text,created_at timestamptz);
    create table private.offerpsp_providers(id uuid,brand_name text);
    create table public.offerpsp_leads(lead_id uuid,company text,name text,work_email text);
    create table public.offerpsp_email_templates(id uuid,template_code text,name text,category text,language text,subject_template text,
      body_template text,sort_order int,active boolean);
    insert into public.offerpsp_email_threads(id,subject,status,unread_count,priority,last_message_at) values
      ('${thread}','Partner','open',1,'normal',now()),('${other}','Archive','archived',0,'normal',now()-interval '2 days');
    insert into public.offerpsp_email_messages(id,thread_id,direction,text_body,html_body,created_at,delivery_status,is_read)
      select md5(i::text)::uuid,'${thread}',case when i%2=0 then 'inbound' else 'outbound' end,
        repeat('searchable ',1000)||'full text tail',repeat('<p>complete HTML</p>',5000),now()+i*interval '1 second','sent',true
      from generate_series(1,20) i;
    insert into public.offerpsp_email_messages(id,thread_id,text_body,created_at) values('${other}','${other}','archived evidence',now());
    insert into public.offerpsp_email_attachments(id,message_id,filename,created_at) values('${thread}',md5('20')::uuid,'terms.pdf',now());
  `);
  await db.exec(migration);
  let index = await rpc('get_offerpsp_mail_index', 1);
  assert.equal(index.metrics.threads, 1);
  assert.equal(index.threads.length, 1);
  assert.equal(index.messages.length, 20);
  assert.equal(index.attachments.length, 1, 'limit applies to threads, not the first message');
  assert.ok(index.messages.every(m => m.html_body === null && m.body_loaded === false));
  assert.ok(index.messages.every(m => m.text_body.endsWith('full text tail')), 'text search is not truncated');
  const detail = await rpc('get_offerpsp_mail_thread', thread);
  assert.equal(detail.thread_id, thread);
  assert.equal(detail.messages.length, 20);
  assert.ok(detail.messages.every(m => m.body_loaded && m.html_body === '<p>complete HTML</p>'.repeat(5000)));
  assert.ok(JSON.stringify(index).length < JSON.stringify(detail).length / 5);
  index = await rpc('get_offerpsp_mail_index', 0);
  assert.equal(index.threads.length, 1);
  assert.equal((await rpc('get_offerpsp_mail_index', 500)).threads.length, 2, 'archive remains accessible');
  await assert.rejects(rpc('get_offerpsp_mail_thread', '10000000-0000-4000-8000-000000000099'), /not found/);
  const before = (await db.query('select count(*) n from public.offerpsp_email_messages')).rows[0].n;
  await db.exec("select set_config('test.staff','false',false)");
  await assert.rejects(rpc('get_offerpsp_mail_index', 1), /staff access required/);
  await assert.rejects(rpc('get_offerpsp_mail_thread', thread), /staff access required/);
  for (const fn of ['get_offerpsp_mail_index(integer)', 'get_offerpsp_mail_thread(uuid)']) {
    for (const role of ['anon','authenticated','service_role']) {
      const allowed = (await db.query('select has_function_privilege($1,$2,$3) allowed',[role,'public.'+fn,'EXECUTE'])).rows[0].allowed;
      assert.equal(allowed, role === 'authenticated');
    }
  }
  assert.equal((await db.query('select count(*) n from public.offerpsp_email_messages')).rows[0].n, before);
  console.log('PASS actual staff-only SQL index/detail, full body/search preservation, archive, attachment scope, limits and no message writes');
} finally { await db.close(); }
