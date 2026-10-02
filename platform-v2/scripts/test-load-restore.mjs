import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {randomUUID,createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {initializeIntakeFixture,chat} from './intake-actions-test-fixture.mjs';

// Synthetic workflow benchmark. No production credentials, ports, network or sends.
const image=process.argv.find(arg=>arg.startsWith('--image='))?.slice(8)||'postgres:15-alpine';
assert.ok(['postgres:15-alpine','public.ecr.aws/supabase/postgres:17.6.1.165'].includes(image),'Only reviewed, already-installed test images are allowed');
const total=120, concurrency=12;
let container;
function docker(args,input='') {
  return new Promise((resolve,reject)=>{
    const p=spawn('docker',args,{stdio:['pipe','pipe','pipe']});
    let out='',err=''; const timer=setTimeout(()=>p.kill('SIGTERM'),45000);
    p.stdout.on('data',b=>out+=b); p.stderr.on('data',b=>err+=b);
    p.stdin.on('error',()=>{});p.stdin.end(input);
    p.on('error',e=>{clearTimeout(timer);reject(e)});
    p.on('close',code=>{clearTimeout(timer);code===0?resolve(out.trim()):reject(new Error(`${args[0]} failed (${code}): ${err.slice(-1000)}`))});
  });
}
const report={scope:'isolated synthetic PostgreSQL fixture; not production capacity or full-cloud DR',image,total,concurrency,started_at:new Date().toISOString(),tests:[]};
try {
  const testPassword=randomUUID();
  container=await docker(['run','--pull=never','-d','--network','none','--env','POSTGRES_HOST_AUTH_METHOD=trust','--env',`POSTGRES_PASSWORD=${testPassword}`,'--name',`offerpsp-load-restore-${randomUUID()}`,image]);
  assert.match(container,/^[0-9a-f]{64}$/);
  const psql=(sql,db='qa_workload')=>docker(['exec','-i','--env',`PGPASSWORD=${testPassword}`,container,'psql','-h','127.0.0.1','-U','postgres','-d',db,'-qAt','-v','ON_ERROR_STOP=1'],sql);
  for(let i=0;i<60;i++){try{await psql('select 1','postgres');break;}catch(e){if(i===59)throw e;await new Promise(r=>setTimeout(r,200))}}
  await psql('create database qa_workload template template0','postgres');
  await initializeIntakeFixture({exec:sql=>psql(sql.replace(/create role (anon|authenticated|service_role);/g,(_,role)=>`DO $$ BEGIN IF NOT EXISTS (select 1 from pg_roles where rolname='${role}') THEN CREATE ROLE ${role}; END IF; END $$;`))});
  report.database_version=await psql('select version()');
  const ids=Array.from({length:total},()=>randomUUID());
  await psql(`insert into public.offerpsp_leads(lead_id,company,name,work_email) values ${ids.map((id,i)=>`('${id}','Synthetic QA ${i}','No action required','qa${i}@example.invalid')`).join(',')};`);
  const prefix=`set "request.jwt.claims"='{"role":"service_role"}';set "request.jwt.claim.role"='service_role';set "test.staff"='true';`;
  let cursor=0;const times=[];const started=performance.now();
  await Promise.all(Array.from({length:concurrency},async()=>{
    while(cursor<ids.length){const id=ids[cursor++],t=performance.now();
      const card=JSON.parse(await psql(`${prefix}select public.prepare_offerpsp_telegram_intake_card('${id}');`));
      const click=JSON.parse(await psql(`${prefix}select public.execute_offerpsp_telegram_intake_action('${card.actions.reply_draft}','${chat}','${chat}');`));
      assert.equal(click.outcome,'completed');
      const replay=JSON.parse(await psql(`${prefix}select public.execute_offerpsp_telegram_intake_action('${card.actions.reply_draft}','${chat}','${chat}');`));
      assert.equal(replay.replayed,true);assert.equal(replay.draft_id,click.draft_id);times.push(performance.now()-t);
    }
  }));
  const duration=performance.now()-started;times.sort((a,b)=>a-b);
  assert.equal(await psql('select count(*) from public.offerpsp_tasks'),String(total));
  assert.equal(await psql('select count(*) from public.email_drafts'),String(total));
  report.tests.push({id:'load-idempotency',status:'PASS',workflows:times.length,errors:0,duration_ms:Math.round(duration),workflows_per_second:Number((total/(duration/1000)).toFixed(2)),p50_ms:Math.round(times[Math.floor(times.length*.5)]),p95_ms:Math.round(times[Math.floor(times.length*.95)]),max_ms:Math.round(times.at(-1)),timing_scope:'3 docker exec sessions per workflow; includes process overhead'});
  const fingerprintSql=`select jsonb_build_object('leads',(select jsonb_agg(to_jsonb(l) order by lead_id) from public.offerpsp_leads l),'tasks',(select jsonb_agg(to_jsonb(t) order by id) from public.offerpsp_tasks t),'drafts',(select jsonb_agg(to_jsonb(d) order by id) from public.email_drafts d),'activities',(select jsonb_agg(to_jsonb(a) order by id) from public.offerpsp_lead_activities a),'tokens',(select jsonb_agg(to_jsonb(t) order by token) from private.offerpsp_telegram_intake_actions t));`;
  const fingerprint=()=>psql(fingerprintSql);
  const before=await fingerprint();const sha=value=>createHash('sha256').update(value).digest('hex');
  const crashStarted=performance.now();
  await docker(['kill','--signal','KILL',container]);
  await docker(['start',container]);
  for(let i=0;i<60;i++){try{await psql('select 1');break;}catch(e){if(i===59)throw e;await new Promise(r=>setTimeout(r,200))}}
  assert.equal(sha(await fingerprint()),sha(before));
  report.tests.push({id:'unclean-postmaster-recovery',status:'PASS',recovery_ms:Math.round(performance.now()-crashStarted),sha256:sha(before)});
  // A real pg_dump/pg_restore round trip, including definitions and sequences.
  const restoreStarted=performance.now();
  await docker(['exec','--env',`PGPASSWORD=${testPassword}`,container,'pg_dump','-h','127.0.0.1','-U','postgres','-Fc','-f','/tmp/offerpsp-qa.dump','qa_workload']);
  await psql('create database restore_qa template template0','postgres');
  await docker(['exec','--env',`PGPASSWORD=${testPassword}`,container,'pg_restore','-h','127.0.0.1','-U','postgres','-d','restore_qa','--exit-on-error','/tmp/offerpsp-qa.dump']);
  const restored=await psql(fingerprintSql,'restore_qa');
  if(sha(restored)!==sha(before)){
    const a=JSON.parse(before),b=JSON.parse(restored);
    console.log(JSON.stringify({restore_differences:Object.keys(a).filter(k=>JSON.stringify(a[k])!==JSON.stringify(b[k])).map(k=>({table:k,before_count:a[k]?.length,after_count:b[k]?.length,first_before:a[k]?.[0],first_after:b[k]?.[0]}))},null,2));
  }
  assert.equal(sha(restored),sha(before));
  const originalToken=JSON.parse(before).tokens.find(t=>t.lead_id===ids[0]&&t.action==='reply_draft').token;
  const restoredReplay=JSON.parse(await psql(`${prefix}select public.execute_offerpsp_telegram_intake_action('${originalToken}','${chat}','${chat}');`,'restore_qa'));
  assert.equal(restoredReplay.replayed,true,JSON.stringify(restoredReplay));
  assert.equal(await psql('select count(*) from public.email_drafts','restore_qa'),String(total));
  report.tests.push({id:'pg-dump-restore',status:'PASS',restore_ms:Math.round(performance.now()-restoreStarted),sha256:sha(before),post_restore_replay:'PASS; no duplicate draft'});
  report.before_sha256=sha(before);
} finally {
  if(container&&/^[0-9a-f]{64}$/.test(container)){
    await docker(['rm','--force','--volumes',container]);
  }
}
console.log(JSON.stringify(report,null,2));
const reportDir=path.resolve('../.private/quality-20261002/load-restore');
await mkdir(reportDir,{recursive:true,mode:0o700});
await writeFile(path.join(reportDir,`${report.started_at.replace(/[:.]/g,'-')}.json`),JSON.stringify(report,null,2),{mode:0o600});
