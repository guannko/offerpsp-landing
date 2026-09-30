import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { initializeIntakeFixture,addIntake,card,click,owner,other,chat } from './intake-actions-test-fixture.mjs';
async function withDb(fn) {const db=new PGlite(); try {await initializeIntakeFixture(db); await fn(db);} finally {await db.close();}}
const rows=async(db,sql,args=[]) => (await db.query(sql,args)).rows;

test('new intake creates one existing-system task, owner, 24-hour target and one activity',()=>withDb(async db=>{
  const id=await addIntake(db); const a=await card(db,id),b=await card(db,id);
  assert.equal(a.task.id,b.task.id); assert.deepEqual(a.actions,b.actions);
  const [t]=await rows(db,'select * from public.offerpsp_tasks');
  assert.equal(t.assigned_to,owner); assert.equal(t.source,'system');
  assert.equal(await rows(db,'select * from public.offerpsp_tasks').then(r=>r.length),1);
  const [delta]=await rows(db,'select extract(epoch from (t.due_at-l.submitted_at))/3600 hours from public.offerpsp_tasks t join public.offerpsp_leads l using(lead_id)');
  assert.equal(Number(delta.hours),24);
  assert.equal((await rows(db,"select * from public.offerpsp_lead_activities where activity_type='intake_task_created'")).length,1);
}));
test('spam/archived/closed intake does not create tasks or usable cards',()=>withDb(async db=>{
  for(const options of [{status:'spam'},{status:'closed'},{state:'archived'},{status:'won'},{status:'lost'}]) {
    const id=await addIntake(db,options); assert.equal((await card(db,id)).outcome,'inactive');
  }
  assert.equal((await rows(db,'select * from public.offerpsp_tasks')).length,0);
}));
test('won/lost cancel only initial-response work and block new intake callbacks',()=>withDb(async db=>{
  const id=await addIntake(db),c=await card(db,id);
  await db.query("insert into public.offerpsp_tasks(lead_id,title) values($1,'Ongoing account management')",[id]);
  await db.query("update public.offerpsp_leads set status='won' where lead_id=$1",[id]);
  const tasks=await rows(db,'select automation_ref,status from public.offerpsp_tasks');
  assert.equal(tasks.find(t=>t.automation_ref).status,'cancelled');
  assert.equal(tasks.find(t=>!t.automation_ref).status,'pending');
  assert.equal((await click(db,c.actions.reply_draft)).outcome,'inactive');
}));
test('assigned staff preserved; done task and manually changed due date never reset',()=>withDb(async db=>{
  const id=await addIntake(db,{assignedTo:other});
  await db.query("update public.offerpsp_tasks set status='done',due_at='2030-01-01' where lead_id=$1",[id]);
  const c=await card(db,id); assert.equal(c.task.status,'done');
  assert.match(c.task.due_at,/2030-01-01/); assert.equal((await click(db,c.actions.remind)).outcome,'inactive');
  assert.equal((await rows(db,'select assigned_to from public.offerpsp_tasks'))[0].assigned_to,other);
  await assert.rejects(db.query('update public.offerpsp_tasks set lead_id=null where lead_id=$1',[id]),/identity is immutable/);
}));
test('new task rolls back with failed intake; no side effects outlive transaction',()=>withDb(async db=>{
  await db.exec('begin');await addIntake(db);await db.exec('rollback');
  assert.equal((await rows(db,'select * from public.offerpsp_tasks')).length,0);
}));
test('card projection excludes provider, pricing and margin; unknown screening remains unknown',()=>withDb(async db=>{
  const id=await addIntake(db);
  await db.query("insert into private.offerpsp_route_matches(lead_id,provider_id,pricing_snapshot) values($1,gen_random_uuid(),'{\"provider\":\"NEVER_SEND\",\"margin\":999}')",[id]);
  const c=await card(db,id);assert.equal(c.match_count,1);assert.equal(c.screening.completeness,null);
  assert.ok(!JSON.stringify(c).includes('NEVER_SEND'));assert.ok(!JSON.stringify(c).includes('pricing_snapshot'));
}));
test('unauthorized user, wrong private chat, removed staff and wrong scope cannot use a token',()=>withDb(async db=>{
  const id=await addIntake(db),c=await card(db,id);
  for(const [from,to] of [['999',chat],[chat,'-42'],['999','999']]) assert.equal((await click(db,c.actions.reply_draft,from,to)).outcome,'unauthorized');
  await db.exec(`update public.offerpsp_staff_members set active=false where user_id='${owner}'`);
  assert.equal((await click(db,c.actions.reply_draft)).outcome,'unauthorized');
  await db.exec(`update public.offerpsp_staff_members set active=true,role='operator' where user_id='${owner}'`);
  assert.equal((await click(db,c.actions.reply_draft)).outcome,'unauthorized');
  assert.equal((await rows(db,'select * from public.email_drafts')).length,0);
}));
test('draft click is atomic, repeated clicks reuse one draft and one action journal entry',()=>withDb(async db=>{
  const id=await addIntake(db),c=await card(db,id);
  const first=await click(db,c.actions.reply_draft),again=await click(db,c.actions.reply_draft);
  assert.equal(first.outcome,'completed'); assert.equal(first.draft_id,again.draft_id);assert.equal(again.replayed,true);
  const [draft]=await rows(db,'select * from public.email_drafts');assert.equal(draft.status,'draft');
  assert.equal(draft.chat_id,`control-bridge:${owner}`);assert.equal((await rows(db,'select * from public.email_drafts')).length,1);
  assert.equal((await rows(db,"select * from public.offerpsp_lead_activities where activity_type='telegram_intake_action'")).length,1);
  assert.deepEqual((await rows(db,'select auth.jwt() claims'))[0].claims,{role:'service_role'});
}));
test('missing-data draft only uses stored missing list, never invents a checklist',()=>withDb(async db=>{
  const first=await card(db,await addIntake(db));assert.equal((await click(db,first.actions.missing_draft)).outcome,'not_ready');
  const id=await addIntake(db);
  await db.query("insert into private.offerpsp_compliance_cases(lead_id,missing_information) values($1,array['Licence jurisdiction','Monthly volume'])",[id]);
  const c=await card(db,id); assert.equal((await click(db,c.actions.missing_draft)).outcome,'completed');
  const [d]=await rows(db,'select body,status from public.email_drafts');assert.match(d.body,/Licence jurisdiction/);assert.equal(d.status,'draft');
}));
test('archiving cancels task; expired buttons and closed merchants never mutate',()=>withDb(async db=>{
  const id=await addIntake(db),c=await card(db,id);
  await db.query("update private.offerpsp_telegram_intake_actions set expires_at=now()-interval '1 second' where token=$1",[c.actions.reply_draft]);
  assert.equal((await click(db,c.actions.reply_draft)).outcome,'expired');
  await db.query("update public.offerpsp_leads set record_state='archived' where lead_id=$1",[id]);
  assert.equal((await click(db,c.actions.screen)).outcome,'inactive');
  assert.equal((await rows(db,'select status from public.offerpsp_tasks'))[0].status,'cancelled');
}));
test('screening callback reuses protected queue operation and replay never queues twice',()=>withDb(async db=>{
  const id=await addIntake(db),c=await card(db,id);
  await db.query("insert into private.offerpsp_compliance_cases(lead_id,case_status) values($1,'manual_review')",[id]);
  const result=await click(db,c.actions.screen);assert.equal(result.outcome,'completed',JSON.stringify(result));
  assert.equal((await click(db,c.actions.screen)).replayed,true);
  assert.equal((await rows(db,'select * from private.offerpsp_compliance_cases')).length,1);
}));
test('follow-up changes existing task once; double click keeps the same due date',()=>withDb(async db=>{
  const id=await addIntake(db),c=await card(db,id);
  const a=await click(db,c.actions.remind),b=await click(db,c.actions.remind);
  assert.equal(a.outcome,'completed');assert.equal(a.due_at,b.due_at);assert.equal(b.replayed,true);
  assert.equal((await rows(db,'select * from public.offerpsp_tasks')).length,1);
}));
test('client roles cannot call RPCs or read tokens/bindings; service body checks also fail closed',()=>withDb(async db=>{
  for(const role of ['anon','authenticated']) {
    const [p]=await rows(db,`select has_function_privilege($1,'public.execute_offerpsp_telegram_intake_action(uuid,text,text)','execute') f,
      has_function_privilege($1,'public.claim_offerpsp_telegram_intake_card_v2(uuid,text)','execute') c,
      has_function_privilege($1,'public.complete_offerpsp_telegram_intake_card_refresh(uuid,text,text,uuid,text)','execute') r,
      has_function_privilege($1,'public.claim_offerpsp_stuck_intake_alert()','execute') a,
      has_function_privilege($1,'public.complete_offerpsp_stuck_intake_alert(uuid,uuid,text)','execute') x,
      has_table_privilege($1,'private.offerpsp_telegram_intake_actions','select') t,
      has_table_privilege($1,'private.offerpsp_stuck_intake_alerts','select') s`,[role]);
    assert.deepEqual(p,{f:false,c:false,r:false,a:false,x:false,t:false,s:false});
  }
  await db.exec("select set_config('request.jwt.claims','{\"role\":\"authenticated\"}',false)");
  await assert.rejects(db.query('select public.authorize_offerpsp_telegram_operator($1,$1)',[chat]),/Transport service/);
}));
test('notification retry never sends another card; receipt records once and rejects conflicting message',()=>withDb(async db=>{
  const id=await addIntake(db);
  const claim=async()=> (await rows(db,'select public.claim_offerpsp_telegram_intake_card($1) r',[id]))[0].r;
  assert.equal((await claim()).outcome,'ready');assert.equal((await claim()).outcome,'already_reserved');
  const complete=async(mid)=> (await rows(db,'select public.complete_offerpsp_telegram_intake_card($1,$2,$3) r',[id,chat,mid]))[0].r;
  assert.equal((await complete('321')).outcome,'recorded');assert.equal((await complete('321')).outcome,'already_recorded');
  await assert.rejects(complete('322'),/Conflicting delivery/);
  assert.equal((await rows(db,"select * from public.offerpsp_lead_activities where activity_type='telegram_intake_card_sent'")).length,1);
}));
test('live card sends once, edits the same Telegram message and skips unchanged state',()=>withDb(async db=>{
  const id=await addIntake(db);
  const claim=async(reason='test')=>(await rows(db,'select public.claim_offerpsp_telegram_intake_card_v2($1,$2) r',[id,reason]))[0].r;
  const initial=await claim('initial');
  assert.equal(initial.delivery_mode,'send');assert.match(initial.content_hash,/^[0-9a-f]{32}$/);
  assert.equal((await claim('duplicate')).outcome,'already_reserved');
  const sent=(await rows(db,'select public.complete_offerpsp_telegram_intake_card_v2($1,$2,$3,$4) r',[id,chat,'321',initial.content_hash]))[0].r;
  assert.deepEqual(sent,{outcome:'recorded',revision:1});
  assert.equal((await claim('unchanged')).outcome,'unchanged');

  await db.query("insert into private.offerpsp_compliance_cases(lead_id,case_status,completeness_score,risk_level,last_screened_at,missing_information) values($1,'manual_review',55,'unknown',now(),array['Website'])",[id]);
  await db.query("insert into private.offerpsp_intake_auto_replies(lead_id,source_hash,reply_class,status,reason_code) values($1,'fixture','acknowledgement','review_required','missing_verified_domain')",[id]);
  const refresh=await claim('screening_completed');
  assert.equal(refresh.delivery_mode,'edit');assert.equal(refresh.message_id,'321');assert.equal(refresh.revision,2);
  assert.match(refresh.refresh_token,/^[0-9a-f-]{36}$/);assert.equal(refresh.auto_reply.status,'review_required');
  const duplicate=await claim('same_state');assert.equal(duplicate.outcome,'already_reserved');
  const completed=(await rows(db,'select public.complete_offerpsp_telegram_intake_card_refresh($1,$2,$3,$4,$5) r',[id,chat,'321',refresh.refresh_token,refresh.content_hash]))[0].r;
  assert.deepEqual(completed,{outcome:'recorded',revision:2});
  assert.equal((await claim('unchanged_after_edit')).outcome,'unchanged');
  const [delivery]=await rows(db,'select status,message_id,revision,refresh_status from private.offerpsp_telegram_intake_deliveries where lead_id=$1',[id]);
  assert.deepEqual(delivery,{status:'sent',message_id:'321',revision:2,refresh_status:'idle'});
  assert.equal((await rows(db,"select * from public.offerpsp_lead_activities where activity_type='telegram_intake_card_sent'")).length,1);
  assert.equal((await rows(db,"select * from public.offerpsp_lead_activities where activity_type='telegram_intake_card_refreshed'")).length,1);
}));
test('stuck-intake alerts claim once, record a durable receipt and resolve when work clears',()=>withDb(async db=>{
  const id=await addIntake(db);
  await db.query("update public.offerpsp_tasks set due_at=now()-interval '2 hours' where lead_id=$1",[id]);
  const claim=async()=> (await rows(db,'select public.claim_offerpsp_stuck_intake_alert() r'))[0].r;
  const first=await claim();
  assert.equal(first.outcome,'ready');assert.equal(first.alert_kind,'task_overdue');assert.equal(first.lead_id,id);
  assert.equal((await claim()).outcome,'empty');
  const complete=(await rows(db,'select public.complete_offerpsp_stuck_intake_alert($1,$2,$3) r',[id,first.claim_token,'777']))[0].r;
  assert.deepEqual(complete,{outcome:'recorded',lead_id:id,notification_count:1});
  assert.equal((await claim()).outcome,'empty');
  assert.equal((await rows(db,"select * from public.offerpsp_lead_activities where activity_type='stuck_intake_alert_sent'")).length,1);

  await db.query("update public.offerpsp_tasks set status='done',completed_at=now() where lead_id=$1",[id]);
  assert.equal((await claim()).outcome,'empty');
  assert.equal((await rows(db,'select status from private.offerpsp_stuck_intake_alerts where lead_id=$1',[id]))[0].status,'resolved');
}));
test('used button receipt survives refresh while the updated card receives a fresh token',()=>withDb(async db=>{
  const id=await addIntake(db),before=await card(db,id),oldToken=before.actions.reply_draft;
  const first=await click(db,oldToken);assert.equal(first.outcome,'completed');
  const after=await card(db,id),newToken=after.actions.reply_draft;
  assert.notEqual(newToken,oldToken);
  const replay=await click(db,oldToken);assert.equal(replay.replayed,true);assert.equal(replay.draft_id,first.draft_id);
  const fresh=await click(db,newToken);assert.equal(fresh.outcome,'completed');
  assert.equal((await rows(db,'select * from public.email_drafts')).length,2);
  assert.equal((await rows(db,"select * from private.offerpsp_telegram_intake_actions where lead_id=$1 and action='reply_draft'",[id])).length,2);
  assert.equal((await rows(db,"select * from private.offerpsp_telegram_intake_actions where lead_id=$1 and action='reply_draft' and active",[id])).length,0);
}));
test('failed draft operation rolls back partial state, restores identity and stores a redacted failure receipt',()=>withDb(async db=>{
  const id=await addIntake(db),c=await card(db,id);
  await db.exec(`create or replace function public.create_offerpsp_email_draft(p_lead_id uuid,p_to_email text,p_subject text,p_body text)
    returns jsonb language plpgsql as $$ begin
      insert into public.email_drafts(chat_id,to_email,subject,body,status) values('synthetic',$2,$3,$4,'draft');
      raise exception 'PRIVATE_ERROR_CONTENT';
    end; $$;`);
  const a=await click(db,c.actions.reply_draft),b=await click(db,c.actions.reply_draft);
  assert.equal(a.outcome,'failed');assert.equal(a.error_code,'P0001');assert.equal(b.replayed,true);
  assert.ok(!JSON.stringify(a).includes('PRIVATE_ERROR_CONTENT'));
  assert.equal((await rows(db,'select * from public.email_drafts')).length,0);
  assert.deepEqual((await rows(db,'select auth.jwt() claims'))[0].claims,{role:'service_role'});
}));
