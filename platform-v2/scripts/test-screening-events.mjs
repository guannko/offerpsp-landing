import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { initializeScreeningFixture } from './screening-test-fixture.mjs';

const sql = (await readFile(new URL('../../supabase/migrations/20260916181143_offerpsp_screening_events.sql', import.meta.url), 'utf8'))
  .replace('create extension if not exists pg_net with schema extensions;', '');
const tickets = await readFile(new URL('../../supabase/migrations/20260916181803_offerpsp_screening_event_tickets.sql', import.meta.url), 'utf8');
const encoding = await readFile(new URL('../../supabase/migrations/20260916182014_offerpsp_screening_ticket_encoding.sql', import.meta.url), 'utf8');
async function fixture() {
  const db = new PGlite();
  await initializeScreeningFixture(db);
  // Transport/vault doubles only. Trigger, RLS/grants, queue, transaction and guards are real SQL.
  await db.exec(`create schema vault; create schema net; create schema extensions;
    create function extensions.hmac(bytea,bytea,text) returns bytea language sql as 'select decode(''deadbeef'',''hex'')';
    create table vault.secrets(id uuid primary key default gen_random_uuid(), secret text, name text);
    create view vault.decrypted_secrets as select id, secret as decrypted_secret from vault.secrets;
    create function vault.create_secret(text,text,text) returns uuid language sql as
      'insert into vault.secrets(secret,name) values($1,$2) returning id';
    create function vault.update_secret(uuid,text) returns void language sql as
      'update vault.secrets set secret=$2 where id=$1';
    create table net.sent(id bigint generated always as identity, url text, body jsonb, headers jsonb);
    create function net.http_post(url text, body jsonb, headers jsonb, timeout_milliseconds integer)
      returns bigint language plpgsql as $$ declare result bigint; begin
      if current_setting('test.network_failure',true)='true' then raise exception 'secret must not reach diagnostics'; end if;
      if headers->>'Authorization' not like 'Bearer %.%.%' then raise exception 'missing auth'; end if;
      insert into net.sent(url,body,headers) values($1,$2,$3) returning id into result; return result; end; $$;`);
  await db.exec(sql);
  await db.exec(tickets);
  await db.exec(encoding);
  return db;
}
async function configure(db) {
  await db.exec("select set_config('request.jwt.claim.role','service_role',false)");
  await db.query('select public.configure_offerpsp_screening_dispatch($1,true)', ['a'.repeat(64)]);
}
async function add(db, status='pending', active=true) {
  const lead=(await db.query("insert into public.offerpsp_leads(lead_id,company,record_state) values(gen_random_uuid(),'Test',$1) returning lead_id", [active?'active':'archived'])).rows[0].lead_id;
  return (await db.query('insert into private.offerpsp_compliance_cases(lead_id,case_status) values($1,$2) returning id',[lead,status])).rows[0].id;
}
async function count(db) { return (await db.query('select count(*)::int n from net.sent')).rows[0].n; }
test('new pending intake wakes once; duplicates, claims and completion do not create an event loop', async()=>{
  const db=await fixture(); try {
    await configure(db); const id=await add(db); assert.equal(await count(db),1);
    await db.query("update private.offerpsp_compliance_cases set case_status='pending' where id=$1",[id]);
    await db.exec('select public.claim_offerpsp_pre_compliance_jobs(1)');
    await db.query("update private.offerpsp_compliance_cases set case_status='manual_review' where id=$1",[id]);
    assert.equal(await count(db),1);
    await db.exec("select set_config('test.staff','true',false)");
    await db.query('select public.queue_offerpsp_pre_compliance_screening(lead_id) from private.offerpsp_compliance_cases where id=$1',[id]);
    await db.query('select public.queue_offerpsp_pre_compliance_screening(lead_id) from private.offerpsp_compliance_cases where id=$1',[id]);
    assert.equal(await count(db),2);
    const bodies=(await db.query('select body from net.sent')).rows;
    assert.deepEqual(bodies.map(r=>r.body), [{event:'screening_ready'},{event:'screening_ready'}]);
    const headers=(await db.query('select headers from net.sent limit 1')).rows[0].headers;
    assert.ok(!JSON.stringify(headers).includes('a'.repeat(64)), 'Signing secret must never leave Vault');
    const claims=JSON.parse(Buffer.from(headers.Authorization.split('.')[1],'base64url'));
    assert.equal(claims.exp-claims.iat,60);
    assert.equal(claims.aud,'offerpsp_screening_wakeup');
  } finally {await db.close();}
});
test('disabled module, archived and human-reviewed records never wake the worker',async()=>{
  const db=await fixture(); try {
    await configure(db); await add(db,'pending',false);
    for(const status of ['manual_review','hold','cleared','rejected','spam']) await add(db,status);
    await db.exec("select set_config('test.module_enabled','false',false)"); await add(db);
    assert.equal(await count(db),0);
  } finally {await db.close();}
});
test('unconfigured/failed dispatch retains the pending intake for recovery without leaking errors',async()=>{
  const db=await fixture(); try {
    await add(db); await configure(db);
    await db.exec("select set_config('test.network_failure','true',false)"); await add(db);
    assert.deepEqual((await db.query('select outcome from private.offerpsp_screening_dispatches order by id')).rows.map(r=>r.outcome),['unconfigured','enqueue_failed']);
    assert.equal((await db.query("select count(*)::int n from private.offerpsp_compliance_cases where case_status='pending'")).rows[0].n,2);
    assert.equal((await db.query("select error_code from private.offerpsp_screening_dispatches where outcome='enqueue_failed'")).rows[0].error_code,'P0001');
  } finally {await db.close();}
});
test('event enqueue rolls back with intake; client roles cannot configure or read dispatch secrets',async()=>{
  const db=await fixture(); try {
    await assert.rejects(db.query('select public.configure_offerpsp_screening_dispatch($1,true)',['a'.repeat(64)]),/service access required/);
    for(const role of ['anon','authenticated']) {
      const row=(await db.query("select has_function_privilege($1,'public.configure_offerpsp_screening_dispatch(text,boolean)','execute') f, has_table_privilege($1,'private.offerpsp_screening_dispatch_config','select') t",[role])).rows[0];
      assert.deepEqual(row,{f:false,t:false});
    }
    await configure(db); await db.exec('begin'); await add(db); assert.equal(await count(db),1);
    await db.exec('rollback'); assert.equal(await count(db),0);
  } finally {await db.close();}
});
