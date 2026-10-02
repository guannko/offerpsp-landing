import assert from 'node:assert/strict';
import {createHmac,randomBytes,randomUUID} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';

// All sidecars share the already verified NETWORK NONE namespace, not a bridge.
// No production signing keys, SMTP credentials, listeners on the Mac, or sends.
export async function checkRestoredServices({container,pack,proof,docker,psql}) {
  assert.match(container,/^[a-f0-9]{64}$/);
  const mode=(await docker(['inspect','--format','{{.HostConfig.NetworkMode}}',container])).toString().trim();
  assert.equal(mode,'none');
  const namespace=`container:${container}`;
  const sidecars=[];
  const key=randomBytes(48).toString('base64url');
  const jwt=claims=>{
    const header=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');
    const payload=Buffer.from(JSON.stringify({iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+1800,...claims})).toString('base64url');
    return `${header}.${payload}.${createHmac('sha256',key).update(`${header}.${payload}`).digest('base64url')}`;
  };
  const service=jwt({role:'service_role'}),anon=jwt({role:'anon'});
  const report={status:'IN_PROGRESS',network:'none (shared loopback namespace)',published_ports:0,
    production_mutations:false,external_sends:false,signing_keys:'new synthetic local key',checks:[],
    limitations:['Not a hosted Supabase failover','Existing managed Vault secrets are not decrypted by a new local root key','Google OAuth, external SMTP, n8n, Edge/Vercel runtimes and production RTO/RPO remain unverified']};
  const start=async(image,env,mounts=[],command=[])=>{
    const args=['run','--pull=never','-d','--network',namespace,'--name',`offerpsp-dr-${randomUUID()}`];
    for(const [name,value] of Object.entries(env))args.push('--env',`${name}=${value}`);
    for(const mount of mounts)args.push('--mount',mount);
    args.push(image,...command);
    const id=(await docker(args,'','service-start')).toString().trim();assert.match(id,/^[a-f0-9]{64}$/);sidecars.push(id);
    const config=JSON.parse((await docker(['inspect','--format','{{json .HostConfig}}',id])).toString());
    assert.equal(config.NetworkMode,namespace);assert.ok(!config.PortBindings||!Object.keys(config.PortBindings).length);
    return id;
  };
  let helper;
  const execute=async(code,arg={})=>{
    const output=await docker(['exec','-i',helper,'node','--input-type=module','-e',code],JSON.stringify(arg),'service-probe');
    return JSON.parse(output.toString());
  };
  const request=async(url,options={})=>execute(`
    let input='';for await(const b of process.stdin)input+=b;const {url,options}=JSON.parse(input);
    if(!url.startsWith('http://127.0.0.1:'))throw new Error('Local-only request required');
    const response=await fetch(url,{...options,signal:AbortSignal.timeout(8000),redirect:'manual'});
    const body=await response.text();let data;try{data=JSON.parse(body);}catch{data=null;}
    console.log(JSON.stringify({status:response.status,data,location:response.headers.get('location')}));
  `,{url,options});
  const ready=async(url)=>{
    for(let i=0;i<60;i++){
      try{const r=await request(url);if(r.status===200)return;}catch{}
      await new Promise(resolve=>setTimeout(resolve,250));
    }
    throw new Error(`Local service not ready at port ${new URL(url).port}`);
  };
  try {
    helper=await start('node:24-bookworm-slim',{},[],['sleep','infinity']);
    await start('public.ecr.aws/supabase/mailpit:v1.30.2',{});
    await ready('http://127.0.0.1:8025/api/v1/messages');
    const rest=await start('public.ecr.aws/supabase/postgrest:v16.2',{
      PGRST_DB_URI:'postgresql://authenticator@127.0.0.1:5432/postgres',PGRST_DB_SCHEMAS:'public',
      PGRST_DB_ANON_ROLE:'anon',PGRST_JWT_SECRET:key,PGRST_SERVER_HOST:'127.0.0.1',PGRST_SERVER_PORT:'3000',
    });
    await ready('http://127.0.0.1:3000/');
    report.checks.push({id:'rest-restored-schema',status:'PASS'});
    const auth=await start('public.ecr.aws/supabase/gotrue:v2.196.0',{
      GOTRUE_API_HOST:'127.0.0.1',GOTRUE_API_PORT:'9999',API_EXTERNAL_URL:'http://127.0.0.1:9999',
      GOTRUE_DB_DRIVER:'postgres',GOTRUE_DB_DATABASE_URL:'postgres://supabase_auth_admin@127.0.0.1:5432/postgres',
      GOTRUE_SITE_URL:'http://127.0.0.1:9999',GOTRUE_URI_ALLOW_LIST:'http://127.0.0.1:9999/**',
      GOTRUE_JWT_SECRET:key,GOTRUE_JWT_AUD:'authenticated',GOTRUE_JWT_ADMIN_ROLES:'service_role',
      GOTRUE_EXTERNAL_EMAIL_ENABLED:'true',GOTRUE_EXTERNAL_ANONYMOUS_USERS_ENABLED:'false',GOTRUE_DISABLE_SIGNUP:'true',
      GOTRUE_MAILER_AUTOCONFIRM:'false',GOTRUE_SMTP_HOST:'127.0.0.1',GOTRUE_SMTP_PORT:'1025',
      GOTRUE_SMTP_ADMIN_EMAIL:'capture@recovery.invalid',GOTRUE_SMTP_SENDER_NAME:'OfferPSP isolated recovery',
    });
    await ready('http://127.0.0.1:9999/health');
    const otp=await request('http://127.0.0.1:9999/otp',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'hello@brain-index.com',create_user:false})});
    assert.equal(otp.status,200,'Restored owner OTP request failed');
    const emails=await request('http://127.0.0.1:8025/api/v1/messages');
    assert.ok(emails.data.messages.length>0,'Local SMTP did not capture the auth email');
    const email=await request(`http://127.0.0.1:8025/api/v1/message/${emails.data.messages[0].ID}`);
    const source=email.data.HTML||email.data.Text;
    const link=source.match(/http:\/\/127\.0\.0\.1:9999\/verify[^\s"<>]+/)?.[0]?.replaceAll('&amp;','&');
    assert.ok(link,'Local auth link missing');
    const parsed=new URL(link);assert.equal(parsed.hostname,'127.0.0.1');
    const verified=await request(link);assert.equal(verified.status,303);
    const redirect=new URL(verified.location);const hash=new URLSearchParams(redirect.hash.slice(1));
    const access=hash.get('access_token');assert.ok(access,'Restored login did not issue a session');
    const user=await request('http://127.0.0.1:9999/user',{headers:{Authorization:`Bearer ${access}`}});
    assert.equal(user.status,200);assert.equal(user.data.email,'hello@brain-index.com');
    report.checks.push({id:'auth-existing-owner-otp-local-smtp-session',status:'PASS',recipient:'our approved QA owner',external_delivery:false});
    const read=await request('http://127.0.0.1:3000/rpc/get_offerpsp_company_join_requests',{
      method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${access}`},body:'{}',
    });
    assert.equal(read.status,200);assert.ok(Array.isArray(read.data));
    report.checks.push({id:'auth-session-rest-rpc',status:'PASS'});
    const denied=await request('http://127.0.0.1:3000/rpc/get_offerpsp_company_join_requests',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
    assert.ok([401,403].includes(denied.status));report.checks.push({id:'anonymous-rpc-denied',status:'PASS'});
    const staffSource=await readFile(new URL('../platform-v2/api/_lib/staff-auth.mjs',import.meta.url),'utf8');
    const guard=await execute(`
      let input='';for await(const b of process.stdin)input+=b;const{source,access,anon}=JSON.parse(input);
      const fetchLocal=globalThis.fetch;globalThis.fetch=(input,options)=>{
        const u=new URL(input);if(u.hostname!=='127.0.0.1')throw new Error('Nonlocal guard request');
        if(u.pathname.startsWith('/auth/v1/')){u.port='9999';u.pathname=u.pathname.slice('/auth/v1'.length);}
        else if(u.pathname.startsWith('/rest/v1/')){u.port='3000';u.pathname=u.pathname.slice('/rest/v1'.length);}
        else throw new Error('Unexpected guard request');return fetchLocal(u,{...options,signal:AbortSignal.timeout(8000)});
      };
      process.env.SUPABASE_URL='http://127.0.0.1:3000';process.env.SUPABASE_PUBLISHABLE_KEY=anon;
      const{requireOfferPspStaff}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
      let status;try{await requireOfferPspStaff({headers:{authorization:'Bearer '+access}});status=200;}catch(e){status=e.status;}
      if(status!==403)throw new Error('Real nonstaff session did not receive staff denial');
      console.log(JSON.stringify({status}));
    `,{source:staffSource,access,anon});
    report.checks.push({id:'actual-staff-auth-helper-valid-nonstaff-denied',status:'PASS',http_status:guard.status,scope:'shared guard, not every endpoint'});
    const parts=access.split('.');assert.equal(parts.length,3);
    const tampered=[parts[0],parts[1],(parts[2].startsWith('A')?'B':'A')+parts[2].slice(1)].join('.');
    const invalidSessions=[
      {id:'tampered-signature',token:tampered},
      {id:'expired-session',token:jwt({role:'authenticated',sub:user.data.id,aud:'authenticated',exp:Math.floor(Date.now()/1000)-120})},
    ];
    for(const scenario of invalidSessions){
      const invalid=await request('http://127.0.0.1:9999/user',{headers:{Authorization:`Bearer ${scenario.token}`}});
      assert.ok([401,403].includes(invalid.status),`Auth accepted ${scenario.id}`);
      const invalidRpc=await request('http://127.0.0.1:3000/rpc/get_offerpsp_company_join_requests',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${scenario.token}`},body:'{}'});
      assert.equal(invalidRpc.status,401,`REST accepted ${scenario.id}`);
      report.checks.push({id:scenario.id,status:'PASS',auth_status:invalid.status,rest_status:invalidRpc.status});
    }
    const manifest=JSON.parse(await readFile(path.join(pack,'storage-export/manifest.json'),'utf8'));
    const versions=JSON.parse((await psql("select coalesce(jsonb_agg(jsonb_build_object('bucket',bucket_id,'name',name,'version',version)), '[]'::jsonb) from storage.objects;",'postgres','recovery_operator')).toString());
    const files=path.join(proof,'storage-service-files');await mkdir(files,{mode:0o700});
    for(const o of manifest.objects){
      const row=versions.find(v=>v.bucket===o.bucket&&v.name===o.key);assert.ok(row);
      const relative=`stub/stub/${o.bucket}/${o.key}${row.version?`/${row.version}`:''}`;
      const target=path.resolve(files,relative);assert.ok(target.startsWith(files+path.sep));
      await mkdir(path.dirname(target),{recursive:true,mode:0o700});
      await writeFile(target,await readFile(path.join(pack,'storage-export',o.local)),{mode:0o600,flag:'wx'});
    }
    const storage=await start('public.ecr.aws/supabase/storage-api:v1.72.1',{
      ANON_KEY:anon,SERVICE_KEY:service,AUTH_JWT_SECRET:key,
      POSTGREST_URL:'http://127.0.0.1:3000',DATABASE_URL:'postgres://supabase_storage_admin@127.0.0.1:5432/postgres',
      STORAGE_BACKEND:'file',FILE_STORAGE_BACKEND_PATH:'/var/lib/storage',GLOBAL_S3_BUCKET:'stub',TENANT_ID:'stub',
      REGION:'local',ENABLE_IMAGE_TRANSFORMATION:'false',TUS_USE_FILE_VERSION_SEPARATOR:'false',
    });
    // Docker Desktop host bind mounts do not reliably support Linux xattrs,
    // which the official file backend needs even for reads. Keep a disposable
    // copy on the container's Linux filesystem; the private export stays intact.
    await docker(['cp',`${files}/.`,`${storage}:/var/lib/storage`],'','service-storage-copy');
    await ready('http://127.0.0.1:5000/status');
    const downloadCode=`
      import{createHash}from'node:crypto';let input='';for await(const b of process.stdin)input+=b;
      const{objects,service,anon}=JSON.parse(input);let count=0;const denials={};
      for(const o of objects){const route=encodeURIComponent(o.bucket)+'/'+o.key.split('/').map(encodeURIComponent).join('/');
        const r=await fetch('http://127.0.0.1:5000/object/'+route,{headers:{Authorization:'Bearer '+service},signal:AbortSignal.timeout(8000)});
        if(r.status!==200)throw new Error('Private object download failed ('+r.status+')');
        const data=Buffer.from(await r.arrayBuffer());if(data.length!==o.bytes||createHash('sha256').update(data).digest('hex')!==o.sha256)throw new Error('Storage API byte mismatch');count++;
        for(const headers of [{},{Authorization:'Bearer '+anon}]){
          const denied=await fetch('http://127.0.0.1:5000/object/'+route,{headers,signal:AbortSignal.timeout(8000)});
          if(![400,401,403,404].includes(denied.status))throw new Error('Unexpected private object denial status ('+denied.status+')');
          denials[denied.status]=(denials[denied.status]||0)+1;await denied.arrayBuffer();
        }
      }console.log(JSON.stringify({count,denials}));
    `;
    const downloads=await execute(downloadCode,{objects:manifest.objects,service,anon});
    report.checks.push({id:'storage-api-all-restored-objects-sha256-and-anonymous-denial',status:'PASS',objects:downloads.count,denials:downloads.denials,anonymous_modes:['missing bearer','valid anon-role JWT']});
    await docker(['restart',auth,rest,storage],'','service-restart');
    await ready('http://127.0.0.1:9999/health');await ready('http://127.0.0.1:3000/');await ready('http://127.0.0.1:5000/status');
    const afterRestart=await request('http://127.0.0.1:9999/user',{headers:{Authorization:`Bearer ${access}`}});
    assert.equal(afterRestart.status,200);assert.equal(afterRestart.data.id,user.data.id);
    const afterRest=await request('http://127.0.0.1:3000/rpc/get_offerpsp_company_join_requests',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${access}`},body:'{}'});
    assert.equal(afterRest.status,200);assert.ok(Array.isArray(afterRest.data));
    const afterStorage=await execute(downloadCode,{objects:manifest.objects,service,anon});assert.equal(afterStorage.count,downloads.count);
    assert.deepEqual(afterStorage.denials,downloads.denials);
    report.checks.push({id:'auth-rest-storage-restart-session-and-all-file-hashes',status:'PASS',objects:afterStorage.count});
    report.status='PASS bounded Auth/REST/Storage runtime drill';
  } catch(error) {
    report.status='FAILED';report.error=error.message;
    for(const id of sidecars){
      const log=await docker(['logs','--tail','60',id],'',`service-log-${id.slice(0,12)}`);
      await writeFile(path.join(proof,`service-${id.slice(0,12)}.log`),log,{mode:0o600});
    }
    throw error;
  } finally {
    // Attempt every removal even when one Docker operation fails. A cleanup
    // failure must never be hidden behind a successful functional result.
    const cleanupErrors=[];
    for(const id of sidecars.reverse()){
      try{await docker(['rm','--force','--volumes',id],'',`service-cleanup-${id.slice(0,12)}`);}
      catch(error){cleanupErrors.push({container:id,message:error.message});}
    }
    report.sidecars_removed=cleanupErrors.length===0;
    if(cleanupErrors.length){report.cleanup_errors=cleanupErrors;report.status='FAILED';}
    await writeFile(path.join(proof,'services-report.json'),JSON.stringify(report,null,2),{mode:0o600});
    if(cleanupErrors.length)throw new Error('Isolated service cleanup incomplete; inspect private report');
  }
  return report;
}
