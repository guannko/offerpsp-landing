import { readFile } from 'node:fs/promises';
import { initializeScreeningFixture } from './screening-test-fixture.mjs';

export const owner='10000000-0000-4000-8000-000000000001';
export const other='10000000-0000-4000-8000-000000000002';
export const chat='12345';
const root=new URL('../../supabase/migrations/',import.meta.url);
const load=name=>readFile(new URL(name,root),'utf8');
function definition(sql,start,end='\n$$;') {
  const from=sql.indexOf(start), to=sql.indexOf(end,from);
  if(from<0||to<0) throw new Error(`Missing fixture source: ${start}`);
  return sql.slice(from,to+end.length);
}
export async function initializeIntakeFixture(db) {
  await initializeScreeningFixture(db);
  const foundation=await load('20260730_offerpsp_platform_foundation.sql');
  await db.exec(definition(foundation,'create table if not exists public.offerpsp_staff_members','\n);'));
  await db.exec(definition(foundation,'create table if not exists public.offerpsp_tasks','\n);'));
  await db.exec(`
    create function auth.jwt() returns jsonb language sql as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
    create function auth.uid() returns uuid language sql as $$ select (auth.jwt()->>'sub')::uuid $$;
    alter table public.offerpsp_leads add assigned_to uuid, add client_user_id uuid;
    alter table public.offerpsp_tasks add entity_type text, add entity_id text;
    create table private.offerpsp_integration_settings(integration_key text primary key,enabled boolean,configuration jsonb);
    create table private.offerpsp_route_matches(id uuid primary key default gen_random_uuid(),lead_id uuid,provider_id uuid,pricing_snapshot jsonb);
    create table private.offerpsp_offer_update_queue(lead_id uuid,status text,updated_at timestamptz,notes text);
    create table public.email_drafts(id bigint generated always as identity,chat_id text not null,lead_internal_id text,to_email text,subject text,body text,status text);
    insert into auth.users values('${owner}'),('${other}');
    insert into public.offerpsp_staff_members(user_id,role) values('${owner}','owner'),('${other}','operator');
    insert into private.offerpsp_integration_settings values('telegram',true,'{"default_chat_id":"${chat}","lead_notifications":true}');
    select set_config('test.staff','true',false);
    select set_config('request.jwt.claim.role','service_role',false);
    select set_config('request.jwt.claims','{"role":"service_role"}',false);
  `);
  const draft=await load('20260803192003_offerpsp_captains_bridge.sql');
  await db.exec(definition(draft,'create or replace function public.create_offerpsp_email_draft'));
  const lifecycle=await load('20260827112000_offerpsp_inactive_lead_queue_cleanup.sql');
  await db.exec(definition(lifecycle,'create or replace function private.offerpsp_cancel_tasks_for_inactive_lead'));
  await db.exec('create trigger cancel_tasks after update of record_state,status on public.offerpsp_leads for each row execute function private.offerpsp_cancel_tasks_for_inactive_lead()');
  await db.exec(await load('20260916185027_offerpsp_intake_operator_tasks.sql'));
  await db.exec(await load('20260916185028_offerpsp_telegram_intake_actions.sql'));
  await db.exec(await load('20260916190145_offerpsp_intake_terminal_guards.sql'));
}
export async function addIntake(db,{status='new',state='active',assignedTo=null}={}) {
  return (await db.query(`insert into public.offerpsp_leads(lead_id,company,name,work_email,company_url,status,record_state,assigned_to)
    values(gen_random_uuid(),'Synthetic No action required','Synthetic','synthetic@example.invalid','https://example.invalid',$1,$2,$3) returning lead_id`,[status,state,assignedTo])).rows[0].lead_id;
}
export async function card(db,id) { return (await db.query('select public.prepare_offerpsp_telegram_intake_card($1) result',[id])).rows[0].result; }
export async function click(db,token,from=chat,to=chat) {
  return (await db.query('select public.execute_offerpsp_telegram_intake_action($1,$2,$3) result',[token,from,to])).rows[0].result;
}
