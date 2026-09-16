import assert from 'node:assert/strict';
import {test} from 'node:test';
import vm from 'node:vm';
import {renderIntakeCard,acceptTelegramUpdate,buildTelegramGuardNodes,buildIntakeNotificationNodes,guardConnections} from './telegram-intake-workflow.mjs';
const id='10000000-0000-4000-8000-000000000001';
const credentials={databaseCredential:{id:'test-db',name:'Isolated DB'},telegramCredential:{id:'test-tg',name:'Isolated Telegram'}};
const update=data=>({callback_query:{id:'callback',from:{id:123,is_bot:false},message:{chat:{id:123,type:'private'}},data}});
const sample={outcome:'ready',chat_id:'123',lead:{id,company:'Synthetic'},screening:{},task:{status:'pending'},actions:{screen:id,reply_draft:id,remind:id}};
test('card has canonical merchant link and bounded opaque callbacks; incomplete is not approved',()=>{
  const c=renderIntakeCard(sample); assert.match(c.text,/ещё не рассчитана/);assert.match(c.text,/не определён/);
  assert.equal(c.inline_keyboard[0][0].url,`https://ops-7q4m2x9k8v3n.vercel.app/merchants/${id}`);
  for(const row of c.inline_keyboard.slice(1)) assert.ok(Buffer.byteLength(row[0].callback_data)<=64);
  assert.equal(renderIntakeCard({outcome:'already_reserved'}),null);
  assert.throws(()=>renderIntakeCard({...sample,lead:{id:'https://evil.invalid'}}),/identity/);
});
test('anonymous/group/bot updates are denied; only authorized private operator reaches shared bot',()=>{
  const u=update('oi:'+id);
  assert.equal(acceptTelegramUpdate(u,{authorized:false}),null);
  assert.equal(acceptTelegramUpdate({...u,callback_query:{...u.callback_query,from:{id:999}}},{authorized:true}),null);
  assert.equal(acceptTelegramUpdate({...u,callback_query:{...u.callback_query,message:{chat:{id:123,type:'group'}}}},{authorized:true}),null);
  assert.deepEqual(acceptTelegramUpdate(u,{authorized:true}),u);
  const message={message:{from:{id:123},chat:{id:123,type:'private'},text:'hello'}};
  assert.deepEqual(acceptTelegramUpdate(message,{authorized:true}),message);
});
test('untrusted company/website/flags cannot inject Telegram HTML or overflow decoded text',()=>{
  const c=renderIntakeCard({...sample,lead:{...sample.lead,company:'<a href="https://evil.invalid">FAKE</a>',domain:'&'.repeat(10000)},screening:{red_flags:Array(100).fill('<>'.repeat(500)),missing:Array(100).fill('😀'.repeat(500))}});
  assert.ok(!c.text.includes('<a'));assert.ok(c.text.includes('&lt;a'));
  assert.ok(Array.from(c.text.replaceAll('&amp;','&').replaceAll('&lt;','<').replaceAll('&gt;','>')).length<=3800);
});
test('legacy unguarded external-send buttons cannot reach SMTP or LLM send path',()=>{
  for(const action of ['do_send_email_12','send_emails','save_to_sheets','made_up_action'])
    assert.equal(acceptTelegramUpdate(update(action),{authorized:true}),null);
  assert.ok(acceptTelegramUpdate(update('bulk_confirm_'+id),{authorized:true}));
});
test('n8n Code sources execute without imports; all new callbacks bypass language model',()=>{
  const nodes=buildTelegramGuardNodes(credentials),render=buildIntakeNotificationNodes(credentials).find(n=>n.name==='Render operator intake card');
  const result=vm.runInNewContext(`(function(){${render.parameters.jsCode}})()`,{$input:{first:()=>({json:sample})}});
  assert.equal(result[0].json.lead_id,id);
  const guard=nodes.find(n=>n.name==='Guard Telegram identity');
  const denied=vm.runInNewContext(`(function(){${guard.parameters.jsCode}})()`,{$input:{first:()=>({json:{authorized:false}})},$:()=>({first:()=>({json:update('oi:'+id)})})});
  assert.equal(denied.length,0);
  assert.deepEqual(guardConnections()['Telegram Trigger'].main[0][0].node,'Authorize Telegram operator');
  assert.ok(!JSON.stringify(nodes).includes('iGaming Agent'));
  assert.equal(buildIntakeNotificationNodes(credentials).find(n=>n.name==='Send operator intake card').retryOnFail,false);
});
