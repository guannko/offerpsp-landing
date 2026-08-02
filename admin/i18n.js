(() => {
  const STORAGE_KEY = "offerpsp-admin-language";
  const EN_TO_RU = {
    "Private operations desk": "Закрытая рабочая панель",
    "Sign in to the lead desk": "Вход в панель заявок",
    "Merchant requests, matching, tasks and communication in one protected workspace.": "Заявки, подбор PSP, задачи и переписка в одном защищённом кабинете.",
    "Work email": "Рабочий email",
    "Password": "Пароль",
    "Your password": "Ваш пароль",
    "Sign in": "Войти",
    "Continue with Google": "Войти через Google",
    "Email me a secure link": "Получить ссылку на email",
    "Access is limited to approved OfferPSP staff accounts.": "Доступ разрешён только сотрудникам OfferPSP.",
    "Operations": "Управление",
    "Lead desk": "Заявки",
    "Matching": "Подбор PSP",
    "Tasks": "Задачи",
    "PSP supply": "База PSP",
    "PSP register": "Реестр PSP",
    "Offer catalog": "Каталог офферов",
    "Import rate card": "Импорт rate card",
    "Analytics": "Аналитика",
    "Soon": "Скоро",
    "Coming in the next delivery": "Появится в следующем обновлении",
    "Sign out": "Выйти",
    "Open menu": "Открыть меню",
    "Merchant requests": "Заявки мерчантов",
    "Refresh leads": "Обновить заявки",
    "Lead summary": "Сводка по заявкам",
    "Total requests": "Всего заявок",
    "All time": "За всё время",
    "Needs review": "Нужна проверка",
    "New + qualifying": "Новые и на оценке",
    "In matching": "В подборе",
    "Active research": "Идёт подбор",
    "Shortlists ready": "Shortlist готов",
    "Ready to share": "Готов к отправке",
    "Converted": "Конвертировано",
    "Won opportunities": "Успешные сделки",
    "Lead inbox": "Входящие заявки",
    "Loading requests…": "Загружаю заявки…",
    "Search company, email or GEO": "Поиск по компании, email или GEO",
    "Filter by status": "Фильтр по статусу",
    "All statuses": "Все статусы",
    "New": "Новая",
    "Qualifying": "Оценка",
    "Needs clarification": "Нужны уточнения",
    "Shortlist ready": "Shortlist готов",
    "Shared": "Отправлен клиенту",
    "Option selected": "Оффер выбран",
    "Dossier ready": "Досье готово",
    "PSP review": "Проверка PSP",
    "PSP needs info": "PSP запросил данные",
    "PSP accepted": "PSP согласовал",
    "PSP declined": "PSP отказал",
    "Telegram introduction": "Знакомство в Telegram",
    "Zoom scheduled": "Zoom назначен",
    "Negotiating": "Переговоры",
    "Won": "Успешно",
    "Lost": "Потеряна",
    "Loading the lead desk…": "Загружаю панель заявок…",
    "No requests found": "Заявки не найдены",
    "New merchant requests will appear here automatically.": "Новые заявки автоматически появятся здесь.",
    "Merchant": "Мерчант",
    "Operating profile": "Профиль",
    "Volume": "Оборот",
    "Quality": "Качество",
    "Status": "Статус",
    "Received": "Получена",
    "Open": "Открыть",
    "Private PSP supply": "Приватная база PSP",
    "Import reviewed rate-card drafts without exposing PSP pricing to clients": "Импортируйте проверенные rate cards без раскрытия ставок PSP клиентам",
    "PSP supply summary": "Сводка по базе PSP",
    "rate cards": "rate cards",
    "Controlled import": "Контролируемый импорт",
    "Upload prepared rate card": "Загрузить подготовленный rate card",
    "The file creates or updates the PSP and stores the original source, routes and parser warnings as a private draft.": "Файл создаёт или обновляет PSP и приватно сохраняет исходник, маршруты и предупреждения парсера как черновик.",
    "Prepared JSON file": "Подготовленный JSON-файл",
    "Import private draft": "Импортировать приватный черновик",
    "Provider register": "Реестр провайдеров",
    "PSP relationships": "Отношения с PSP",
    "Refresh PSP supply": "Обновить базу PSP",
    "Loading private supply…": "Загружаю приватную базу…",
    "No PSP rate cards imported yet.": "Rate cards PSP ещё не импортированы.",
    "Rate-card register": "Реестр rate cards",
    "Import batches": "Пакеты импорта",
    "Coverage matrix": "Матрица покрытия",
    "What we can offer now": "Что мы можем предложить сейчас",
    "Cross-provider view of active GEOs, currencies, methods and verticals.": "Общая картина активных GEO, валют, методов и вертикалей по всем PSP.",
    "Search GEO, currency, method or PSP": "Поиск GEO, валюты, метода или PSP",
    "Filter coverage routes": "Фильтр маршрутов в матрице",
    "All active routes": "Все активные маршруты",
    "Published only": "Только опубликованные",
    "Draft and review": "Черновики и проверка",
    "Needs attention": "Требуют внимания",
    "Coverage matrix is unavailable until its database migration is applied.": "Матрица покрытия станет доступна после применения миграции базы.",
    "No routes match these filters.": "Под эти фильтры маршруты не найдены.",
    "Coverage": "Покрытие",
    "PSP / route": "PSP / маршрут",
    "Currencies": "Валюты",
    "Methods": "Методы",
    "Verticals": "Вертикали",
    "Readiness": "Готовность",
    "Routes": "Маршруты",
    "GEOs": "GEO",
    "Worldwide": "Весь мир",
    "Regional": "Региональное",
    "Not confirmed": "Не подтверждено",
    "Blocked by errors": "Заблокирован ошибками",
    "Margin required": "Нужно задать маржу",
    "Published · stale": "Опубликован · неактуален",
    "Published · live": "Опубликован · работает",
    "Review · stale": "Проверка · неактуален",
    "Ready for review": "Готов к проверке",
    "warnings": "предупреждений",
    "Private supply is unavailable until its database migration is applied.": "Приватная база станет доступна после применения миграции.",
    "Rate cards": "Rate cards",
    "Published routes": "Опубликованные маршруты",
    "Client rate": "Ставка клиенту",
    "Included by PSP": "Включена PSP",
    "Margin policy": "Правило маржи",
    "No import batches yet.": "Пакетов импорта пока нет.",
    "routes": "маршрутов",
    "open checks": "открытых проверок",
    "Publish": "Опубликовать",
    "The JSON payload is empty.": "JSON-файл пуст.",
    "Provider brand_name is required.": "В файле не указано название PSP.",
    "Original rate-card source text is required.": "В файле отсутствует исходный текст rate card.",
    "The rate-card routes must be an array.": "Маршруты rate card должны быть массивом.",
    "The prepared JSON file must be smaller than 10 MB.": "Подготовленный JSON-файл должен быть меньше 10 МБ.",
    "Choose a valid prepared JSON file first.": "Сначала выберите корректный подготовленный JSON-файл.",
    "This exact source was already imported; no duplicate was created.": "Этот исходник уже импортирован; дубликат не создан.",
    "Could not import the rate card.": "Не удалось импортировать rate card.",
    "Could not read the prepared JSON file.": "Не удалось прочитать подготовленный JSON-файл.",
    "draft": "черновик",
    "review": "проверка",
    "published": "опубликован",
    "superseded": "заменён",
    "archived": "архив",
    "prospect": "потенциальный",
    "onboarding": "подключение",
    "active": "активный",
    "paused": "приостановлен",
    "Conversion snapshot": "Конверсия",
    "Commercial analytics": "Коммерческая аналитика",
    "Where leads stop, which sources work and what needs attention next": "Где останавливаются лиды, какие источники работают и что требует внимания",
    "Main bottleneck": "Главное узкое место",
    "Not enough data yet": "Пока недостаточно данных",
    "The dashboard will identify the largest loss between funnel stages.": "Панель покажет самый большой провал между этапами воронки.",
    "Current workload": "Текущая нагрузка",
    "Requests by stage": "Заявки по этапам",
    "Acquisition": "Привлечение",
    "Lead sources and results": "Источники лидов и результат",
    "Live funnel based on the current lead pipeline": "Актуальная воронка по текущим заявкам",
    "Submitted": "Получено",
    "Qualified": "Оценено",
    "Matched": "Подобрано",
    "Introduced": "Представлено",
    "Lead details": "Детали заявки",
    "Request workspace": "Рабочее место заявки",
    "Merchant request": "Заявка мерчанта",
    "Close": "Закрыть",
    "Pipeline": "Воронка",
    "Quality score": "Оценка качества",
    "Grade": "Категория",
    "Owner": "Ответственный",
    "Unassigned": "Не назначен",
    "Not scored": "Не оценено",
    "A — priority": "A — приоритет",
    "B — qualified": "B — подходит",
    "C — needs work": "C — нужно уточнение",
    "D — low fit": "D — низкое соответствие",
    "Save changes": "Сохранить изменения",
    "PSP matching": "Подбор PSP",
    "Client offers": "Офферы клиенту",
    "Send offer": "Отправить оффер",
    "Manual selection": "Ручной выбор",
    "Send any published route": "Отправить любой опубликованный маршрут",
    "Automatic matching is advisory. You can send a different route whenever it is commercially relevant.": "Автоподбор носит рекомендательный характер. Можно отправить другой маршрут, если он коммерчески уместен.",
    "Search GEO, currency, method or internal PSP name": "Поиск по GEO, валюте, методу или внутреннему названию PSP",
    "Client title": "Заголовок для клиента",
    "Introduction": "Вводный текст",
    "Note shown with every offer": "Заметка у каждого оффера",
    "Create manual preview": "Создать ручной предпросмотр",
    "Selected payment routes": "Подобранные платёжные маршруты",
    "OfferPSP selected these anonymous payment routes for your review.": "OfferPSP подобрал эти конфиденциальные платёжные маршруты для вашего рассмотрения.",
    "Selected manually by OfferPSP for your review.": "Выбрано специалистом OfferPSP для вашего рассмотрения.",
    "Overview": "Обзор",
    "Dossier": "Досье",
    "Deal desk": "Сделка",
    "Tasks & messages": "Задачи и сообщения",
    "Current operation": "Текущая работа",
    "Loading next action…": "Определяю следующий шаг…",
    "Merchant dossier": "Досье мерчанта",
    "Information the PSP needs before it decides whether to meet the merchant.": "Информация, по которой PSP решает, готов ли он знакомиться с мерчантом.",
    "Legal / company name": "Юридическое название / компания",
    "Contact name": "Контактное лицо",
    "Product URL": "Ссылка на продукт",
    "Registration GEO": "GEO регистрации",
    "Target GEOs": "Целевые GEO",
    "Business model": "Бизнес-модель",
    "Licence status": "Статус лицензии",
    "Unknown": "Не указано",
    "Licensed": "Есть лицензия",
    "Unlicensed": "Без лицензии",
    "Pending": "В процессе",
    "Not required": "Не требуется",
    "Licence jurisdiction": "Юрисдикция лицензии",
    "Licence number": "Номер лицензии",
    "Licence evidence URL": "Ссылка на подтверждение лицензии",
    "Expected monthly volume": "Ожидаемый месячный оборот",
    "Volume currency": "Валюта оборота",
    "Requested currencies": "Валюты обработки",
    "Flows": "Потоки",
    "Traffic types": "Типы трафика",
    "Minimum transaction": "Минимальная транзакция",
    "Maximum transaction": "Максимальная транзакция",
    "Transaction currency": "Валюта транзакции",
    "Launch timeline": "Срок запуска",
    "Current processing setup": "Текущий процессинг",
    "Save dossier": "Сохранить досье",
    "Create shortlist preview": "Создать предпросмотр shortlist",
    "Client preview": "Предпросмотр для клиента",
    "PSP review → Telegram introduction → Zoom → result.": "Проверка PSP → знакомство в Telegram → Zoom → результат.",
    "Required PSP review information is complete": "Обязательные данные для PSP review заполнены",
    "Internal decision note": "Внутренняя заметка по решению",
    "Information requested from merchant": "Данные, запрошенные у мерчанта",
    "Send dossier to PSP review": "Отправить досье на проверку PSP",
    "Resubmit updated dossier": "Повторно отправить обновлённое досье",
    "PSP accepted": "PSP согласовал",
    "Request information": "Запросить данные",
    "PSP declined": "PSP отказал",
    "Telegram group title": "Название Telegram-группы",
    "Telegram group URL": "Ссылка на Telegram-группу",
    "Record Telegram introduction": "Зафиксировать знакомство в Telegram",
    "Review channel": "Канал проверки",
    "External reference": "Внешняя ссылка или номер",
    "Chat, ticket or message reference": "Чат, тикет или ссылка на сообщение",
    "Zoom URL": "Ссылка на Zoom",
    "Meeting date and time": "Дата и время встречи",
    "Schedule Zoom": "Назначить Zoom",
    "Outcome note": "Итоговая заметка",
    "Mark live / won": "Отметить запуск / успех",
    "Mark lost": "Отметить потерю",
    "Recommended payment routes": "Рекомендованные платёжные маршруты",
    "Option": "Вариант",
    "Incomplete legacy option": "Неполный старый вариант",
    "Missing normalized route details": "Не хватает нормализованных параметров маршрута",
    "Risk": "Риск",
    "GEO eligible": "Подходит по GEO",
    "Currency eligible": "Подходит по валюте",
    "Payment method eligible": "Подходит по методу оплаты",
    "Method eligible": "Подходит по методу",
    "Traffic type eligible": "Подходит по типу трафика",
    "Traffic eligible": "Подходит по трафику",
    "Transaction range eligible": "Подходит по лимитам транзакций",
    "Freshness requires confirmation": "Нужно подтвердить актуальность оффера",
    "Offer freshness requires confirmation": "Нужно подтвердить актуальность оффера",
    "Loading candidates…": "Загружаю кандидатов…",
    "Run matching": "Запустить подбор",
    "Share shortlist": "Отправить shortlist",
    "Internal note": "Внутренняя заметка",
    "Add qualification context, PSP requirements or next steps…": "Добавьте контекст, требования к PSP или следующие шаги…",
    "Add to history": "Добавить в историю",
    "e.g. Verify licence and processing history": "Например: проверить лицензию и историю процессинга",
    "Priority": "Приоритет",
    "Normal": "Обычный",
    "High": "Высокий",
    "Urgent": "Срочный",
    "Low": "Низкий",
    "Due date": "Срок",
    "Create task": "Создать задачу",
    "Client conversation": "Переписка с клиентом",
    "Reply in the client cabinet…": "Ответить в кабинете клиента…",
    "Send reply": "Отправить ответ",
    "Activity": "История",
    "Could not load requests": "Не удалось загрузить заявки",
    "Unspecified": "Не указано",
    "Contact": "Контакт",
    "Telegram": "Telegram",
    "Company URL": "Сайт компании",
    "Vertical": "Вертикаль",
    "Monthly volume": "Месячный оборот",
    "Markets / GEOs": "Рынки / GEO",
    "Payment methods": "Платёжные методы",
    "Source": "Источник",
    "Consent": "Согласие",
    "Confirmed": "Подтверждено",
    "Not confirmed": "Не подтверждено",
    "Details": "Детали",
    "Loading activity…": "Загружаю историю…",
    "Loading conversation…": "Загружаю переписку…",
    "No activity yet.": "История пока пуста.",
    "No tasks for this request.": "Для этой заявки задач пока нет.",
    "Reopen task": "Открыть задачу снова",
    "Complete task": "Завершить задачу",
    "Could not load candidates": "Не удалось загрузить кандидатов",
    "No candidates generated yet": "Кандидаты пока не подобраны",
    "Run matching to compare this request with the PSP database.": "Запустите подбор, чтобы сравнить заявку с базой PSP.",
    "Manual verification required": "Требуется ручная проверка",
    "review eligible routes": "проверьте подходящие маршруты",
    "Vertical fit": "Подходит по вертикали",
    "No client messages yet.": "Сообщений от клиента пока нет.",
    "Write a reply first.": "Сначала напишите ответ.",
    "Reply sent in client cabinet": "Ответ отправлен в кабинет клиента",
    "Reply published in the client cabinet.": "Ответ опубликован в кабинете клиента.",
    "Score must be a whole number between 0 and 100.": "Оценка должна быть целым числом от 0 до 100.",
    "Lead qualification updated": "Оценка заявки обновлена",
    "Lead saved, but the activity record failed.": "Заявка сохранена, но запись в историю не добавилась.",
    "Changes saved.": "Изменения сохранены.",
    "Write a note first.": "Сначала напишите заметку.",
    "Note added.": "Заметка добавлена.",
    "Give the task a title.": "Укажите название задачи.",
    "Task created.": "Задача создана.",
    "Enter your password or request a secure email link.": "Введите пароль или запросите безопасную ссылку.",
    "Enter your work email first.": "Сначала введите рабочий email.",
    "Secure link sent. Check your inbox.": "Ссылка отправлена. Проверьте почту.",
    "This account is not approved for the OfferPSP desk.": "Этот аккаунт не имеет доступа к OfferPSP.",
    "Could not verify access.": "Не удалось проверить доступ.",
    "Shortlist shared in the client cabinet.": "Shortlist отправлен в кабинет клиента.",
    "Automated qualification and PSP matching completed": "Автоматическая оценка и подбор PSP завершены",
    "New merchant request submitted": "Получена новая заявка мерчанта",
    "Payment methods missing": "Не указаны платёжные методы",
    "Request details are limited": "Недостаточно деталей заявки",
    "owner": "владелец",
    "staff": "сотрудник",
    "system": "система",
    "pending": "ожидает",
    "done": "выполнена",
    "normal": "обычный",
    "high": "высокий",
    "urgent": "срочный",
    "low": "низкий",
    "Signing in…": "Выполняю вход…",
    "Sending…": "Отправляю…",
    "Opening Google…": "Открываю Google…",
    "Saving…": "Сохраняю…",
    "Matching…": "Подбираю…",
    "Sharing…": "Отправляю…",
    "Adding…": "Добавляю…",
    "Creating…": "Создаю…",
    "Importing…": "Импортирую…",
    "Publishing…": "Публикую…",
    "Open workspace": "Открыть рабочую панель",
    "Open errors / warnings": "Открытые ошибки / предупреждения",
    "Stale routes": "Неактуальные маршруты",
    "Last confirmed": "Последнее подтверждение",
    "Never": "Никогда",
    "No working contacts yet.": "Рабочих контактов пока нет.",
    "No active margin policy. Publication is blocked unless the PSP rate already includes commission.": "Активное правило маржи отсутствует. Публикация заблокирована, если комиссия уже не включена в ставку PSP.",
    "No normalized routes.": "Нормализованных маршрутов пока нет.",
    "No parser checks for this PSP.": "Проверок парсера для этого PSP нет.",
    "No rate-card versions.": "Версий rate card пока нет.",
    "No operational changes recorded yet.": "Рабочие изменения пока не зафиксированы.",
    "Open errors": "Открытые ошибки",
    "Open warnings": "Открытые предупреждения",
    "Stale": "Неактуален",
    "Contact": "Контакт",
    "Private PSP operations": "Приватное управление PSP",
    "PSP supply workspace": "Рабочая панель базы PSP",
    "PSP & contacts": "PSP и контакты",
    "Routes & pricing": "Маршруты и ставки",
    "Review queue": "Очередь проверки",
    "Versions & history": "Версии и история",
    "Relationship owner view": "Рабочее место по партнёру",
    "PSP profile": "Профиль PSP",
    "Confirm terms are current": "Подтвердить актуальность условий",
    "Brand name": "Бренд",
    "Legal name": "Юридическое название",
    "Website": "Сайт",
    "Relationship": "Статус отношений",
    "Prospect": "Потенциальный партнёр",
    "Onboarding": "Подключение",
    "Active": "Активный",
    "Paused": "Приостановлен",
    "Archived": "Архив",
    "Strategic priority": "Стратегический приоритет",
    "PSP rate already includes our commission": "Ставка PSP уже включает нашу комиссию",
    "Relationship notes": "Заметки по отношениям",
    "Save PSP profile": "Сохранить профиль PSP",
    "Contacts": "Контакты",
    "People we actually work with at this PSP.": "Люди, с которыми мы реально работаем в этом PSP.",
    "Name": "Имя",
    "Role": "Роль",
    "Region": "Регион",
    "Phone": "Телефон",
    "Preferred channel": "Предпочтительный канал",
    "Not specified": "Не указано",
    "Other": "Другое",
    "Active contact": "Активный контакт",
    "Notes": "Заметки",
    "Save contact": "Сохранить контакт",
    "New contact": "Новый контакт",
    "Our margin": "Наша маржа",
    "PSP base rate stays private; the merchant sees only the final rate.": "Базовая ставка PSP остаётся приватной; мерчант видит только итоговую ставку.",
    "Scope": "Область действия",
    "All PSP routes": "Все маршруты PSP",
    "Flow": "Поток",
    "All": "Все",
    "Pay-in": "Pay-in",
    "Pay-out": "Pay-out",
    "Settlement": "Settlement",
    "Mode": "Режим",
    "Add percentage points": "Добавить процентные пункты",
    "Relative percent": "Относительный процент",
    "Fixed fee": "Фиксированная комиссия",
    "Percent + fixed": "Процент + фикс",
    "Already included": "Уже включено",
    "Percent": "Процент",
    "Fixed amount": "Фиксированная сумма",
    "Currency": "Валюта",
    "Internal note": "Внутренняя заметка",
    "Save new margin policy": "Сохранить новое правило маржи",
    "Normalized routes": "Нормализованные маршруты",
    "Edit working fields without changing the original partner message.": "Редактируйте рабочие поля, не изменяя исходное сообщение партнёра.",
    "Select a route": "Выберите маршрут",
    "Client title": "Название для клиента",
    "Both": "Оба",
    "Coverage": "Покрытие",
    "Specific GEOs": "Конкретные GEO",
    "Regional": "Региональное",
    "Global": "Глобальное",
    "GEOs": "GEO",
    "Blocked GEOs": "Запрещённые GEO",
    "Currencies": "Валюты",
    "Methods": "Методы",
    "Traffic": "Трафик",
    "Verticals": "Вертикали",
    "Integrations": "Интеграции",
    "Minimum monthly volume": "Минимальный месячный оборот",
    "Maximum monthly volume": "Максимальный месячный оборот",
    "Fresh for days": "Срок актуальности, дней",
    "Effective from": "Действует с",
    "Expires": "Истекает",
    "Operational notes": "Операционные заметки",
    "Fees": "Ставки",
    "+ Add fee": "+ Добавить ставку",
    "Limits": "Лимиты",
    "+ Add limit": "+ Добавить лимит",
    "+ Add term": "+ Добавить условие",
    "Save route": "Сохранить маршрут",
    "Pause": "Приостановить",
    "Resume": "Возобновить",
    "Archive": "Архивировать",
    "Every parser error must be corrected or consciously accepted before publication.": "Каждую ошибку парсера нужно исправить или осознанно принять до публикации.",
    "Resolved after correction": "Исправлено",
    "Accept as confirmed": "Принять как подтверждённое",
    "Ignore duplicate/noise": "Игнорировать дубль/шум",
    "Rate-card versions": "Версии rate card",
    "Immutable sources and the operational changes made after parsing.": "Неизменяемые исходники и рабочие изменения после парсинга.",
    "Change history": "История изменений",
    "Control center": "Центр управления",
    "Operations control center": "Операционный центр",
    "Manage the whole network": "Управление всей сетью",
    "Merchants, PSPs, offers and agents stay editable as relationships change.": "Мерчанты, PSP, офферы и агенты остаются управляемыми при любых изменениях отношений.",
    "Refresh control center": "Обновить центр управления",
    "Managed entities": "Управляемые сущности",
    "Merchants": "Мерчанты",
    "PSPs": "PSP",
    "Offers": "Офферы",
    "Agents & organizations": "Агенты и организации",
    "Search merchant or contact": "Поиск мерчанта или контакта",
    "Merchant record state": "Состояние записи мерчанта",
    "All records": "Все записи",
    "PSP record": "Карточка PSP",
    "Add PSP": "Добавить PSP",
    "Tier": "Категория",
    "Top": "Топ",
    "Core": "Основной",
    "Standard": "Стандартный",
    "Watchlist": "Под наблюдением",
    "Margin included by PSP": "Маржа включена PSP",
    "Save PSP": "Сохранить PSP",
    "New PSP": "Новый PSP",
    "Relationship register": "Реестр отношений",
    "All PSPs": "Все PSP",
    "Manual offer": "Ручной оффер",
    "Add an offer from any PSP": "Добавить оффер любого PSP",
    "Creates an editable private draft. The PSP identity stays hidden from clients.": "Создаёт редактируемый приватный черновик. Название PSP остаётся скрытым от клиента.",
    "Choose PSP": "Выберите PSP",
    "Client-safe title": "Название для клиента",
    "Base rate, %": "Базовая ставка, %",
    "Limit currency": "Валюта лимита",
    "Source / internal note": "Источник / внутренняя заметка",
    "Create private draft": "Создать приватный черновик",
    "Offer lifecycle": "Жизненный цикл оффера",
    "How changes work": "Как работают изменения",
    "Draft / review": "Черновик / проверка",
    "Edit rates, GEOs, methods, limits and settlement directly.": "Редактируйте ставки, GEO, методы, лимиты и settlement напрямую.",
    "Published": "Опубликованный",
    "Create a revision; the live offer stays unchanged until the replacement is approved.": "Создайте ревизию; действующий оффер не изменится до утверждения замены.",
    "Margin": "Маржа",
    "Every change creates a new effective version and preserves the previous rate.": "Каждое изменение создаёт новую действующую версию и сохраняет прежнюю ставку.",
    "Leave the market": "Прекращение работы",
    "Pause or archive the route without losing deal history.": "Приостановите или архивируйте маршрут без потери истории сделок.",
    "Organization record": "Карточка организации",
    "Add agent or merchant company": "Добавить агента или компанию мерчанта",
    "Type": "Тип",
    "Agent / affiliate": "Агент / аффилат",
    "Merchant organization": "Компания мерчанта",
    "Save organization": "Сохранить организацию",
    "New organization": "Новая организация",
    "Portfolio register": "Реестр портфелей",
    "Agents and merchant organizations": "Агенты и компании мерчантов",
    "Assign merchant to agent": "Закрепить мерчанта за агентом",
    "Agent": "Агент",
    "Choose agent": "Выберите агента",
    "Choose merchant": "Выберите мерчанта",
    "Save assignment": "Сохранить закрепление",
    "Agent resale margin": "Наценка агента",
    "Merchant scope": "Область мерчантов",
    "All assigned merchants": "Все закреплённые мерчанты",
    "Save new margin version": "Сохранить новую версию маржи",
    "Merchant record": "Карточка мерчанта",
    "Edit the source record, archive inactive requests or remove obvious junk.": "Редактируйте исходную запись, архивируйте неактивные заявки или удаляйте явный мусор.",
    "Company": "Компания",
    "Save merchant": "Сохранить мерчанта",
    "Restore": "Восстановить",
    "Delete permanently": "Удалить навсегда",
    "Create revision": "Создать ревизию",
    "Deactivate": "Отключить",
    "Active merchants": "Активные мерчанты",
    "Active offers": "Активные офферы",
    "Agents": "Агенты",
    "Active status": "Активен",
    "Paused status": "Приостановлен",
    "Archived status": "В архиве",
    "Pending status": "Ожидает",
    "Ended status": "Завершено",
    "Delete": "Удалить",
    "Edit": "Редактировать",
    "No merchant records match this filter.": "Под этот фильтр записи мерчантов не найдены.",
    "No PSP records yet.": "Записей PSP пока нет.",
    "No agent or merchant organizations yet.": "Организаций агентов и мерчантов пока нет.",
    "No merchant portfolios assigned to agents.": "Портфели мерчантов ещё не закреплены за агентами.",
    "Portfolio assignment": "Закрепление портфеля",
    "PSP saved.": "PSP сохранён.",
    "Organization saved.": "Организация сохранена.",
    "Merchant record saved.": "Карточка мерчанта сохранена.",
    "Merchant archived and removed from active work.": "Мерчант архивирован и убран из активной работы.",
    "Merchant restored to active work.": "Мерчант возвращён в активную работу.",
    "Merchant portfolio assignment saved.": "Закрепление мерчанта за агентом сохранено.",
    "New agent margin version is active; the previous version was closed.": "Новая версия маржи агента активна; предыдущая версия закрыта.",
    "Confirming…": "Подтверждаю…"
  };

  const RU_TO_EN = Object.fromEntries(
    Object.entries(EN_TO_RU).map(([english, russian]) => [russian, english]),
  );

  let language = localStorage.getItem(STORAGE_KEY) === "en" ? "en" : "ru";

  function pluralRequests(count) {
    const mod10 = count % 10;
    const mod100 = count % 100;
    if (mod10 === 1 && mod100 !== 11) return "заявка";
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "заявки";
    return "заявок";
  }

  function translateDynamic(text, targetLanguage) {
    if (targetLanguage === "ru") {
      let match = text.match(/^Updated (.+)$/);
      if (match) return `Обновлено ${match[1]}`;
      match = text.match(/^(\d+) requests?$/);
      if (match) return `${match[1]} ${pluralRequests(Number(match[1]))}`;
      match = text.match(/^(\d+)% conversion$/);
      if (match) return `${match[1]}% конверсии`;
      match = text.match(/^(\d+) candidates · (shortlist shared|draft shortlist ready|normalized shortlist ready)$/);
      if (match) {
        return `${match[1]} кандидатов · ${match[2] === "shortlist shared" ? "shortlist отправлен" : match[2] === "normalized shortlist ready" ? "нормализованный shortlist готов" : "черновик shortlist готов"}`;
      }
      match = text.match(/^(\d+) candidates · review eligible routes$/);
      if (match) return `${match[1]} кандидатов · проверьте подходящие маршруты`;
      match = text.match(/^Matching complete: (\d+) eligible routes\.$/);
      if (match) return `Подбор завершён: ${match[1]} подходящих маршрутов.`;
      match = text.match(/^Matching complete: (\d+) eligible routes\. Review and select the routes manually\.$/);
      if (match) return `Подбор завершён: ${match[1]} подходящих маршрутов. Проверьте и выберите маршруты вручную.`;
      match = text.match(/^Matching needs clarification: (.+)\.$/);
      if (match) return `Для подбора нужны уточнения: ${match[1]}.`;
      match = text.match(/^Open (.+)$/);
      if (match) return `Открыть ${match[1]}`;
      match = text.match(/^Status changed to (.+)$/);
      if (match) return `Статус изменён: ${translateText(match[1], "ru")}`;
      match = text.match(/^Task created: (.+)$/);
      if (match) return `Создана задача: ${match[1]}`;
      match = text.match(/^Lead quality: (\d+)\/100 \((.+)\)\. Candidates: (\d+)\.$/);
      if (match) return `Качество лида: ${match[1]}/100 (${match[2]}). Кандидатов: ${match[3]}.`;
      match = text.match(/^Matching complete: (\d+) candidates, grade (.+)\.$/);
      if (match) return `Подбор завершён: ${match[1]} кандидатов, категория ${match[2]}.`;
      match = text.match(/^(.+) · due (.+)$/);
      if (match) return `${translateText(match[1], "ru")} · срок ${match[2]}`;
      match = text.match(/^(\d+) live \/ (\d+) routes$/);
      if (match) return `${match[1]} опубликовано / ${match[2]} маршрутов`;
      match = text.match(/^(\d+) members(?: · (\d+) merchants)?$/);
      if (match) return `${match[1]} участников${match[2] ? ` · ${match[2]} мерчантов` : ""}`;
      match = text.match(/^Private draft (.+) created\.$/);
      if (match) return `Приватный черновик ${match[1]} создан.`;
      match = text.match(/^(.+) permanently deleted\. The deletion audit event was retained\.$/);
      if (match) return `${match[1]} удалён навсегда. Событие удаления сохранено в аудите.`;
    }

    return text;
  }

  function translateText(text, targetLanguage = language) {
    const trimmed = text.trim();
    if (!trimmed) return text;
    const leading = text.slice(0, text.indexOf(trimmed));
    const trailing = text.slice(text.indexOf(trimmed) + trimmed.length);
    const direct = targetLanguage === "ru" ? EN_TO_RU[trimmed] : RU_TO_EN[trimmed];
    const translated = direct || translateDynamic(trimmed, targetLanguage);
    return `${leading}${translated}${trailing}`;
  }

  function translateElement(element) {
    if (!(element instanceof Element)) return;
    for (const attribute of ["placeholder", "aria-label", "title"]) {
      if (!element.hasAttribute(attribute)) continue;
      const value = element.getAttribute(attribute);
      const translated = translateText(value);
      if (translated !== value) element.setAttribute(attribute, translated);
    }
  }

  function translateNode(root = document.body) {
    if (!root) return;
    if (root.nodeType === Node.TEXT_NODE) {
      const translated = translateText(root.nodeValue);
      if (translated !== root.nodeValue) root.nodeValue = translated;
      return;
    }
    if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return;
    if (root.nodeType === Node.ELEMENT_NODE) translateElement(root);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      if (node.nodeType === Node.TEXT_NODE) {
        const translated = translateText(node.nodeValue);
        if (translated !== node.nodeValue) node.nodeValue = translated;
      } else {
        translateElement(node);
      }
      node = walker.nextNode();
    }
  }

  function updateSwitches() {
    document.querySelectorAll("[data-language]").forEach((button) => {
      const active = button.dataset.language === language;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }

  function setLanguage(nextLanguage) {
    language = nextLanguage === "en" ? "en" : "ru";
    localStorage.setItem(STORAGE_KEY, language);
    document.documentElement.lang = language;
    translateNode();
    updateSwitches();
    window.dispatchEvent(new CustomEvent("offerpsp:languagechange", { detail: { language } }));
  }

  document.querySelectorAll("[data-language]").forEach((button) => {
    button.addEventListener("click", () => setLanguage(button.dataset.language));
  });

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "characterData") translateNode(mutation.target);
      mutation.addedNodes.forEach((node) => translateNode(node));
    }
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });

  window.offerPspI18n = {
    getLanguage: () => language,
    setLanguage,
    t: (text) => translateText(text),
    translate: translateNode,
  };

  setLanguage(language);
})();
