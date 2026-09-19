import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {initializeIntakeFixture,owner,chat} from './intake-actions-test-fixture.mjs';
function docker(args,stdin='') {return new Promise((resolve,reject)=>{
  const p=spawn('docker',args,{stdio:['pipe','pipe','pipe']});let out='',err='';
  const timer=setTimeout(()=>p.kill('SIGTERM'),30000);
  p.stdout.on('data',b=>out+=b);p.stderr.on('data',b=>err+=b);
  p.on('error',e=>{clearTimeout(timer);reject(e);});p.on('close',code=>{clearTimeout(timer);code===0?resolve(out.trim()):reject(new Error(err.slice(-2000)));});
  p.stdin.on('error',()=>{});p.stdin.end(stdin);
});}
let container;
try {
  container=await docker(['run','--pull=never','--rm','-d','--network','none','--tmpfs','/var/lib/postgresql/data','--env','POSTGRES_HOST_AUTH_METHOD=trust','--name',`offerpsp-intake-test-${randomUUID()}`,'postgres:15-alpine']);
  assert.match(container,/^[0-9a-f]{64}$/);
  let ready=false;
  for(let i=0;i<30;i++){try{await docker(['exec',container,'pg_isready','-h','127.0.0.1','-U','postgres']);ready=true;break;}catch{await new Promise(r=>setTimeout(r,200));}}
  assert.ok(ready);
  const psql=sql=>docker(['exec','-i',container,'psql','-h','127.0.0.1','-U','postgres','-qAt','-v','ON_ERROR_STOP=1'],sql);
  await initializeIntakeFixture({exec:psql});
  const prefix=`set "request.jwt.claims"='{"role":"service_role"}';set "request.jwt.claim.role"='service_role';set "test.staff"='true';`;
  const id=randomUUID();
  await psql(`insert into public.offerpsp_leads(lead_id,company,name,work_email) values('${id}','Synthetic','Test','no-action@example.invalid');`);
  const cards=await Promise.all([psql(`${prefix} select public.prepare_offerpsp_telegram_intake_card('${id}');`),psql(`${prefix} select public.prepare_offerpsp_telegram_intake_card('${id}');`)]);
  const a=JSON.parse(cards[0]),b=JSON.parse(cards[1]);assert.equal(a.task.id,b.task.id);assert.deepEqual(a.actions,b.actions);
  assert.equal(await psql('select count(*) from public.offerpsp_tasks;'),'1');
  console.log('PASS concurrent card preparation: one task and one token set');
  const sql=`${prefix} select public.execute_offerpsp_telegram_intake_action('${a.actions.reply_draft}','${chat}','${chat}');`;
  const clicks=(await Promise.all([psql(sql),psql(sql)])).map(JSON.parse);
  assert.ok(clicks.every(r=>r.outcome==='completed'));assert.equal(clicks.filter(r=>r.replayed).length,1);
  assert.equal(clicks[0].draft_id,clicks[1].draft_id);assert.equal(await psql('select count(*) from public.email_drafts;'),'1');
  assert.equal(await psql(`select count(*) from public.offerpsp_lead_activities where activity_type='telegram_intake_action' and actor_user_id='${owner}';`),'1');
  console.log('PASS concurrent callback double-click: one draft and one attributed journal entry');
  const claim=`${prefix} select public.claim_offerpsp_telegram_intake_card_v2('${id}','concurrency_test');`;
  const sends=(await Promise.all([psql(claim),psql(claim)])).map(JSON.parse);
  const sender=sends.find(r=>r.delivery_mode==='send');
  assert.ok(sender);assert.match(sender.content_hash,/^[0-9a-f]{32}$/);
  assert.equal(sends.filter(r=>r.outcome==='already_reserved').length,1);
  console.log('PASS concurrent delivery claims: only one sender can proceed');
  assert.equal(JSON.parse(await psql(`${prefix} select public.complete_offerpsp_telegram_intake_card_v2('${id}','${chat}','321','${sender.content_hash}');`)).outcome,'recorded');
  await psql(`insert into private.offerpsp_compliance_cases(lead_id,case_status,completeness_score,last_screened_at)
    values('${id}','manual_review',55,now())
    on conflict(lead_id) do update set case_status=excluded.case_status,completeness_score=excluded.completeness_score,last_screened_at=excluded.last_screened_at;`);
  const refreshClaim=`${prefix} select public.claim_offerpsp_telegram_intake_card_v2('${id}','screening_completed');`;
  const refreshes=(await Promise.all([psql(refreshClaim),psql(refreshClaim)])).map(JSON.parse);
  const editor=refreshes.find(r=>r.delivery_mode==='edit');
  assert.ok(editor);assert.equal(editor.message_id,'321');assert.equal(editor.revision,2);
  assert.equal(refreshes.filter(r=>r.outcome==='already_reserved').length,1);
  assert.equal(JSON.parse(await psql(`${prefix} select public.complete_offerpsp_telegram_intake_card_refresh('${id}','${chat}','321','${editor.refresh_token}','${editor.content_hash}');`)).revision,2);
  assert.equal(JSON.parse(await psql(`${prefix} select public.claim_offerpsp_telegram_intake_card_v2('${id}','unchanged');`)).outcome,'unchanged');
  console.log('PASS concurrent refresh claims: one in-place edit, one receipt and no unchanged duplicate');
  await psql(`update public.offerpsp_tasks set due_at=now()-interval '2 hours' where lead_id='${id}';`);
  const alertClaims=(await Promise.all([
    psql(`${prefix} select public.claim_offerpsp_stuck_intake_alert();`),
    psql(`${prefix} select public.claim_offerpsp_stuck_intake_alert();`),
  ])).map(JSON.parse);
  const alert=alertClaims.find(row=>row.outcome==='ready');
  assert.ok(alert);assert.equal(alertClaims.filter(row=>row.outcome==='ready').length,1);
  assert.equal(alertClaims.filter(row=>row.outcome==='empty').length,1);
  assert.equal(JSON.parse(await psql(`${prefix} select public.complete_offerpsp_stuck_intake_alert('${id}','${alert.claim_token}','777');`)).outcome,'recorded');
  console.log('PASS concurrent stuck-alert claims: one Telegram sender and one durable receipt');
  console.log('VERIFIED isolated PostgreSQL 15; no network, production data or outbound sends');
} finally {
  if(container&&/^[0-9a-f]{64}$/.test(container)){await docker(['stop','--time','2',container]);console.log('Ephemeral test container removed');}
}
