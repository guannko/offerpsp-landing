import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile, writeFile, mkdir, mkdtemp, stat, realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';

// Local retrospective scan only. This is NOT the production upload quarantine gate.
// The network-enabled signature updater never receives the document mount.
process.umask(0o077);
const root='/Users/borisboris/diskD/N8N/AIBot/offerpsp-landing/.private/recovery-packs';
const pack=process.argv[2];
assert.equal(path.dirname(pack||''),root,'Select an existing authorized recovery pack');
assert.equal(await realpath(pack),pack,'Symlinked packs are not accepted');
const exported=JSON.parse(await readFile(path.join(pack,'export-report.json'),'utf8'));
assert.equal(exported.project_ref,'iceopurxqzqmwtcmwfzl');
assert.match(exported.status,/^EXPORTED/);
const image='clamav/clamav@sha256:57deb108fc4c72778aa83eafbca7bb7153e28c3f57c005afd38d31f16da86f23';
const proof=await mkdtemp(path.join(pack,'antivirus-proof-'));
const signatures=path.join(proof,'signatures');
const controls=path.join(proof,'controls');
await mkdir(signatures,{mode:0o700});await mkdir(controls,{mode:0o700});
const report={status:'IN_PROGRESS',started_at:new Date().toISOString(),image,platform:'linux/amd64',scope:'Offline retrospective Storage-byte scan and synthetic EICAR control, not production upload enforcement',production_mutations:false,documents_sent_to_external_service:false,steps:[]};
let sourceContainer;
const save=()=>writeFile(path.join(proof,'report.json'),JSON.stringify(report,null,2),{mode:0o600});
async function docker(args,label,expected=[0]){
  const child=spawn('docker',args,{stdio:['ignore','pipe','pipe']});const out=[],err=[];
  child.stdout.on('data',b=>out.push(b));child.stderr.on('data',b=>err.push(b));
  const timer=setTimeout(()=>child.kill('SIGTERM'),600000);
  const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve)});clearTimeout(timer);
  await writeFile(path.join(proof,`${label}.log`),Buffer.concat([...out,...err]),{mode:0o600});
  assert.ok(expected.includes(code),`${label} exit ${code}; details retained privately`);
  return {code,text:Buffer.concat(out).toString()};
}
const base=['run','--rm','--pull','never','--platform','linux/amd64','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--tmpfs','/tmp:rw,noexec,nosuid,size=256m'];
const scanArgs=['--recursive','--infected','--max-filesize=25M','--max-scansize=100M','--max-recursion=16','--max-files=1000','--alert-exceeds-max=yes','--alert-encrypted=yes'];
const sha=b=>createHash('sha256').update(b).digest('hex');
try{
  await save();
  const inventory=JSON.parse(await readFile(path.join(pack,'storage-export/manifest.json'),'utf8'));
  for(const object of inventory.objects){
    const file=path.join(pack,'storage-export',object.local);
    assert.equal((await stat(file)).mode&0o077,0);const bytes=await readFile(file);
    assert.equal(bytes.length,object.bytes);assert.equal(sha(bytes),object.sha256);
  }
  report.steps.push({id:'input-integrity',status:'PASS',objects:inventory.objects.length});await save();
  sourceContainer=(await docker(['create','--platform','linux/amd64','--network','none','--entrypoint','true',image],'create')).text.trim();
  assert.match(sourceContainer,/^[a-f0-9]{64}$/);
  await docker(['cp',`${sourceContainer}:/var/lib/clamav/.`,signatures],'copy-signatures');
  // FreshClam calls initgroups/setuid even when selecting root. These two
  // capabilities apply only to the document-free updater, never to the scanner.
  await docker([...base,'--cap-add','SETGID','--cap-add','SETUID','--mount',`type=bind,source=${signatures},target=/var/lib/clamav`,'--entrypoint','freshclam',image,'--stdout','--user=root','--log=/tmp/freshclam.log'],'signature-update');
  const scanBase=[...base,'--network','none','--mount',`type=bind,source=${signatures},target=/var/lib/clamav,readonly`];
  const version=(await docker([...scanBase,'--entrypoint','clamscan',image,'--version'],'version')).text.trim();
  const stamp=version.slice(version.indexOf('/',version.indexOf('/')+1)+1);
  const age=Date.now()-Date.parse(stamp);
  assert.ok(Number.isFinite(age)&&age>=-3600000&&age<=72*3600000,'Signature date must be verified within 72 hours');
  report.engine=version;report.signature_age_hours=Math.round(age/3600000*10)/10;
  report.steps.push({id:'updated-signatures',status:'PASS'});await save();
  // The standard harmless antivirus test string is assembled only in this private fixture.
  await writeFile(path.join(controls,'eicar.txt'),'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*',{mode:0o600});
  const eicar=await docker([...scanBase,'--mount',`type=bind,source=${controls},target=/scan,readonly`,'--entrypoint','clamscan',image,...scanArgs,'/scan'],'eicar',[1]);
  assert.match(eicar.text,/Eicar[^\n]*FOUND/i);
  report.steps.push({id:'eicar-positive-control',status:'PASS',scanner_exit:eicar.code});await save();
  const actual=await docker([...scanBase,'--mount',`type=bind,source=${path.join(pack,'storage-export/storage')},target=/scan,readonly`,'--entrypoint','clamscan',image,...scanArgs,'/scan'],'storage-scan',[0,1]);
  const scanned=Number(actual.text.match(/Scanned files:\s*(\d+)/)?.[1]);
  assert.equal(scanned,inventory.objects.length,'Every archived object must be scanned');
  report.steps.push({id:'offline-storage-scan',status:actual.code===0?'PASS':'FLAGGED',objects:scanned,scanner_exit:actual.code});
  report.status=actual.code===0?'PASS: bounded retrospective scan; production quarantine is not installed':'FLAGGED: inspect private diagnostics; no production files changed';
  if(actual.code!==0)process.exitCode=1;
}catch(error){report.status='FAILED';report.error=error.message;process.exitCode=1;}
finally{
  if(sourceContainer&&/^[a-f0-9]{64}$/.test(sourceContainer)){
    try{await docker(['rm','--volumes',sourceContainer],'cleanup');report.temporary_container_removed=true;}catch(error){report.cleanup_error=error.message;process.exitCode=1;}
  }
  report.completed_at=new Date().toISOString();await save();
  console.log(JSON.stringify({proof,status:report.status,engine:report.engine,steps:report.steps,error:report.error}));
}
