# OfferPSP — функциональный и UX-аудит админки и клиентского кабинета

Дата: 2026-08-01
Статус: `VERIFIED` read-only аудит production, кода, Supabase и n8n
Область: `/admin/`, `/portal/`, рабочий процесс OfferPSP, auth и операционная автоматизация

## 1. Краткий вывод

OfferPSP уже имеет серьёзный backend-фундамент, но пока не имеет законченного рабочего продукта для ежедневной эксплуатации.

- База умеет хранить приватные PSP, версии rate card, маршруты, ставки, matching, shortlist, dossier, PSP review, Telegram, Zoom, организации субагентов, их наценки и комиссии.
- Клиентский кабинет умеет показывать несколько заявок, анонимные варианты, ответы клиента, запрос знакомства, сообщения и состояние сделки.
- Админка умеет принимать заявки, менять базовый статус и score, запускать matching, отправлять shortlist, создавать простые задачи и сообщения, импортировать подготовленный JSON.
- Но большая часть полного процесса после shortlist существует только в базе/RPC и не имеет нормального staff UI.
- Ни админка, ни кабинет клиента не построены вокруг понятного списка текущих действий. Пользователь видит информацию, но часто не понимает, что именно он должен сделать сейчас и где это сделать.
- Production-данные пока не готовы поддерживать полезную ежедневную работу: опубликованных нормализованных маршрутов нет, большинство активных заявок не квалифицированы, реальные агентские связи и комиссии отсутствуют.

Главный диагноз:

> Сейчас это не пустой макет, но и не полноценная рабочая система. Это backend-платформа примерно на один этап впереди своей операционной оболочки.

Не следует добавлять ещё сущности в базу до завершения основных рабочих экранов.

### Статус реализации после аудита

`VERIFIED` локально 2026-08-01: реализован первый операционный блок, закрывающий главные
пробелы ежедневной работы. Админка получила единый request workspace, структурированное
досье, ручную сборку и предварительный просмотр shortlist, Deal Desk и назначение владельца.
Клиентский кабинет получил редактируемое досье, понятные недостающие поля и отдельную задачу
по запросу PSP. Клиентские варианты теперь загружаются через безопасный RPC без прямой
зависимости frontend от legacy `SECURITY DEFINER` view.

`VERIFIED` локально: второй операционный блок добавил PSP supply workspace — редактирование
профиля и контактов PSP, нормализованных маршрутов, ставок, лимитов, settlement, маржи и
аномалий; pause/resume/archive, freshness, версии и неизменяемую историю действий. Возобновление
маршрута повторно проверяет ошибки, актуальность условий, pricing, лимиты и маржу.

`PARTIAL`: оба frontend-блока и новая supply migration ещё не развёрнуты в production. Telegram
ingestion, автоматические reminders, coverage matrix, сравнение версий, полный кабинет субагента,
commission operations и расширенная аналитика остаются следующими блоками.

## 2. Как проводился аудит

Проверено:

- фактический production-код ветки `agent/offerpsp-platform`;
- `admin/index.html`, `admin/app.js`, `admin/i18n.js`, `admin/styles.css`;
- `portal/index.html`, `portal/app.js`, `portal/request-state.js`, `portal/styles.css`;
- 13 Supabase migrations OfferPSP;
- production Supabase: структура, агрегированные данные, функции и advisors;
- production login-экраны `/admin/` и `/portal/`;
- активные n8n workflows OfferPSP;
- текущие `TASKS.md` и архитектурные документы;
- актуальные паттерны Stripe Connect, Adyen Customer Area, HubSpot pipelines и GOV.UK Task List.

Ограничение:

- Vercel OAuth в текущем чате истёк, поэтому deployment metadata не была повторно получена через Vercel connector. Публичные production-страницы открываются, JavaScript-ошибок на login-экранах не обнаружено. Последний rollout SHA и deployment ID взяты из проектного журнала и не являются независимой проверкой этого аудита.

## 3. Фактическое состояние production-данных

### Спрос и работа с мерчами

| Факт | Production |
|---|---:|
| Все заявки | 12 |
| Активные заявки | 4 |
| Закрытые заявки | 8 |
| Активные с URL | 3 из 4 |
| Активные с нормализованными GEO | 1 из 4 |
| Активные с валютами | 1 из 4 |
| Активные с методами | 1 из 4 |
| Активные с числовым оборотом | 1 из 4 |
| Активные с license status | 1 из 4 |
| Активные с business model | 1 из 4 |
| Активные, назначенные сотруднику | 0 из 4 |
| Активные, связанные с merchant organization | 0 из 4 |
| Рабочие задачи | 0 |
| Сообщения в портале | 1 |
| Записи notification audit | 0 |

Вывод: административная панель не может быть полноценным рабочим местом, пока активные заявки не имеют владельца, структурированного dossier и следующего действия.

### PSP supply

| Факт | Production |
|---|---:|
| Приватные PSP | 4 |
| Rate-card batches | 4 |
| Нормализованные маршруты | 37 |
| Draft routes | 35 |
| Published routes | 0 |
| Archived routes | 2 |
| Ошибки parser/anomaly | 38 |
| Предупреждения | 47 |

Вывод: matching engine существует, но полезной опубликованной базы маршрутов сейчас нет. BRPay и Antarex правильно остаются draft, однако без исправления ошибок и публикации проверенных маршрутов клиент не получит реальный нормализованный выбор.

### Субагенты

Production содержит только архивированные E2E-объекты:

- 3 archived agent organizations;
- 3 archived merchant organizations;
- 3 ended agent-client links;
- 3 inactive memberships;
- 0 agent margin policies;
- 0 agent commissions.

Это подтверждает, что agent backend реализован, но продукт для реального субагента ещё не существует.

## 4. Каким должен быть рабочий процесс OfferPSP

```text
Новая заявка
→ первичная проверка и назначение владельца
→ заполнение merchant dossier
→ уточнение недостающих данных у клиента
→ matching по опубликованным и актуальным маршрутам
→ ручная проверка кандидатов сотрудником
→ preview и отправка анонимного shortlist
→ выбор клиента
→ повторная проверка offer freshness и dossier
→ приватная отправка dossier конкретному PSP
→ accept / decline / needs information
→ общий Telegram-чат
→ Zoom
→ won / lost
→ контроль реального запуска и следующий запрос клиента
```

Каждый этап обязан иметь:

1. владельца;
2. текущий статус;
3. одно понятное следующее действие;
4. обязательные данные для перехода дальше;
5. срок/SLA;
6. историю изменений;
7. уведомление ответственному человеку.

## 5. Целевая структура админки

Админка должна быть не набором таблиц и drawer, а операционной системой OfferPSP.

### 5.1. Главная / Command Center

Показывает не общие красивые цифры, а работу на сегодня:

- новые необработанные заявки;
- заявки без владельца;
- просроченные действия;
- dossier с недостающими полями;
- shortlist, ожидающие проверки или отправки;
- PSP review без ответа;
- знакомства, где ещё нет Telegram или Zoom;
- stale routes и rate cards;
- unread client messages;
- ближайшие задачи;
- ключевые показатели воронки и времени прохождения.

Основная логика: оператор открывает админку и сразу понимает, что делать первым.

### 5.2. Requests / Merchant pipeline

Нужны два режима:

- таблица для поиска и массовой работы;
- kanban по стадиям процесса.

Фильтры:

- статус;
- владелец;
- GEO;
- vertical;
- monthly volume;
- source/campaign;
- quality grade;
- наличие лицензии;
- наличие недостающих данных;
- срок следующего действия;
- agent/direct;
- created/updated date.

В строке заявки должны быть видны:

- компания и контакт;
- GEO/метод/валюта;
- volume;
- owner;
- stage;
- next action;
- deadline;
- unread messages;
- dossier completeness;
- shortlist/introduction state.

### 5.3. Полная карточка мерча

Drawer на 620 px подходит для быстрого просмотра, но не для полного цикла. Нужна отдельная страница заявки с вкладками:

1. **Overview** — статус, owner, next action, SLA, краткое резюме.
2. **Company & dossier** — юридические данные, URL, регистрация, лицензия, GEO, оборот, методы, traffic, риски и источники подтверждения.
3. **Matching** — требования мерча и сравнение подходящих маршрутов.
4. **Shortlist** — выбранные варианты и точный preview того, что увидит клиент.
5. **PSP review** — кому отправлено dossier, ответ PSP, вопросы и раунды review.
6. **Introduction** — Telegram, Zoom, участники, ссылки и результат.
7. **Tasks & messages** — все действия и переписка.
8. **Activity** — неизменяемый audit trail.

Нужны structured fields и validation, а не только текстовые заметки.

### 5.4. Matching Workbench

Сотрудник должен видеть по каждому candidate route:

- настоящий PSP и контакт;
- route version и freshness;
- hard-gate result;
- GEO, currency, flow, method, traffic, vertical;
- limits и settlement;
- PSP base rate;
- OfferPSP margin;
- agent margin при наличии;
- final client rate;
- risk/requirements;
- причины match/mismatch;
- открытые anomalies;
- предыдущий опыт с PSP;
- возможность включить/исключить вариант вручную с причиной.

Обязательные действия:

- refresh matching;
- запросить уточнение у клиента;
- подтвердить freshness у PSP;
- выбрать конкретные routes;
- изменить порядок;
- preview client card;
- отправить shortlist;
- сохранить audit reason.

Автоматический выбор первых пяти кандидатов без полноценного review UI неприемлем для production.

### 5.5. PSP & Offer Operations

Отдельные рабочие экраны:

- PSP registry и contacts;
- route/rate-card register;
- inbox новых source messages/files;
- parser review queue;
- anomaly resolution;
- version diff;
- margin editor;
- publish/pause/archive;
- freshness calendar;
- coverage matrix GEO × currency × method × flow × vertical;
- reminders PSP-партнёрам;
- история качества и результативности PSP.

### 5.6. Deal Desk

Это главный отсутствующий staff UI.

Нужны очереди:

- option selected;
- dossier incomplete;
- dossier ready;
- waiting PSP decision;
- PSP needs info;
- PSP accepted;
- Telegram required;
- Zoom required;
- negotiating;
- won/lost follow-up.

Для каждой сделки:

- клиентская компания;
- выбранный anonymous option;
- реальный PSP/route;
- freshness check;
- dossier preview;
- private PSP contact;
- история review rounds;
- шаблон и факт отправки;
- Telegram group data;
- Zoom schedule;
- responsible manager;
- next action/deadline;
- final result и причина потери.

### 5.7. Tasks, Inbox и Notifications

Нужны не только задачи внутри drawer:

- общая очередь задач;
- `My tasks`;
- просроченные;
- по заявке/PSP/deal;
- assignee;
- due date и reminder;
- unread client messages;
- автоматические задачи из pipeline events;
- email/Telegram/in-app notifications;
- notification delivery log и retry.

### 5.8. Agents

Для staff:

- агентские организации;
- users и роли;
- merchant assignments;
- ownership/attribution;
- OfferPSP и agent markup policy;
- active deals;
- commission ledger;
- approval/earned/paid;
- statement/export;
- co-branding settings;
- обход/duplicate protection.

### 5.9. Analytics

Не только общий conversion rate:

- source → qualified;
- qualified → shortlist;
- shortlist → interested;
- interested → introduction request;
- introduction → PSP accepted;
- accepted → Telegram;
- Telegram → Zoom;
- Zoom → won;
- time in every stage;
- reason for clarification/decline/loss;
- quality by source, GEO, vertical and agent;
- PSP acceptance and response time;
- route coverage/freshness;
- projected/earned margin;
- direct vs agent performance.

## 6. Целевая структура клиентского кабинета

Кабинет не должен становиться generic CRM. Он должен облегчать только платёжные задачи клиента.

### 6.1. Home / Action Center

Первый экран:

- приветствие и организация;
- одна главная карточка `Требуется ваше действие`;
- активные payment requests;
- новые варианты;
- dossier completeness;
- unread messages;
- ближайшие знакомства/Zoom;
- работающие или согласованные routes;
- кнопка `Новая платёжная задача`.

Пустые счётчики без действий не нужны.

### 6.2. Payment Requests

Каждая задача должна иметь:

- понятное пользовательское название: `India · INR · UPI PayIn`;
- merchant/project;
- статус нормальным человеческим языком;
- progress timeline;
- ответственного OfferPSP;
- next action и deadline;
- историю изменений;
- route shortlist;
- deal room после выбора.

### 6.3. Task-based dossier

Если данных не хватает, клиент не должен видеть текст `missing_fields` или предложение написать всё в чат.

Нужен task list:

- данные компании;
- сайт/продукт;
- регистрационный GEO;
- target GEOs;
- licence status и подтверждение;
- monthly volume;
- average/min/max transaction;
- методы, валюты, PayIn/PayOut;
- текущий processing setup;
- launch timeline;
- документы;
- review & confirm.

Каждый пункт имеет статус `Not started / Incomplete / Complete / Needs update` и открывает конкретную форму. Такой подход соответствует [GOV.UK Task List](https://design-system.service.gov.uk/components/task-list/) и практике incremental requirements в [Stripe Connect onboarding](https://docs.stripe.com/connect/embedded-onboarding).

### 6.4. Сравнение маршрутов

Текущая основа правильная, но нужна более удобная логика:

- компактная compare table на desktop;
- карточки на mobile;
- sticky comparison header;
- одинаковые параметры в одинаковом порядке;
- final rate, limits, settlement, integration, traffic requirements;
- `Почему подходит` и `Что нужно проверить`;
- validity/freshness;
- кнопки `Подходит`, `Нужны детали`, `Не подходит`;
- одно выбранное основное решение и возможный backup;
- понятное объяснение следующего шага и конфиденциальности PSP.

### 6.5. Deal Room

После `Request introduction` должен появляться отдельный рабочий блок:

- dossier readiness;
- `OfferPSP проверяет данные`;
- `PSP рассматривает заявку`;
- вопросы PSP как структурированные tasks;
- статус решения без раскрытия PSP при decline;
- после accept — название PSP и контакт;
- Telegram group;
- Zoom date/link;
- agreed terms summary;
- результат;
- next follow-up.

### 6.6. Connections

После `won` кабинет не должен заканчиваться.

Для каждого согласованного подключения:

- route summary;
- GEO/currency/method;
- agreed client rate/version;
- started/not started;
- Telegram/Zoom/history;
- request change;
- report issue;
- request backup route;
- expand to new GEO/method;
- validity/freshness alerts.

OfferPSP не обрабатывает платежи, поэтому не нужно копировать transaction dashboard Adyen. Полезная часть [Adyen Customer Area](https://docs.adyen.com/account/) для нас — структура аккаунтов, ролей, payment-method requests, reports и контролируемый доступ, а не управление транзакциями.

### 6.7. Messages, Documents и Notifications

Нужны:

- единый inbox;
- unread count;
- сообщения, привязанные к конкретной request/deal;
- attachments;
- structured requests for information;
- email/Telegram/in-app notifications;
- notification preferences;
- история документов и версий.

### 6.8. Team и роли

Для merchant organization:

- owner/admin/member;
- приглашения;
- доступ только к выбранным merchant projects;
- история действий;
- деактивация пользователя.

RBAC должен следовать принципу минимальных полномочий. Практическим референсом является разделение account access и roles в [Adyen Customer Area](https://docs.adyen.com/account/user-roles).

### 6.9. Кабинет субагента

Поверх общего workspace:

- merchant switcher;
- `Add merchant` и invite flow;
- portfolio с next action по каждому мерчу;
- attribution и ownership;
- co-branded client view;
- final merchant rate без PSP base и OfferPSP margin;
- projected/approved/earned/paid commission;
- statements;
- разделение ролей агентской команды.

## 7. Функциональная матрица админки

| Функция | Статус | Фактическое состояние / пробел |
|---|---|---|
| Staff auth и проверка роли | `VERIFIED` | Работает |
| RU/EN | `VERIFIED` | Работает |
| Lead inbox | `VERIFIED` | Таблица, search и status filter |
| Расширенные фильтры и saved views | `MISSING` | Нет owner/GEO/vertical/source/date/SLA filters |
| Назначение владельца | `MISSING` | Поле в БД есть, UI отсутствует; 0 из 4 active assigned |
| Kanban/pipeline | `MISSING` | Только status dropdown в drawer |
| Command center/next actions | `MISSING` | Статистика не превращена в очередь действий |
| Полный merchant dossier editor | `MISSING` | Поля БД есть, UI показывает legacy profile read-only |
| Structured clarification workflow | `MISSING` | Нет forms/tasks для недостающих полей |
| Lead score/grade | `VERIFIED` | Ручное редактирование есть |
| Internal notes/activity | `VERIFIED` | Базовый audit trail есть |
| Tasks per lead | `PARTIAL` | Создать/закрыть можно, нет общей очереди/assignee/reminders |
| Client messaging | `PARTIAL` | Текст работает, нет unread, attachments, realtime и structured requests |
| Route matching engine | `VERIFIED` backend | Функции и E2E существуют |
| Matching Workbench | `MISSING` | Видны только top-5, score и общий текст |
| Ручной выбор/исключение candidates | `MISSING` | Код автоматически берёт первые пять |
| Shortlist preview | `MISSING` | Staff не видит точный client output до отправки |
| PSP register | `VERIFIED` local | Profile/contact workspace реализован; rollout pending |
| Rate-card import | `PARTIAL` | Только заранее подготовленный JSON |
| Telegram ingestion | `MISSING` | Активного workflow нет |
| Route/anomaly editor | `VERIFIED` local | Routes, fees, limits, settlement и anomaly resolution реализованы; rollout pending |
| Margin editor | `VERIFIED` local | Provider/route margin policies реализованы; rollout pending |
| Publish guard | `VERIFIED` | Error anomalies блокируют публикацию |
| Version diff/history | `PARTIAL` local | Реестр версий и audit history есть; field-by-field diff ещё отсутствует |
| Pause/archive/freshness | `PARTIAL` local | Controls и freshness есть; автоматические reminders отсутствуют |
| Coverage matrix | `MISSING` | Нет обзора ниш и пробелов supply |
| Deal Desk | `MISSING` UI | Dossier/review/Telegram/Zoom/won есть только в RPC/БД |
| Agent management | `MISSING` UI | Только backend foundation |
| Commission operations | `MISSING` UI | Нет реальных policy/ledger records |
| Global tasks/inbox | `MISSING` | Disabled navigation items подтверждают отсутствие |
| Lead notifications | `VERIFIED` | n8n Telegram + email |
| Portal-message notifications staff | `VERIFIED` | n8n Telegram + email |
| Pipeline/reminder/client notifications | `MISSING` | Других OfferPSP workflows нет |
| Analytics | `PARTIAL` | Только базовые counts и funnel snapshot |
| Audit/permissions UI | `MISSING` | Нет управления staff/team access |

## 8. Функциональная матрица клиентского кабинета

| Функция | Статус | Фактическое состояние / пробел |
|---|---|---|
| Email/password, magic link, Google | `VERIFIED` | Работает, но branding требует исправления |
| RU/EN | `VERIFIED` | Есть; выбранный язык сохраняется в браузере |
| Несколько requests | `VERIFIED` | Список и переключение работают |
| Overview counters | `PARTIAL` | Показывают состояние, но не ведут к действиям |
| Понятное next action | `PARTIAL` | Только текст, обычно без кнопки/формы |
| Создать новую задачу | `PARTIAL` | Ведёт на публичную landing form без reuse/prefill |
| Merchant profile/projects | `MISSING` | Нет управления профилем и несколькими merchant projects |
| Structured dossier | `MISSING` | Нельзя заполнить недостающие данные внутри кабинета |
| Documents/uploads | `MISSING` | Нет лицензий и подтверждающих файлов |
| Task list | `MISSING` | Нет списка обязательных действий и completion state |
| Anonymous route comparison | `VERIFIED` | GEO/currency/flow/method/rate/limits/settlement/integration |
| Ответ по option | `VERIFIED` | Interested / Need details / Not suitable |
| Primary/backup choice | `PARTIAL` | Можно отметить несколько Interested без ясной роли |
| Request introduction | `VERIFIED` | RPC работает |
| Missing-info remediation | `BROKEN UX` | Показываются missing fields, но заполнить их негде |
| Deal progress | `PARTIAL` | Status + Telegram/Zoom links, полноценного Deal Room нет |
| PSP questions | `MISSING` | Нет structured requests and responses |
| Persistent conversation | `PARTIAL` | Только простой text chat |
| Notifications/unread | `MISSING` | Нет notification center и unread state |
| Live connections | `PARTIAL` | Счётчик и deal cards, нет lifecycle/change/issues/expansion |
| Team and roles | `MISSING` UI | Organization backend есть |
| Agent merchant portfolio | `MISSING` UI | Отображается только agent banner |
| Agent commission view | `MISSING` UI | Backend foundation без продукта |
| Profile/settings/security | `MISSING` | Только email и sign out |

## 9. UX-проблемы текущей реализации

### P0/P1

1. **Нет действий для `needs_clarification`.** Система знает, чего не хватает, но не даёт клиенту это заполнить.
2. **Нет staff Deal Desk.** Backend flow до `won` нельзя нормально вести через админку.
3. **Matching автоматически помещает первые пять routes в shortlist.** Это опасная подмена review логики.
4. **Нет preview перед share.** Сотрудник не контролирует точный client-facing результат.
5. **Нет route/anomaly editor.** 38 ошибок supply физически нельзя исправить в рабочем UI.
6. **Нет owner и next action.** Заявки превращаются в список, а не процесс.
7. **Слишком много функций спрятано в длинном боковом drawer.** Полный dossier/deal невозможно удобно вести в панели шириной 620 px.
8. **Критически мелкая типографика.** В client request rail и карточках используются размеры 8–11 px; это плохо читается и выглядит как технический прототип.
9. **Технические Supabase error messages выводятся пользователю напрямую.** Нужны безопасные человеческие сообщения и закрытый diagnostic log.
10. **Новая заявка уводит на landing form.** Существующий клиент повторно заполняет данные и теряет ощущение постоянного workspace.

### P2

- Нет saved filters, bulk actions и keyboard-friendly workflow.
- Нет unread indicators.
- Нет mobile bottom navigation/action bar.
- Нет client-visible timeline с датами и владельцем.
- Нет contextual help, definitions и examples для payment terms.
- Нет accessibility pass: шрифты, focus states, landmarks, screen-reader status и contrast требуют отдельной проверки.

## 10. Google OAuth показывает Supabase domain

### Ответ

Это технически штатное поведение Supabase без custom domain, но для OfferPSP это **не нормальный production-брендинг**.

`xcizofpejsomjiflesbx.supabase.co`:

- не является секретом;
- само по себе не даёт доступ к базе;
- не раскрывает ключи или пароли;
- но выглядит подозрительно и снижает доверие клиента;
- облегчает phishing, потому что пользователь не видит явной связи с `offerpsp.com`.

Supabase прямо пишет, что без custom domain Google показывает `<project-id>.supabase.co`, что не вызывает доверия. Источник: [Supabase — Login with Google](https://supabase.com/docs/guides/auth/social-login/auth-google).

### Рекомендуемое исправление

1. Настроить Google Auth Platform Branding:
   - app name `OfferPSP`;
   - logo;
   - homepage `https://offerpsp.com`;
   - privacy и terms;
   - verified domain `offerpsp.com`;
   - корректные authorized origins и redirect URIs.
2. Подключить Supabase custom domain, предпочтительно `api.offerpsp.com`.
3. До активации добавить в Google OAuth оба callback URI:
   - текущий `https://xcizofpejsomjiflesbx.supabase.co/auth/v1/callback`;
   - новый `https://api.offerpsp.com/auth/v1/callback`.
4. Активировать custom domain и проверить Google login для `/admin/` и `/portal/`.
5. После проверки постепенно переключить frontend Supabase URL на custom domain.

Custom domains доступны как paid add-on для проекта на paid plan: [Supabase — Custom Domains](https://supabase.com/docs/guides/platform/custom-domains).

Если сейчас не готовы платить за add-on, Google branding и verification всё равно нужно сделать немедленно. Но полностью убрать случайный Supabase domain с OAuth flow без custom/vanity domain не получится.

## 11. Security findings

### Требует исправления до масштабирования

1. `public.offerpsp_client_shortlist` отмечен Supabase advisor как `SECURITY DEFINER` view (`ERROR`). Production E2E подтвердил фактическую client isolation, поэтому утечка не доказана, но архитектуру нужно заменить на client-safe RPC либо `security_invoker` view с корректными RLS/grants.
2. Многие `SECURITY DEFINER` RPC доступны роли `authenticated`. Это может быть намеренно, но staff-only RPC необходимо отдельно проверить на обязательный internal `is_offerpsp_staff()` guard и минимальные `EXECUTE` grants.
3. Frontend показывает клиенту raw database/RPC errors. Это может раскрывать структуру схемы и ухудшает UX.
4. Magic link использует `shouldCreateUser: true`, а Google login доступен любому Google account. RLS защищает данные, но auth account proliferation, rate-limit abuse и путаница пользователей остаются. Нужны CAPTCHA, нормальный SMTP и ясный invite/claim policy.
5. Нужен audit auth roles: owner/operator/client/agent/foreign-client и периодическая деактивация лишних пользователей. Подход минимальных ролей соответствует практике [Adyen user roles](https://docs.adyen.com/account/user-roles).

### Производительность

Supabase advisor отмечает:

- много foreign keys без covering indexes;
- несколько RLS policies с повторной оценкой `auth.uid()`;
- overlapping permissive policies;
- много неиспользованных indexes.

При текущем объёме это не блокер. Исправлять после стабилизации UI и реальных запросов, не механически удаляя индексы по короткой статистике.

## 12. Автоматизация n8n

`VERIFIED` активны только два OfferPSP workflow:

1. `OfferPSP | Inbound Lead Form` — validation, spam check, запись lead, Telegram и email Boris.
2. `OfferPSP | Portal Message Notification` — проверка сообщения, Telegram и email Boris.

Отсутствуют:

- rate-card ingestion из Telegram;
- parser review notifications;
- stale-offer reminders;
- dossier missing-info notifications;
- PSP review reminders;
- introduction/Telegram/Zoom follow-ups;
- client notifications;
- task due/overdue reminders;
- commission events;
- daily operational digest.

## 13. Приоритетный план

### P0 — сделать существующий процесс реально рабочим

1. Создать полноценную страницу merchant request вместо одного drawer.
2. Добавить owner, next action, deadline и dossier completeness.
3. Сделать structured dossier editor в admin и task-based dossier в portal.
4. Сделать Matching Workbench с ручным выбором routes и client preview.
5. Сделать staff Deal Desk для PSP review → Telegram → Zoom → won/lost.
6. Заменить raw errors безопасными сообщениями.
7. Проверить/исправить `SECURITY DEFINER` client view и staff-only RPC grants.

### P1 — supply и ежедневные операции

1. Задеплоить готовый route/anomaly/margin workspace.
2. Добавить field-by-field version diff и coverage matrix.
3. Общий Tasks/Inbox/Notifications.
4. n8n ingestion, reminders и pipeline automation.
5. Нормальная новая payment request внутри client workspace с reusable profile.
6. Deal Room и live connections.
7. Google branding и `api.offerpsp.com`.

### P2 — агенты и аналитика

1. Staff Agent Operations.
2. Agent portfolio и merchant switcher.
3. Margin/commission workflow и statements.
4. Полная funnel/time/quality/PSP analytics.
5. Co-branding; white-label только после реальных активных агентов.

## 14. Рекомендуемая последовательность экранов

```text
Delivery 1
Admin Command Center
→ Request page + dossier
→ Matching Workbench + shortlist preview
→ Client task-based dossier + request detail

Delivery 2
Deal Desk
→ client Deal Room
→ tasks/inbox/notifications
→ n8n follow-ups

Delivery 3
PSP supply editor
→ anomaly resolution
→ margin/version/freshness
→ publish real BRPay routes

Delivery 4
Agent Operations
→ agent portfolio
→ commissions
→ analytics
```

## 15. Критерий готовности первой рабочей версии

OfferPSP можно считать удобным рабочим продуктом, когда Boris без Supabase и ручных SQL может:

1. открыть admin и увидеть приоритетные действия;
2. квалифицировать заявку и запросить недостающие данные;
3. исправить и опубликовать PSP routes;
4. вручную собрать и проверить shortlist;
5. отправить его клиенту;
6. получить структурированный ответ клиента;
7. отправить dossier PSP;
8. записать решение PSP;
9. создать Telegram и Zoom;
10. закрыть результат;
11. увидеть всю историю, сроки и следующую задачу.

Клиентская версия готова, когда клиент без объяснений в Telegram понимает:

1. что происходит;
2. что требуется от него сейчас;
3. где заполнить данные;
4. как сравнить варианты;
5. как запросить знакомство;
6. где увидеть вопросы PSP, Telegram, Zoom и результат;
7. как открыть следующую платёжную задачу без повторного onboarding.
