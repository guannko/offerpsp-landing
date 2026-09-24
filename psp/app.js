import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_BROWSER_URL = `${window.location.origin}/_data`;
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_6j6imdLpydTh8gt9wI861Q_YDITWOaM";

const supabase = createClient(
  SUPABASE_BROWSER_URL,
  SUPABASE_PUBLISHABLE_KEY,
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } },
);

const byId = (id) => document.getElementById(id);
const state = { user: null, workspaces: [], providerId: null, workspace: null, busy: false, sourceFile: null, pollTimer: null };
const editableRoles = new Set(["owner", "admin", "editor"]);
const statusLabels = {
  draft: "Черновик", review: "На проверке", submitted: "Отправлен", published: "Опубликован",
  paused: "На паузе", expired: "Истёк", withdrawn: "Отозван", rejected: "Отклонён",
  queued: "В очереди", processing: "Разбирается", imported: "Импортирован", duplicate: "Повтор",
  failed: "Ошибка", dismissed: "Закрыт", approved: "Одобрено", archived: "Архив",
};
const OPS_API = "https://ops-7q4m2x9k8v3n.vercel.app/api/provider-offer-source";

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
}

function split(value) {
  return String(value || "").split(",").map((item) => item.trim().toUpperCase()).filter(Boolean);
}

function numberOrNull(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

function formatDate(value) {
  if (!value) return "не подтверждено";
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

function formatDateTimeLocal(value) {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 16);
}

function roleLabel(role) {
  return ({ owner: "владелец", admin: "администратор", editor: "менеджер", viewer: "наблюдатель" })[role] || role || "—";
}

function setStatus(message = "", tone = "") {
  const node = byId("globalStatus");
  node.textContent = message;
  node.className = `notice${message ? "" : " hidden"}${tone ? ` ${tone}` : ""}`;
}

function setBusy(value) {
  state.busy = value;
  document.querySelectorAll("button").forEach((button) => { button.disabled = value; });
}

function showAuth() {
  byId("authView").classList.remove("hidden");
  byId("portalView").classList.add("hidden");
}

function showPortal() {
  byId("authView").classList.add("hidden");
  byId("portalView").classList.remove("hidden");
  byId("userEmail").textContent = state.user?.email || "";
}

async function checkAuthGateway() {
  try {
    const response = await fetch(`${SUPABASE_BROWSER_URL}/auth/v1/health`, {
      headers: { apikey: SUPABASE_PUBLISHABLE_KEY },
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Auth gateway returned ${response.status}`);
    document.documentElement.dataset.authGateway = "ready";
    return true;
  } catch (error) {
    document.documentElement.dataset.authGateway = "unavailable";
    console.warn("PSP auth gateway unavailable", error);
    return false;
  }
}

async function loadWorkspaces() {
  const result = await supabase.rpc("list_offerpsp_my_provider_workspaces");
  if (result.error) throw result.error;
  state.workspaces = Array.isArray(result.data) ? result.data : [];
  if (!state.workspaces.length) {
    byId("accessDenied").classList.remove("hidden");
    byId("workspaceContent").classList.add("hidden");
    byId("providerName").textContent = "Доступ не назначен";
    byId("providerMeta").textContent = "Закрытый кабинет OfferPSP";
    byId("freshnessButton").classList.add("hidden");
    return;
  }
  byId("accessDenied").classList.add("hidden");
  byId("workspaceContent").classList.remove("hidden");
  byId("freshnessButton").classList.remove("hidden");
  const select = byId("workspaceSelect");
  select.innerHTML = state.workspaces.map((item) => `<option value="${escapeHtml(item.provider_id)}">${escapeHtml(item.brand_name)}</option>`).join("");
  select.classList.toggle("hidden", state.workspaces.length < 2);
  state.providerId = state.providerId && state.workspaces.some((item) => item.provider_id === state.providerId)
    ? state.providerId
    : state.workspaces[0].provider_id;
  select.value = state.providerId;
  await loadWorkspace();
}

async function loadWorkspace() {
  if (!state.providerId) return;
  setBusy(true); setStatus();
  const result = await supabase.rpc("get_offerpsp_provider_portal_workspace", { p_provider_id: state.providerId });
  setBusy(false);
  if (result.error) throw result.error;
  state.workspace = result.data || {};
  renderWorkspace();
}

function renderWorkspace() {
  const workspace = state.workspace;
  const provider = workspace.provider || {};
  const membership = workspace.membership || {};
  const routes = Array.isArray(workspace.routes) ? workspace.routes : [];
  const drafts = Array.isArray(workspace.drafts) ? workspace.drafts : [];
  const canEdit = editableRoles.has(membership.role);

  byId("providerName").textContent = provider.brand_name || "PSP workspace";
  byId("providerMeta").textContent = `${provider.internal_code || ""} · роль: ${roleLabel(membership.role)} · условия подтверждены ${formatDate(provider.last_verified_at)}`;
  byId("stats").innerHTML = [
    [routes.filter((item) => item.status === "published").length, "Опубликовано"],
    [routes.filter((item) => ["draft", "review"].includes(item.status)).length, "На проверке"],
    [drafts.filter((item) => item.status === "draft").length, "Черновики"],
    [routes.filter((item) => item.is_stale).length, "Требуют сверки"],
  ].map(([value, label], index) => `<article><span class="stat-index">${String(index + 1).padStart(2, "0")}</span><strong>${value}</strong><span>${label}</span></article>`).join("");

  byId("freshnessButton").disabled = !canEdit;
  byId("newOfferButton").classList.toggle("hidden", !canEdit);
  document.querySelector('[data-tab="new"]').classList.toggle("hidden", !canEdit);
  document.querySelectorAll("#profileForm input, #profileForm textarea, #profileForm button, #contactForm input, #contactForm textarea, #contactForm select, #contactForm button, #updateForm input, #updateForm textarea, #updateForm select, #updateForm button, #sourceForm textarea, #sourceForm input, #sourceForm button").forEach((node) => { node.disabled = !canEdit; });
  byId("brandName").value = provider.brand_name || "";
  byId("legalName").value = provider.legal_name || "";
  byId("website").value = provider.website || "";
  const profile = workspace.profile || {};
  const profileValues = {
    apiDocsUrl: profile.api_docs_url, headquartersCountry: profile.headquarters_country,
    foundedYear: profile.founded_year, companyDescription: profile.company_description,
    operatingGeos: (profile.operating_geos || []).join(", "), supportedCurrencies: (profile.supported_currencies || []).join(", "),
    profilePaymentMethods: (profile.payment_methods || []).join(", "), profileCardSchemes: (profile.card_schemes || []).join(", "),
    supportedVerticals: (profile.supported_verticals || []).join(", "), profileProhibitedVerticals: (profile.prohibited_verticals || []).join(", "),
    profileIntegrations: (profile.integrations || []).join(", "), settlementCurrencies: (profile.settlement_currencies || []).join(", "),
    supportLanguages: (profile.support_languages || []).join(", "), onboardingSla: profile.onboarding_sla,
    licences: (profile.licences || []).map((item) => [item.jurisdiction, item.number, item.url].filter(Boolean).join(" | ")).join("\n"),
    complianceSummary: profile.compliance_summary, onboardingRequirements: profile.onboarding_requirements, publicSummary: profile.public_summary,
  };
  Object.entries(profileValues).forEach(([id, value]) => { byId(id).value = value ?? ""; });

  byId("routeList").innerHTML = routes.length
    ? `<h3>Рабочие офферы</h3>${routes.map((route) => routeCard(route, canEdit)).join("")}`
    : `<div class="empty"><h3>Рабочих офферов пока нет</h3><p>Создайте первый черновик и отправьте его на проверку.</p></div>`;
  byId("draftList").innerHTML = drafts.length
    ? `<h3>Черновики и отправки</h3>${drafts.map((draft) => draftCard(draft, canEdit)).join("")}`
    : "";
  renderIngestionJobs(workspace.ingestion_jobs || []);
  renderContacts(workspace.contacts || [], canEdit);
  renderUpdates(workspace.updates || [], canEdit);

  document.querySelectorAll("[data-pause-route]").forEach((button) => button.addEventListener("click", () => pauseRoute(button.dataset.pauseRoute)));
  document.querySelectorAll("[data-edit-draft]").forEach((button) => button.addEventListener("click", () => editDraft(button.dataset.editDraft)));
  document.querySelectorAll("[data-submit-draft]").forEach((button) => button.addEventListener("click", () => submitDraft(button.dataset.submitDraft)));
  document.querySelectorAll("[data-edit-contact]").forEach((button) => button.addEventListener("click", () => editContact(button.dataset.editContact)));
  document.querySelectorAll("[data-edit-update]").forEach((button) => button.addEventListener("click", () => editUpdate(button.dataset.editUpdate)));
  scheduleIngestionPoll(workspace.ingestion_jobs || []);
}

function renderIngestionJobs(jobs) {
  byId("ingestionList").innerHTML = jobs.length
    ? `<h3>Последние отправки</h3>${jobs.slice(0, 8).map((job) => `<article class="source-job"><div><span class="pill ${escapeHtml(job.status)}">${escapeHtml(statusLabels[job.status] || job.status)}</span><strong>${escapeHtml(job.source_metadata?.original_filename || (job.source_type === "admin_file" ? "Файл" : "Текстовое сообщение"))}</strong><span>${escapeHtml(formatDate(job.received_at))}</span></div><p>${job.status === "review" ? `Распознано маршрутов: ${job.route_count}. Передано OfferPSP на проверку.` : job.status === "failed" ? escapeHtml(job.error_message || "Не удалось разобрать источник") : job.status === "queued" ? "Ожидает автоматического разбора" : job.status === "processing" ? "Система выделяет офферы и условия" : `Маршрутов: ${job.route_count || 0}`}</p></article>`).join("")}`
    : "";
}

function renderContacts(contacts, canEdit) {
  byId("contactList").innerHTML = contacts.length
    ? `<h3>Контакты PSP</h3>${contacts.map((contact) => `<article class="offer-card"><div class="offer-main"><div><span class="pill ${contact.active ? "published" : "paused"}">${contact.active ? "Активен" : "Неактивен"}</span><h3>${escapeHtml(contact.full_name)}</h3><p>${escapeHtml(contact.role_title || "Роль не указана")} · ${escapeHtml(contact.region || contact.timezone || "регион не указан")}</p></div>${canEdit ? `<button class="button ghost" type="button" data-edit-contact="${escapeHtml(contact.id)}">Изменить</button>` : ""}</div><p class="contact-line">${escapeHtml([contact.email, contact.telegram, contact.phone].filter(Boolean).join(" · ") || "Нет канала связи")}</p></article>`).join("")}`
    : `<div class="empty"><h3>Контактов пока нет</h3><p>Добавьте менеджеров, которые отвечают за условия, интеграцию и compliance.</p></div>`;
}

function renderUpdates(updates, canEdit) {
  byId("updateList").innerHTML = updates.length
    ? `<h3>История обновлений</h3>${updates.map((item) => `<article class="offer-card"><div class="offer-main"><div><span class="pill ${escapeHtml(item.status)}">${escapeHtml(statusLabels[item.status] || item.status)}</span><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.update_type)} · ${escapeHtml(formatDate(item.created_at))}</p></div>${canEdit && ["draft", "rejected"].includes(item.status) ? `<button class="button ghost" type="button" data-edit-update="${escapeHtml(item.id)}">Изменить</button>` : ""}</div><p class="update-body">${escapeHtml(item.body)}</p></article>`).join("")}`
    : `<div class="empty"><h3>Обновлений пока нет</h3><p>Здесь будет накапливаться проверяемая история развития PSP.</p></div>`;
}

function scheduleIngestionPoll(jobs) {
  if (state.pollTimer) window.clearTimeout(state.pollTimer);
  if (jobs.some((job) => ["queued", "processing"].includes(job.status))) {
    state.pollTimer = window.setTimeout(() => loadWorkspace().catch(() => {}), 5000);
  }
}

function routeCard(route, canEdit) {
  const coverage = route.coverage_mode === "global_except" ? `WW кроме ${(route.blocked_geos || []).join(", ") || "ограничений"}` : (route.geos || []).join(", ") || route.coverage_mode || "—";
  const fee = (route.fees || []).map((item) => `${item.flow}: ${item.base_percent ?? "—"}%${item.base_fixed != null ? ` + ${item.base_fixed} ${item.base_fixed_currency || ""}` : ""}`).join(" · ") || "ставка не указана";
  const pause = route.status === "published" && canEdit ? `<button class="button danger" type="button" data-pause-route="${escapeHtml(route.id)}">Поставить на паузу</button>` : "";
  return `<article class="offer-card"><div class="offer-main"><div><span class="pill ${escapeHtml(route.status)}">${escapeHtml(statusLabels[route.status] || route.status)}</span><h3>${escapeHtml(route.client_title)}</h3><p>${escapeHtml(route.internal_code)} · ${escapeHtml(route.flow)} · ${escapeHtml(coverage)}</p></div><div class="offer-actions">${pause}</div></div><dl><div><dt>Валюты</dt><dd>${escapeHtml((route.currencies || []).join(", ") || "—")}</dd></div><div><dt>Методы</dt><dd>${escapeHtml((route.methods || []).join(", ") || "—")}</dd></div><div><dt>Ставка PSP</dt><dd>${escapeHtml(fee)}</dd></div><div><dt>Актуальность</dt><dd>${route.is_stale ? "Нужно подтвердить" : "Актуально"}</dd></div></dl></article>`;
}

function draftCard(draft, canEdit) {
  const editable = draft.status === "draft" && canEdit;
  return `<article class="offer-card"><div class="offer-main"><div><span class="pill ${escapeHtml(draft.status)}">${escapeHtml(statusLabels[draft.status] || draft.status)}</span><h3>${escapeHtml(draft.title)}</h3><p>Обновлён ${escapeHtml(formatDate(draft.updated_at))}</p></div><div class="offer-actions">${editable ? `<button class="button ghost" type="button" data-edit-draft="${escapeHtml(draft.id)}">Редактировать</button><button class="button primary" type="button" data-submit-draft="${escapeHtml(draft.id)}">Отправить на проверку</button>` : ""}</div></div></article>`;
}

function selectTab(name) {
  document.querySelectorAll("[data-tab]").forEach((button) => button.classList.toggle("active", button.dataset.tab === name));
  ["offers", "new", "profile", "contacts", "updates"].forEach((tab) => byId(`${tab}Tab`).classList.toggle("hidden", tab !== name));
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function offerPayload() {
  const flow = byId("flow").value;
  const currencies = split(byId("currencies").value);
  const fees = [];
  const addFee = (feeFlow, percentId, fixedId) => {
    const percent = numberOrNull(byId(percentId).value);
    const fixed = numberOrNull(byId(fixedId).value);
    if (percent != null || fixed != null) fees.push({ flow: feeFlow, percent, fixed, fixed_currency: fixed != null ? currencies[0] || null : null, applies_on: "success" });
  };
  if (flow !== "payout") addFee("payin", "payinPercent", "payinFixed");
  if (flow !== "payin") addFee("payout", "payoutPercent", "payoutFixed");
  const limits = byId("limitCurrency").value.trim() ? [{ flow, scope: "transaction", currency: byId("limitCurrency").value, minimum_amount: numberOrNull(byId("limitMin").value), maximum_amount: numberOrNull(byId("limitMax").value) }] : [];
  const settlements = byId("settlementCurrency").value.trim() || byId("settlementPeriod").value.trim() ? [{ currency: byId("settlementCurrency").value, period: byId("settlementPeriod").value, fee_percent: numberOrNull(byId("settlementPercent").value) }] : [];
  return {
    client_title: byId("clientTitle").value.trim(), flow, coverage_mode: byId("coverageMode").value,
    geos: split(byId("geos").value), blocked_geos: split(byId("blockedGeos").value), currencies,
    methods: split(byId("methods").value), card_brands: split(byId("cardBrands").value), traffic_types: split(byId("trafficTypes").value),
    verticals: split(byId("verticals").value), prohibited_verticals: split(byId("prohibitedVerticals").value), integrations: split(byId("integrations").value),
    effective_from: byId("effectiveFrom").value || null, expires_at: byId("expiresAt").value || null,
    freshness_days: numberOrNull(byId("freshnessDays").value) || 30,
    min_monthly_volume: numberOrNull(byId("minMonthlyVolume").value), max_monthly_volume: numberOrNull(byId("maxMonthlyVolume").value),
    volume_currency: byId("volumeCurrency").value.trim().toUpperCase() || null,
    fees, limits, settlements, risk_terms: { notes: byId("riskNotes").value.trim() }, operational_notes: byId("operationalNotes").value.trim() || null,
  };
}

async function saveDraft({ quiet = false } = {}) {
  if (!byId("offerForm").reportValidity()) return null;
  const payload = offerPayload();
  if (!payload.fees.length) { setStatus("Укажите хотя бы одну ставку PSP.", "error"); return null; }
  if (["specific", "allowlist"].includes(payload.coverage_mode) && !payload.geos.length) { setStatus("Для выбранного покрытия укажите хотя бы один GEO.", "error"); return null; }
  setBusy(true); setStatus();
  const result = await supabase.rpc("save_offerpsp_provider_offer_draft", { p_provider_id: state.providerId, p_draft_id: byId("draftId").value || null, p_payload: payload });
  setBusy(false);
  if (result.error) { setStatus(result.error.message, "error"); return null; }
  byId("draftId").value = result.data.id;
  if (!quiet) setStatus("Черновик сохранён.", "success");
  await loadWorkspace();
  return result.data;
}

async function submitDraft(draftId = null) {
  let id = draftId;
  if (!id) {
    const saved = await saveDraft({ quiet: true });
    if (!saved) return;
    id = saved.id;
  }
  if (!window.confirm("Отправить оффер команде OfferPSP на проверку? После отправки этот черновик нельзя редактировать.")) return;
  setBusy(true); setStatus();
  const result = await supabase.rpc("submit_offerpsp_provider_offer_draft", { p_provider_id: state.providerId, p_draft_id: id });
  setBusy(false);
  if (result.error) { setStatus(result.error.message, "error"); return; }
  resetOfferForm();
  await loadWorkspace();
  selectTab("offers");
  setStatus("Оффер отправлен на проверку. Он не опубликован до решения команды OfferPSP.", "success");
}

function editDraft(id) {
  const draft = state.workspace?.drafts?.find((item) => item.id === id);
  if (!draft || draft.status !== "draft") return;
  resetOfferForm();
  const payload = draft.payload || {};
  const values = {
    draftId: draft.id, clientTitle: payload.client_title, flow: payload.flow, coverageMode: payload.coverage_mode,
    geos: (payload.geos || []).join(", "), blockedGeos: (payload.blocked_geos || []).join(", "), currencies: (payload.currencies || []).join(", "),
    methods: (payload.methods || []).join(", "), cardBrands: (payload.card_brands || []).join(", "), trafficTypes: (payload.traffic_types || []).join(", "),
    verticals: (payload.verticals || []).join(", "), prohibitedVerticals: (payload.prohibited_verticals || []).join(", "), integrations: (payload.integrations || []).join(", "),
    effectiveFrom: payload.effective_from, expiresAt: payload.expires_at, freshnessDays: payload.freshness_days || 30,
    minMonthlyVolume: payload.min_monthly_volume, maxMonthlyVolume: payload.max_monthly_volume, volumeCurrency: payload.volume_currency,
    riskNotes: payload.risk_terms?.notes, operationalNotes: payload.operational_notes,
  };
  Object.entries(values).forEach(([key, value]) => { if (byId(key)) byId(key).value = value ?? ""; });
  (payload.fees || []).forEach((fee) => {
    if (fee.flow === "payin") { byId("payinPercent").value = fee.percent ?? ""; byId("payinFixed").value = fee.fixed ?? ""; }
    if (fee.flow === "payout") { byId("payoutPercent").value = fee.percent ?? ""; byId("payoutFixed").value = fee.fixed ?? ""; }
  });
  const limit = payload.limits?.[0] || {};
  byId("limitCurrency").value = limit.currency || ""; byId("limitMin").value = limit.minimum_amount ?? ""; byId("limitMax").value = limit.maximum_amount ?? "";
  const settlement = payload.settlements?.[0] || {};
  byId("settlementCurrency").value = settlement.currency || ""; byId("settlementPeriod").value = settlement.period || ""; byId("settlementPercent").value = settlement.fee_percent ?? "";
  byId("offerFormTitle").textContent = "Редактирование черновика";
  selectTab("new");
}

function resetOfferForm() {
  byId("offerForm").reset();
  byId("draftId").value = "";
  byId("freshnessDays").value = "30";
  byId("offerFormTitle").textContent = "Новый оффер PSP";
}

async function pauseRoute(id) {
  const reason = window.prompt("Причина паузы (её увидит команда OfferPSP):", "Условия временно недоступны");
  if (reason === null) return;
  setBusy(true); setStatus();
  const result = await supabase.rpc("pause_offerpsp_provider_route", { p_provider_id: state.providerId, p_route_id: id, p_reason: reason });
  setBusy(false);
  if (result.error) { setStatus(result.error.message, "error"); return; }
  await loadWorkspace();
  setStatus("Оффер поставлен на паузу. Команда OfferPSP увидит изменение.", "success");
}

async function confirmFreshness() {
  if (!window.confirm("Подтвердить, что текущие условия PSP актуальны на сегодня?")) return;
  setBusy(true); setStatus();
  const result = await supabase.rpc("confirm_offerpsp_provider_portal_freshness", { p_provider_id: state.providerId });
  setBusy(false);
  if (result.error) { setStatus(result.error.message, "error"); return; }
  await loadWorkspace();
  setStatus("Актуальность условий подтверждена.", "success");
}

async function saveProfile(event) {
  event.preventDefault();
  setBusy(true); setStatus();
  const licences = byId("licences").value.split("\n").map((line) => line.trim()).filter(Boolean).map((line) => {
    const [jurisdiction, number, url] = line.split("|").map((item) => item.trim());
    return { jurisdiction: jurisdiction || null, number: number || null, url: url || null };
  });
  const result = await supabase.rpc("save_offerpsp_provider_portal_profile", { p_provider_id: state.providerId, p_payload: {
    brand_name: byId("brandName").value, legal_name: byId("legalName").value, website: byId("website").value,
    api_docs_url: byId("apiDocsUrl").value, headquarters_country: byId("headquartersCountry").value,
    founded_year: numberOrNull(byId("foundedYear").value), company_description: byId("companyDescription").value,
    operating_geos: split(byId("operatingGeos").value), supported_currencies: split(byId("supportedCurrencies").value),
    payment_methods: split(byId("profilePaymentMethods").value), card_schemes: split(byId("profileCardSchemes").value),
    supported_verticals: split(byId("supportedVerticals").value), prohibited_verticals: split(byId("profileProhibitedVerticals").value),
    integrations: split(byId("profileIntegrations").value), settlement_currencies: split(byId("settlementCurrencies").value),
    support_languages: split(byId("supportLanguages").value), licences,
    compliance_summary: byId("complianceSummary").value, onboarding_requirements: byId("onboardingRequirements").value,
    onboarding_sla: byId("onboardingSla").value, public_summary: byId("publicSummary").value,
  } });
  setBusy(false);
  if (result.error) { setStatus(result.error.message, "error"); return; }
  await loadWorkspaces();
  setStatus("Профиль PSP сохранён.", "success");
}

function resetContactForm() {
  byId("contactForm").reset();
  byId("contactId").value = "";
  byId("contactActive").value = "true";
}

function editContact(id) {
  const contact = state.workspace?.contacts?.find((item) => item.id === id);
  if (!contact) return;
  byId("contactId").value = contact.id;
  byId("contactName").value = contact.full_name || "";
  byId("contactRole").value = contact.role_title || "";
  byId("contactEmail").value = contact.email || "";
  byId("contactTelegram").value = contact.telegram || "";
  byId("contactPhone").value = contact.phone || "";
  byId("contactRegion").value = contact.region || contact.timezone || "";
  byId("contactChannel").value = contact.preferred_channel || "email";
  byId("contactActive").value = String(contact.active !== false);
  byId("contactNotes").value = contact.provider_supplied_notes || "";
  selectTab("contacts");
}

async function saveContact(event) {
  event.preventDefault();
  if (![byId("contactEmail").value, byId("contactTelegram").value, byId("contactPhone").value].some((value) => value.trim())) {
    setStatus("Укажите email, Telegram или телефон контакта.", "error"); return;
  }
  setBusy(true); setStatus();
  const result = await supabase.rpc("save_offerpsp_provider_portal_contact", {
    p_provider_id: state.providerId,
    p_contact_id: byId("contactId").value || null,
    p_payload: {
      full_name: byId("contactName").value, role_title: byId("contactRole").value,
      email: byId("contactEmail").value, telegram: byId("contactTelegram").value,
      phone: byId("contactPhone").value, region: byId("contactRegion").value,
      preferred_channel: byId("contactChannel").value, active: byId("contactActive").value === "true",
      notes: byId("contactNotes").value,
    },
  });
  setBusy(false);
  if (result.error) { setStatus(result.error.message, "error"); return; }
  resetContactForm(); await loadWorkspace(); setStatus("Контакт PSP сохранён.", "success");
}

function resetUpdateForm() {
  byId("updateForm").reset();
  byId("updateId").value = "";
}

function editUpdate(id) {
  const item = state.workspace?.updates?.find((update) => update.id === id);
  if (!item) return;
  byId("updateId").value = item.id;
  byId("updateType").value = item.update_type || "general";
  byId("updateTitle").value = item.title || "";
  byId("updateBody").value = item.body || "";
  byId("updateEffectiveAt").value = formatDateTimeLocal(item.effective_at);
  selectTab("updates");
}

async function saveUpdate(submit = false) {
  if (!byId("updateForm").reportValidity()) return;
  setBusy(true); setStatus();
  const result = await supabase.rpc("save_offerpsp_provider_update", {
    p_provider_id: state.providerId,
    p_update_id: byId("updateId").value || null,
    p_payload: {
      update_type: byId("updateType").value, title: byId("updateTitle").value,
      body: byId("updateBody").value, effective_at: byId("updateEffectiveAt").value || null,
    },
    p_submit: submit,
  });
  setBusy(false);
  if (result.error) { setStatus(result.error.message, "error"); return; }
  resetUpdateForm(); await loadWorkspace();
  setStatus(submit ? "Обновление отправлено OfferPSP на проверку." : "Черновик обновления сохранён.", "success");
}

function safeFilename(name) {
  const value = String(name || "source").normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return (value || "source").slice(-120);
}

function renderSourceFile() {
  const node = byId("sourceFileCard");
  if (!state.sourceFile) { node.classList.add("hidden"); node.innerHTML = ""; return; }
  node.classList.remove("hidden");
  node.innerHTML = `<div><strong>${escapeHtml(state.sourceFile.name)}</strong><span>${Math.ceil(state.sourceFile.size / 1024)} КБ</span></div><button id="removeSourceFile" class="button ghost" type="button">Убрать</button>`;
  byId("removeSourceFile").addEventListener("click", () => { state.sourceFile = null; byId("sourceFile").value = ""; renderSourceFile(); });
}

async function extractUploadedSource(file, storagePath, accessToken) {
  const response = await fetch(OPS_API, {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({ provider_id: state.providerId, storage_path: storagePath, filename: file.name, mime_type: file.type || "application/octet-stream" }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || payload.message || "Не удалось извлечь текст из файла");
  return payload;
}

async function submitSource(event) {
  event.preventDefault();
  const pastedText = byId("sourceText").value.trim();
  const file = state.sourceFile;
  if (!pastedText && !file) { setStatus("Вставьте текст оффера или приложите файл.", "error"); return; }
  if (file && file.size > 15 * 1024 * 1024) { setStatus("Файл превышает 15 МБ.", "error"); return; }
  setBusy(true); setStatus(file ? "Загружаем и читаем файл…" : "Ставим сообщение в очередь разбора…");
  let storagePath = null;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("Сессия входа истекла");
    let sourceText = pastedText;
    let metadata = { source_format: "telegram_text" };
    let sourceKind = "text";
    let sourceReference = null;
    if (file) {
      storagePath = `providers/${state.providerId}/${state.user.id}/${crypto.randomUUID()}-${safeFilename(file.name)}`;
      const upload = await supabase.storage.from("offerpsp-private-sources").upload(storagePath, file, { contentType: file.type || "application/octet-stream", upsert: false });
      if (upload.error) throw upload.error;
      const extracted = await extractUploadedSource(file, storagePath, session.access_token);
      sourceText = [pastedText, extracted.text].filter(Boolean).join("\n\n--- FILE CONTENT ---\n\n");
      sourceKind = "file";
      sourceReference = `storage://offerpsp-private-sources/${storagePath}`;
      metadata = { original_filename: file.name, mime_type: file.type || extracted.mime_type, size_bytes: file.size, source_sha256: extracted.source_sha256, extraction_method: extracted.extraction_method, source_format: file.name.split(".").pop()?.toLowerCase() || "file" };
    }
    const result = await supabase.rpc("enqueue_offerpsp_provider_source", { p_provider_id: state.providerId, p_source_text: sourceText, p_source_kind: sourceKind, p_source_reference: sourceReference, p_source_metadata: metadata });
    if (result.error) throw result.error;
    byId("sourceText").value = ""; state.sourceFile = null; byId("sourceFile").value = ""; renderSourceFile();
    await loadWorkspace();
    setStatus(result.data?.duplicate ? "Это сообщение уже находится в очереди." : "Источник принят. Система выделит офферы и передаст их OfferPSP на проверку.", "success");
  } catch (error) {
    if (storagePath) await supabase.storage.from("offerpsp-private-sources").remove([storagePath]).catch(() => {});
    setStatus(error.message || "Не удалось отправить источник.", "error");
  } finally {
    setBusy(false);
  }
}

async function enter(session) {
  if (!session?.user) { state.user = null; showAuth(); return; }
  state.user = session.user; showPortal();
  try { await loadWorkspaces(); } catch (error) { setStatus(error.message || "Не удалось загрузить кабинет PSP.", "error"); }
}

function authErrorMessage(error) {
  if (error?.code === "over_email_send_rate_limit" || /email rate limit exceeded/i.test(error?.message || "")) {
    return "Почтовый сервис временно исчерпал лимит отправки. Не нажимайте повторно — попробуйте последнюю ссылку из письма или повторите позже.";
  }
  if (error?.code === "over_request_rate_limit") {
    return "Слишком много запросов за короткое время. Подождите несколько минут и повторите один раз.";
  }
  return error?.message || "Не удалось отправить ссылку для входа.";
}

function startLoginCooldown(seconds = 60) {
  const button = byId("loginButton");
  let remaining = seconds;
  button.disabled = true;
  button.textContent = `Повторно через ${remaining} сек.`;
  const timer = window.setInterval(() => {
    remaining -= 1;
    if (remaining <= 0) {
      window.clearInterval(timer);
      button.disabled = false;
      button.textContent = "Получить ссылку для входа";
      return;
    }
    button.textContent = `Повторно через ${remaining} сек.`;
  }, 1000);
}

byId("loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = byId("emailInput").value.trim().toLowerCase();
  byId("loginButton").disabled = true;
  byId("authStatus").textContent = "Отправляем ссылку…";
  const result = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: `${window.location.origin}/psp/` } });
  if (result.error) byId("loginButton").disabled = false;
  else startLoginCooldown();
  byId("authStatus").textContent = result.error ? authErrorMessage(result.error) : "Ссылка отправлена. Проверьте почту; повторное нажатие не требуется.";
  byId("authStatus").className = `status ${result.error ? "error" : "success"}`;
});
byId("signOutButton").addEventListener("click", async () => { await supabase.auth.signOut(); showAuth(); });
byId("workspaceSelect").addEventListener("change", async (event) => { state.providerId = event.target.value; await loadWorkspace(); });
byId("freshnessButton").addEventListener("click", confirmFreshness);
byId("uploadOfferButton").addEventListener("click", () => {
  selectTab("offers");
  window.requestAnimationFrame(() => byId("sourceText").focus());
});
byId("newOfferButton").addEventListener("click", () => { resetOfferForm(); selectTab("new"); });
byId("resetOfferButton").addEventListener("click", resetOfferForm);
byId("offerForm").addEventListener("submit", async (event) => { event.preventDefault(); await saveDraft(); });
byId("submitDraftButton").addEventListener("click", () => submitDraft());
byId("profileForm").addEventListener("submit", saveProfile);
byId("sourceForm").addEventListener("submit", submitSource);
byId("sourceFile").addEventListener("change", (event) => { state.sourceFile = event.target.files?.[0] || null; renderSourceFile(); });
byId("contactForm").addEventListener("submit", saveContact);
byId("resetContactButton").addEventListener("click", resetContactForm);
byId("updateForm").addEventListener("submit", async (event) => { event.preventDefault(); await saveUpdate(false); });
byId("submitUpdateButton").addEventListener("click", () => saveUpdate(true));
document.querySelectorAll("[data-tab]").forEach((button) => button.addEventListener("click", () => selectTab(button.dataset.tab)));
supabase.auth.onAuthStateChange((_event, session) => { window.setTimeout(() => enter(session), 0); });
if (await checkAuthGateway()) {
  const { data: { session } } = await supabase.auth.getSession();
  await enter(session);
} else {
  showAuth();
  byId("authStatus").textContent = "Сервис входа временно недоступен.";
  byId("authStatus").className = "status error";
}
