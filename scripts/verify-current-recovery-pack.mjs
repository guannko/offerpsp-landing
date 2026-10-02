import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir,mkdtemp,stat} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// Runs only against a newly-created container with no network and no published ports.
process.umask(0o077);
const pack=process.argv[2];
const root='/Users/borisboris/diskD/N8N/AIBot/offerpsp-landing/.private/recovery-packs/';
assert.ok(pack?.startsWith(root)&&path.dirname(pack)===root.slice(0,-1));
const exported=JSON.parse(await readFile(path.join(pack,'export-report.json'),'utf8'));
assert.equal(exported.project_ref,'iceopurxqzqmwtcmwfzl');
assert.match(exported.status,/^EXPORTED/);
const proof=await mkdtemp(path.join(pack,'restore-proof-'));
const servicesRequested=process.argv.includes('--check-services');
const report={started_at:new Date().toISOString(),status:'IN_PROGRESS',scope:servicesRequested?'Logical PostgreSQL and local Storage restore with bounded isolated Auth/REST/Storage runtime checks; not hosted failover or external-integration recovery':'Logical PostgreSQL restore and local Storage byte verification; not a live Supabase service-stack restore',network:'none',published_ports:0,cron_enabled:false,production_mutations:false,steps:[]};
let container;
async function save(){await writeFile(path.join(proof,'report.json'),JSON.stringify(report,null,2),{mode:0o600});}
async function docker(args,input='',label='docker'){
  const p=spawn('docker',args,{stdio:['pipe','pipe','pipe']});const out=[],err=[];
  p.stdout.on('data',b=>out.push(b));p.stderr.on('data',b=>err.push(b));p.stdin.on('error',()=>{});p.stdin.end(input);
  const timer=setTimeout(()=>p.kill('SIGTERM'),180000);
  const code=await new Promise((resolve,reject)=>{p.on('error',reject);p.on('close',resolve)});clearTimeout(timer);
  if(err.length)await writeFile(path.join(proof,`${label}-stderr.txt`),Buffer.concat(err),{mode:0o600});
  if(code!==0)throw new Error(`${label} failed (${code}); diagnostic saved privately`);
  return Buffer.concat(out);
}
const sha=b=>createHash('sha256').update(b).digest('hex');
try{
  await save();
  for(const f of exported.steps){const b=await readFile(path.join(pack,f.file));assert.equal(b.length,f.bytes);assert.equal(sha(b),f.sha256);}
  report.steps.push({id:'dump-receipt-integrity',status:'PASS'});await save();
  const preload=servicesRequested?'pg_cron,pg_net,pgsodium':'pg_cron,pg_net';
  container=(await docker(['run','--pull=never','-d','--network','none','--env','POSTGRES_HOST_AUTH_METHOD=trust','--env',`POSTGRES_PASSWORD=${randomUUID()}`,'--mount',`type=bind,source=${pack},target=/recovery,readonly`,'--name',`offerpsp-current-restore-${randomUUID()}`,exported.image,'postgres','-c',`shared_preload_libraries=${preload}`,...(servicesRequested?['-c','pgsodium.getkey_script=/usr/share/postgresql/extension/pgsodium_getkey']:[]),'-c','cron.launch_active_jobs=off','-c','pg_net.database_name=template1'],'','start')).toString().trim();
  assert.match(container,/^[0-9a-f]{64}$/);
  const psql=(sql,db='postgres',user='postgres')=>docker(['exec','-i',container,'psql','-h','127.0.0.1','-U',user,'-d',db,'-XqAt','-v','ON_ERROR_STOP=1'],sql,'sql');
  for(let i=0;i<100;i++){try{await psql('select 1');break;}catch(e){if(i===99)throw e;await new Promise(r=>setTimeout(r,200));}}
  await psql('CREATE ROLE recovery_operator SUPERUSER LOGIN;','postgres','supabase_admin');
  // Preserve production role definitions without conflicting with image bootstrap roles.
  const roles=(await readFile(path.join(pack,'roles.sql'),'utf8')).replace(/^CREATE ROLE (.+);$/gm,(_,r)=>`DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname=${"'"+r.replace(/^"|"$/g,'').replaceAll("'","''")+"'"}) THEN CREATE ROLE ${r}; END IF; END $$;`);
  await psql(roles,'postgres','recovery_operator');
  await psql('DROP DATABASE postgres WITH (FORCE);','template1','recovery_operator');
  await psql('CREATE DATABASE postgres OWNER postgres TEMPLATE template0;','template1','recovery_operator');
  const inspected=JSON.parse((await docker(['inspect','--format','{{json .HostConfig}}',container],'','isolation')).toString());
  assert.equal(inspected.NetworkMode,'none');assert.ok(!inspected.PortBindings||Object.keys(inspected.PortBindings).length===0);
  assert.equal((await psql('show cron.launch_active_jobs;','postgres','recovery_operator')).toString().trim(),'off');
  assert.equal((await psql('show pg_net.database_name;','postgres','recovery_operator')).toString().trim(),'template1');
  assert.equal((await psql("select count(*) from pg_extension where extname='pg_net';",'template1','recovery_operator')).toString().trim(),'0');
  await docker(['exec',container,'pg_restore','-h','127.0.0.1','-U','recovery_operator','-d','postgres','--exit-on-error','--single-transaction','/recovery/database.dump'],'','restore');
  report.steps.push({id:'logical-database-restore',status:'PASS',exit_on_error:true,single_transaction:true});await save();
  const inventory=await psql(`SELECT jsonb_build_object('tables',(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind IN ('r','p') AND n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema'),'functions',(SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'),'policies',(SELECT count(*) FROM pg_policy),'extensions',(SELECT jsonb_agg(jsonb_build_object('name',extname,'version',extversion) ORDER BY extname) FROM pg_extension));`,'postgres','recovery_operator');
  const inv=JSON.parse(inventory.toString());assert.equal(inv.tables,exported.inventory.tables);
  assert.deepEqual(inv.extensions,exported.inventory.extensions);
  await writeFile(path.join(proof,'restored-inventory.json'),inventory,{mode:0o600});report.inventory=inv;
  // Compare every archived COPY row with restored COPY output; never print row contents.
  const archived=(await docker(['exec',container,'pg_restore','--data-only','--file=-','/recovery/database.dump'],'','archive-data')).toString('utf8');
  const blocks=[];let block;
  for(const line of archived.split('\n')){
    if(block){if(line==='\\.'){blocks.push(block);block=undefined;}else block.rows.push(line);}
    else {const m=line.match(/^COPY (.+) FROM stdin;$/);if(m)block={target:m[1],rows:[]};}
  }
  assert.ok(blocks.length>0);assert.equal(block,undefined);
  const tableNames=JSON.parse((await psql("SELECT jsonb_agg(format('%I.%I',n.nspname,c.relname) ORDER BY n.nspname,c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind IN ('r','p') AND n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema';",'postgres','recovery_operator')).toString());
  report.tables_without_archived_copy=tableNames.filter(t=>!blocks.some(b=>b.target.startsWith(`${t} (`)));
  let rows=0;
  for(const b of blocks){
    const output=(await psql(`SET DateStyle='ISO'; SET IntervalStyle='postgres'; SET timezone='UTC'; SET search_path=''; SET extra_float_digits=3; COPY ${b.target} TO STDOUT;`,'postgres','recovery_operator')).toString('utf8');
    const lines=output===''?[]:output.replace(/\n$/,'').split('\n');
    assert.equal(lines.length,b.rows.length,`Row count differs for ${b.target}`);
    assert.equal(sha(lines.sort().join('\n')),sha(b.rows.sort().join('\n')),`Row contents differ for ${b.target}`);
    rows+=lines.length;
  }
  report.steps.push({id:'all-archived-copy-rows-sha256',status:'PASS',tables:blocks.length,rows,comparison:'order-independent row multiset; exact archived COPY columns'});await save();
  const manifest=JSON.parse(await readFile(path.join(pack,'storage-export/manifest.json'),'utf8'));
  const restoredFiles=path.join(proof,'storage');await mkdir(restoredFiles,{mode:0o700});
  for(const o of manifest.objects){const source=path.join(pack,'storage-export',o.local);assert.equal((await stat(source)).mode&0o077,0);const b=await readFile(source);assert.equal(b.length,o.bytes);assert.equal(sha(b),o.sha256);const target=path.join(restoredFiles,path.basename(o.local));await writeFile(target,b,{mode:0o600,flag:'wx'});assert.equal(sha(await readFile(target)),o.sha256);}
  report.steps.push({id:'storage-local-restore-sha256',status:'PASS',objects:manifest.objects.length,bytes:manifest.total_bytes});
  if(process.argv.includes('--check-company-rejection')){
    const fixture=await readFile(path.join(path.dirname(fileURLToPath(import.meta.url)),'restored-company-rejection.sql'),'utf8');
    const result=await psql(fixture,'postgres','recovery_operator');
    const parsed=JSON.parse(result.toString());assert.equal(parsed.status,'PASS');
    report.steps.push({id:'restored-company-rejection',...parsed});await save();
  }
  if(servicesRequested){
    const {checkRestoredServices}=await import('./check-restored-services.mjs');
    report.service_check=await checkRestoredServices({container,pack,proof,docker,psql});
    await save();
  }
  report.status=servicesRequested?'PASS: logical restore, local files and bounded Auth/REST/Storage drill; external integrations remain unverified':'PASS: logical restore and local file integrity; service-stack recovery remains unverified';
}catch(e){report.status='FAILED';report.error=e.message;process.exitCode=1;}
finally{
  if(container&&/^[0-9a-f]{64}$/.test(container)){try{await docker(['rm','--force','--volumes',container],'','cleanup');report.temporary_container_removed=true;}catch(e){report.cleanup_error=e.message;report.status='FAILED';process.exitCode=1;}}
  report.completed_at=new Date().toISOString();await save();console.log(JSON.stringify({pack,status:report.status,steps:report.steps,error:report.error}));
}
