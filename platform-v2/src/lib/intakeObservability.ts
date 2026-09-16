export type IntakeSnapshot = {
  observed_at: string;
  lead: { id: string; company: string; status: string; record_state: string; source: string; submitted_at: string; workspace_linked: boolean };
  screening: null | { status: string; updated_at: string; started_at: string | null; finished_at: string | null; attempts: number; lease_until: string | null; missing: string[] | null; summary: string | null; risk: string | null; checks: {key: string; title: string; status: string; detail: string | null}[] };
  task: null | { status: string; due_at: string; created_at: string };
  telegram: null | { status: string; started_at: string; finished_at: string | null };
  actions: { action: string; at: string; outcome: string; message: string | null; error_code: string | null }[];
  match_count: number;
  events: { id: string; created_at: string; actor_type: string; activity_type: string; title: string; detail: string | null; outcome: string | null }[];
  event_count: number;
};
export type IntakeStep = { key: string; title: string; state: 'done' | 'running' | 'attention' | 'failed' | 'unknown' | 'stopped'; reason: string; at?: string | null };
export const intakeStateLabels = {done:'Подтверждено',running:'В работе',attention:'Нужно внимание',failed:'Ошибка',unknown:'Нет подтверждения',stopped:'Остановлено'};
export const intakeActionLabels: Record<string,string> = {reply_draft:'Черновик ответа',missing_draft:'Запрос данных — черновик',screen:'Постановка проверки в очередь',matching:'Просмотр matching',remind:'Перенос срока задачи'};
export function intakeSteps(s: IntakeSnapshot): IntakeStep[] {
  const c=s.screening, d=s.telegram, t=s.task;
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
  steps.push({key:'email',title:'Письмо клиенту',state:'unknown',reason:'Этот дисплей не подтверждает доставку почты. Кнопки карточки создают только черновики. Проверьте переписку в рубке.'});
  return steps;
}
