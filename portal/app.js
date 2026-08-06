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

const MESSAGE_NOTIFICATION_ENDPOINT =
  "https://annoris--n8n-make--xjvz9xynmzwk.code.run/webhook/offerpsp-portal-message-v1";
const LANGUAGE_STORAGE_KEY = "offerpsp-portal-language";

const COPY = {
  ru: {
    workspace: "Платёжный кабинет", authTitle: "Ваши платёжные задачи — в одном месте.",
    authCopy: "Войдите с рабочим email из заявки OfferPSP.", workEmail: "Рабочий email", password: "Пароль",
    signIn: "Войти", continueGoogle: "Продолжить с Google", sendLoginLink: "Отправить безопасную ссылку", signOut: "Выйти",
    workspaceTitle: "Управляйте подключениями, а не перепиской по кругу.",
    workspaceCopy: "Новые рынки, маршруты, знакомства и действующие подключения собраны в одном процессе.",
    newRequest: "Новая платёжная задача", activeRequests: "Активные задачи", availableOptions: "Варианты к выбору",
    liveConnections: "Подключения и знакомства", noRequestTitle: "Пока нет платёжных задач.",
    noRequestCopy: "Создайте первую задачу — мы сохраним её здесь и проведём до результата.", requests: "Задачи",
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
    sharedAt: "Обновлено", noMessages: "Сообщений пока нет. Здесь сохраняется весь рабочий контекст.",
    sent: "Сообщение отправлено.", loginPassword: "Введите пароль или используйте безопасную ссылку.",
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
  },
  en: {
    workspace: "Payment workspace", authTitle: "All your payment work, in one place.",
    authCopy: "Sign in with the work email used for your OfferPSP request.", workEmail: "Work email", password: "Password",
    signIn: "Sign in", continueGoogle: "Continue with Google", sendLoginLink: "Send secure login link", signOut: "Sign out",
    workspaceTitle: "Manage payment connections, not scattered conversations.",
    workspaceCopy: "New markets, routes, introductions and live connections follow one reusable process.",
    newRequest: "New payment request", activeRequests: "Active requests", availableOptions: "Options to review",
    liveConnections: "Connections and introductions", noRequestTitle: "No payment requests yet.",
    noRequestCopy: "Create the first request and we will keep its progress and history here.", requests: "Requests",
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
    sharedAt: "Updated", noMessages: "No messages yet. The full working context stays here.", sent: "Message sent.",
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
  profile: null, conversationId: null, messages: [], language: "ru", portfolioQuery: "",
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
];
const elements = Object.fromEntries(ids.map((id) => [id, document.getElementById(id)]));

function t(key) { return COPY[state.language]?.[key] || COPY.en[key] || key; }
function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
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
    elements.agentBanner.innerHTML = `<strong>${escapeHtml(t("managedByAgent"))}: ${escapeHtml(agent.name)}</strong><span>${escapeHtml(agent.managed_merchants)} ${escapeHtml(t("managedClients"))}</span>`;
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
    return `<article class="option-card">
      <div class="option-top"><span>${escapeHtml(t("option"))} ${escapeHtml(option.rank)}</span><code>${escapeHtml(option.option_code)}</code></div>
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
        <button type="button" data-option-response="interested" data-option-code="${escapeHtml(option.option_code)}" class="option-button${option.client_response === "interested" ? " active" : ""}">${escapeHtml(t("interested"))}</button>
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

async function enterPortal(session) {
  if (!session?.user) {
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
  const selected = state.requests.find((request) => request.lead_id === preferredLeadId) || state.requests[0] || null;
  await selectRequest(selected?.lead_id);
}

async function selectRequest(leadId) {
  state.lead = state.requests.find((request) => request.lead_id === leadId) || null;
  state.options = state.allOptions.filter((option) => option.lead_id === leadId);
  state.deals = state.allDeals.filter((deal) => deal.lead_id === leadId);
  state.profile = null;
  state.conversationId = null;
  state.messages = [];
  if (state.lead) {
    const [profileResult] = await Promise.all([
      supabase.rpc("get_offerpsp_client_request_profile", { p_lead_id: leadId }),
      loadConversation(leadId),
    ]);
    state.profile = profileResult.error ? null : profileResult.data;
  }
  renderWorkspace();
}

async function loadConversation(leadId) {
  const { data, error } = await supabase.rpc("ensure_offerpsp_portal_conversation", { p_lead_id: leadId });
  if (error) { setStatus(elements.messageStatus, friendlyError(error, state.language === "ru" ? "Рабочий чат пока недоступен." : "The workspace chat is currently unavailable."), "error"); return; }
  state.conversationId = data;
  const messages = await supabase.from("offerpsp_messages").select("id, sender_type, direction, body, sent_at")
    .eq("conversation_id", data).order("sent_at", { ascending: true });
  if (messages.error) { setStatus(elements.messageStatus, state.language === "ru" ? "Не удалось загрузить сообщения." : "Could not load messages.", "error"); return; }
  state.messages = messages.data || [];
}

document.addEventListener("click", async (event) => {
  const languageButton = event.target.closest("[data-language]");
  if (languageButton) { setLanguage(languageButton.dataset.language); return; }
  const requestButton = event.target.closest("[data-request-id]");
  if (requestButton) { await selectRequest(requestButton.dataset.requestId); return; }
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

elements.openDossierButton.addEventListener("click", () => {
  elements.clientDossierEditor.open = true;
  elements.dossierSection.scrollIntoView({ behavior: "smooth", block: "start" });
});

elements.portfolioSearch.addEventListener("input", () => {
  state.portfolioQuery = elements.portfolioSearch.value;
  renderWorkspace();
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
  setLoading(button, true, t("sending"));
  const { error } = await supabase.from("offerpsp_messages").insert({
    conversation_id: state.conversationId, sender_type: "client", sender_user_id: state.user.id, direction: "inbound", body,
  });
  setLoading(button, false);
  if (error) { setStatus(elements.messageStatus, state.language === "ru" ? "Не удалось отправить сообщение. Текст сохранён в поле — попробуйте ещё раз." : "Could not send the message. Your text is still here; try again.", "error"); return; }
  try {
    await fetch(MESSAGE_NOTIFICATION_ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ company: state.lead.company, sender_email: state.user.email, message: body }) });
  } catch { /* The database message is already saved. */ }
  elements.messageInput.value = "";
  setStatus(elements.messageStatus, t("sent"), "success");
  await loadConversation(state.lead.lead_id);
  renderMessages();
});

elements.signOutButton.addEventListener("click", async () => { await supabase.auth.signOut(); await enterPortal(null); });

setLanguage(localStorage.getItem(LANGUAGE_STORAGE_KEY) || "ru");
const { data: { session } } = await supabase.auth.getSession();
await enterPortal(session);
supabase.auth.onAuthStateChange((event, nextSession) => {
  if (event === "SIGNED_OUT") enterPortal(null);
  else if (event === "SIGNED_IN" && nextSession?.user && nextSession.user.id !== state.user?.id) enterPortal(nextSession);
});
