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
  const claim=`${prefix} select public.claim_offerpsp_telegram_intake_card('${id}');`;
  const sends=(await Promise.all([psql(claim),psql(claim)])).map(JSON.parse);
  assert.deepEqual(sends.map(r=>r.outcome).sort(),['already_reserved','ready']);
  console.log('PASS concurrent delivery claims: only one sender can proceed');
  console.log('VERIFIED isolated PostgreSQL 15; no network, production data or outbound sends');
} finally {
  if(container&&/^[0-9a-f]{64}$/.test(container)){await docker(['stop','--time','2',container]);console.log('Ephemeral test container removed');}
}
