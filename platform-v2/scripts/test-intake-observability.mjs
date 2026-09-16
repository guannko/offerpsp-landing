import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {initializeIntakeFixture,addIntake,card,click,owner} from './intake-actions-test-fixture.mjs';
import {intakeSteps} from '../src/lib/intakeObservability.ts';
const sql=await readFile(new URL('../../supabase/migrations/20260916194807_offerpsp_intake_observability.sql',import.meta.url),'utf8');
async function fixture(fn){const db=new PGlite();try{await initializeIntakeFixture(db);await db.exec(sql);await fn(db);}finally{await db.close();}}
const snapshot=async(db,id)=>(await db.query('select public.get_offerpsp_intake_observability($1) result',[id])).rows[0].result;
const auth=async db=>db.exec(`select set_config('request.jwt.claims','{"role":"authenticated","sub":"${owner}"}',false)`);
test('journal denies anonymous, authenticated nonstaff and revoked staff; grants are narrow',()=>fixture(async db=>{
  const id=await addIntake(db);
  await assert.rejects(snapshot(db,id),/Active staff/);
  await db.exec(`select set_config('request.jwt.claims','{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000999"}',false)`);
  await assert.rejects(snapshot(db,id),/Active staff/);
  await auth(db);assert.equal((await snapshot(db,id)).lead.id,id);
  await db.exec(`update public.offerpsp_staff_members set active=false where user_id='${owner}'`);
  await assert.rejects(snapshot(db,id),/Active staff/);
  const grants=(await db.query("select has_function_privilege('anon','public.get_offerpsp_intake_observability(uuid)','execute') anon,has_function_privilege('service_role','public.get_offerpsp_intake_observability(uuid)','execute') service")).rows[0];
  assert.equal(grants.anon,false);assert.equal(grants.service,false);
}));
test('read-only evidence projection excludes tokens and never invents successful processing',()=>fixture(async db=>{
  const id=await addIntake(db),c=await card(db,id);await auth(db);
  const before=(await db.query('select count(*) n from public.offerpsp_lead_activities')).rows[0].n;
  const s=await snapshot(db,id);const steps=intakeSteps(s);
  assert.equal(steps.find(x=>x.key==='screening').state,'unknown');
  assert.equal(steps.find(x=>x.key==='matching').state,'unknown');
  assert.equal(steps.find(x=>x.key==='callbacks').state,'unknown');
  assert.equal(steps.find(x=>x.key==='email').state,'unknown');
  assert(!JSON.stringify(s).includes(c.actions.reply_draft));assert(!JSON.stringify(s).includes('chat_id'));
  assert.equal((await db.query('select count(*) n from public.offerpsp_lead_activities')).rows[0].n,before);
}));
test('draft receipt is visible once but is not email delivery; uncertain Telegram and lease expiry need attention',()=>fixture(async db=>{
  const id=await addIntake(db),c=await card(db,id);await click(db,c.actions.reply_draft);await click(db,c.actions.reply_draft);
  await db.query("insert into private.offerpsp_telegram_intake_deliveries(lead_id,chat_id,status,reserved_at) values($1,'12345','reserved',now()-interval '10 minutes')",[id]);
  await db.query("insert into private.offerpsp_compliance_cases(lead_id,case_status,screening_lease_until) values($1,'screening',now()-interval '1 minute')",[id]);
  await auth(db);const s=await snapshot(db,id),steps=intakeSteps(s);
  assert.equal(s.actions.length,1);assert.equal(s.actions[0].outcome,'completed');
  assert.equal(steps.find(x=>x.key==='email').state,'unknown');
  assert.equal(steps.find(x=>x.key==='telegram').state,'attention');
  assert.equal(steps.find(x=>x.key==='screening').state,'attention');
  assert.equal(steps.find(x=>x.key==='callbacks').state,'done');
}));
test('event history is bounded and unknown lead fails explicitly',()=>fixture(async db=>{
  const id=await addIntake(db);await auth(db);
  await db.query("insert into public.offerpsp_lead_activities(lead_id,actor_type,activity_type,title) select $1,'system','test','Synthetic' from generate_series(1,110)",[id]);
  const s=await snapshot(db,id);assert.equal(s.events.length,100);assert(s.event_count>100);
  await assert.rejects(snapshot(db,'00000000-0000-4000-8000-000000000000'),/not found/);
}));
