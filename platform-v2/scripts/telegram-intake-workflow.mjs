// All business state and replay authorization stay in protected OfferPSP RPCs.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function renderIntakeCard(card) {
  if(card.outcome!=='ready') return null;
  if(!UUID.test(card.lead?.id)||!/^[1-9][0-9]*$/.test(card.chat_id)) throw new Error('Invalid intake identity');
  const text=(v,max=200)=>String(v??'не указано').replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,max);
  const entries=v=>v==null?[]:Array.isArray(v)?v:[v];
  const list=v=>{
    const items=entries(v);
    if(!items.length) return 'нет сохранённого списка';
    const labels=items.slice(0,5).map(x=>{
      const label=typeof x==='string'?x:typeof x?.title==='string'?x.title:null;
      return label?.trim()?text(label,160):'формат не распознан — проверьте в рубке';
    });
    if(items.length>5) labels.push(`ещё ${items.length-5} ${new Intl.PluralRules('ru').select(items.length-5)==='one'?'пункт':new Intl.PluralRules('ru').select(items.length-5)==='few'?'пункта':'пунктов'} — в рубке`);
    return labels.join('; ');
  };
  const c=card.screening||{},t=card.task||{};
  const due=t.due_at&&Number.isFinite(Date.parse(t.due_at))?new Intl.DateTimeFormat('ru-RU',{timeZone:'Asia/Nicosia',dateStyle:'short',timeStyle:'short'}).format(new Date(t.due_at))+' (Кипр)':'не назначен';
  const url=`https://ops-7q4m2x9k8v3n.vercel.app/merchants/${card.lead.id}`;
  const lines=[
    '🆕 OfferPSP · новая заявка', '',
    `Компания: ${text(card.lead.company)}`,`Контакт: ${text(card.lead.contact)}`,
    `Сайт из заявки: ${text(card.lead.domain)}`,`Вертикаль: ${text(card.lead.vertical)}`,
    `GEO: ${text(card.lead.geos)}`,`Объём: ${text(card.lead.volume)}`,
    `Возможные совпадения email/URL: ${Number(card.possible_duplicates)||0} (не окончательный вывод)`,
    '',`Автопроверка: ${text(c.status||'ожидается')}`,
    `Полнота: ${typeof c.completeness==='number'?c.completeness+'%':'ещё не рассчитана'}`,
    `Риск: ${text(c.risk||'не определён')}`,
    `Флаги: ${list([...entries(c.red_flags),...entries(c.yellow_flags)])}`,
    `Нужно уточнить: ${list(c.missing)}`,
    `ЛК: ${card.workspace_ready?'создан':'создание не подтверждено'}`,
    `Сохранённых matching-кандидатов: ${Number(card.match_count)||0}`,
    '',`Задача: ${text(t.status)} · срок: ${due}`,
    `Заявка: ${card.lead.id}`,
    'Это снимок на момент уведомления. Свежие результаты — в карточке.',
    'Кнопки готовят внутренние действия. Письма клиенту не отправляются.',
  ];
  const labels={screen:'🔎 Автопроверка',matching:'📋 Проверить matching',missing_draft:'📝 Запрос данных — черновик',reply_draft:'✍️ Ответ — черновик',remind:'🕒 Перенести срок +24ч'};
  const buttons=Object.entries(labels).flatMap(([action,label])=>UUID.test(card.actions?.[action]||'')?[{text:label,callback_data:'oi:'+card.actions[action]}]:[]);
  // Telegram defaults to HTML; escape the entire bounded message, including website/company input.
  const safeText=Array.from(lines.join('\n')).slice(0,3800).join('').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
  return {lead_id:card.lead.id,chat_id:card.chat_id,text:safeText,inline_keyboard:[[{text:'Открыть мерчанта',url}],...buttons.map(b=>[b])]};
}
export function acceptTelegramUpdate(update,authorization) {
  if(authorization?.authorized!==true) return null;
  const event=update.callback_query||update.message;
  const message=update.callback_query?.message||update.message;
  if(!event?.from||event.from.is_bot||!message||message.chat?.type!=='private'||String(event.from.id)!==String(message.chat.id)) return null;
  if(update.callback_query) {
    const data=update.callback_query.data;
    if(typeof data!=='string') return null;
    // Old direct SMTP/generic model-send buttons have no immutable one-time approval.
    // Leave read/cancel and existing server-token bulk flows intact; sends use staff web UI.
    if(!(/^oi:[0-9a-f-]{36}$/i.test(data)||/^bulk_(confirm|cancel)_[0-9a-f-]{36}$/i.test(data)||['done','cancel_email','stop_sending','skip_email'].includes(data))) return null;
  }
  return update;
}
const source=fn=>fn.toString();
const http=(name,id,credential,rpc,jsonBody,position)=>({name,id,position,type:'n8n-nodes-base.httpRequest',typeVersion:4.3,
  parameters:{method:'POST',url:`https://iceopurxqzqmwtcmwfzl.supabase.co/rest/v1/rpc/${rpc}`,
    authentication:'predefinedCredentialType',nodeCredentialType:'supabaseApi',sendBody:true,specifyBody:'json',jsonBody,
    options:{timeout:15000,redirect:{redirect:{followRedirects:false}}}},credentials:{supabaseApi:credential},onError:'stopWorkflow'});
const code=(name,id,jsCode,position)=>({name,id,position,type:'n8n-nodes-base.code',typeVersion:2,parameters:{jsCode}});
const link=node=>({node,type:'main',index:0});
// fixedCollection must remain an object. A root expression is passed through as
// a string by this Telegram node version, silently producing an empty keyboard.
const keyboard={rows:Array.from({length:6},(_,index)=>({row:{buttons:[{
  text:`={{ $json.inline_keyboard[${index}][0].text }}`,
  additionalFields:index===0?{url:'={{ $json.inline_keyboard[0][0].url }}'}:{callback_data:`={{ $json.inline_keyboard[${index}][0].callback_data }}`},
}]}}))};
export function buildTelegramGuardNodes({databaseCredential,telegramCredential}) {
  return [
    http('Authorize Telegram operator','offerpsp-authorize-tg',databaseCredential,'authorize_offerpsp_telegram_operator',
      `={{ JSON.stringify({p_from_id:String(($json.callback_query||$json.message)?.from?.id||''),p_chat_id:String(($json.callback_query?.message||$json.message)?.chat?.id||'')}) }}`,[250,-500]),
    code('Guard Telegram identity','offerpsp-guard-tg',`${source(acceptTelegramUpdate)}\nconst update=acceptTelegramUpdate($('Telegram Trigger').first().json,$input.first().json);\nreturn update?[{json:update}]:[];`,[450,-500]),
    {name:'Is intake action',id:'offerpsp-if-intake-action',position:[650,-500],type:'n8n-nodes-base.if',typeVersion:2.2,
      parameters:{conditions:{options:{caseSensitive:true,leftValue:'',typeValidation:'strict'},conditions:[{id:'intake-action',leftValue:"={{ String($json.callback_query?.data||'').startsWith('oi:') }}",rightValue:true,operator:{type:'boolean',operation:'true',singleValue:true}}],combinator:'and'},options:{}}},
    {name:'Answer intake callback',id:'offerpsp-answer-intake',position:[850,-650],type:'n8n-nodes-base.telegram',typeVersion:1.2,
      parameters:{resource:'callback',operation:'answerQuery',queryId:'={{ $json.callback_query.id }}',additionalFields:{}},credentials:{telegramApi:telegramCredential},onError:'continueRegularOutput'},
    http('Execute intake action','offerpsp-execute-intake',databaseCredential,'execute_offerpsp_telegram_intake_action',
      `={{ JSON.stringify({p_token:$('Telegram Trigger').first().json.callback_query.data.slice(3),p_from_id:String($('Telegram Trigger').first().json.callback_query.from.id),p_chat_id:String($('Telegram Trigger').first().json.callback_query.message.chat.id)}) }}`,[1050,-650]),
    code('Render intake action receipt','offerpsp-render-receipt',`const r=$input.first().json;\nif(r.outcome==='unauthorized') return [];\nconst status={expired:'Срок действия кнопки истёк. Откройте карточку в Captain’s Bridge.',inactive:'Заявка или задача закрыта; изменений нет.',failed:'Действие не выполнено. Проверьте карточку в Captain’s Bridge.'};\nreturn [{json:{chat_id:String($('Telegram Trigger').first().json.callback_query.message.chat.id),text:(r.replayed?'Уже выполнено ранее.\\n':'')+(r.message||status[r.outcome]||'Результат не подтверждён. Проверьте карточку.')}}];`,[1250,-650]),
    {name:'Send intake action receipt',id:'offerpsp-send-receipt',position:[1450,-650],type:'n8n-nodes-base.telegram',typeVersion:1.2,
      parameters:{resource:'message',operation:'sendMessage',chatId:'={{ $json.chat_id }}',text:'={{ $json.text }}',additionalFields:{appendAttribution:false}},credentials:{telegramApi:telegramCredential}},
  ];
}
export function guardConnections() {return {
  'Telegram Trigger':{main:[[link('Authorize Telegram operator')]]},
  'Authorize Telegram operator':{main:[[link('Guard Telegram identity')]]},
  'Guard Telegram identity':{main:[[link('Is intake action')]]},
  'Is intake action':{main:[[link('Answer intake callback')],[link('IF Callback?')]]},
  'Answer intake callback':{main:[[link('Execute intake action')]]},
  'Execute intake action':{main:[[link('Render intake action receipt')]]},
  'Render intake action receipt':{main:[[link('Send intake action receipt')]]},
};}
export function buildIntakeNotificationNodes({databaseCredential,telegramCredential}) {
  return [
    http('Claim operator intake card','offerpsp-claim-intake-card',databaseCredential,'claim_offerpsp_telegram_intake_card',
      `={{ JSON.stringify({p_lead_id:$('Intake identity').first().json.lead_id}) }}`,[1400,550]),
    code('Render operator intake card','offerpsp-render-intake-card',`const UUID=${UUID.toString()};\n${source(renderIntakeCard)}\nconst card=renderIntakeCard($input.first().json);return card?[{json:card}]:[];`,[1600,550]),
    {name:'Send operator intake card',id:'offerpsp-send-intake-card',position:[1800,550],type:'n8n-nodes-base.telegram',typeVersion:1.2,
      parameters:{resource:'message',operation:'sendMessage',chatId:'={{ $json.chat_id }}',text:'={{ $json.text }}',
        replyMarkup:'inlineKeyboard',inlineKeyboard:keyboard,additionalFields:{parse_mode:'HTML',disable_web_page_preview:true,appendAttribution:false}},credentials:{telegramApi:telegramCredential},retryOnFail:false,onError:'stopWorkflow'},
    http('Record operator card receipt','offerpsp-record-card-receipt',databaseCredential,'complete_offerpsp_telegram_intake_card',
      `={{ JSON.stringify({p_lead_id:$('Render operator intake card').first().json.lead_id,p_chat_id:String($json.result?.chat?.id||$json.chat?.id||''),p_message_id:String($json.result?.message_id||$json.message_id||'')}) }}`,[2000,550]),
  ];
}
export function cardConnections() {return {
  'Claim operator intake card':{main:[[link('Render operator intake card')]]},
  'Render operator intake card':{main:[[link('Send operator intake card')]]},
  'Send operator intake card':{main:[[link('Record operator card receipt')]]},
};}
export function buildIntakeCardWorker(credentials,errorWorkflow) {
  return {name:'OfferPSP | Operator intake card',settings:{executionOrder:'v1',executionTimeout:90,errorWorkflow,saveDataSuccessExecution:'all',saveDataErrorExecution:'all'},
    nodes:[
      {name:'Intake event',id:'intake-event',position:[1000,550],type:'n8n-nodes-base.executeWorkflowTrigger',typeVersion:1.1,parameters:{inputSource:'passthrough'}},
      code('Intake identity','intake-identity',`const id=$input.first().json.lead_id;if(!${UUID.toString()}.test(id||'')) throw new Error('Intake ID required');return [{json:{lead_id:id}}];`,[1200,550]),
      ...buildIntakeNotificationNodes(credentials)],
    connections:{'Intake event':{main:[[link('Intake identity')]]},'Intake identity':{main:[[link('Claim operator intake card')]]},...cardConnections()}};
}
export function buildIntakeDispatch(workerId) {
  if(typeof workerId!=='string'||!workerId) throw new Error('Verified operator-card workflow ID required');
  return {id:'offerpsp-dispatch-operator-card',name:'Dispatch operator card',type:'n8n-nodes-base.executeWorkflow',typeVersion:1.2,position:[1050,-180],
    parameters:{source:'database',workflowId:{__rl:true,value:workerId,mode:'id',cachedResultName:'OfferPSP | Operator intake card'},
      workflowInputs:{mappingMode:'defineBelow',value:{lead_id:"={{ $('Save OfferPSP Lead').first().json.lead_id }}"}},
      mode:'once',options:{waitForSubWorkflow:false}},onError:'stopWorkflow'};
}
