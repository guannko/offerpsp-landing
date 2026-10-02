import assert from 'node:assert/strict';

// Real entrypoints with synthetic Auth responses. No network fallback, credentials,
// entity identifiers or external sends. This complements live JWT/REST probes.
const configured={
  SUPABASE_URL:'https://auth-fixture.invalid',SUPABASE_PUBLISHABLE_KEY:'QA-PUBLIC-NOT-A-KEY',
  SUPABASE_SERVICE_ROLE_KEY:'QA-SERVER-NOT-A-KEY',
  N8N_EMAIL_WEBHOOK_URL:'https://delivery-fixture.invalid/email',
  N8N_TELEGRAM_WEBHOOK_URL:'https://delivery-fixture.invalid/telegram',
  AIBOT_WEBHOOK_URL:'https://delivery-fixture.invalid/agent',
  AIBOT_WEBHOOK_SECRET:'QA-WEBHOOK-NOT-A-KEY',
};
const previous=Object.fromEntries(Object.keys(configured).map(key=>[key,process.env[key]]));
Object.assign(process.env,configured);
const originalFetch=globalThis.fetch;
const entrypoints=[
  ['integration-health','../api/integration-health.mjs','GET'],
  ['aibot-command','../api/aibot-command.mjs','POST'],
  ['send-email','../api/send-email.mjs','POST'],
  ['send-telegram','../api/send-telegram.mjs','POST'],
  ['extract-document','../api/extract-document.mjs','POST'],
  ['unified-search','../api/unified-search.mjs','GET'],
  ['hybrid-memory-search','../api/hybrid-memory-search.mjs','POST'],
  ['search-index-sync','../api/search-index-sync.mjs','POST'],
  ...['module-health','evaluate-rules','semantic-memory','oauth-request','oauth-decision']
    .map(module=>[module,'../api/platform-modules.mjs',module==='oauth-decision'?'POST':'GET',{module}]),
];
const results=[];
try{
  for(const [id,module,method,query={}] of entrypoints){
    const handler=(await import(module)).default;
    for(const mode of ['valid-nonstaff','revoked-session','auth-service-failure','staff-service-failure','malformed-staff-result']){
      const calls=[],unexpected=[];
      globalThis.fetch=async(url,init={})=>{
        const target=String(url);calls.push(target);
        assert.equal(new Headers(init.headers).get('authorization'),'Bearer QA-SESSION-NOT-A-CREDENTIAL');
        if(target===`${configured.SUPABASE_URL}/auth/v1/user`){
          if(mode==='revoked-session')return Response.json({message:'Revoked fixture'},{status:401});
          if(mode==='auth-service-failure')return Response.json({message:'Unavailable fixture'},{status:503});
          return Response.json({id:'00000000-0000-4000-8000-000000000001',email:'qa@example.invalid',app_metadata:{provider:'email'},user_metadata:{staff:true,role:'owner'}});
        }
        if(target===`${configured.SUPABASE_URL}/rest/v1/rpc/is_offerpsp_staff`){
          if(mode==='staff-service-failure')return Response.json({message:'Unavailable staff fixture'},{status:503});
          if(mode==='malformed-staff-result')return Response.json('true');
          if(mode==='valid-nonstaff')return Response.json(false);
        }
        unexpected.push(target);return Response.json({error:'Unexpected side effect blocked by fixture'},{status:503});
      };
      const response={headers:{},statusCode:0,
        setHeader(name,value){this.headers[name.toLowerCase()]=value;return this;},
        status(code){this.statusCode=code;return this;},
        end(value){this.body=value;return this;},
        send(value){this.body=value;return this;},
        json(value){this.body=JSON.stringify(value);return this;},
      };
      await handler({method,query,headers:{authorization:'Bearer QA-SESSION-NOT-A-CREDENTIAL'},body:{}},response);
      assert.equal(unexpected.length,0,`${id}/${mode} reached a protected downstream operation`);
      assert.equal(calls.length,['revoked-session','auth-service-failure'].includes(mode)?1:2,`${id}/${mode} authentication gate not exercised`);
      assert.equal(response.headers['cache-control'],'no-store');
      const expected=mode==='revoked-session'?[401]:mode==='auth-service-failure'?[401,503]:mode==='staff-service-failure'?[403,503]:[403];
      assert.ok(expected.includes(response.statusCode),`${id}/${mode} must fail closed, received ${response.statusCode}`);
      assert.ok(JSON.parse(response.body).error,`${id}/${mode} must explain denial`);
      results.push({endpoint:id,mode,status:response.statusCode,downstream_calls:0});
    }
  }
  console.log(JSON.stringify({status:'PASS',asserted_scenarios:results.length,entrypoints:entrypoints.length,scope:'Actual handlers with mocked Auth responses; not live valid-user penetration testing',results}));
}finally{
  globalThis.fetch=originalFetch;
  for(const [key,value] of Object.entries(previous)){if(value===undefined)delete process.env[key];else process.env[key]=value;}
}
