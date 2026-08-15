import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { isPortalTerminalStatus, portalEmptyStateKeys } from "/portal/request-state.js";
import {
  localizedClientNote,
  localizedCommercialLine,
  localizedCountryName,
  readableOfferCode,
} from "/portal/offer-localization.js";

const supabase = createClient(
  "https://xcizofpejsomjiflesbx.supabase.co",
  "sb_publishable_8VDTb7EC6ZGATqgMZZgghA_95pAushW",
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } },
);

const MESSAGE_NOTIFICATION_ENDPOINT = "/api/portal-notification";
const LEAD_ENDPOINT = "https://annoris--n8n-make--xjvz9xynmzwk.code.run/webhook/offerpsp-lead-v1";
const LANGUAGE_STORAGE_KEY = "offerpsp-portal-language";
const MESSAGE_REFRESH_INTERVAL_MS = 3000;

const COPY = {
  ru: {
    workspace: "Платёжный кабинет", authTitle: "Ваши платёжные задачи — в одном месте.",
    authCopy: "Войдите с рабочим email из заявки OfferPSP.", workEmail: "Рабочий email", password: "Пароль",
    signIn: "Войти", continueGoogle: "Продолжить с Google", sendLoginLink: "Отправить безопасную ссылку", signOut: "Выйти",
    workspaceTitle: "Платёжные подключения",
    navOverview: "Обзор", navRequests: "Платёжные задачи", navDocuments: "Документы",
    navRoutes: "Маршруты", navConversations: "Диалоги", secureWorkspace: "Защищённый кабинет",
    workspaceCopy: "Заявки, документы, варианты и связь с OfferPSP — в одном защищённом кабинете.",
    getSupport: "Связаться с командой", newRequest: "Новая платёжная задача", activeRequests: "Активные задачи",
    activeRequestsHint: "В работе у команды", availableOptions: "Варианты к выбору", availableOptionsHint: "Готовы к вашему решению",
    liveConnections: "Подключения и знакомства", liveConnectionsHint: "Активные этапы с PSP",
    noRequestTitle: "Создайте первую платёжную задачу",
    noRequestCopy: "Укажите GEO, методы, валюты и объём. Команда проверит профиль, подготовит подходящие маршруты и будет вести процесс в этом кабинете.",
    startHere: "Начните здесь", createRequest: "Создать задачу", requestTimeHint: "Обычно занимает 3–5 минут",
    processTitle: "Как проходит работа", processStepOne: "Запрос и профиль", processStepOneCopy: "Фиксируем задачу и недостающие данные.",
    processStepTwo: "Проверка и подбор", processStepTwoCopy: "Сравниваем только подходящие маршруты.",
    processStepThree: "Решение и знакомство", processStepThreeCopy: "Передаём досье PSP после вашего выбора.",
    prepareTitle: "Что подготовить", prepareCompany: "Сайт и юридическое лицо", prepareCoverage: "Целевые GEO, валюты и методы",
    prepareVolume: "Ожидаемый оборот и лимиты", prepareLicense: "Статус лицензии и документы",
    supportTitle: "Поддержка", supportHeading: "Нужна помощь с формулировкой запроса?",
    supportCopy: "Напишите команде OfferPSP. Поможем собрать требования до отправки задачи.",
    supportDialogEyebrow: "Прямая связь", supportDialogTitle: "Связаться с командой OfferPSP",
    supportDialogIntro: "Напишите прямо из кабинета. Переписка сохранится здесь, а команда получит уведомление.",
    supportMessagePlaceholder: "Чем мы можем помочь?", supportFallback: "Если вопрос срочный:",
    newRequestEyebrow: "Новая задача", newRequestTitle: "Создать платёжную задачу",
    newRequestIntro: "Опишите новое GEO, метод или проблему с действующим подключением. Профиль компании останется связан с этой задачей.",
    selectVertical: "Выберите вертикаль", monthlyVolumeRange: "Ожидаемый оборот в месяц", selectRange: "Выберите диапазон",
    requestDetails: "Что должна решить новая задача?", requestDetailsPlaceholder: "Текущий процессинг, ограничения, сроки или конкретная проблема…",
    newRequestConsent: "Разрешаю OfferPSP использовать эти данные для оценки запроса и связи по подходящим PSP.",
    privacyNotice: "Политика конфиденциальности", cancel: "Отмена", submitRequest: "Создать задачу",
    creatingRequest: "Создаём задачу…", requestCreated: "Задача создана и добавлена в кабинет.",
    requestCreateError: "Не удалось подтвердить создание задачи. Повторите попытку или напишите команде.",
    requestRequired: "Заполните обязательные поля.",
    navCompany: "Компания", navDossier: "Досье", navOptions: "Варианты", navMessages: "Сообщения", requests: "Задачи",
    yourRequests: "Ваши запросы", searchPortfolio: "Мерч, GEO, статус…", selectedRequest: "Выбранная задача", nextStep: "Следующее действие",
    connections: "Знакомства и подключения", dealProgress: "Ход сделки", comparison: "Сравнение",
    yourOptions: "Подобранные маршруты", directLine: "Прямая связь", conversation: "Рабочий чат с OfferPSP",
    messagePlaceholder: "Задайте вопрос или сообщите об изменении…", sendMessage: "Отправить",
    requestReceived: "Заявка получена", qualification: "Уточняем профиль", matching: "Идёт подбор",
    shortlistReady: "Варианты готовы", shared: "Ожидаем ваш выбор", optionSelected: "Вариант выбран",
    dossierReady: "Готовим досье", providerReviewing: "PSP рассматривает", providerNeedsInfo: "Нужны данные",
    providerAccepted: "PSP согласовал знакомство", providerDeclined: "Подбираем замену", telegramCreated: "Telegram создан",
    zoomScheduled: "Zoom запланирован", won: "Подключение подтверждено", lost: "Процесс завершён",
    nextClarify: "Дополните профиль в рабочем чате.",
    nextClarifyCopy: "Для точного подбора или PSP review не хватает данных. Менеджер уточнит конкретные пункты.",
    nextWait: "Мы проверяем рынок и готовим варианты.",
    nextWaitCopy: "Новых действий от вас сейчас не требуется. Обновления появятся здесь и в рабочем чате.",
    nextCompare: "Сравните маршруты и отметьте решение.",
    nextCompareCopy: "Сравнивайте GEO, валюту, метод, лимиты и финальную ставку. Название PSP раскроем после его согласия.",
    nextRequest: "Запросите знакомство по выбранному маршруту.",
    nextRequestCopy: "OfferPSP соберёт досье и передаст его PSP на предварительное рассмотрение.",
    nextReview: "Следите за PSP review.", nextReviewCopy: "Мы ведём рассмотрение. Если PSP запросит данные, задача появится здесь.",
    nextInfo: "Ответьте на запрос PSP в рабочем чате.", nextInfoCopy: "После уточнения мы продолжим review без новой заявки.",
    nextConnect: "Перейдите к знакомству и встрече.", nextConnectCopy: "Ссылки на Telegram и Zoom находятся в блоке сделки.",
    nextWon: "Маршрут сохранён. Создавайте следующую задачу при расширении.",
    nextWonCopy: "Используйте кабинет для нового GEO, метода, резервного PSP или проблемы с действующим маршрутом.",
    nextLost: "Создайте новую задачу или попросите альтернативу.", nextLostCopy: "История сохранена — повторно описывать весь контекст не нужно.",
    matchingProgress: "Мы готовим нормализованные варианты", matchingCopy: "В кабинете появятся только маршруты с понятными условиями.",
    matchingComplete: "По этой задаче нет активных вариантов", matchingCompleteCopy: "Результат сохранён. Можно создать новую задачу.",
    option: "Оффер", clientRate: "Итоговая ставка", methods: "Методы", limits: "Лимиты", settlement: "Расчёты",
    integration: "Интеграция", whyMatched: "Почему подходит", interested: "Интересно", needDetails: "Нужны детали",
    notSuitable: "Не подходит", selectedOptions: "Выбрано", requestIntroduction: "Запросить знакомство с PSP",
    stalenessUpdated: "условия обновлены", stalenessPaused: "оффер приостановлен",
    stalenessUnavailable: "оффер больше недоступен", stalenessExpired: "срок действия истёк",
    stalenessNote: "Этот вариант изменился. Менеджер OfferPSP подготовит актуальную версию.",
    sharedAt: "Обновлено", noMessages: "Сообщений пока нет. Здесь сохраняется весь рабочий контекст.",
    sent: "Сообщение отправлено.", notificationDelayed: "Сообщение сохранено, но уведомление менеджеру задерживается.", loginPassword: "Введите пароль или используйте безопасную ссылку.",
    loginEmail: "Сначала введите рабочий email.", linkSent: "Ссылка отправлена. Проверьте почту.",
    signingIn: "Входим…", sending: "Отправляем…", openingGoogle: "Открываем Google…", saving: "Сохраняем…",
    dossierReadyMessage: "Запрос принят. Мы проверим досье перед отправкой PSP.", missingPrefix: "Нужно дополнить:",
    telegram: "Открыть Telegram", zoom: "Открыть Zoom", managedByAgent: "Агентский кабинет",
    managedClients: "мерчей под управлением", global: "Все GEO", validThrough: "Актуально до",
    completeProfile: "Дополнить профиль", pspReviewProfile: "Профиль для PSP review", companyDossier: "Досье компании",
    dossierExplanation: "Это информация, по которой PSP решает, готов ли он знакомиться и обсуждать подключение.",
    openCompanyProfile: "Открыть и обновить профиль компании", companyName: "Название компании", contactName: "Контактное лицо",
    productUrl: "Ссылка на продукт", registrationGeo: "GEO регистрации", targetGeos: "Целевые GEO", vertical: "Вертикаль",
    businessModel: "Бизнес-модель", licenseStatus: "Статус лицензии", unknown: "Не указано", licensed: "Есть лицензия",
    unlicensed: "Без лицензии", pending: "В процессе", notRequired: "Не требуется", licenseJurisdiction: "Юрисдикция лицензии",
    licenseNumber: "Номер лицензии", licenseEvidence: "Ссылка на подтверждение лицензии", expectedVolume: "Ожидаемый оборот в месяц",
    volumeCurrency: "Валюта оборота", requestedCurrencies: "Валюты обработки", paymentMethods: "Платёжные методы",
    paymentFlows: "Потоки", trafficTypes: "Тип трафика", minimumTransaction: "Минимальная транзакция",
    maximumTransaction: "Максимальная транзакция", transactionCurrency: "Валюта транзакции", launchTimeline: "Когда нужен запуск",
    processingSetup: "Текущий процессинг", saveProfile: "Сохранить профиль", profileComplete: "Профиль готов для PSP review",
    profileSaved: "Профиль сохранён.", profileStillMissing: "Профиль сохранён. Заполните отмеченные пункты.",
    payinSolutions: "Решения PayIn", payoutSolutions: "Решения PayOut", payin: "PayIn", payout: "PayOut",
    geo: "GEO", currency: "Валюта", trafficType: "Тип трафика", openGeo: "Открытые GEO", solution: "Решение",
    cardBrands: "Карты", cardIssue: "Страна выпуска карты", method: "Метод",
    mdrPayin: "MDR PayIn", mdrPayout: "MDR PayOut", minMaxPayin: "Min/Max транзакции PayIn",
    minMaxPayout: "Min/Max транзакции PayOut", settlementCurrency: "Валюта расчётов",
    settlementFee: "Комиссия за расчёт", settlementPeriod: "Период расчётов", minimumSettlement: "Минимальная выплата",
    chargebackFee: "Комиссия Chargeback", refundFee: "Комиссия Refund", rollingReserve: "Rolling Reserve",
    notSpecified: "Не указано", notApplicable: "Не применяется", yes: "Да", no: "Нет", bothTraffic: "Оба",
    selectedForReview: "Выбрано специалистом OfferPSP для вашего рассмотрения.",
    firstRefundRule: "Первый возврат по плательщику проводится без дополнительных вопросов; последующие возвраты по этому плательщику проверяет служба поддержки.",
    offerExplanation: "Условия одного платёжного решения без скрытых догадок.",
    companyCenter: "Компания", companyCenterTitle: "Постоянный профиль компании",
    companyCenterExplanation: "Эти реквизиты и документы используются во всех платёжных задачах. Обновите их один раз — повторно заполнять анкету не придётся.",
    openPersistentProfile: "Открыть профиль и документы компании", brandName: "Название бренда", legalName: "Юридическое название",
    registrationNumber: "Регистрационный номер", registrationJurisdiction: "Страна регистрации", registeredAddress: "Юридический адрес",
    operatingAddress: "Рабочий адрес", companyWebsite: "Сайт компании", companyDescription: "Кратко о компании",
    saveCompanyProfile: "Сохранить профиль компании", companyProfileSaved: "Профиль компании сохранён.",
    documentVault: "Документы", documentVaultTitle: "Приватное хранилище", documentVaultLimit: "PDF, изображения, Word или Excel · до 10 МБ",
    documentType: "Тип документа", documentLicense: "Лицензия", documentCorporate: "Корпоративный документ",
    documentOwnership: "Структура владения", documentFinancial: "Финансовый документ", documentProcessing: "Processing statement",
    documentContract: "Договор", documentOther: "Другое", documentTitle: "Название", documentExpiry: "Действует до",
    chooseDocument: "Выберите файл", documentNote: "Комментарий", uploadDocument: "Загрузить документ",
    documentUploaded: "Документ загружен и отправлен на проверку.", downloadDocument: "Открыть", archiveDocument: "В архив",
    noCompanyDocuments: "Документов пока нет.", verificationUnverified: "Не проверен", verificationInReview: "На проверке",
    verificationVerified: "Проверен", verificationNeedsInformation: "Нужны данные", verificationRejected: "Отклонён",
  },
  en: {
    workspace: "Payment workspace", authTitle: "All your payment work, in one place.",
    authCopy: "Sign in with the work email used for your OfferPSP request.", workEmail: "Work email", password: "Password",
    signIn: "Sign in", continueGoogle: "Continue with Google", sendLoginLink: "Send secure login link", signOut: "Sign out",
    workspaceTitle: "Payment connections",
    navOverview: "Overview", navRequests: "Payment requests", navDocuments: "Documents",
    navRoutes: "Matched routes", navConversations: "Conversations", secureWorkspace: "Secure workspace",
    workspaceCopy: "Requests, documents, options and communication with OfferPSP in one secure workspace.",
    getSupport: "Contact the team", newRequest: "New payment request", activeRequests: "Active requests",
    activeRequestsHint: "In progress with the team", availableOptions: "Options to review", availableOptionsHint: "Ready for your decision",
    liveConnections: "Connections and introductions", liveConnectionsHint: "Active PSP stages",
    noRequestTitle: "Create your first payment request",
    noRequestCopy: "Share the GEOs, methods, currencies and expected volume. The team will review the profile, prepare relevant routes and manage the process here.",
    startHere: "Start here", createRequest: "Create request", requestTimeHint: "Usually takes 3–5 minutes",
    processTitle: "How the process works", processStepOne: "Request and profile", processStepOneCopy: "We capture the task and any missing information.",
    processStepTwo: "Review and matching", processStepTwoCopy: "We compare only relevant routes.",
    processStepThree: "Decision and introduction", processStepThreeCopy: "We send the dossier to the PSP after your choice.",
    prepareTitle: "What to prepare", prepareCompany: "Website and legal entity", prepareCoverage: "Target GEOs, currencies and methods",
    prepareVolume: "Expected volume and limits", prepareLicense: "Licence status and documents",
    supportTitle: "Support", supportHeading: "Need help defining the request?",
    supportCopy: "Contact the OfferPSP team. We will help structure the requirements before submission.",
    supportDialogEyebrow: "Direct line", supportDialogTitle: "Contact the OfferPSP team",
    supportDialogIntro: "Write directly from your workspace. The conversation stays here and the team is notified.",
    supportMessagePlaceholder: "How can we help?", supportFallback: "For urgent matters:",
    newRequestEyebrow: "New request", newRequestTitle: "Create a payment request",
    newRequestIntro: "Describe a new GEO, method or issue with an existing connection. Your company profile will remain linked to this request.",
    selectVertical: "Select vertical", monthlyVolumeRange: "Expected monthly volume", selectRange: "Select range",
    requestDetails: "What should this request solve?", requestDetailsPlaceholder: "Current processing setup, constraints, timing or a specific issue…",
    newRequestConsent: "I allow OfferPSP to use this information to assess the request and contact me about relevant PSPs.",
    privacyNotice: "Privacy Notice", cancel: "Cancel", submitRequest: "Create request",
    creatingRequest: "Creating request…", requestCreated: "The request was created and added to your workspace.",
    requestCreateError: "We could not confirm the request. Try again or contact the team.",
    requestRequired: "Complete the required fields.",
    navCompany: "Company", navDossier: "Dossier", navOptions: "Options", navMessages: "Messages", requests: "Requests",
    yourRequests: "Your requests", searchPortfolio: "Merchant, GEO, status…", selectedRequest: "Selected request", nextStep: "Next action",
    connections: "Introductions and connections", dealProgress: "Deal progress", comparison: "Comparison",
    yourOptions: "Matched routes", directLine: "Direct line", conversation: "OfferPSP workspace chat",
    messagePlaceholder: "Ask a question or share an update…", sendMessage: "Send",
    requestReceived: "Request received", qualification: "Profile clarification", matching: "Matching in progress",
    shortlistReady: "Options ready", shared: "Waiting for your choice", optionSelected: "Option selected",
    dossierReady: "Preparing dossier", providerReviewing: "PSP reviewing", providerNeedsInfo: "Information needed",
    providerAccepted: "PSP approved introduction", providerDeclined: "Finding an alternative", telegramCreated: "Telegram created",
    zoomScheduled: "Zoom scheduled", won: "Connection confirmed", lost: "Process completed",
    nextClarify: "Complete the profile in the workspace chat.",
    nextClarifyCopy: "Specific information is missing for matching or PSP review. Your manager will identify what is needed.",
    nextWait: "We are checking the market and preparing options.",
    nextWaitCopy: "No action is required now. Updates will appear here and in the workspace chat.",
    nextCompare: "Compare the routes and record your decision.",
    nextCompareCopy: "Compare GEO, currency, method, limits and final rate. PSP identity is disclosed after provider approval.",
    nextRequest: "Request an introduction for the selected route.",
    nextRequestCopy: "OfferPSP will assemble the dossier and send it to the PSP for preliminary review.",
    nextReview: "Follow the PSP review.", nextReviewCopy: "We manage the review. Any required action will appear here.",
    nextInfo: "Answer the PSP request in the workspace chat.", nextInfoCopy: "We will continue the same review after clarification.",
    nextConnect: "Continue to the introduction and meeting.", nextConnectCopy: "Telegram and Zoom links are available in the deal section.",
    nextWon: "Route saved. Create the next request when you expand.",
    nextWonCopy: "Use this workspace for a new GEO, method, backup PSP or an issue with a live route.",
    nextLost: "Create a new request or ask for an alternative.", nextLostCopy: "The history is saved, so you do not need to repeat the full context.",
    matchingProgress: "We are preparing normalized options", matchingCopy: "Only routes with clear comparable terms will appear here.",
    matchingComplete: "No active options for this request", matchingCompleteCopy: "The result is saved. You can create a new request.",
    option: "Offer", clientRate: "Final rate", methods: "Methods", limits: "Limits", settlement: "Settlement",
    integration: "Integration", whyMatched: "Why it fits", interested: "Interested", needDetails: "Need details",
    notSuitable: "Not suitable", selectedOptions: "Selected", requestIntroduction: "Request PSP introduction",
    stalenessUpdated: "terms updated", stalenessPaused: "offer paused",
    stalenessUnavailable: "offer no longer available", stalenessExpired: "offer expired",
    stalenessNote: "This option has changed. Your OfferPSP manager will prepare an updated version.",
    sharedAt: "Updated", noMessages: "No messages yet. The full working context stays here.", sent: "Message sent.", notificationDelayed: "Message saved, but the manager notification is delayed.",
    loginPassword: "Enter a password or use a secure link.", loginEmail: "Enter your work email first.",
    linkSent: "Secure link sent. Check your inbox.", signingIn: "Signing in…", sending: "Sending…",
    openingGoogle: "Opening Google…", saving: "Saving…", dossierReadyMessage: "Request accepted. We will verify the dossier before PSP review.",
    missingPrefix: "Please complete:", telegram: "Open Telegram", zoom: "Open Zoom", managedByAgent: "Agent workspace",
    managedClients: "managed merchants", global: "All GEOs", validThrough: "Valid through",
    completeProfile: "Complete profile", pspReviewProfile: "PSP review profile", companyDossier: "Company dossier",
    dossierExplanation: "This is the information a PSP uses to decide whether to meet and discuss the connection.",
    openCompanyProfile: "Open and update company profile", companyName: "Company name", contactName: "Contact name",
    productUrl: "Product URL", registrationGeo: "Registration GEO", targetGeos: "Target GEOs", vertical: "Vertical",
    businessModel: "Business model", licenseStatus: "Licence status", unknown: "Unknown", licensed: "Licensed",
    unlicensed: "Unlicensed", pending: "Pending", notRequired: "Not required", licenseJurisdiction: "Licence jurisdiction",
    licenseNumber: "Licence number", licenseEvidence: "Licence evidence URL", expectedVolume: "Expected monthly volume",
    volumeCurrency: "Volume currency", requestedCurrencies: "Processing currencies", paymentMethods: "Payment methods",
    paymentFlows: "Flows", trafficTypes: "Traffic types", minimumTransaction: "Minimum transaction",
    maximumTransaction: "Maximum transaction", transactionCurrency: "Transaction currency", launchTimeline: "Launch timeline",
    processingSetup: "Current processing setup", saveProfile: "Save profile", profileComplete: "Profile is ready for PSP review",
    profileSaved: "Profile saved.", profileStillMissing: "Profile saved. Complete the highlighted items.",
    payinSolutions: "PayIn solutions", payoutSolutions: "PayOut solutions", payin: "PayIn", payout: "PayOut",
    geo: "GEO", currency: "Currency", trafficType: "Traffic type", openGeo: "Open GEO", solution: "Solution",
    cardBrands: "Card brands", cardIssue: "Card issue", method: "Method",
    mdrPayin: "MDR PayIn", mdrPayout: "MDR PayOut", minMaxPayin: "Min/Max transaction PayIn",
    minMaxPayout: "Min/Max transaction PayOut", settlementCurrency: "Settlement currency",
    settlementFee: "Settlement fee", settlementPeriod: "Settlement period", minimumSettlement: "Minimum settlement",
    chargebackFee: "Chargeback fee", refundFee: "Refund fee", rollingReserve: "Rolling reserve",
    notSpecified: "Not specified", notApplicable: "N/A", yes: "Yes", no: "No", bothTraffic: "Both",
    selectedForReview: "Selected by an OfferPSP specialist for your review.",
    firstRefundRule: "The first refund for a payer is processed without additional questions; subsequent refunds for the same payer are investigated by support.",
    offerExplanation: "One payment solution with explicit commercial terms.",
    companyCenter: "Company", companyCenterTitle: "Persistent company profile",
    companyCenterExplanation: "These details and documents are reused across all payment requests. Update them once instead of completing the same form again.",
    openPersistentProfile: "Open company profile and documents", brandName: "Brand name", legalName: "Legal name",
    registrationNumber: "Registration number", registrationJurisdiction: "Registration country", registeredAddress: "Registered address",
    operatingAddress: "Operating address", companyWebsite: "Company website", companyDescription: "Company summary",
    saveCompanyProfile: "Save company profile", companyProfileSaved: "Company profile saved.",
    documentVault: "Documents", documentVaultTitle: "Private document vault", documentVaultLimit: "PDF, images, Word or Excel · up to 10 MB",
    documentType: "Document type", documentLicense: "Licence", documentCorporate: "Corporate document",
    documentOwnership: "Ownership structure", documentFinancial: "Financial document", documentProcessing: "Processing statement",
    documentContract: "Contract", documentOther: "Other", documentTitle: "Title", documentExpiry: "Valid until",
    chooseDocument: "Choose file", documentNote: "Note", uploadDocument: "Upload document",
    documentUploaded: "Document uploaded and submitted for review.", downloadDocument: "Open", archiveDocument: "Archive",
    noCompanyDocuments: "No documents yet.", verificationUnverified: "Unverified", verificationInReview: "In review",
    verificationVerified: "Verified", verificationNeedsInformation: "Information needed", verificationRejected: "Rejected",
  },
};

const STATUS_KEYS = {
  new: "requestReceived", reviewing: "qualification", qualified: "qualification", qualifying: "qualification",
  needs_clarification: "providerNeedsInfo", matching: "matching", matched: "matching", shortlist_ready: "shortlistReady",
  shared: "shared", option_selected: "optionSelected", dossier_ready: "dossierReady", provider_reviewing: "providerReviewing",
  provider_needs_info: "providerNeedsInfo", provider_accepted: "providerAccepted", provider_declined: "providerDeclined",
  telegram_created: "telegramCreated", zoom_scheduled: "zoomScheduled", negotiating: "telegramCreated", won: "won", lost: "lost",
};

const state = {
  user: null, requests: [], lead: null, allOptions: [], options: [], allDeals: [], deals: [], organizations: [],
  agentBrand: null, profile: null, companyWorkspace: null, conversationId: null, messages: [],
  supportConversationId: null, supportMessages: [], conversationRefreshTimer: null, supportRefreshTimer: null,
  language: "ru", portfolioQuery: "",
};
const ids = [
  "authView", "portalView", "loginForm", "emailInput", "passwordInput", "googleLoginButton", "magicLinkButton",
  "authStatus", "signOutButton", "userEmail", "noRequestState", "workspaceView", "requestList", "requestView", "portfolioSearch", "portfolioResult",
  "activeRequestCount", "availableOptionCount", "liveConnectionCount", "agentBanner", "companyName", "requestMeta",
  "statusPill", "nextActionTitle", "nextActionText", "dealSection", "dealList", "shortlistPending", "pendingTitle",
  "pendingCopy", "shortlistGrid", "shortlistUpdated", "selectedSummary", "optionStatus", "messageList", "messageForm",
  "messageInput", "messageStatus", "openDossierButton", "dossierSection", "clientDossierProgress", "clientDossierTasks",
  "clientDossierEditor", "clientDossierForm", "clientCompany", "clientContactName", "clientTelegram", "clientCompanyUrl",
  "clientRegistrationGeo", "clientTargetGeos", "clientVertical", "clientBusinessModel", "clientLicenseStatus",
  "clientLicenseJurisdiction", "clientLicenseNumber", "clientLicenseEvidenceUrl", "clientMonthlyVolume", "clientVolumeCurrency",
  "clientCurrencies", "clientMethods", "clientFlows", "clientTrafficTypes", "clientMinTransaction", "clientMaxTransaction",
  "clientTransactionCurrency", "clientLaunchTimeline", "clientProcessingSetup", "clientDossierStatus",
  "companyPersistentSection", "companyVerification", "companyProfileProgress", "companyProfileEditor", "companyProfileForm",
  "companyProfileName", "companyProfileLegalName", "companyRegistrationNumber", "companyRegistrationJurisdiction",
  "companyRegisteredAddress", "companyOperatingAddress", "companyWebsiteUrl", "companyLicenseStatus",
  "companyLicenseJurisdiction", "companyLicenseNumber", "companyDescription", "companyProfileStatus",
  "companyDocumentForm", "companyDocumentType", "companyDocumentTitle", "companyDocumentExpiry", "companyDocumentFile",
  "companyDocumentNote", "companyDocumentStatus", "companyDocumentList",
  "newRequestDialog", "newRequestForm", "newRequestName", "newRequestEmail", "newRequestCompany", "newRequestCompanyUrl",
  "newRequestVertical", "newRequestVolume", "newRequestGeos", "newRequestMethods", "newRequestTelegram", "newRequestDetails",
  "newRequestConsent", "newRequestWebsiteUrl", "newRequestStatus", "newRequestSubmit", "portalToast",
  "supportDialog", "supportMessageList", "supportMessageForm", "supportMessageInput", "supportMessageStatus",
];
const elements = Object.fromEntries(ids.map((id) => [id, document.getElementById(id)]));

function t(key) { return COPY[state.language]?.[key] || COPY.en[key] || key; }
function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}
function safeHttpsUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}
function setStatus(element, message = "", type = "") {
  element.textContent = message;
  element.className = `status${type ? ` ${type}` : ""}`;
}
function setLoading(button, loading, label) {
  if (!button.dataset.label) button.dataset.label = button.textContent;
  button.disabled = loading;
  button.textContent = loading ? label : button.dataset.label;
}
function list(value) { return Array.isArray(value) ? value : []; }
function parseList(value) { return String(value || "").split(",").map((item) => item.trim()).filter(Boolean); }
function listInput(value) { return list(value).join(", "); }
function friendlyError(error, fallback) {
  const message = String(error?.message || "");
  if (message.includes("request not found")) return state.language === "ru" ? "Заявка недоступна. Обновите страницу." : "The request is unavailable. Refresh the page.";
  if (message.includes("can no longer be edited")) return state.language === "ru" ? "Завершённую заявку уже нельзя изменять." : "A completed request can no longer be edited.";
  return fallback;
}
function friendlyAuthError(error) {
  const message = String(error?.message || "").toLowerCase();
  if (message.includes("invalid login credentials")) return state.language === "ru" ? "Неверный email или пароль." : "Invalid email or password.";
  if (message.includes("rate limit")) return state.language === "ru" ? "Слишком много попыток. Подождите немного или войдите через Google." : "Too many attempts. Wait a moment or use Google sign-in.";
  return state.language === "ru" ? "Не удалось войти. Попробуйте ещё раз." : "Could not sign in. Please try again.";
}
function formatDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat(state.language === "ru" ? "ru-RU" : "en-GB", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(new Date(value));
}
function formatNumber(value) {
  return value == null ? "" : new Intl.NumberFormat(state.language === "ru" ? "ru-RU" : "en-GB").format(value);
}
function formatFee(fee) {
  const result = [];
  if (fee.client_percent != null) result.push(`${formatNumber(fee.client_percent)}%`);
  if (fee.client_fixed != null) result.push(`${formatNumber(fee.client_fixed)} ${fee.client_fixed_currency || ""}`.trim());
  return result.join(" + ") || "—";
}
function paymentFlow(value) { return String(value || "").toLowerCase(); }
function countryFlag(value) {
  const code = String(value || "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return "🌐";
  return String.fromCodePoint(...[...code].map((character) => 127397 + character.charCodeAt(0)));
}
function countryName(value) {
  const code = String(value || "").trim().toUpperCase();
  try {
    return new Intl.DisplayNames([state.language === "ru" ? "ru" : "en"], { type: "region" }).of(code) || code;
  } catch {
    return code;
  }
}
function readableCode(value) { return readableOfferCode(value, state.language); }
function readableList(values, separator = ", ") { return list(values).map(readableCode).filter(Boolean).join(separator); }
function offerGeo(option) {
  if (option.coverage_scope === "global") return `🌐 ${t("global")}`;
  return list(option.geos).map((geo) => `${countryFlag(geo)} ${countryName(geo)}`).join(", ") || t("notSpecified");
}
function localizedCountryValue(value) {
  return localizedCountryName(value, state.language);
}
function offerLimit(option, requestedFlow) {
  const flow = paymentFlow(requestedFlow);
  const paymentLimits = list(option.limits).filter((limit) => [flow, "both"].includes(paymentFlow(limit.flow)));
  return paymentLimits.map((limit) => {
    const minimum = limit.minimum_amount == null ? "—" : formatNumber(limit.minimum_amount);
    const maximum = limit.maximum_amount == null ? "—" : formatNumber(limit.maximum_amount);
    return `${minimum}–${maximum} ${limit.currency || ""}`.trim();
  }).join("; ") || t("notSpecified");
}
function offerFee(option, flow) {
  const fee = list(option.client_fees).find((item) => paymentFlow(item.flow) === flow);
  return fee ? formatFee(fee) : t("notSpecified");
}
function offerSettlement(option) {
  const terms = list(option.settlement);
  return {
    currency: [...new Set(terms.map((item) => item.currency).filter(Boolean))].join(", ") || t("notSpecified"),
    period: [...new Set(terms.map((item) => item.period).filter(Boolean))].join(", ") || t("notSpecified"),
    minimum: terms.map((item) => item.minimum_amount == null ? "" : `${formatNumber(item.minimum_amount)} ${item.currency || ""}`.trim()).filter(Boolean).join("; ") || t("notSpecified"),
    reserve: terms.map((item) => item.netting_percent == null ? "" : `${formatNumber(item.netting_percent)}%`).filter(Boolean).join("; ") || t("notSpecified"),
  };
}
function trafficDescription(option) {
  const traffic = list(option.traffic_types).map(readableCode).filter(Boolean);
  if (traffic.length > 1) return `${t("bothTraffic")} (${traffic.join(" & ")})`;
  return traffic.join("") || t("notSpecified");
}
function flowMethods(option, flow) {
  const scoped = [
    ...list(option.client_fees).filter((fee) => paymentFlow(fee.flow) === flow).flatMap((fee) => list(fee.method_scope)),
    ...list(option.limits).filter((limit) => [flow, "both"].includes(paymentFlow(limit.flow))).flatMap((limit) => list(limit.method_scope)),
  ];
  return readableList([...new Set(scoped)]) || readableList(option.methods) || t("notSpecified");
}
function supportsFlow(option, flow) {
  const routeFlow = paymentFlow(option.flow);
  return routeFlow === flow || routeFlow === "both"
    || list(option.client_fees).some((fee) => paymentFlow(fee.flow) === flow)
    || list(option.limits).some((limit) => paymentFlow(limit.flow) === flow);
}
function commercialTermLine(label, value, sourcePattern) {
  return localizedCommercialLine(label, value, sourcePattern, state.language);
}
function statusLabel(status) { return t(STATUS_KEYS[status] || status); }
function requestSummary(lead) {
  const parts = [list(lead.target_geos).join(", "), list(lead.requested_currencies).join(", "), list(lead.requested_methods).join(", ")];
  if (lead.expected_monthly_volume != null) parts.push(`${formatNumber(lead.expected_monthly_volume)} ${lead.volume_currency || ""}`.trim());
  return parts.filter(Boolean).join(" · ") || lead.vertical || "OfferPSP";
}
function nextAction(status) {
  if (["new", "reviewing", "qualified", "qualifying", "needs_clarification"].includes(status)) return ["nextClarify", "nextClarifyCopy"];
  if (["matching", "matched", "shortlist_ready", "provider_declined"].includes(status)) return ["nextWait", "nextWaitCopy"];
  if (status === "shared") return ["nextCompare", "nextCompareCopy"];
  if (status === "option_selected") return ["nextRequest", "nextRequestCopy"];
  if (["dossier_ready", "provider_reviewing", "provider_accepted"].includes(status)) return ["nextReview", "nextReviewCopy"];
  if (status === "provider_needs_info") return ["nextInfo", "nextInfoCopy"];
  if (["telegram_created", "zoom_scheduled", "negotiating"].includes(status)) return ["nextConnect", "nextConnectCopy"];
  if (status === "won") return ["nextWon", "nextWonCopy"];
  return ["nextLost", "nextLostCopy"];
}

const DOSSIER_LABELS = {
  legal_name: { ru: "Название компании", en: "Company name" },
  contact_name: { ru: "Контактное лицо", en: "Contact name" },
  contact_email: { ru: "Рабочий email", en: "Work email" },
  product_url: { ru: "Ссылка на казино или продукт", en: "Casino or product URL" },
  target_geos: { ru: "Целевые GEO", en: "Target GEOs" },
  vertical: { ru: "Вертикаль", en: "Vertical" },
  license_status: { ru: "Статус лицензии", en: "Licence status" },
  license_jurisdiction: { ru: "Юрисдикция лицензии", en: "Licence jurisdiction" },
  expected_monthly_volume: { ru: "Ожидаемый месячный оборот", en: "Expected monthly volume" },
  volume_currency: { ru: "Валюта оборота", en: "Volume currency" },
  requested_methods: { ru: "Платёжные методы", en: "Payment methods" },
  requested_flows: { ru: "PayIn / PayOut", en: "PayIn / PayOut" },
};

function dossierLabel(field) {
  return DOSSIER_LABELS[field]?.[state.language] || field.replaceAll("_", " ");
}

function renderDossier() {
  const profile = state.profile;
  if (!profile) {
    elements.clientDossierProgress.textContent = "—";
    elements.clientDossierTasks.innerHTML = `<div class="client-task">${escapeHtml(state.language === "ru" ? "Профиль пока недоступен" : "Profile is currently unavailable")}</div>`;
    return;
  }
  const missing = list(profile.missing_fields);
  const pspRequest = String(profile.psp_requested_information || "").trim();
  const total = 11 + (profile.license_status === "licensed" ? 1 : 0);
  const progress = Math.round((Math.max(0, total - missing.length) / total) * 100);
  elements.clientDossierProgress.textContent = `${progress}%`;
  const tasks = [
    ...(pspRequest ? [`<div class="client-task">${escapeHtml(state.language === "ru" ? `PSP запросил: ${pspRequest}` : `PSP requested: ${pspRequest}`)}</div>`] : []),
    ...missing.map((field) => `<div class="client-task">${escapeHtml(dossierLabel(field))}</div>`),
  ];
  elements.clientDossierTasks.innerHTML = tasks.length
    ? tasks.join("")
    : `<div class="client-task complete">${escapeHtml(t("profileComplete"))}</div>`;
  elements.openDossierButton.classList.toggle("is-hidden", missing.length === 0 && state.lead?.status !== "provider_needs_info");

  elements.clientCompany.value = profile.company || "";
  elements.clientContactName.value = profile.name || "";
  elements.clientTelegram.value = profile.telegram || "";
  elements.clientCompanyUrl.value = profile.company_url || "";
  elements.clientRegistrationGeo.value = profile.registration_geo || "";
  elements.clientTargetGeos.value = listInput(profile.target_geos);
  elements.clientVertical.value = profile.vertical || "";
  elements.clientBusinessModel.value = profile.business_model || "";
  elements.clientLicenseStatus.value = profile.license_status || "unknown";
  elements.clientLicenseJurisdiction.value = profile.license_jurisdiction || "";
  elements.clientLicenseNumber.value = profile.license_number || "";
  elements.clientLicenseEvidenceUrl.value = profile.license_evidence_url || "";
  elements.clientMonthlyVolume.value = profile.expected_monthly_volume ?? "";
  elements.clientVolumeCurrency.value = profile.volume_currency || "";
  elements.clientCurrencies.value = listInput(profile.requested_currencies);
  elements.clientMethods.value = listInput(profile.requested_methods);
  elements.clientFlows.value = listInput(profile.requested_flows);
  elements.clientTrafficTypes.value = listInput(profile.traffic_types);
  elements.clientMinTransaction.value = profile.min_transaction_amount ?? "";
  elements.clientMaxTransaction.value = profile.max_transaction_amount ?? "";
  elements.clientTransactionCurrency.value = profile.transaction_currency || "";
  elements.clientLaunchTimeline.value = profile.launch_timeline || "";
  elements.clientProcessingSetup.value = profile.current_processing_setup || "";
}

const COMPANY_VERIFICATION_KEYS = {
  unverified: "verificationUnverified", in_review: "verificationInReview", verified: "verificationVerified",
  needs_information: "verificationNeedsInformation", rejected: "verificationRejected",
};
const DOCUMENT_TYPE_KEYS = {
  license: "documentLicense", corporate: "documentCorporate", ownership: "documentOwnership",
  financial: "documentFinancial", processing_statement: "documentProcessing", contract: "documentContract", other: "documentOther",
};
const DOCUMENT_STATUS_LABELS = {
  pending: { ru: "Ожидает проверки", en: "Pending review" }, reviewing: { ru: "Проверяется", en: "In review" },
  verified: { ru: "Проверен", en: "Verified" }, rejected: { ru: "Отклонён", en: "Rejected" },
  expired: { ru: "Истёк", en: "Expired" }, archived: { ru: "В архиве", en: "Archived" },
};

function formatFileSize(value) {
  const bytes = Number(value || 0);
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function renderCompanyWorkspace() {
  const workspace = state.companyWorkspace;
  const profile = workspace?.organization;
  elements.companyPersistentSection.classList.toggle("is-hidden", !profile);
  if (!profile) return;
  const verificationKey = COMPANY_VERIFICATION_KEYS[profile.verification_status] || "verificationUnverified";
  elements.companyVerification.textContent = t(verificationKey);
  elements.companyVerification.className = `status-pill company-verification status-${profile.verification_status || "unverified"}`;
  elements.companyProfileProgress.textContent = `${workspace.profile_completion || 0}%`;
  elements.companyProfileName.value = profile.name || "";
  elements.companyProfileLegalName.value = profile.legal_name || "";
  elements.companyRegistrationNumber.value = profile.registration_number || "";
  elements.companyRegistrationJurisdiction.value = profile.registration_jurisdiction || "";
  elements.companyRegisteredAddress.value = profile.registered_address || "";
  elements.companyOperatingAddress.value = profile.operating_address || "";
  elements.companyWebsiteUrl.value = profile.website_url || "";
  elements.companyLicenseStatus.value = profile.license_status || "unknown";
  elements.companyLicenseJurisdiction.value = profile.license_jurisdiction || "";
  elements.companyLicenseNumber.value = profile.license_number || "";
  elements.companyDescription.value = profile.description || "";
  const documents = list(workspace.documents).filter((document) => document.status !== "archived");
  elements.companyDocumentList.innerHTML = documents.length ? documents.map((document) => `
    <article class="company-document-card">
      <div class="company-document-main">
        <span>${escapeHtml(t(DOCUMENT_TYPE_KEYS[document.document_type] || "documentOther"))}</span>
        <strong>${escapeHtml(document.title)}</strong>
        <small>${escapeHtml(document.file_name)}${document.size_bytes ? ` · ${escapeHtml(formatFileSize(document.size_bytes))}` : ""}${document.expires_at ? ` · ${escapeHtml(t("documentExpiry"))}: ${escapeHtml(formatDate(document.expires_at))}` : ""}</small>
        ${document.review_note ? `<p>${escapeHtml(document.review_note)}</p>` : ""}
      </div>
      <div class="company-document-actions">
        <em class="document-status status-${escapeHtml(document.status)}">${escapeHtml(DOCUMENT_STATUS_LABELS[document.status]?.[state.language] || document.status)}</em>
        <button type="button" class="text-button" data-company-document-open="${escapeHtml(document.id)}">${escapeHtml(t("downloadDocument"))}</button>
        <button type="button" class="text-button danger" data-company-document-archive="${escapeHtml(document.id)}">${escapeHtml(t("archiveDocument"))}</button>
      </div>
    </article>`).join("") : `<p class="status">${escapeHtml(t("noCompanyDocuments"))}</p>`;
}

function setLanguage(language) {
  state.language = COPY[language] ? language : "ru";
  localStorage.setItem(LANGUAGE_STORAGE_KEY, state.language);
  document.documentElement.lang = state.language;
  document.querySelectorAll("[data-language]").forEach((button) => button.classList.toggle("active", button.dataset.language === state.language));
  document.querySelectorAll("[data-i18n]").forEach((node) => { node.textContent = t(node.dataset.i18n); });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((node) => { node.placeholder = t(node.dataset.i18nPlaceholder); });
  renderWorkspace();
}

function renderWorkspace() {
  const active = state.requests.filter((request) => !isPortalTerminalStatus(request.status)).length;
  elements.activeRequestCount.textContent = active;
  elements.availableOptionCount.textContent = state.allOptions.filter((option) => {
    const request = state.requests.find((item) => item.lead_id === option.lead_id);
    return request && !isPortalTerminalStatus(request.status) && option.client_response !== "not_suitable";
  }).length;
  elements.liveConnectionCount.textContent = state.allDeals.length;

  const agent = state.organizations.find((organization) => organization.organization_type === "agent");
  elements.agentBanner.classList.toggle("is-hidden", !agent);
  if (agent) {
    const brand = state.agentBrand?.co_brand_enabled ? state.agentBrand : null;
    const displayName = brand?.brand_display_name || agent.name;
    const tagline = state.language === "ru" ? brand?.brand_tagline_ru : brand?.brand_tagline_en;
    const logoUrl = safeHttpsUrl(brand?.brand_logo_url);
    const accent = /^#[0-9A-F]{6}$/i.test(brand?.brand_accent_color || "") ? brand.brand_accent_color : "#A7F3D0";
    const supportEmail = brand?.brand_support_email || "";
    elements.agentBanner.style.setProperty("--agent-accent", accent);
    elements.agentBanner.innerHTML = brand ? `
      <div class="agent-brand-main">
        ${logoUrl ? `<img src="${escapeHtml(logoUrl)}" alt="">` : `<span class="agent-brand-mark">${escapeHtml(displayName.slice(0, 2).toUpperCase())}</span>`}
        <span><strong>${escapeHtml(displayName)}</strong>${tagline ? `<small>${escapeHtml(tagline)}</small>` : ""}</span>
      </div>
      <div class="agent-brand-meta"><span>Powered by OfferPSP</span>${supportEmail ? `<a href="mailto:${escapeHtml(supportEmail)}">${escapeHtml(supportEmail)}</a>` : ""}</div>
    ` : `<strong>${escapeHtml(t("managedByAgent"))}: ${escapeHtml(agent.name)}</strong><span>${escapeHtml(agent.managed_merchants)} ${escapeHtml(t("managedClients"))}</span>`;
  } else {
    state.agentBrand = null;
    elements.agentBanner.removeAttribute("style");
  }

  elements.noRequestState.classList.toggle("is-hidden", state.requests.length > 0);
  elements.workspaceView.classList.toggle("is-hidden", state.requests.length === 0);
  if (!state.requests.length) return;

  const portfolioNeedle = state.portfolioQuery.trim().toLowerCase();
  const visibleRequests = state.requests.filter((request) => !portfolioNeedle || [
    request.company, request.vertical, request.geos, request.status, request.volume_label,
  ].filter(Boolean).join(" ").toLowerCase().includes(portfolioNeedle));
  elements.portfolioResult.textContent = state.language === "ru"
    ? `Показано ${visibleRequests.length} из ${state.requests.length}`
    : `Showing ${visibleRequests.length} of ${state.requests.length}`;
  elements.requestList.innerHTML = visibleRequests.map((request) => `
    <button type="button" class="request-item${request.lead_id === state.lead?.lead_id ? " active" : ""}" data-request-id="${escapeHtml(request.lead_id)}">
      <span class="request-dot status-${escapeHtml(request.status)}"></span>
      <span><strong>${escapeHtml(request.company)}</strong><small>${escapeHtml(requestSummary(request))}</small></span>
      <em>${escapeHtml(statusLabel(request.status))}</em>
    </button>`).join("");
  if (!visibleRequests.length) {
    elements.requestList.innerHTML = `<p class="portfolio-result">${state.language === "ru" ? "Ничего не найдено" : "No matching merchants"}</p>`;
  }
  renderRequest();
}

function renderRequest() {
  const lead = state.lead;
  if (!lead) return;
  elements.companyName.textContent = lead.company;
  elements.requestMeta.textContent = requestSummary(lead);
  elements.statusPill.textContent = statusLabel(lead.status);
  elements.statusPill.className = `status-pill status-${lead.status}`;
  const [titleKey, copyKey] = nextAction(lead.status);
  elements.nextActionTitle.textContent = t(titleKey);
  elements.nextActionText.textContent = t(copyKey);
  renderCompanyWorkspace();
  renderDossier();
  renderDeals();
  renderOptions();
  renderMessages();
}

function renderDeals() {
  elements.dealSection.classList.toggle("is-hidden", state.deals.length === 0);
  elements.dealList.innerHTML = state.deals.map((deal) => `
    <article class="deal-card">
      <div><span>${escapeHtml(deal.option_code)}</span><strong>${escapeHtml(statusLabel(deal.status))}</strong></div>
      <div class="deal-actions">
        ${deal.telegram_group_url ? `<a class="button secondary" href="${escapeHtml(deal.telegram_group_url)}" target="_blank" rel="noopener">${escapeHtml(t("telegram"))}</a>` : ""}
        ${deal.zoom_url ? `<a class="button secondary" href="${escapeHtml(deal.zoom_url)}" target="_blank" rel="noopener">${escapeHtml(t("zoom"))}${deal.zoom_scheduled_at ? ` · ${escapeHtml(formatDate(deal.zoom_scheduled_at))}` : ""}</a>` : ""}
      </div>
    </article>`).join("");
}

function renderOptions() {
  const hasOptions = state.options.length > 0;
  elements.shortlistPending.classList.toggle("is-hidden", hasOptions);
  elements.shortlistGrid.classList.toggle("is-hidden", !hasOptions);
  const [pendingTitle, pendingCopy] = portalEmptyStateKeys(state.lead.status);
  elements.pendingTitle.textContent = t(pendingTitle);
  elements.pendingCopy.textContent = t(pendingCopy);
  elements.shortlistUpdated.textContent = hasOptions ? `${t("sharedAt")}: ${formatDate(state.options[0].shared_at)}` : "";
  elements.shortlistGrid.innerHTML = state.options.map((option) => {
    const settlement = offerSettlement(option);
    const riskTerms = option.risk_terms && typeof option.risk_terms === "object" ? option.risk_terms : {};
    const geos = offerGeo(option);
    const methods = readableList(option.methods) || t("notSpecified");
    const payin = supportsFlow(option, "payin");
    const payout = supportsFlow(option, "payout");
    const chargeback = riskTerms.chargeback || offerFee(option, "chargeback");
    const refund = riskTerms.refund || offerFee(option, "refund");
    const rollingReserve = riskTerms.rolling_reserve || settlement.reserve;
    const hasChargeback = chargeback !== t("notSpecified");
    const hasRefund = refund !== t("notSpecified");
    const hasReserve = rollingReserve !== t("notSpecified");
    const hasSettlementMinimum = settlement.minimum !== t("notSpecified");
    const hasIntegration = readableList(option.integrations) !== "";
    const stalenessKey = { updated: "stalenessUpdated", paused: "stalenessPaused", unavailable: "stalenessUnavailable", expired: "stalenessExpired" }[option.route_staleness_status];
    const stalenessLabel = stalenessKey ? t(stalenessKey) : "";
    const isStale = Boolean(option.route_staleness_status);
    return `<article class="option-card${isStale ? " option-card--stale" : ""}">
      <div class="option-top"><span>${escapeHtml(t("option"))} ${escapeHtml(option.rank)}</span><code>${escapeHtml(option.option_code)}</code>${stalenessLabel ? `<span class="staleness-badge">${escapeHtml(stalenessLabel)}</span>` : ""}</div>
      ${isStale ? `<div class="staleness-notice">${escapeHtml(t("stalenessNote"))}</div>` : ""}
      <div class="telegram-offer">
        <h3>${escapeHtml(`GEO — ${geos}`)} <small>(${escapeHtml(methods)})</small></h3>
        <div class="offer-message-lines">
          <p>${escapeHtml(t("currency"))} — ${escapeHtml(readableList(option.currencies) || t("notSpecified"))}</p>
          <p>${escapeHtml(t("trafficType"))} — ${escapeHtml(trafficDescription(option))}</p>
          <p>${escapeHtml(t("cardBrands"))}: ${escapeHtml(readableList(option.card_brands, " / ") || t("notSpecified"))}</p>
          <p><strong>${escapeHtml(t("method"))}: ${escapeHtml(methods)}</strong></p>
          ${option.card_issue ? `<p>${escapeHtml(t("cardIssue"))}: ${escapeHtml(localizedCountryValue(option.card_issue))}</p>` : ""}
          <p>${escapeHtml(t("openGeo"))}: ${escapeHtml(list(option.geos).join(", ") || t("global"))}</p>
        </div>
        ${payin ? `<section class="offer-flow-message"><h4>${escapeHtml(t("payin"))}</h4>
          <p>${escapeHtml(t("minMaxPayin"))} (${escapeHtml(flowMethods(option, "payin"))}) ${escapeHtml(offerLimit(option, "payin"))}</p>
          <p class="mdr-line">${escapeHtml(t("mdrPayin"))} — <strong>${escapeHtml(offerFee(option, "payin"))}</strong></p>
        </section>` : ""}
        ${payout ? `<section class="offer-flow-message"><h4>${escapeHtml(t("payout"))}</h4>
          <p>${escapeHtml(t("minMaxPayout"))} (${escapeHtml(flowMethods(option, "payout"))}) ${escapeHtml(offerLimit(option, "payout"))}</p>
          <p class="mdr-line">${escapeHtml(t("mdrPayout"))} — <strong>${escapeHtml(offerFee(option, "payout"))}</strong></p>
        </section>` : ""}
        <section class="offer-settlement-message"><h4>${escapeHtml(t("settlement"))}:</h4>
          <p>${escapeHtml(t("settlementCurrency"))}: ${escapeHtml(settlement.currency)}</p>
          <p>${escapeHtml(t("settlementFee"))}: ${escapeHtml(offerFee(option, "settlement"))}</p>
          ${hasSettlementMinimum ? `<p>${escapeHtml(t("minimumSettlement"))}: ${escapeHtml(settlement.minimum)}</p>` : ""}
          <p>${escapeHtml(t("settlementPeriod"))}: ${escapeHtml(settlement.period)}</p>
          ${hasChargeback ? `<p>${escapeHtml(commercialTermLine(t("chargebackFee"), chargeback, /^charge\s?back(?:\s+(?:fee|penalty))?\b/i))}</p>` : ""}
          ${hasRefund ? `<p>${escapeHtml(commercialTermLine(t("refundFee"), refund, /^refund(?:\s+fee)?\b/i))}</p>` : ""}
          ${hasReserve ? `<p>${escapeHtml(commercialTermLine(t("rollingReserve"), rollingReserve, /^(?:rolling reserve|rr)\b/i))}</p>` : ""}
          ${hasIntegration ? `<p>${escapeHtml(t("integration"))}: ${escapeHtml(readableList(option.integrations))}</p>` : ""}
        </section>
      </div>
      <p class="match-reason"><span>${escapeHtml(t("whyMatched"))}</span>${escapeHtml(localizedClientNote(option.client_note, state.language, t("selectedForReview")))}</p>
      ${option.valid_through ? `<small class="validity">${escapeHtml(t("validThrough"))}: ${escapeHtml(formatDate(option.valid_through))}</small>` : ""}
      <div class="option-actions">
        <button type="button" data-option-response="interested" data-option-code="${escapeHtml(option.option_code)}" class="option-button${option.client_response === "interested" ? " active" : ""}"${isStale ? " disabled aria-disabled=\"true\"" : ""}>${escapeHtml(t("interested"))}</button>
        <button type="button" data-option-response="need_details" data-option-code="${escapeHtml(option.option_code)}" class="option-button${option.client_response === "need_details" ? " active" : ""}">${escapeHtml(t("needDetails"))}</button>
        <button type="button" data-option-response="not_suitable" data-option-code="${escapeHtml(option.option_code)}" class="option-button${option.client_response === "not_suitable" ? " active" : ""}">${escapeHtml(t("notSuitable"))}</button>
      </div>
    </article>`;
  }).join("");

  const selected = state.options.filter((option) => option.client_response === "interested");
  elements.selectedSummary.classList.toggle("is-hidden", selected.length === 0);
  elements.selectedSummary.innerHTML = selected.length ? `
    <div><span>${escapeHtml(t("selectedOptions"))}</span><strong>${selected.map((option) => escapeHtml(option.option_code)).join(", ")}</strong></div>
    ${selected.map((option) => `<button class="button primary" type="button" data-request-introduction="${escapeHtml(option.option_code)}">${escapeHtml(t("requestIntroduction"))} · ${escapeHtml(option.option_code)}</button>`).join("")}` : "";
}

function renderMessages() {
  elements.messageList.innerHTML = state.messages.length ? state.messages.map((message) => `
    <article class="message${message.sender_type === "client" ? " client" : ""}">${escapeHtml(message.body)}<small>${escapeHtml(formatDate(message.sent_at))}</small></article>`).join("")
    : `<p class="status">${escapeHtml(t("noMessages"))}</p>`;
  elements.messageList.scrollTop = elements.messageList.scrollHeight;
}

function renderSupportMessages() {
  elements.supportMessageList.innerHTML = state.supportMessages.length ? state.supportMessages.map((message) => `
    <article class="message${message.sender_type === "client" ? " client" : ""}">${escapeHtml(message.body)}<small>${escapeHtml(formatDate(message.sent_at))}</small></article>`).join("")
    : `<p class="status">${escapeHtml(t("noMessages"))}</p>`;
  elements.supportMessageList.scrollTop = elements.supportMessageList.scrollHeight;
}

function messagesChanged(current, next) {
  if (current.length !== next.length) return true;
  return current.some((message, index) => message.id !== next[index]?.id || message.body !== next[index]?.body);
}

async function fetchConversationMessages(conversationId) {
  const messages = await supabase.from("offerpsp_messages").select("id, sender_type, direction, body, sent_at")
    .eq("conversation_id", conversationId).order("sent_at", { ascending: true });
  if (messages.error) throw messages.error;
  return messages.data || [];
}

async function refreshSupportMessages() {
  if (!state.supportConversationId || !state.user) return;
  const nextMessages = await fetchConversationMessages(state.supportConversationId);
  if (!messagesChanged(state.supportMessages, nextMessages)) return;
  state.supportMessages = nextMessages;
  renderSupportMessages();
}

function stopSupportUpdates() {
  window.clearInterval(state.supportRefreshTimer);
  state.supportRefreshTimer = null;
}

function startSupportUpdates() {
  stopSupportUpdates();
  state.supportRefreshTimer = window.setInterval(() => {
    if (elements.supportDialog.open && document.visibilityState === "visible") {
      refreshSupportMessages().catch(() => {});
    }
  }, MESSAGE_REFRESH_INTERVAL_MS);
}

function stopConversationUpdates() {
  window.clearInterval(state.conversationRefreshTimer);
  state.conversationRefreshTimer = null;
}

function startConversationUpdates() {
  stopConversationUpdates();
  state.conversationRefreshTimer = window.setInterval(async () => {
    if (!state.conversationId || !state.user || document.visibilityState !== "visible") return;
    try {
      const nextMessages = await fetchConversationMessages(state.conversationId);
      if (!messagesChanged(state.messages, nextMessages)) return;
      state.messages = nextMessages;
      renderMessages();
    } catch { /* Keep the current conversation visible and retry later. */ }
  }, MESSAGE_REFRESH_INTERVAL_MS);
}

async function loadSupportConversation() {
  const ensured = await supabase.rpc("ensure_offerpsp_portal_support_conversation");
  if (ensured.error) throw ensured.error;
  state.supportConversationId = ensured.data;
  state.supportMessages = await fetchConversationMessages(ensured.data);
}

async function openSupportDialog() {
  if (!state.user || elements.supportDialog.open) return;
  setStatus(elements.supportMessageStatus, t("sending"));
  elements.supportDialog.showModal();
  try {
    await loadSupportConversation();
    setStatus(elements.supportMessageStatus);
    renderSupportMessages();
    startSupportUpdates();
    elements.supportMessageInput.focus();
  } catch (error) {
    setStatus(elements.supportMessageStatus, friendlyError(error, state.language === "ru" ? "Чат поддержки пока недоступен." : "Support chat is currently unavailable."), "error");
  }
}

function closeSupportDialog() {
  const button = elements.supportMessageForm.querySelector("button");
  if (!button.disabled && elements.supportDialog.open) {
    stopSupportUpdates();
    elements.supportDialog.close();
  }
}

async function sendPortalMessage(conversationId, body, button, statusElement) {
  setLoading(button, true, t("sending"));
  const { data: savedMessage, error } = await supabase.from("offerpsp_messages").insert({
    conversation_id: conversationId, sender_type: "client", sender_user_id: state.user.id, direction: "inbound", body,
  }).select("id").single();
  setLoading(button, false);
  if (error) {
    setStatus(statusElement, state.language === "ru" ? "Не удалось отправить сообщение. Текст сохранён в поле — попробуйте ещё раз." : "Could not send the message. Your text is still here; try again.", "error");
    return false;
  }
  let notificationDelivered = false;
  try {
    const session = await supabase.auth.getSession();
    const notification = await fetch(MESSAGE_NOTIFICATION_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.data.session?.access_token || ""}` },
      body: JSON.stringify({ portal_message_id: savedMessage.id }),
    });
    notificationDelivered = notification.ok;
  } catch { /* The database message is already saved. */ }
  setStatus(statusElement, t(notificationDelivered ? "sent" : "notificationDelayed"), notificationDelivered ? "success" : "warning");
  return true;
}

async function enterPortal(session) {
  if (!session?.user) {
    stopSupportUpdates();
    stopConversationUpdates();
    state.user = null; state.requests = []; state.lead = null;
    elements.portalView.classList.add("is-hidden");
    elements.authView.classList.remove("is-hidden");
    return;
  }
  state.user = session.user;
  elements.userEmail.textContent = session.user.email;
  elements.authView.classList.add("is-hidden");
  elements.portalView.classList.remove("is-hidden");
  await supabase.rpc("claim_offerpsp_leads");
  await loadWorkspace();
}

async function loadWorkspace(preferredLeadId = state.lead?.lead_id) {
  const [requestsResult, optionsResult, dealsResult, organizationsResult] = await Promise.all([
    supabase.rpc("list_offerpsp_workspace_requests"),
    supabase.rpc("list_offerpsp_client_offers", { p_lead_id: null }),
    supabase.rpc("list_offerpsp_client_deals", { p_lead_id: null }),
    supabase.rpc("list_offerpsp_my_organizations"),
  ]);
  if (requestsResult.error) {
    setStatus(elements.authStatus, state.language === "ru" ? "Не удалось загрузить рабочий кабинет. Обновите страницу." : "Could not load the workspace. Refresh the page.", "error");
    state.requests = [];
  } else state.requests = requestsResult.data || [];
  state.allOptions = optionsResult.error ? [] : optionsResult.data || [];
  state.allDeals = dealsResult.error ? [] : dealsResult.data || [];
  state.organizations = organizationsResult.error ? [] : organizationsResult.data || [];
  const agent = state.organizations.find((organization) => organization.organization_type === "agent");
  if (agent) {
    const brandResult = await supabase.rpc("get_offerpsp_my_agent_brand", { p_organization_id: agent.organization_id });
    state.agentBrand = brandResult.error ? null : brandResult.data;
  } else state.agentBrand = null;
  const selected = state.requests.find((request) => request.lead_id === preferredLeadId) || state.requests[0] || null;
  await selectRequest(selected?.lead_id);
}

async function selectRequest(leadId) {
  stopConversationUpdates();
  state.lead = state.requests.find((request) => request.lead_id === leadId) || null;
  state.options = state.allOptions.filter((option) => option.lead_id === leadId);
  state.deals = state.allDeals.filter((deal) => deal.lead_id === leadId);
  state.profile = null;
  state.companyWorkspace = null;
  state.conversationId = null;
  state.messages = [];
  if (state.lead) {
    const [profileResult, companyResult] = await Promise.all([
      supabase.rpc("get_offerpsp_client_request_profile", { p_lead_id: leadId }),
      supabase.rpc("get_offerpsp_company_workspace", { p_lead_id: leadId }),
      loadConversation(leadId),
    ]);
    state.profile = profileResult.error ? null : profileResult.data;
    state.companyWorkspace = companyResult.error ? null : companyResult.data;
  }
  renderWorkspace();
}

async function loadConversation(leadId) {
  const { data, error } = await supabase.rpc("ensure_offerpsp_portal_conversation", { p_lead_id: leadId });
  if (error) { setStatus(elements.messageStatus, friendlyError(error, state.language === "ru" ? "Рабочий чат пока недоступен." : "The workspace chat is currently unavailable."), "error"); return; }
  state.conversationId = data;
  try {
    state.messages = await fetchConversationMessages(data);
    startConversationUpdates();
  } catch {
    setStatus(elements.messageStatus, state.language === "ru" ? "Не удалось загрузить сообщения." : "Could not load messages.", "error");
  }
}

function showPortalToast(message, type = "success") {
  elements.portalToast.textContent = message;
  elements.portalToast.className = `portal-toast ${type}`;
  window.clearTimeout(showPortalToast.timer);
  showPortalToast.timer = window.setTimeout(() => elements.portalToast.classList.add("is-hidden"), 6000);
}

function openNewRequestDialog() {
  if (!state.user || elements.newRequestDialog.open) return;
  const companyProfile = state.companyWorkspace?.organization;
  const merchantOrganization = state.organizations.find((organization) => organization.organization_type === "merchant");
  const userName = state.user.user_metadata?.full_name || state.user.user_metadata?.name || "";
  elements.newRequestForm.reset();
  delete elements.newRequestForm.dataset.submissionId;
  elements.newRequestName.value = state.profile?.contact_name || userName;
  elements.newRequestEmail.value = state.user.email || "";
  elements.newRequestCompany.value = state.lead?.company || companyProfile?.name || merchantOrganization?.name || "";
  elements.newRequestCompanyUrl.value = companyProfile?.website_url || state.profile?.company_url || "";
  elements.newRequestTelegram.value = state.profile?.telegram || "";
  const currentVertical = state.lead?.vertical || state.profile?.vertical || "";
  if ([...elements.newRequestVertical.options].some((option) => option.value === currentVertical)) {
    elements.newRequestVertical.value = currentVertical;
  }
  setStatus(elements.newRequestStatus);
  elements.newRequestDialog.showModal();
  elements.newRequestName.focus();
}

function closeNewRequestDialog() {
  if (!elements.newRequestSubmit.disabled && elements.newRequestDialog.open) elements.newRequestDialog.close();
}

document.addEventListener("click", async (event) => {
  const languageButton = event.target.closest("[data-language]");
  if (languageButton) { setLanguage(languageButton.dataset.language); return; }
  if (event.target.closest("[data-open-support]")) { await openSupportDialog(); return; }
  if (event.target.closest("[data-close-support]")) { closeSupportDialog(); return; }
  if (event.target.closest("[data-open-new-request]")) { openNewRequestDialog(); return; }
  if (event.target.closest("[data-close-new-request]")) { closeNewRequestDialog(); return; }
  const requestButton = event.target.closest("[data-request-id]");
  if (requestButton) { await selectRequest(requestButton.dataset.requestId); return; }
  const openDocumentButton = event.target.closest("[data-company-document-open]");
  if (openDocumentButton) {
    const documentItem = list(state.companyWorkspace?.documents).find((item) => item.id === openDocumentButton.dataset.companyDocumentOpen);
    if (!documentItem) return;
    setLoading(openDocumentButton, true, t("saving"));
    const { data, error } = await supabase.storage.from("offerpsp-merchant-documents").download(documentItem.storage_path);
    setLoading(openDocumentButton, false);
    if (error) { setStatus(elements.companyDocumentStatus, friendlyError(error, state.language === "ru" ? "Не удалось открыть документ." : "Could not open the document."), "error"); return; }
    const url = URL.createObjectURL(data);
    const link = document.createElement("a");
    link.href = url; link.download = documentItem.file_name || "document"; link.target = "_blank";
    document.body.appendChild(link); link.click(); link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 30000);
    return;
  }
  const archiveDocumentButton = event.target.closest("[data-company-document-archive]");
  if (archiveDocumentButton) {
    setLoading(archiveDocumentButton, true, t("saving"));
    const { error } = await supabase.rpc("archive_offerpsp_company_document", { p_document_id: archiveDocumentButton.dataset.companyDocumentArchive });
    setLoading(archiveDocumentButton, false);
    if (error) { setStatus(elements.companyDocumentStatus, friendlyError(error, state.language === "ru" ? "Не удалось архивировать документ." : "Could not archive the document."), "error"); return; }
    await selectRequest(state.lead?.lead_id);
    return;
  }
  const responseButton = event.target.closest("[data-option-response]");
  if (responseButton) {
    setLoading(responseButton, true, t("saving"));
    const { error } = await supabase.rpc("respond_offerpsp_option", {
      p_option_code: responseButton.dataset.optionCode,
      p_response: responseButton.dataset.optionResponse,
    });
    setLoading(responseButton, false);
    if (error) { setStatus(elements.optionStatus, friendlyError(error, state.language === "ru" ? "Не удалось сохранить выбор." : "Could not save the choice."), "error"); return; }
    await loadWorkspace(state.lead.lead_id);
    return;
  }
  const introductionButton = event.target.closest("[data-request-introduction]");
  if (introductionButton) {
    setLoading(introductionButton, true, t("sending"));
    const { data, error } = await supabase.rpc("request_offerpsp_introduction", { p_option_code: introductionButton.dataset.requestIntroduction });
    setLoading(introductionButton, false);
    if (error) { setStatus(elements.optionStatus, friendlyError(error, state.language === "ru" ? "Не удалось отправить запрос на знакомство." : "Could not request the introduction."), "error"); return; }
    setStatus(elements.optionStatus, data.status === "ready" ? t("dossierReadyMessage") : `${t("missingPrefix")} ${(data.missing_fields || []).map(dossierLabel).join(", ")}`, data.status === "ready" ? "success" : "error");
    await loadWorkspace(state.lead.lead_id);
    if (data.status !== "ready") {
      elements.clientDossierEditor.open = true;
      elements.dossierSection.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }
});

elements.newRequestDialog.addEventListener("click", (event) => {
  if (event.target === elements.newRequestDialog) closeNewRequestDialog();
});
elements.newRequestDialog.addEventListener("cancel", (event) => {
  if (elements.newRequestSubmit.disabled) event.preventDefault();
});

elements.supportDialog.addEventListener("click", (event) => {
  if (event.target === elements.supportDialog) closeSupportDialog();
});
elements.supportDialog.addEventListener("cancel", (event) => {
  if (elements.supportMessageForm.querySelector("button").disabled) event.preventDefault();
});

elements.newRequestForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setStatus(elements.newRequestStatus);
  if (!elements.newRequestForm.checkValidity()) {
    elements.newRequestForm.reportValidity();
    setStatus(elements.newRequestStatus, t("requestRequired"), "error");
    return;
  }

  const submissionId = elements.newRequestForm.dataset.submissionId || crypto.randomUUID();
  elements.newRequestForm.dataset.submissionId = submissionId;
  const payload = {
    name: elements.newRequestName.value.trim(),
    work_email: state.user.email,
    company: elements.newRequestCompany.value.trim(),
    company_url: elements.newRequestCompanyUrl.value.trim(),
    vertical: elements.newRequestVertical.value,
    monthly_volume: elements.newRequestVolume.value,
    geos: elements.newRequestGeos.value.trim(),
    methods: elements.newRequestMethods.value.trim(),
    telegram: elements.newRequestTelegram.value.trim(),
    details: elements.newRequestDetails.value.trim(),
    website_url: elements.newRequestWebsiteUrl.value,
    consent: elements.newRequestConsent.checked,
    source_category: "portal",
    source_platform: "offerpsp-portal",
    source_referrer: "",
    landing_path: "/portal/",
    submission_id: submissionId,
    attribution: {
      version: 1,
      first_touch: { source_category: "portal", source_platform: "offerpsp-portal", landing_path: "/portal/" },
      last_touch: { source_category: "portal", source_platform: "offerpsp-portal", landing_path: "/portal/" },
      session_id: submissionId,
    },
  };

  setLoading(elements.newRequestSubmit, true, t("creatingRequest"));
  setStatus(elements.newRequestStatus, t("creatingRequest"));
  try {
    const response = await fetch(LEAD_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      body: JSON.stringify(payload),
    });
    let result = null;
    try { result = await response.json(); } catch { result = null; }
    if (!response.ok || !result || result.success !== true) throw new Error("Submission was not confirmed");

    setLoading(elements.newRequestSubmit, false);
    elements.newRequestDialog.close();
    showPortalToast(t("requestCreated"));
    const claimResult = await supabase.rpc("claim_offerpsp_leads");
    if (!claimResult.error) await loadWorkspace(result.lead_id || null);
  } catch {
    setLoading(elements.newRequestSubmit, false);
    setStatus(elements.newRequestStatus, t("requestCreateError"), "error");
  }
});

elements.openDossierButton.addEventListener("click", () => {
  elements.clientDossierEditor.open = true;
  elements.dossierSection.scrollIntoView({ behavior: "smooth", block: "start" });
});

elements.portfolioSearch.addEventListener("input", () => {
  state.portfolioQuery = elements.portfolioSearch.value;
  renderWorkspace();
});

elements.companyDocumentFile.addEventListener("change", () => {
  delete elements.companyDocumentForm.dataset.pendingDocumentId;
  delete elements.companyDocumentForm.dataset.pendingStoragePath;
  if (!elements.companyDocumentTitle.value.trim() && elements.companyDocumentFile.files?.[0]) {
    elements.companyDocumentTitle.value = elements.companyDocumentFile.files[0].name.replace(/\.[^.]+$/, "");
  }
});

elements.companyProfileForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const organizationId = state.companyWorkspace?.organization?.id;
  if (!organizationId || !state.lead) return;
  const button = elements.companyProfileForm.querySelector('button[type="submit"]');
  setLoading(button, true, t("saving"));
  setStatus(elements.companyProfileStatus);
  const payload = {
    name: elements.companyProfileName.value.trim(),
    legal_name: elements.companyProfileLegalName.value.trim(),
    registration_number: elements.companyRegistrationNumber.value.trim(),
    registration_jurisdiction: elements.companyRegistrationJurisdiction.value.trim(),
    registered_address: elements.companyRegisteredAddress.value.trim(),
    operating_address: elements.companyOperatingAddress.value.trim(),
    website_url: elements.companyWebsiteUrl.value.trim(),
    license_status: elements.companyLicenseStatus.value,
    license_jurisdiction: elements.companyLicenseJurisdiction.value.trim(),
    license_number: elements.companyLicenseNumber.value.trim(),
    description: elements.companyDescription.value.trim(),
  };
  const { error } = await supabase.rpc("save_offerpsp_company_profile", { p_organization_id: organizationId, p_payload: payload });
  setLoading(button, false);
  if (error) { setStatus(elements.companyProfileStatus, friendlyError(error, state.language === "ru" ? "Не удалось сохранить профиль компании." : "Could not save the company profile."), "error"); return; }
  await selectRequest(state.lead.lead_id);
  setStatus(elements.companyProfileStatus, t("companyProfileSaved"), "success");
});

elements.companyDocumentForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const organizationId = state.companyWorkspace?.organization?.id;
  const file = elements.companyDocumentFile.files?.[0];
  if (!organizationId || !file || !state.lead) return;
  if (file.size > 10 * 1024 * 1024) {
    setStatus(elements.companyDocumentStatus, state.language === "ru" ? "Файл превышает лимит 10 МБ." : "The file exceeds the 10 MB limit.", "error");
    return;
  }
  const button = elements.companyDocumentForm.querySelector('button[type="submit"]');
  setLoading(button, true, t("saving"));
  setStatus(elements.companyDocumentStatus);
  const documentId = elements.companyDocumentForm.dataset.pendingDocumentId || crypto.randomUUID();
  const safeName = file.name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "document";
  const storagePath = elements.companyDocumentForm.dataset.pendingStoragePath || `${organizationId}/${documentId}/${safeName}`;
  if (!elements.companyDocumentForm.dataset.pendingDocumentId) {
    const uploaded = await supabase.storage.from("offerpsp-merchant-documents").upload(storagePath, file, {
      cacheControl: "3600", contentType: file.type || undefined, upsert: false,
    });
    if (uploaded.error) {
      setLoading(button, false);
      setStatus(elements.companyDocumentStatus, friendlyError(uploaded.error, state.language === "ru" ? "Не удалось загрузить файл." : "Could not upload the file."), "error");
      return;
    }
    elements.companyDocumentForm.dataset.pendingDocumentId = documentId;
    elements.companyDocumentForm.dataset.pendingStoragePath = storagePath;
  }
  const payload = {
    document_type: elements.companyDocumentType.value,
    title: elements.companyDocumentTitle.value.trim(),
    file_name: file.name,
    storage_path: storagePath,
    mime_type: file.type || null,
    size_bytes: file.size,
    expires_at: elements.companyDocumentExpiry.value || null,
    client_note: elements.companyDocumentNote.value.trim() || null,
  };
  const registered = await supabase.rpc("register_offerpsp_company_document", {
    p_organization_id: organizationId, p_document_id: documentId, p_payload: payload,
  });
  setLoading(button, false);
  if (registered.error) {
    setStatus(elements.companyDocumentStatus, friendlyError(registered.error, state.language === "ru" ? "Файл загружен, но карточка документа не создана. Нажмите «Загрузить» ещё раз." : "The file was uploaded but its record was not created. Click Upload again."), "error");
    return;
  }
  delete elements.companyDocumentForm.dataset.pendingDocumentId;
  delete elements.companyDocumentForm.dataset.pendingStoragePath;
  elements.companyDocumentForm.reset();
  await selectRequest(state.lead.lead_id);
  elements.companyProfileEditor.open = true;
  setStatus(elements.companyDocumentStatus, t("documentUploaded"), "success");
});

elements.clientDossierForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!state.lead) return;
  const button = elements.clientDossierForm.querySelector('button[type="submit"]');
  setLoading(button, true, t("saving"));
  setStatus(elements.clientDossierStatus);
  const profile = {
    company: elements.clientCompany.value.trim(),
    name: elements.clientContactName.value.trim(),
    telegram: elements.clientTelegram.value.trim(),
    company_url: elements.clientCompanyUrl.value.trim(),
    registration_geo: elements.clientRegistrationGeo.value.trim(),
    target_geos: parseList(elements.clientTargetGeos.value),
    vertical: elements.clientVertical.value.trim(),
    business_model: elements.clientBusinessModel.value.trim(),
    license_status: elements.clientLicenseStatus.value,
    license_jurisdiction: elements.clientLicenseJurisdiction.value.trim(),
    license_number: elements.clientLicenseNumber.value.trim(),
    license_evidence_url: elements.clientLicenseEvidenceUrl.value.trim(),
    expected_monthly_volume: elements.clientMonthlyVolume.value.trim(),
    volume_currency: elements.clientVolumeCurrency.value.trim(),
    requested_currencies: parseList(elements.clientCurrencies.value),
    requested_methods: parseList(elements.clientMethods.value),
    requested_flows: parseList(elements.clientFlows.value),
    traffic_types: parseList(elements.clientTrafficTypes.value),
    min_transaction_amount: elements.clientMinTransaction.value.trim(),
    max_transaction_amount: elements.clientMaxTransaction.value.trim(),
    transaction_currency: elements.clientTransactionCurrency.value.trim(),
    launch_timeline: elements.clientLaunchTimeline.value.trim(),
    current_processing_setup: elements.clientProcessingSetup.value.trim(),
  };
  const leadId = state.lead.lead_id;
  const { data, error } = await supabase.rpc("update_offerpsp_client_dossier", { p_lead_id: leadId, p_profile: profile });
  setLoading(button, false);
  if (error) {
    setStatus(elements.clientDossierStatus, friendlyError(error, state.language === "ru" ? "Не удалось сохранить профиль." : "Could not save the profile."), "error");
    return;
  }
  await loadWorkspace(leadId);
  setStatus(elements.clientDossierStatus, data.complete ? t("profileSaved") : t("profileStillMissing"), data.complete ? "success" : "error");
});

elements.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const password = elements.passwordInput.value;
  if (!password) { setStatus(elements.authStatus, t("loginPassword"), "error"); return; }
  const button = elements.loginForm.querySelector('button[type="submit"]');
  setLoading(button, true, t("signingIn"));
  const { data, error } = await supabase.auth.signInWithPassword({ email: elements.emailInput.value.trim(), password });
  setLoading(button, false);
  if (error) { setStatus(elements.authStatus, friendlyAuthError(error), "error"); return; }
  await enterPortal(data.session);
});

elements.magicLinkButton.addEventListener("click", async () => {
  const email = elements.emailInput.value.trim();
  if (!email) { setStatus(elements.authStatus, t("loginEmail"), "error"); return; }
  setLoading(elements.magicLinkButton, true, t("sending"));
  const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: `${window.location.origin}/portal/`, shouldCreateUser: true } });
  setLoading(elements.magicLinkButton, false);
  setStatus(elements.authStatus, error ? friendlyAuthError(error) : t("linkSent"), error ? "error" : "success");
});

elements.googleLoginButton.addEventListener("click", async () => {
  setLoading(elements.googleLoginButton, true, t("openingGoogle"));
  const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${window.location.origin}/portal/` } });
  if (error) { setLoading(elements.googleLoginButton, false); setStatus(elements.authStatus, friendlyAuthError(error), "error"); }
});

elements.messageForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const body = elements.messageInput.value.trim();
  if (!body || !state.conversationId) return;
  const button = elements.messageForm.querySelector("button");
  if (!await sendPortalMessage(state.conversationId, body, button, elements.messageStatus)) return;
  elements.messageInput.value = "";
  await loadConversation(state.lead.lead_id);
  renderMessages();
});

elements.supportMessageForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const body = elements.supportMessageInput.value.trim();
  if (!body || !state.supportConversationId) return;
  const button = elements.supportMessageForm.querySelector("button");
  if (!await sendPortalMessage(state.supportConversationId, body, button, elements.supportMessageStatus)) return;
  elements.supportMessageInput.value = "";
  await refreshSupportMessages();
});

elements.signOutButton.addEventListener("click", async () => { await supabase.auth.signOut(); await enterPortal(null); });

setLanguage(localStorage.getItem(LANGUAGE_STORAGE_KEY) || "ru");
const loginUrl = new URL(window.location.href);
const emailTokenHash = loginUrl.searchParams.get("token_hash");
if (emailTokenHash) {
  const { error } = await supabase.auth.verifyOtp({ token_hash: emailTokenHash, type: "email" });
  loginUrl.searchParams.delete("token_hash");
  loginUrl.searchParams.delete("type");
  window.history.replaceState({}, document.title, `${loginUrl.pathname}${loginUrl.search}${loginUrl.hash}`);
  if (error) setStatus(elements.authStatus, friendlyAuthError(error), "error");
}
const { data: { session } } = await supabase.auth.getSession();
await enterPortal(session);
supabase.auth.onAuthStateChange((event, nextSession) => {
  if (event === "SIGNED_OUT") enterPortal(null);
  else if (event === "SIGNED_IN" && nextSession?.user && nextSession.user.id !== state.user?.id) enterPortal(nextSession);
});
