// All business state and replay authorization stay in protected OfferPSP RPCs.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const COMPANY_INTAKE_RPC_URL='https://iceopurxqzqmwtcmwfzl.supabase.co/rest/v1/rpc/upsert_offerpsp_lead_intake';
export const COMPANY_INTAKE_RPC_BODY="={{ JSON.stringify({p_payload:Object.fromEntries(Object.entries($json).filter(([key]) => key !== 'is_spam'))}) }}";
export function buildIntakeSubmissionReplyDispatch({endpoint,credential}) {
  const url=new URL(endpoint);
  if(url.protocol!=='https:'||url.username||url.password||url.searchParams.get('module')!=='company-screening-worker') throw new Error('Protected screening endpoint required');
  if(!credential?.id||!credential?.name) throw new Error('Verified worker credential reference required');
  return {id:'offerpsp-dispatch-submission-reply',name:'Send immediate client acknowledgement',type:'n8n-nodes-base.httpRequest',typeVersion:4.3,
    position:[1180,80],retryOnFail:false,onError:'continueRegularOutput',
    parameters:{method:'POST',url:url.href,authentication:'genericCredentialType',genericAuthType:'httpHeaderAuth',sendBody:true,specifyBody:'json',
      jsonBody:'={{ JSON.stringify({action:"process_submission_reply",submission_id:$("Save OfferPSP Lead").first().json.submission_id}) }}',
      options:{timeout:45000,redirect:{redirect:{followRedirects:false}}}},
    credentials:{httpHeaderAuth:credential}};
}
export function renderCompanyIntakeNotification(saved,original) {
  const result=saved&&typeof saved==='object'&&!Array.isArray(saved)?saved:{};
  const lead={...(original||{}),...result};
  const esc=value=>String(value??'—').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
  const state=result.review_required?'review':result.merged?'merged':'created';
  const heading={created:'Новая заявка мерчанта',merged:'Новый менеджер существующей компании',review:'Нужно подтвердить связь с компанией'}[state];
  const note={
    created:'Создана новая карточка компании.',
    merged:'Контакт добавлен в существующую карточку; отдельная карточка не создавалась.',
    review:'Новая карточка не создавалась. Контакт не получил доступ, пока связь с компанией не будет подтверждена.',
  }[state];
  const matchStrategy={
    verified_company_email_domain:'совпали компания и корпоративный домен почты',
    company_domain_conflict:'название совпало, домены сайтов различаются',
    contact_domain_unverified:'название и сайт совпали, но корпоративная почта не подтверждена',
    company_identity_unverified:'совпало название, но связь контакта с компанией не подтверждена',
    website_domain_company_conflict:'сайт совпал, название компании различается',
    email_domain_company_conflict:'домен почты совпал, название компании различается',
    new_company:'новая компания',
  }[result.match_strategy]||String(result.match_strategy||'не указано');
  const subject=`${heading} — ${String(lead.company||'OfferPSP').slice(0,160)}`;
  const telegramText=[
    `${state==='review'?'⚠️':state==='merged'?'👤':'🆕'} <b>${esc(heading)}</b>`,'',
    `<b>Компания:</b> ${esc(lead.company)}`,`<b>Контакт:</b> ${esc(lead.name)}`,
    `<b>Email:</b> ${esc(lead.work_email)}`,`<b>Результат:</b> ${esc(note)}`,
    `<b>Основание:</b> ${esc(matchStrategy)}`,'',
    `Карточка: https://ops-7q4m2x9k8v3n.vercel.app/merchants/${esc(result.lead_id)}`,
  ].join('\n');
  const emailHtml=`
    <div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;color:#171923">
      <div style="padding:24px;background:#f8f5ee;border:1px solid #d9d4ca;border-radius:16px 16px 0 0">
        <div style="font-size:12px;color:#d93667;text-transform:uppercase;letter-spacing:.12em">OfferPSP · Captain's Bridge</div>
        <h1 style="margin:10px 0 0;font-size:26px">${esc(heading)}</h1>
      </div>
      <div style="padding:24px;border:1px solid #d9d4ca;border-top:0;border-radius:0 0 16px 16px">
        <p style="padding:12px 14px;background:#fff5f7;border-left:4px solid #ff4d7a"><b>Результат:</b> ${esc(note)}</p>
        <p><b>Компания:</b> ${esc(lead.company)}</p>
        <p><b>Новый контакт:</b> ${esc(lead.name)} · ${esc(lead.work_email)}</p>
        <p><b>Telegram:</b> ${esc(lead.telegram)}</p>
        <p><b>Сайт:</b> ${esc(lead.company_url)}</p>
        <p><b>Вертикаль / GEO:</b> ${esc(lead.vertical)} · ${esc(lead.geos)}</p>
        <p><b>Объём / методы:</b> ${esc(lead.monthly_volume)} · ${esc(lead.methods)}</p>
        <p><b>Основание решения:</b> ${esc(matchStrategy)}</p>
        <p><b>Детали:</b><br>${esc(lead.details)}</p>
        <p style="margin-top:28px"><a href="https://ops-7q4m2x9k8v3n.vercel.app/merchants/${esc(result.lead_id)}" style="display:inline-block;padding:12px 18px;border-radius:9px;background:#ff4d7a;color:#080a13;text-decoration:none;font-weight:700">Открыть карточку</a></p>
      </div>
    </div>`;
  return {...lead,email_subject:subject,telegram_text:telegramText,email_html:emailHtml};
}
export function companyIntakeNotificationCode() {
  return `const saved=$input.first().json;\nconst original=$('Validate and Normalize Lead').first().json;\n${renderCompanyIntakeNotification.toString()}\nreturn [{json:renderCompanyIntakeNotification(saved,original)}];`;
}
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
  const c=card.screening||{},t=card.task||{},a=card.auto_reply||{},s=card.latest_submission||{};
  const due=t.due_at&&Number.isFinite(Date.parse(t.due_at))?new Intl.DateTimeFormat('ru-RU',{timeZone:'Asia/Nicosia',dateStyle:'short',timeStyle:'short'}).format(new Date(t.due_at))+' (Кипр)':'не назначен';
  const screened=c.screened_at&&Number.isFinite(Date.parse(c.screened_at))?new Intl.DateTimeFormat('ru-RU',{timeZone:'Asia/Nicosia',dateStyle:'short',timeStyle:'medium'}).format(new Date(c.screened_at))+' (Кипр)':'ещё не завершена';
  const autoReply={sent:'отправлен автоматически',review_required:'нужно внимание оператора',uncertain:'доставка не подтверждена',claimed:'отправляется',queued:'ожидает обработки',waiting:'ожидает результата проверки'}[a.status]||text(a.status||'ожидает');
  const screeningStatus={manual_review:'нужна ручная проверка',needs_info:'нужно запросить данные',cleared:'предварительно проверено',pending:'ожидает проверки',processing:'проверяется',failed:'проверка завершилась ошибкой'}[c.status]||text(c.status||'ожидается');
  const risk={unknown:'не определён',low:'низкий',medium:'средний',high:'высокий',critical:'критический'}[c.risk]||text(c.risk||'не определён');
  const attentionReason={response_task_inactive:'задача первого ответа неактивна',source_not_allowlisted:'источник заявки требует ручной проверки',recipient_missing:'не указан адрес получателя',recipient_invalid:'адрес получателя не прошёл проверку',missing_required_fields:'не хватает обязательных данных',screening_incomplete:'предварительная проверка ещё не завершена',delivery_uncertain:'доставка ответа не подтверждена'}[a.reason_code]||text(a.reason_code,120);
  const taskStatus={pending:'ожидает',in_progress:'в работе',completed:'завершена',cancelled:'отменена',overdue:'просрочена'}[t.status]||text(t.status);
  const matchStrategy={verified_company_email_domain:'совпали компания и корпоративный домен почты',company_domain_conflict:'название совпало, домены сайтов различаются',contact_domain_unverified:'название и сайт совпали, но корпоративная почта не подтверждена',company_identity_unverified:'совпало название, но связь контакта с компанией не подтверждена',website_domain_company_conflict:'сайт совпал, название компании различается',email_domain_company_conflict:'домен почты совпал, название компании различается',new_company:'новая компания'}[s.match_strategy]||text(s.match_strategy||'не указана',120);
  const submissionLines=s.disposition==='merged'
    ?['',`👤 Новый менеджер добавлен в существующую карточку: ${text(s.name)} · ${text(s.email)}`,`Основание объединения: ${matchStrategy}`]
    :s.disposition==='review_required'
      ?['',`⚠️ Новый контакт не привязан: ${text(s.name)} · ${text(s.email)}`,`Причина: требуется подтвердить компанию (${matchStrategy}). Новая карточка не создана.`]
      :[];
  const url=`https://ops-7q4m2x9k8v3n.vercel.app/merchants/${card.lead.id}`;
  const lines=[
    card.delivery_mode==='edit'?'🔄 OfferPSP · карточка заявки обновлена':'🆕 OfferPSP · новая заявка', '',
    `Компания: ${text(card.lead.company)}`,`Контакт: ${text(card.lead.contact)}`,
    `Сайт из заявки: ${text(card.lead.domain)}`,`Вертикаль: ${text(card.lead.vertical)}`,
    `GEO: ${text(card.lead.geos)}`,`Объём: ${text(card.lead.volume)}`,
    `Возможные совпадения email/URL: ${Number(card.possible_duplicates)||0} (не окончательный вывод)`,
    ...submissionLines,
    '',`Автопроверка: ${screeningStatus}`,
    `Проверка завершена: ${screened}`,
    `Полнота: ${typeof c.completeness==='number'?c.completeness+'%':'ещё не рассчитана'}`,
    `Риск: ${risk}`,
    `Флаги: ${list([...entries(c.red_flags),...entries(c.yellow_flags)])}`,
    `Нужно уточнить: ${list(c.missing)}`,
    `ЛК: ${card.workspace_ready?'создан':'создание не подтверждено'}`,
    `Сохранённых matching-кандидатов: ${Number(card.match_count)||0}`,
    '',`Первый ответ клиенту: ${autoReply}`,
    ...(a.reason_code?[`Причина внимания: ${attentionReason}`]:[]),
    `Задача оператора: ${taskStatus} · срок: ${due}`,
    `Заявка: ${card.lead.id}`,
    'Карточка обновляется после проверки и результата первого ответа.',
    'Кнопки не раскрывают PSP и не отправляют коммерческие предложения клиенту.',
  ];
  const labels={screen:'🔎 Автопроверка',matching:'📋 Проверить matching',missing_draft:'📝 Запрос данных — черновик',reply_draft:'✍️ Ответ — черновик',remind:'🕒 Перенести срок +24ч'};
  const buttons=Object.entries(labels).flatMap(([action,label])=>UUID.test(card.actions?.[action]||'')?[{text:label,callback_data:'oi:'+card.actions[action]}]:[]);
  // Telegram defaults to HTML; escape the entire bounded message, including website/company input.
  const safeText=Array.from(lines.join('\n')).slice(0,3800).join('').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
  return {lead_id:card.lead.id,chat_id:card.chat_id,text:safeText,
    delivery_mode:card.delivery_mode||'send',message_id:card.message_id||null,
    refresh_token:card.refresh_token||null,content_hash:card.content_hash||null,revision:Number(card.revision)||1,
    inline_keyboard:[[{text:'Открыть мерчанта',url}],...buttons.map(b=>[b])]};
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
    http('Claim operator intake card','offerpsp-claim-intake-card',databaseCredential,'claim_offerpsp_telegram_intake_card_v2',
      `={{ JSON.stringify({p_lead_id:$('Intake identity').first().json.lead_id,p_reason:$('Intake identity').first().json.reason}) }}`,[1400,550]),
    code('Render operator intake card','offerpsp-render-intake-card',`const UUID=${UUID.toString()};\n${source(renderIntakeCard)}\nconst card=renderIntakeCard($input.first().json);return card?[{json:card}]:[];`,[1600,550]),
    {name:'Is card refresh',id:'offerpsp-if-card-refresh',position:[1800,550],type:'n8n-nodes-base.if',typeVersion:2.2,
      parameters:{conditions:{options:{caseSensitive:true,leftValue:'',typeValidation:'strict'},conditions:[{id:'card-refresh',leftValue:"={{ $json.delivery_mode }}",rightValue:'edit',operator:{type:'string',operation:'equals'}}],combinator:'and'},options:{}}},
    {name:'Edit operator intake card',id:'offerpsp-edit-intake-card',position:[2000,420],type:'n8n-nodes-base.telegram',typeVersion:1.2,
      parameters:{resource:'message',operation:'editMessageText',chatId:'={{ $json.chat_id }}',messageId:'={{ $json.message_id }}',text:'={{ $json.text }}',
        replyMarkup:'inlineKeyboard',inlineKeyboard:keyboard,additionalFields:{parse_mode:'HTML',disable_web_page_preview:true}},credentials:{telegramApi:telegramCredential},retryOnFail:false,onError:'stopWorkflow'},
    {name:'Send operator intake card',id:'offerpsp-send-intake-card',position:[2000,680],type:'n8n-nodes-base.telegram',typeVersion:1.2,
      parameters:{resource:'message',operation:'sendMessage',chatId:'={{ $json.chat_id }}',text:'={{ $json.text }}',
        replyMarkup:'inlineKeyboard',inlineKeyboard:keyboard,additionalFields:{parse_mode:'HTML',disable_web_page_preview:true,appendAttribution:false}},credentials:{telegramApi:telegramCredential},retryOnFail:false,onError:'stopWorkflow'},
    http('Record operator card receipt','offerpsp-record-card-receipt',databaseCredential,'complete_offerpsp_telegram_intake_card_v2',
      `={{ JSON.stringify({p_lead_id:$('Render operator intake card').first().json.lead_id,p_chat_id:String($json.result?.chat?.id||$json.chat?.id||''),p_message_id:String($json.result?.message_id||$json.message_id||''),p_content_hash:$('Render operator intake card').first().json.content_hash}) }}`,[2200,680]),
    http('Record operator card refresh','offerpsp-record-card-refresh',databaseCredential,'complete_offerpsp_telegram_intake_card_refresh',
      `={{ JSON.stringify({p_lead_id:$('Render operator intake card').first().json.lead_id,p_chat_id:$('Render operator intake card').first().json.chat_id,p_message_id:$('Render operator intake card').first().json.message_id,p_refresh_token:$('Render operator intake card').first().json.refresh_token,p_content_hash:$('Render operator intake card').first().json.content_hash}) }}`,[2200,420]),
  ];
}
export function cardConnections() {return {
  'Claim operator intake card':{main:[[link('Render operator intake card')]]},
  'Render operator intake card':{main:[[link('Is card refresh')]]},
  'Is card refresh':{main:[[link('Edit operator intake card')],[link('Send operator intake card')]]},
  'Edit operator intake card':{main:[[link('Record operator card refresh')]]},
  'Send operator intake card':{main:[[link('Record operator card receipt')]]},
};}
export function buildIntakeCardWorker(credentials,errorWorkflow) {
  return {name:'OfferPSP | Operator intake card',settings:{executionOrder:'v1',executionTimeout:90,errorWorkflow,saveDataSuccessExecution:'all',saveDataErrorExecution:'all'},
    nodes:[
      {name:'Intake event',id:'intake-event',position:[1000,550],type:'n8n-nodes-base.executeWorkflowTrigger',typeVersion:1.1,parameters:{inputSource:'passthrough'}},
      code('Intake identity','intake-identity',`const input=$input.first().json;const id=input.lead_id;if(!${UUID.toString()}.test(id||'')) throw new Error('Intake ID required');const reason=String(input.reason||'initial').replace(/[^a-z0-9_-]/gi,'_').slice(0,80);return [{json:{lead_id:id,reason}}];`,[1200,550]),
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
