import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

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
    clientCabinet: "Кабинет клиента",
    authTitle: "Ваши платёжные варианты — в одном месте.",
    authCopy: "Используйте рабочий email из заявки OfferPSP.",
    workEmail: "Рабочий email",
    password: "Пароль",
    optional: "необязательно",
    signIn: "Войти",
    continueGoogle: "Продолжить с Google",
    sendLoginLink: "Отправить безопасную ссылку",
    signOut: "Выйти",
    noRequestTitle: "Для этого email пока нет заявки.",
    noRequestCopy: "Отправьте заявку с этим рабочим email или свяжитесь с менеджером OfferPSP.",
    submitRequest: "Отправить заявку",
    paymentSearch: "Подбор платёжного решения",
    nextStep: "Следующий шаг",
    curated: "Подобрано под ваш профиль",
    yourOptions: "Ваши платёжные варианты",
    matchingProgress: "Идёт подбор",
    matchingCopy: "Мы сверяем требования с приватной базой PSP. Здесь появятся только проверенные варианты.",
    directLine: "Прямая связь",
    conversation: "Переписка",
    messagePlaceholder: "Задайте вопрос или сообщите обновление…",
    sendMessage: "Отправить",
    requestReceived: "Заявка получена",
    qualification: "Уточнение заявки",
    matching: "Подбор вариантов",
    shortlistReady: "Варианты готовы",
    shared: "Ожидаем ваш выбор",
    optionSelected: "Вариант выбран",
    dossierReady: "Досье готово",
    providerReviewing: "PSP рассматривает заявку",
    providerNeedsInfo: "Нужна дополнительная информация",
    providerAccepted: "PSP подтвердил знакомство",
    providerDeclined: "Подбираем следующий вариант",
    telegramCreated: "Знакомство организовано",
    zoomScheduled: "Zoom запланирован",
    won: "Сотрудничество подтверждено",
    lost: "Процесс завершён",
    nextCompare: "Сравните варианты и отметьте подходящие.",
    nextCompareCopy: "Название PSP остаётся конфиденциальным до согласия провайдера. Вы видите маршрут, лимиты и итоговую ставку для клиента.",
    nextClarify: "Дополните данные заявки.",
    nextClarifyCopy: "Для точного matching или PSP review не хватает обязательной информации. Менеджер уточнит её в переписке.",
    nextRequest: "Запросите знакомство.",
    nextRequestCopy: "Вы выбрали подходящий вариант. Отправьте запрос — OfferPSP подготовит досье и передаст его PSP на предварительное рассмотрение.",
    nextWait: "Мы ведём процесс дальше.",
    nextWaitCopy: "OfferPSP проверяет досье и согласует знакомство с PSP. Провайдер не раскрывается до его явного согласия.",
    nextTelegram: "Продолжайте общение в Telegram.",
    nextTelegramCopy: "Управляемое знакомство состоялось. Коммерческие и технические детали обсуждаются в общей группе.",
    option: "Вариант",
    confidentialRoute: "Конфиденциальный маршрут",
    interested: "Подходит",
    needDetails: "Нужны детали",
    notSuitable: "Не подходит",
    clientRate: "Ставка клиенту",
    limits: "Лимиты",
    settlement: "Расчёты",
    methods: "Методы",
    selectedOptions: "Выбранные варианты",
    requestIntroduction: "Запросить знакомство",
    legacyUpdating: "Менеджер обновляет детали этого варианта перед запросом знакомства.",
    sharedAt: "Опубликовано",
    noMessages: "Сообщений пока нет. Здесь можно задать вопрос или передать обновление.",
    sent: "Сообщение отправлено.",
    loginPassword: "Введите пароль или используйте безопасную ссылку.",
    loginEmail: "Сначала введите рабочий email.",
    linkSent: "Ссылка отправлена. Проверьте почту.",
    signingIn: "Входим…",
    sending: "Отправляем…",
    openingGoogle: "Открываем Google…",
    saving: "Сохраняем…",
    dossierReadyMessage: "Запрос принят. OfferPSP проверит досье перед отправкой PSP.",
    missingPrefix: "Нужно дополнить:",
  },
  en: {
    clientCabinet: "Client cabinet",
    authTitle: "Your payment options, in one place.",
    authCopy: "Use the work email from your OfferPSP request.",
    workEmail: "Work email",
    password: "Password",
    optional: "optional",
    signIn: "Sign in",
    continueGoogle: "Continue with Google",
    sendLoginLink: "Send secure login link",
    signOut: "Sign out",
    noRequestTitle: "No request is linked to this email yet.",
    noRequestCopy: "Submit a request with this work email or contact your OfferPSP manager.",
    submitRequest: "Submit a request",
    paymentSearch: "Payment solution search",
    nextStep: "Next step",
    curated: "Curated for your profile",
    yourOptions: "Your payment options",
    matchingProgress: "Matching is in progress",
    matchingCopy: "We are checking your requirements against the private PSP database. Reviewed options will appear here.",
    directLine: "Direct line",
    conversation: "Conversation",
    messagePlaceholder: "Ask a question or share an update…",
    sendMessage: "Send message",
    requestReceived: "Request received",
    qualification: "Request clarification",
    matching: "Option matching",
    shortlistReady: "Options ready",
    shared: "Waiting for your choice",
    optionSelected: "Option selected",
    dossierReady: "Dossier ready",
    providerReviewing: "PSP is reviewing",
    providerNeedsInfo: "More information required",
    providerAccepted: "PSP approved the introduction",
    providerDeclined: "Selecting another option",
    telegramCreated: "Introduction organized",
    zoomScheduled: "Zoom scheduled",
    won: "Cooperation confirmed",
    lost: "Process completed",
    nextCompare: "Compare the options and mark suitable ones.",
    nextCompareCopy: "The PSP name remains confidential until provider approval. You can compare the route, limits and final client rate.",
    nextClarify: "Complete the request details.",
    nextClarifyCopy: "Required information is missing for accurate matching or PSP review. Your manager will clarify it in the conversation.",
    nextRequest: "Request an introduction.",
    nextRequestCopy: "You selected a suitable option. Submit the request and OfferPSP will prepare the dossier for preliminary PSP review.",
    nextWait: "We are managing the next steps.",
    nextWaitCopy: "OfferPSP is verifying the dossier and obtaining PSP approval. Provider identity stays private until explicit acceptance.",
    nextTelegram: "Continue in Telegram.",
    nextTelegramCopy: "The managed introduction is complete. Commercial and technical discussion continues in the shared group.",
    option: "Option",
    confidentialRoute: "Confidential route",
    interested: "Interested",
    needDetails: "Need details",
    notSuitable: "Not suitable",
    clientRate: "Client rate",
    limits: "Limits",
    settlement: "Settlement",
    methods: "Methods",
    selectedOptions: "Selected options",
    requestIntroduction: "Request introduction",
    legacyUpdating: "Your manager is updating this option before an introduction can be requested.",
    sharedAt: "Shared",
    noMessages: "No messages yet. Use this channel for questions and updates.",
    sent: "Message sent.",
    loginPassword: "Enter your password or use a secure login link.",
    loginEmail: "Enter your work email first.",
    linkSent: "Secure link sent. Check your inbox.",
    signingIn: "Signing in…",
    sending: "Sending…",
    openingGoogle: "Opening Google…",
    saving: "Saving…",
    dossierReadyMessage: "Request received. OfferPSP will verify the dossier before sending it to the PSP.",
    missingPrefix: "Please complete:",
  },
};

const STATUS_KEYS = {
  new: "requestReceived", reviewing: "qualification", qualifying: "qualification",
  needs_clarification: "providerNeedsInfo", qualified: "qualification", matching: "matching",
  matched: "matching", shortlist_ready: "shortlistReady", shared: "shared",
  option_selected: "optionSelected", dossier_ready: "dossierReady",
  provider_reviewing: "providerReviewing", provider_needs_info: "providerNeedsInfo",
  provider_accepted: "providerAccepted", provider_declined: "providerDeclined",
  telegram_created: "telegramCreated", zoom_scheduled: "zoomScheduled",
  negotiating: "telegramCreated", won: "won", closed: "lost", lost: "lost",
};

const state = { user: null, lead: null, options: [], conversationId: null, messages: [], language: "ru" };
const elements = Object.fromEntries([
  "authView", "portalView", "loginForm", "emailInput", "passwordInput", "googleLoginButton",
  "magicLinkButton", "authStatus", "signOutButton", "userEmail", "noRequestState", "requestView",
  "companyName", "requestMeta", "statusPill", "progressLabel", "nextActionTitle", "nextActionText",
  "shortlistPending", "shortlistGrid", "shortlistUpdated", "selectedSummary", "optionStatus",
  "messageList", "messageForm", "messageInput", "messageStatus",
].map((id) => [id, document.getElementById(id)]));

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
function formatDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat(state.language === "ru" ? "ru-RU" : "en-GB", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(new Date(value));
}
function arrayValue(value) { return Array.isArray(value) ? value : []; }
function formatMoney(value, currency) {
  if (value == null) return "";
  return `${new Intl.NumberFormat(state.language === "ru" ? "ru-RU" : "en-GB").format(value)} ${currency || ""}`.trim();
}
function formatFee(fee) {
  const parts = [];
  if (fee.client_percent != null) parts.push(`${fee.client_percent}%`);
  if (fee.client_fixed != null) parts.push(formatMoney(fee.client_fixed, fee.client_fixed_currency));
  return `${fee.flow || ""}${fee.traffic_tier ? ` · ${fee.traffic_tier}` : ""}: ${parts.join(" + ")}`;
}
function applyTranslations() {
  document.documentElement.lang = state.language;
  document.querySelectorAll("[data-i18n]").forEach((node) => { node.textContent = t(node.dataset.i18n); });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((node) => { node.placeholder = t(node.dataset.i18nPlaceholder); });
  document.querySelectorAll("[data-language]").forEach((button) => button.classList.toggle("active", button.dataset.language === state.language));
}
function setLanguage(language) {
  state.language = language === "en" ? "en" : "ru";
  localStorage.setItem(LANGUAGE_STORAGE_KEY, state.language);
  document.querySelectorAll("[data-label]").forEach((button) => { delete button.dataset.label; });
  applyTranslations();
  if (state.lead) renderRequest();
  renderMessages();
}

function resetPortalState() {
  state.lead = null;
  state.options = [];
  state.conversationId = null;
  state.messages = [];
  elements.shortlistGrid.innerHTML = "";
  elements.selectedSummary.innerHTML = "";
  elements.messageList.innerHTML = "";
}

function nextAction() {
  const status = state.lead?.status;
  if (status === "needs_clarification" || status === "provider_needs_info") return ["nextClarify", "nextClarifyCopy"];
  if (["option_selected"].includes(status) || state.options.some((option) => option.client_response === "interested")) return ["nextRequest", "nextRequestCopy"];
  if (["dossier_ready", "provider_reviewing", "provider_accepted", "provider_declined"].includes(status)) return ["nextWait", "nextWaitCopy"];
  if (["telegram_created", "zoom_scheduled", "negotiating", "won"].includes(status)) return ["nextTelegram", "nextTelegramCopy"];
  return ["nextCompare", "nextCompareCopy"];
}

function renderRequest() {
  if (!state.lead) return;
  elements.companyName.textContent = state.lead.company;
  elements.requestMeta.textContent = [state.lead.vertical, state.lead.geos, state.lead.monthly_volume].filter(Boolean).join(" · ");
  const statusKey = STATUS_KEYS[state.lead.status] || "qualification";
  elements.statusPill.textContent = t(statusKey);
  elements.progressLabel.textContent = t(statusKey);
  const [titleKey, copyKey] = nextAction();
  elements.nextActionTitle.textContent = t(titleKey);
  elements.nextActionText.textContent = t(copyKey);
  renderOptions();
}

function renderOptions() {
  if (!state.options.length) {
    elements.shortlistPending.classList.remove("is-hidden");
    elements.shortlistGrid.classList.add("is-hidden");
    elements.selectedSummary.classList.add("is-hidden");
    return;
  }
  elements.shortlistPending.classList.add("is-hidden");
  elements.shortlistGrid.classList.remove("is-hidden");
  const firstSharedAt = state.options[0].shared_at;
  elements.shortlistUpdated.textContent = firstSharedAt ? `${t("sharedAt")} ${formatDate(firstSharedAt)}` : "";
  elements.shortlistGrid.innerHTML = state.options.map((option) => {
    const fees = arrayValue(option.client_fees);
    const limits = arrayValue(option.limits);
    const settlements = arrayValue(option.settlement);
    const detailsReady = Boolean(option.route_title);
    return `
      <article class="psp-card${option.client_response ? " responded" : ""}">
        <div class="psp-card-head">
          <div>
            <span class="psp-rank">${escapeHtml(t("option"))} ${escapeHtml(option.rank)}</span>
            <h3>${escapeHtml(option.option_code)}</h3>
          </div>
          ${option.client_response ? `<span class="response-pill">${escapeHtml(t({ interested: "interested", need_details: "needDetails", not_suitable: "notSuitable" }[option.client_response]))}</span>` : ""}
        </div>
        <strong class="route-title">${escapeHtml(option.route_title || t("confidentialRoute"))}</strong>
        <p>${escapeHtml(option.client_note)}</p>
        ${fees.length ? `<div class="offer-detail"><span>${escapeHtml(t("clientRate"))}</span><strong>${fees.map(formatFee).map(escapeHtml).join("<br>")}</strong></div>` : ""}
        ${limits.length ? `<div class="offer-detail"><span>${escapeHtml(t("limits"))}</span><strong>${limits.slice(0, 3).map((limit) => `${limit.flow}: ${formatMoney(limit.minimum_amount, limit.currency)}–${formatMoney(limit.maximum_amount, limit.currency)}`).map(escapeHtml).join("<br>")}</strong></div>` : ""}
        ${settlements.length ? `<div class="offer-detail"><span>${escapeHtml(t("settlement"))}</span><strong>${settlements.slice(0, 2).map((item) => [item.period, item.currency].filter(Boolean).join(" · ")).map(escapeHtml).join("<br>")}</strong></div>` : ""}
        <div class="psp-tags">${arrayValue(option.methods).map((method) => `<span>${escapeHtml(method)}</span>`).join("")}${arrayValue(option.currencies).map((currency) => `<span>${escapeHtml(currency)}</span>`).join("")}</div>
        <div class="option-actions">
          <button type="button" data-option-response="interested" data-option-code="${escapeHtml(option.option_code)}" class="option-button${option.client_response === "interested" ? " active" : ""}">${escapeHtml(t("interested"))}</button>
          <button type="button" data-option-response="need_details" data-option-code="${escapeHtml(option.option_code)}" class="option-button${option.client_response === "need_details" ? " active" : ""}">${escapeHtml(t("needDetails"))}</button>
          <button type="button" data-option-response="not_suitable" data-option-code="${escapeHtml(option.option_code)}" class="option-button${option.client_response === "not_suitable" ? " active" : ""}">${escapeHtml(t("notSuitable"))}</button>
        </div>
        ${!detailsReady && option.client_response === "interested" ? `<p class="legacy-note">${escapeHtml(t("legacyUpdating"))}</p>` : ""}
      </article>`;
  }).join("");

  const selected = state.options.filter((option) => option.client_response === "interested");
  if (!selected.length) {
    elements.selectedSummary.classList.add("is-hidden");
  } else {
    elements.selectedSummary.classList.remove("is-hidden");
    elements.selectedSummary.innerHTML = `
      <div><span>${escapeHtml(t("selectedOptions"))}</span><strong>${selected.map((option) => option.option_code).join(", ")}</strong></div>
      ${selected.filter((option) => option.route_title).map((option) => `<button class="button primary" type="button" data-request-introduction="${escapeHtml(option.option_code)}">${escapeHtml(t("requestIntroduction"))} · ${escapeHtml(option.option_code)}</button>`).join("")}`;
  }
}

function renderMessages() {
  if (!elements.messageList) return;
  if (!state.messages.length) {
    elements.messageList.innerHTML = `<p class="status">${escapeHtml(t("noMessages"))}</p>`;
    return;
  }
  elements.messageList.innerHTML = state.messages.map((message) => `
    <article class="message${message.sender_type === "client" ? " client" : ""}">
      ${escapeHtml(message.body)}<small>${escapeHtml(formatDate(message.sent_at))}</small>
    </article>`).join("");
  elements.messageList.scrollTop = elements.messageList.scrollHeight;
}

async function enterPortal(session) {
  if (!session?.user) {
    state.user = null;
    resetPortalState();
    elements.portalView.classList.add("is-hidden");
    elements.authView.classList.remove("is-hidden");
    return;
  }
  state.user = session.user;
  elements.userEmail.textContent = session.user.email;
  elements.authView.classList.add("is-hidden");
  elements.portalView.classList.remove("is-hidden");
  await supabase.rpc("claim_offerpsp_leads");
  await loadRequest();
}

async function loadRequest() {
  const { data, error } = await supabase.from("offerpsp_leads")
    .select("lead_id, company, vertical, geos, methods, monthly_volume, status, submitted_at, updated_at")
    .order("submitted_at", { ascending: false }).limit(1).maybeSingle();
  if (error || !data) {
    resetPortalState();
    elements.noRequestState.classList.remove("is-hidden");
    elements.requestView.classList.add("is-hidden");
    return;
  }
  state.lead = data;
  elements.noRequestState.classList.add("is-hidden");
  elements.requestView.classList.remove("is-hidden");
  await Promise.all([loadShortlist(data.lead_id), loadConversation(data.lead_id)]);
  renderRequest();
}

async function loadShortlist(leadId) {
  const { data, error } = await supabase.from("offerpsp_client_shortlist").select("*")
    .eq("lead_id", leadId).order("rank", { ascending: true });
  state.options = error ? [] : data || [];
}

async function loadConversation(leadId) {
  const { data, error } = await supabase.rpc("ensure_offerpsp_portal_conversation", { p_lead_id: leadId });
  if (error) { setStatus(elements.messageStatus, error.message, "error"); return; }
  state.conversationId = data;
  await loadMessages();
}

async function loadMessages() {
  if (!state.conversationId) return;
  const { data, error } = await supabase.from("offerpsp_messages")
    .select("id, sender_type, direction, body, sent_at")
    .eq("conversation_id", state.conversationId).order("sent_at", { ascending: true });
  if (error) { setStatus(elements.messageStatus, error.message, "error"); return; }
  state.messages = data || [];
  renderMessages();
}

document.addEventListener("click", async (event) => {
  const languageButton = event.target.closest("[data-language]");
  if (languageButton) { setLanguage(languageButton.dataset.language); return; }
  const responseButton = event.target.closest("[data-option-response]");
  if (responseButton) {
    setLoading(responseButton, true, t("saving"));
    const { error } = await supabase.rpc("respond_offerpsp_option", {
      p_option_code: responseButton.dataset.optionCode,
      p_response: responseButton.dataset.optionResponse,
    });
    setLoading(responseButton, false);
    if (error) { setStatus(elements.optionStatus, error.message, "error"); return; }
    await loadRequest();
    return;
  }
  const introductionButton = event.target.closest("[data-request-introduction]");
  if (introductionButton) {
    setLoading(introductionButton, true, t("sending"));
    const { data, error } = await supabase.rpc("request_offerpsp_introduction", {
      p_option_code: introductionButton.dataset.requestIntroduction,
    });
    setLoading(introductionButton, false);
    if (error) { setStatus(elements.optionStatus, error.message, "error"); return; }
    const message = data.status === "ready"
      ? t("dossierReadyMessage")
      : `${t("missingPrefix")} ${(data.missing_fields || []).join(", ")}`;
    setStatus(elements.optionStatus, message, data.status === "ready" ? "success" : "error");
    await loadRequest();
  }
});

elements.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = elements.emailInput.value.trim();
  const password = elements.passwordInput.value;
  const button = elements.loginForm.querySelector('button[type="submit"]');
  if (!password) { setStatus(elements.authStatus, t("loginPassword"), "error"); return; }
  setLoading(button, true, t("signingIn"));
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  setLoading(button, false);
  if (error) { setStatus(elements.authStatus, error.message, "error"); return; }
  await enterPortal(data.session);
});

elements.magicLinkButton.addEventListener("click", async () => {
  const email = elements.emailInput.value.trim();
  if (!email) { setStatus(elements.authStatus, t("loginEmail"), "error"); return; }
  setLoading(elements.magicLinkButton, true, t("sending"));
  const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: `${window.location.origin}/portal/`, shouldCreateUser: true } });
  setLoading(elements.magicLinkButton, false);
  setStatus(elements.authStatus, error ? error.message : t("linkSent"), error ? "error" : "success");
});

elements.googleLoginButton.addEventListener("click", async () => {
  setLoading(elements.googleLoginButton, true, t("openingGoogle"));
  const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${window.location.origin}/portal/` } });
  if (error) { setLoading(elements.googleLoginButton, false); setStatus(elements.authStatus, error.message, "error"); }
});

elements.messageForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!state.conversationId) return;
  const body = elements.messageInput.value.trim();
  if (!body) return;
  const button = elements.messageForm.querySelector("button");
  setLoading(button, true, t("sending"));
  const { error } = await supabase.from("offerpsp_messages").insert({
    conversation_id: state.conversationId, sender_type: "client", sender_user_id: state.user.id,
    direction: "inbound", body,
  });
  setLoading(button, false);
  if (error) { setStatus(elements.messageStatus, error.message, "error"); return; }
  try {
    await fetch(MESSAGE_NOTIFICATION_ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ company: state.lead?.company || "OfferPSP client", sender_email: state.user.email, message: body }) });
  } catch { /* The database message is already saved. */ }
  elements.messageInput.value = "";
  setStatus(elements.messageStatus, t("sent"), "success");
  await loadMessages();
});

elements.signOutButton.addEventListener("click", async () => { await supabase.auth.signOut(); await enterPortal(null); });

setLanguage(localStorage.getItem(LANGUAGE_STORAGE_KEY) || "ru");
const { data: { session } } = await supabase.auth.getSession();
await enterPortal(session);
supabase.auth.onAuthStateChange((event, nextSession) => {
  if (event === "SIGNED_OUT") enterPortal(null);
  else if (event === "SIGNED_IN" && nextSession?.user && nextSession.user.id !== state.user?.id) enterPortal(nextSession);
});
