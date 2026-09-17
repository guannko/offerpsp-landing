export type IntakeSnapshot = {
  observed_at: string;
  lead: { id: string; company: string; status: string; record_state: string; source: string; submitted_at: string; workspace_linked: boolean };
  screening: null | { status: string; updated_at: string; started_at: string | null; finished_at: string | null; attempts: number; lease_until: string | null; missing: string[] | null; summary: string | null; risk: string | null; checks: {key: string; title: string; status: string; detail: string | null}[] };
  task: null | { status: string; due_at: string; created_at: string };
  telegram: null | { status: string; started_at: string; finished_at: string | null };
  auto_reply: null | { status: string; reply_class: string | null; reason_code: string | null; draft_id: number | null; created_at: string; updated_at: string; claimed_at: string | null; sent_at: string | null };
  actions: { action: string; at: string; outcome: string; message: string | null; error_code: string | null }[];
  match_count: number;
  events: { id: string; created_at: string; actor_type: string; activity_type: string; title: string; detail: string | null; outcome: string | null }[];
  event_count: number;
};
export type IntakeStep = { key: string; title: string; state: 'done' | 'running' | 'attention' | 'failed' | 'unknown' | 'stopped'; reason: string; at?: string | null };
export const intakeStateLabels = {done:'Подтверждено',running:'В работе',attention:'Нужно внимание',failed:'Ошибка',unknown:'Нет подтверждения',stopped:'Остановлено'};
export const intakeActionLabels: Record<string,string> = {reply_draft:'Черновик ответа',missing_draft:'Запрос данных — черновик',screen:'Постановка проверки в очередь',matching:'Просмотр matching',remind:'Перенос срока задачи'};
const replyReasons: Record<string,string> = {
  inactive_lead:'Заявка неактивна или завершена.',source_not_allowlisted:'Источник заявки пока не разрешён для автоматической отправки.',
  consent_not_recorded:'Согласие заявителя не записано.',invalid_recipient:'Email получателя некорректен.',
  screening_not_current:'Нет завершённой актуальной автопроверки.',screening_stale:'Данные заявки изменились после автопроверки.',
  risk_requires_review:'Риск или красный флаг требует проверки сотрудником.',response_task_inactive:'Задача первого ответа отсутствует или закрыта.',
  possible_duplicate:'Найдена возможная повторная заявка.',email_channel_disabled:'Почтовый канал отключён.',
  automation_disabled:'Операционная автоматика отключена.',prior_outbound_exists:'По заявке уже есть отправленное письмо.',
  unknown_missing_fact:'В списке уточнений появился неизвестный шаблону пункт.',restricted_claim:'Текст содержит утверждение, которое нельзя отправлять автоматически.',
  fact_mismatch:'Текст не совпал с актуальными фактами заявки.',unverified_extra_fact:'В тексте найден лишний неподтверждённый пункт.',
  delivery_uncertain:'SMTP-результат неоднозначен. Повторная отправка заблокирована.',worker_interrupted:'Обработчик прервался; запись оставлена для восстановления.',
};
export function intakeSteps(s: IntakeSnapshot): IntakeStep[] {
  const c=s.screening, d=s.telegram, t=s.task, r=s.auto_reply;
  const inactive=s.lead.record_state!=='active'||['spam','closed','won','lost'].includes(s.lead.status);
  const steps: IntakeStep[]=[{key:'intake',title:'Приём заявки',state:'done',reason:'Заявка сохранена в базе.',at:s.lead.submitted_at}];
  steps.push({key:'task',title:'Задача первого ответа',state:!t?'unknown':t.status==='cancelled'?'stopped':t.status==='failed'?'failed':t.status!=='done'&&Date.parse(t.due_at)<Date.parse(s.observed_at)?'attention':'done',reason:t?`Задача создана. Текущее состояние: ${t.status}. Срок показан ниже; это не подтверждение отправки ответа.`:'Задача не найдена. Для старых заявок автоматическое создание задним числом не выполнялось.',at:t?.created_at});
  const leaseExpired=c?.status==='screening'&&(!c.lease_until||Date.parse(c.lease_until)<Date.parse(s.observed_at));
  steps.push({key:'screening',title:'Предварительная проверка',state:!c?'unknown':inactive&&['pending','screening'].includes(c.status)?'stopped':leaseExpired?'attention':['pending','screening'].includes(c.status)?'running':c.finished_at?'done':'unknown',reason:!c?'Запись проверки отсутствует.':leaseExpired?'Время обработки истекло; успешное завершение не подтверждено. Нужна проверка восстановления.':['pending','screening'].includes(c.status)?`Состояние: ${c.status}. Попыток: ${c.attempts}.` : c.finished_at?'Результаты автопроверки сохранены. Это не одобрение мерчанта и не подтверждение лицензии.':'Завершение автоматической проверки не зафиксировано.',at:c?.finished_at||c?.started_at});
  steps.push({key:'decision',title:'Решение по заявке',state:inactive?'stopped':c?.status==='cleared'?'done':c&&['manual_review','needs_info','hold','rejected','spam'].includes(c.status)?'attention':'unknown',reason:inactive?'Заявка неактивна или завершена; дальнейшая автоматическая обработка ограничена.':c?.status==='cleared'?'Сохранено решение о допуске.':c?`Состояние: ${c.status}. ${c.missing?.length?`Недостающих пунктов: ${c.missing.length}.`:''} Требуется решение сотрудника.`:'Решение не найдено.',at:c?.updated_at});
  steps.push({key:'telegram',title:'Карточка в Telegram',state:!d?'unknown':d.status==='sent'?'done':d.status==='uncertain'||Date.parse(s.observed_at)-Date.parse(d.started_at)>120000?'attention':'running',reason:!d?'Нет записи отправки. Это не доказывает ошибку: уведомление подключено не ко всем источникам заявок.':d.status==='sent'?'Telegram подтвердил приём сообщения. Это не доказывает работу кнопок.':'Отправка зарезервирована, но квитанции Telegram нет. Не отправлять повторно вслепую.',at:d?.finished_at||d?.started_at});
  steps.push({key:'workspace',title:'Личный кабинет',state:s.lead.workspace_linked?'done':'unknown',reason:s.lead.workspace_linked?'С заявкой связан пользователь кабинета. Доставка письма с доступом отдельно не подтверждается этой записью.':'Связь с пользователем кабинета отсутствует. Причина не записана в этом источнике.'});
  steps.push({key:'matching',title:'Подбор решений',state:s.match_count>0?'done':'unknown',reason:s.match_count>0?`Сохранённых кандидатов: ${s.match_count}. Это не подтверждает свежесть подбора или согласие PSP.`:c?.status!=='cleared'?'Кандидатов нет; запуск подбора не подтверждён. Для запуска требуется допуск по заявке.':'Кандидатов нет; по этому факту нельзя определить, запускался ли подбор.'});
  steps.push({key:'callbacks',title:'Действия кнопок Telegram',state:s.actions.some(a=>a.outcome==='failed')?'failed':s.actions.some(a=>a.outcome!=='completed')?'attention':s.actions.length?'done':'unknown',reason:s.actions.length?`Сохранено результатов: ${s.actions.length}. Каждый результат и причина — ниже.`:'Ни одно действие не зарегистрировано. Нельзя отличить отсутствие нажатия от сбоя доставки события без диагностики Telegram.'});
  let emailState: IntakeStep['state']='unknown';
  let emailReason='Автоматический ответ по этой заявке не зарегистрирован. Для старых заявок отправка задним числом не выполняется.';
  if (r) {
    emailState=r.status==='sent'?'done':r.status==='uncertain'||r.status==='review_required'?'attention':r.status==='claimed'||r.status==='queued'?'running':'stopped';
    if (r.status==='sent') emailReason=`Отправка и журнал подтверждены. Тип ответа: ${r.reply_class==='missing_information'?'запрос недостающих данных':'подтверждение заявки'}.`;
    else if (r.status==='uncertain') emailReason='Результат доставки неоднозначен. Система не будет повторять отправку вслепую.';
    else if (r.status==='review_required') emailReason=`${replyReasons[r.reason_code||'']||'Автоматическая отправка остановлена защитной проверкой.'} Откройте переписку и проверьте черновик/контакт.`;
    else if (r.status==='claimed') emailReason='Письмо зарезервировано и передано в канал доставки; окончательная квитанция ещё не записана.';
    else emailReason='Ответ поставлен в очередь и ожидает обработчика.';
  }
  steps.push({key:'email',title:'Первый ответ клиенту',state:emailState,reason:emailReason,at:r?.sent_at||r?.claimed_at||r?.updated_at});
  return steps;
}
