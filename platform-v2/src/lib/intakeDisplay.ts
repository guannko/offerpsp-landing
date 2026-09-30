import type { IntakeSnapshot } from './intakeObservability';

const labels: Record<string, string> = {
  new: 'Новая', qualifying: 'Уточнение данных', shared: 'Предложения переданы',
  closed: 'Закрыта', archived: 'В архиве', won: 'Успешно завершена', lost: 'Закрыта без сделки',
  pending: 'Ожидает обработки', screening: 'Идёт проверка', manual_review: 'Нужна ручная проверка',
  needs_info: 'Нужны данные', hold: 'На паузе', rejected: 'Отклонена', spam: 'Спам', cleared: 'Допущена',
  completed: 'Выполнено', done: 'Выполнено', cancelled: 'Отменено', failed: 'Ошибка',
  expired: 'Срок действия истёк', inactive: 'Заявка неактивна', queued: 'В очереди',
  unknown: 'Не подтверждено', warning: 'Нужно внимание', pass: 'Проверка пройдена',
  passed: 'Проверка пройдена', fail: 'Проверка не пройдена', not_ready: 'Пока не готово',
  sent: 'Отправлено', claimed: 'Отправляется', review_required: 'Нужна проверка', uncertain: 'Доставка не подтверждена',
};
export const intakeStatusName = (value?: string | null) => value ? labels[value] || value : 'Статус не указан';
export function intakeClock(value?: string | null) {
  if (!value || !Number.isFinite(Date.parse(value))) return null;
  const date = new Date(value);
  return {
    day: new Intl.DateTimeFormat('ru-RU', { timeZone: 'Asia/Nicosia', day: '2-digit', month: '2-digit', year: 'numeric' }).format(date),
    time: new Intl.DateTimeFormat('ru-RU', { timeZone: 'Asia/Nicosia', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(date),
  };
}
const events: Record<string, [string, string]> = {
  company_intake_created: ['Создана карточка компании', 'Первая заявка компании сохранена как основная карточка.'],
  company_contact_intake_merged: ['Добавлен новый менеджер компании', 'Контакт надёжно сопоставлен с существующей карточкой; отдельная карточка не создана.'],
  company_contact_intake_review_required: ['Нужно подтвердить связь с компанией', 'Новая карточка не создана и доступ контакту не выдан до ручной проверки.'],
  lead_submitted: ['Заявка поступила', 'Данные заявителя сохранены в рубке.'],
  intake_task_created: ['Создана задача первого ответа', 'Система добавила задачу для сотрудника.'],
  lead_intelligence_available: ['Заявка доступна для проверки', 'Это подготовка к проверке, а не её результат.'],
  pre_compliance_requested: ['Запрошена повторная автопроверка', 'Система приняла запрос; завершение проверки подтверждается отдельным событием.'],
  pre_compliance_screened: ['Автопроверка завершена', 'Результаты сохранены. Допуск мерчанта — отдельное решение.'],
  pre_compliance_requeued_after_hash_fix: ['Автопроверка безопасно перезапущена', 'Незавершённая проверка возвращена в обработку после исправления контрольной версии данных.'],
  telegram_intake_card_reserved: ['Начата отправка в Telegram', 'Система зарезервировала отправку уведомления.'],
  telegram_intake_card_sent: ['Карточка доставлена в Telegram', 'Telegram подтвердил приём сообщения.'],
  telegram_intake_card_refresh_reserved: ['Начато обновление карточки Telegram', 'Система обнаружила новые данные и зарезервировала обновление существующего сообщения.'],
  telegram_intake_card_refreshed: ['Карточка Telegram обновлена', 'Telegram подтвердил обновление существующей карточки без создания дубля.'],
  stuck_intake_alert_sent: ['Отправлено напоминание о зависшей заявке', 'Бот уведомил оператора о незавершённом этапе. Повторные уведомления ограничены.'],
  email_draft_created: ['Создан черновик письма', 'Создание черновика не означает отправку письма.'],
  telegram_intake_action: ['Обработана кнопка Telegram', 'Результат действия сохранён.'],
  intake_auto_reply_ready: ['Автоответ прошёл защитные проверки', 'Подготовлен только разрешённый тип первого ответа.'],
  intake_auto_reply_review_required: ['Автоответ остановлен', 'Защитная проверка требует участия сотрудника.'],
  intake_auto_reply_claimed: ['Начата отправка первого ответа', 'Письмо зарезервировано от повторной отправки.'],
  intake_auto_reply_sent: ['Первый ответ отправлен', 'Доставка записана в канонический почтовый журнал.'],
  intake_auto_reply_uncertain: ['Доставка первого ответа не подтверждена', 'Повторная отправка заблокирована до сверки.'],
  intake_submission_reply_review_required: ['Автоответ новому контакту остановлен', 'Защитная проверка требует участия сотрудника.'],
  intake_submission_reply_claimed: ['Начата отправка ответа новому контакту', 'Письмо зарезервировано от повторной отправки.'],
  intake_submission_reply_sent: ['Новый контакт получил подтверждение', 'Доставка записана отдельно для этого обращения.'],
  intake_submission_reply_uncertain: ['Доставка ответа новому контакту не подтверждена', 'Повторная отправка заблокирована до сверки.'],
  contact_added: ['Добавлен контакт компании', 'Новый сотрудник сохранён в карточке компании.'],
  contact_archived: ['Контакт перенесён в архив', 'Запись сохранена в истории, но больше не считается активным контактом.'],
  task_updated: ['Задача обновлена', 'Сохранены новые параметры или состояние задачи.'],
  merchant_record_updated: ['Карточка мерчанта обновлена', 'Изменения сохранены в профиле компании.'],
  route_matching_completed: ['Подбор платёжных маршрутов завершён', 'Система сохранила результат matching для текущих данных мерчанта.'],
  matching_fixture_configured: ['Тестовый PSP подготовлен', 'Настроен эталонный тестовый сценарий подбора.'],
  matching_fixture_result_captured: ['Результат тестового подбора сохранён', 'Система зафиксировала результат эталонного сценария.'],
  matching_fixture_adjusted: ['Тестовый сценарий подбора уточнён', 'Параметры эталонного PSP скорректированы для проверки matching.'],
  matching_fixture_positive_result_captured: ['Положительный тест matching подтверждён', 'Система сохранила успешный эталонный результат подбора.'],
  matching_fixture_zero_markup_verified: ['Нулевая наценка тестового PSP подтверждена', 'Проверка подтвердила, что внутренняя наценка не добавлена.'],
};
export function intakeEventText(event: IntakeSnapshot['events'][number]) {
  const known = events[event.activity_type];
  return { title: known?.[0] || event.title, detail: event.detail || known?.[1] || '' };
}
export function chronologicalIntakeEvents(items: IntakeSnapshot['events']) {
  return [...items].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
}
export function intakeNow(s: IntakeSnapshot) {
  if (s.lead.record_state === 'archived') return { title: 'Заявка в архиве', detail: 'История сохранена. Архив не означает, что все этапы были выполнены.', target: 'activity' };
  if (['closed', 'won', 'lost', 'spam'].includes(s.lead.status)) return { title: intakeStatusName(s.lead.status), detail: 'Обработка завершена или ограничена. Результаты отдельных действий — ниже.', target: 'activity' };
  if (s.actions.some(a => a.outcome === 'failed')) return { title: 'Есть ошибка действия', detail: 'Откройте результаты кнопок: там сохранена причина.', target: 'callbacks' };
  if (s.auto_reply?.status === 'uncertain') return { title: 'Нужно сверить доставку письма', detail: 'SMTP-результат неоднозначен. Автоматический повтор заблокирован.', target: 'email' };
  if (s.auto_reply?.status === 'review_required') return { title: 'Первый ответ требует проверки', detail: 'Автоматическая отправка остановлена защитной проверкой. Причина указана ниже.', target: 'email' };
  if (s.auto_reply?.status === 'claimed' || s.auto_reply?.status === 'queued') return { title: 'Готовится первый ответ', detail: 'Система обрабатывает разрешённый автоматический ответ.', target: 'email' };
  if (s.screening && ['pending', 'screening'].includes(s.screening.status)) {
    const stale = s.screening.status === 'screening' && (!s.screening.lease_until || Date.parse(s.screening.lease_until) < Date.parse(s.observed_at));
    return { title: stale ? 'Проверка не завершена вовремя' : intakeStatusName(s.screening.status), detail: stale ? 'Время обработки истекло. Нужна проверка восстановления.' : 'Завершение ещё не подтверждено.', target: 'screening' };
  }
  if (s.screening && ['manual_review', 'needs_info', 'hold', 'rejected', 'spam'].includes(s.screening.status)) return { title: intakeStatusName(s.screening.status), detail: s.screening.summary || 'Проверьте результаты и примите решение в карточке мерчанта.', target: 'decision' };
  if (s.screening?.status === 'cleared') return { title: 'Мерчант допущен', detail: 'Можно перейти к подбору решений. Допуск не означает согласие платёжного провайдера.', target: 'matching' };
  return { title: 'Ход обработки не подтверждён', detail: 'Смотрите сохранённые события. Отсутствие записи не считается успешным выполнением.', target: 'activity' };
}
export function intakeDestination(key: string, leadId: string) {
  const root = `/merchants/${encodeURIComponent(leadId)}`;
  const targets: Record<string, { label: string; href: string }> = {
    task: { label: 'Открыть задачи мерчанта', href: `${root}?tab=tasks` },
    screening: { label: 'Открыть проверку мерчанта', href: `${root}?tab=compliance` },
    decision: { label: 'Проверить досье и решение', href: `${root}?tab=compliance` },
    matching: { label: 'Открыть подбор решений', href: `${root}?tab=matching` },
    workspace: { label: 'Открыть кабинет клиента', href: `${root}?tab=preview` },
    email: { label: 'Открыть переписку мерчанта', href: `${root}?tab=communications` },
    activity: { label: 'Открыть историю мерчанта', href: `${root}?tab=activity` },
  };
  return targets[key] || null;
}
