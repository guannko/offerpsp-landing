import assert from 'node:assert/strict';
import {writeFile,mkdir,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {createClient} from '../platform-v2/node_modules/@supabase/supabase-js/dist/index.mjs';

// Explicitly authorized inbound copy. No uploads, deletes, secret files or sends.
const projectRef='iceopurxqzqmwtcmwfzl';
const target=process.argv[2];
assert.ok(target?.startsWith('/Users/borisboris/diskD/N8N/AIBot/offerpsp-landing/.private/recovery-packs/'));
try {await stat(target);throw new Error('Target already exists; refusing overwrite');} catch(e) {if(e.code!=='ENOENT')throw e;}
function selectedKey(name) {
  const value=process.env[name];
  assert.ok(value,`Required existing variable ${name} is missing or empty`);
  return value;
}
assert.equal(selectedKey('VITE_SUPABASE_URL'),`https://${projectRef}.supabase.co`,'Credential must belong to current production project');
const key=selectedKey('SUPABASE_SERVICE_ROLE_KEY');
if(key.startsWith('sb_secret_'))assert.ok(key.length>30);
else {
  const claims=JSON.parse(Buffer.from(key.split('.')[1],'base64url').toString());
  assert.equal(claims.ref,projectRef);assert.equal(claims.role,'service_role');
}
const client=createClient(`https://${projectRef}.supabase.co`,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
const {data:buckets,error}=await client.storage.listBuckets();
if(error)throw new Error(`Bucket inventory failed: ${error.status||error.name}`);
assert.equal(buckets.length,3,'Unexpected bucket inventory; review before copying');
assert.ok(buckets.every(b=>b.public===false),'A public bucket needs separate review');
await mkdir(target,{recursive:true,mode:0o700});
await mkdir(path.join(target,'storage'),{mode:0o700});
const manifest={project_ref:projectRef,scope:'Storage objects and bucket settings; not a database dump or atomic database/Storage snapshot',started_at:new Date().toISOString(),buckets,objects:[],errors:[]};
await writeFile(path.join(target,'manifest.json'),JSON.stringify(manifest,null,2),{mode:0o600});
async function list(bucket,prefix='') {
  const entries=[];
  for(let offset=0;;offset+=100) {
    const {data,error}=await client.storage.from(bucket).list(prefix,{limit:100,offset,sortBy:{column:'name',order:'asc'}});
    if(error)throw new Error(`Object inventory failed in ${bucket}: ${error.status||error.name}`);
    for(const entry of data) {
      const key=prefix?`${prefix}/${entry.name}`:entry.name;
      if(entry.id)entries.push({...entry,key}); else entries.push(...await list(bucket,key));
    }
    if(data.length<100)break;
  }
  return entries;
}
for(const bucket of buckets) {
  const initial=await list(bucket.id);
  for(const object of initial) {
    const {data,error}=await client.storage.from(bucket.id).download(object.key);
    if(error)throw new Error(`Object download failed (${manifest.objects.length+1}): ${error.status||error.name}`);
    const bytes=Buffer.from(await data.arrayBuffer());
    assert.ok(bytes.length<=25*1024*1024,'Unexpected oversized object');
    if(object.metadata?.size!==undefined)assert.equal(bytes.length,Number(object.metadata.size),'Object length mismatch');
    const local=`storage/${String(manifest.objects.length+1).padStart(6,'0')}.bin`;
    await writeFile(path.join(target,local),bytes,{mode:0o600});
    manifest.objects.push({bucket:bucket.id,key:object.key,id:object.id,metadata:object.metadata,created_at:object.created_at,updated_at:object.updated_at,local,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
    await writeFile(path.join(target,'manifest.json'),JSON.stringify(manifest,null,2),{mode:0o600});
  }
  const final=await list(bucket.id);
  assert.deepEqual(initial.map(o=>[o.id,o.key,o.updated_at,o.metadata?.size]),final.map(o=>[o.id,o.key,o.updated_at,o.metadata?.size]),'Storage changed during export; snapshot must be repeated');
  console.log(JSON.stringify({bucket:bucket.id,objects:initial.length,status:'copied and inventory stable'}));
}
manifest.completed_at=new Date().toISOString();
manifest.total_bytes=manifest.objects.reduce((n,o)=>n+o.bytes,0);
manifest.status='PASS: object download and stable per-bucket inventory';
await writeFile(path.join(target,'manifest.json'),JSON.stringify(manifest,null,2),{mode:0o600});
console.log(JSON.stringify({project_ref:projectRef,target,objects:manifest.objects.length,total_bytes:manifest.total_bytes,status:manifest.status}));
