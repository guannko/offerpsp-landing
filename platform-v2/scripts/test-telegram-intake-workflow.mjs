import assert from 'node:assert/strict';
import {test} from 'node:test';
import vm from 'node:vm';
import {renderIntakeCard,renderCompanyIntakeNotification,companyIntakeNotificationCode,COMPANY_INTAKE_RPC_URL,COMPANY_INTAKE_RPC_BODY,acceptTelegramUpdate,buildTelegramGuardNodes,buildIntakeNotificationNodes,buildIntakeSubmissionReplyDispatch,guardConnections} from './telegram-intake-workflow.mjs';
const id='10000000-0000-4000-8000-000000000001';
const credentials={databaseCredential:{id:'test-db',name:'Isolated DB'},telegramCredential:{id:'test-tg',name:'Isolated Telegram'}};
const update=data=>({callback_query:{id:'callback',from:{id:123,is_bot:false},message:{chat:{id:123,type:'private'}},data}});
const sample={outcome:'ready',chat_id:'123',delivery_mode:'send',content_hash:'a'.repeat(32),revision:1,lead:{id,company:'Synthetic'},screening:{},task:{status:'pending'},auto_reply:{status:'waiting'},actions:{screen:id,reply_draft:id,remind:id}};
test('card has canonical merchant link and bounded opaque callbacks; incomplete is not approved',()=>{
  const c=renderIntakeCard(sample); assert.match(c.text,/ещё не рассчитана/);assert.match(c.text,/не определён/);
  assert.match(c.text,/Первый ответ клиенту: ожидает результата проверки/);
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
test('production structured flags render their title; lists disclose omitted items',()=>{
  const c=renderIntakeCard({...sample,screening:{red_flags:[],yellow_flags:[{key:'website_evidence_unavailable',title:'Сайт не проверен; требуется повторная или ручная проверка'}],missing:['Сайт','Методы','Объём','Валюты','PayIn / PayOut','Лицензия','Юрлицо']}});
  assert.match(c.text,/Флаги: Сайт не проверен; требуется повторная или ручная проверка/);
  assert.doesNotMatch(c.text,/\[object Object\]/);
  assert.match(c.text,/ещё 2 пункта — в рубке/);
});
test('operator card translates internal states and reasons into clear Russian',()=>{
  const c=renderIntakeCard({...sample,
    screening:{status:'manual_review',risk:'unknown'},
    task:{status:'cancelled'},
    auto_reply:{status:'review_required',reason_code:'source_not_allowlisted'}});
  assert.match(c.text,/Автопроверка: нужна ручная проверка/);
  assert.match(c.text,/Риск: не определён/);
  assert.match(c.text,/Причина внимания: источник заявки требует ручной проверки/);
  assert.match(c.text,/Задача оператора: отменена/);
  assert.doesNotMatch(c.text,/manual_review|source_not_allowlisted|cancelled/);
});
test('existing company submissions show the new manager and safe merge decision',()=>{
  const merged=renderIntakeCard({...sample,latest_submission:{disposition:'merged',name:'Second Manager',email:'manager@example.com',match_strategy:'verified_company_email_domain'}});
  assert.match(merged.text,/Новый менеджер добавлен в существующую карточку: Second Manager · manager@example.com/);
  assert.match(merged.text,/Основание объединения: совпали компания и корпоративный домен почты/);
  assert.doesNotMatch(merged.text,/verified_company_email_domain/);
  const conflict=renderIntakeCard({...sample,latest_submission:{disposition:'review_required',name:'Unknown Manager',email:'unknown@example.net',match_strategy:'company_domain_conflict'}});
  assert.match(conflict.text,/Новый контакт не привязан/);
  assert.match(conflict.text,/название совпало, домены сайтов различаются/);
  assert.match(conflict.text,/Новая карточка не создана/);
});
test('inbound save targets the atomic company intake RPC and internal notice explains deduplication',()=>{
  assert.match(COMPANY_INTAKE_RPC_URL,/\/rpc\/upsert_offerpsp_lead_intake$/);
  assert.match(COMPANY_INTAKE_RPC_BODY,/p_payload/);
  const merged=renderCompanyIntakeNotification({lead_id:id,merged:true,match_strategy:'verified_company_email_domain'},{company:'Synthetic',name:'Second Manager',work_email:'second@example.com'});
  assert.match(merged.email_subject,/Новый менеджер существующей компании/);
  assert.match(merged.email_html,/отдельная карточка не создавалась/);
  const review=renderCompanyIntakeNotification({lead_id:id,review_required:true,match_strategy:'company_domain_conflict'},{company:'Synthetic',name:'Unknown',work_email:'unknown@example.net'});
  assert.match(review.email_html,/Контакт не получил доступ/);
  const codeResult=vm.runInNewContext(`(function(){${companyIntakeNotificationCode()}})()`,{
    $input:{first:()=>({json:{lead_id:id,merged:true,match_strategy:'verified_company_email_domain'}})},
    $:()=>({first:()=>({json:{company:'Synthetic',name:'Second Manager',work_email:'second@example.com'}})}),
  });
  assert.match(codeResult[0].json.email_subject,/Новый менеджер/);
});

test('submission acknowledgement dispatch sends only the opaque submission id to the protected worker',()=>{
  const node=buildIntakeSubmissionReplyDispatch({
    endpoint:'https://staff.test/api/platform-modules?module=company-screening-worker',
    credential:{id:'worker-fixture',name:'Worker'},
  });
  assert.equal(node.parameters.authentication,'genericCredentialType');
  assert.match(node.parameters.jsonBody,/process_submission_reply/);
  assert.match(node.parameters.jsonBody,/submission_id/);
  assert.doesNotMatch(node.parameters.jsonBody,/work_email|company_url|details/);
  assert.equal(node.onError,'continueRegularOutput');
  assert.equal(node.retryOnFail,false);
  assert.throws(()=>buildIntakeSubmissionReplyDispatch({endpoint:'http://unsafe.test/?module=company-screening-worker',credential:{id:'x',name:'x'}}),/Protected/);
});
test('malformed flags stay explicit and structured titles remain HTML-safe',()=>{
  const c=renderIntakeCard({...sample,screening:{red_flags:{unexpected:true},yellow_flags:[{title:'<b>Unsafe</b>'},{key:'unknown'},null],missing:[]}});
  assert.match(c.text,/&lt;b&gt;Unsafe&lt;\/b&gt;/);
  assert.match(c.text,/формат не распознан — проверьте в рубке/);
  assert.doesNotMatch(c.text,/\[object Object\]|<b>/);
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
  const keyboard=buildIntakeNotificationNodes(credentials).find(n=>n.name==='Send operator intake card').parameters.inlineKeyboard;
  assert.equal(typeof keyboard,'object');assert.equal(keyboard.rows.length,6);
  assert.ok(keyboard.rows.every(row=>row.row.buttons.length===1));
  const notificationNodes=buildIntakeNotificationNodes(credentials);
  assert.equal(notificationNodes.find(n=>n.name==='Claim operator intake card').parameters.url.endsWith('/claim_offerpsp_telegram_intake_card_v2'),true);
  const edit=notificationNodes.find(n=>n.name==='Edit operator intake card');
  assert.equal(edit.parameters.operation,'editMessageText');assert.equal(edit.retryOnFail,false);
  assert.equal(notificationNodes.find(n=>n.name==='Record operator card refresh').parameters.url.endsWith('/complete_offerpsp_telegram_intake_card_refresh'),true);
});
