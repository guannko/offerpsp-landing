import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://xcizofpejsomjiflesbx.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_8VDTb7EC6ZGATqgMZZgghA_95pAushW";

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

const i18n = window.offerPspI18n;

const STATUS_LABELS = {
  new: "New",
  qualifying: "Qualifying",
  needs_clarification: "Needs clarification",
  matching: "Matching",
  shortlist_ready: "Shortlist ready",
  shared: "Shared",
  option_selected: "Option selected",
  dossier_ready: "Dossier ready",
  provider_reviewing: "PSP review",
  provider_needs_info: "PSP needs info",
  provider_accepted: "PSP accepted",
  provider_declined: "PSP declined",
  telegram_created: "Telegram introduction",
  zoom_scheduled: "Zoom scheduled",
  negotiating: "Negotiating",
  won: "Won",
  lost: "Lost",
  prospect: "Prospect",
  onboarding: "Onboarding",
  active: "Active status",
  paused: "Paused status",
  archived: "Archived status",
  pending: "Pending status",
  ended: "Ended status",
};

const state = {
  user: null,
  staff: null,
  staffMembers: [],
  leads: [],
  selectedLead: null,
  activities: [],
  tasks: [],
  matches: [],
  selectedMatchIds: new Set(),
  selectedManualRouteIds: new Set(),
  shortlists: [],
  requestWorkspace: null,
  conversationId: null,
  messages: [],
  supply: {
    providers: [],
    batches: [],
    coverage: [],
    coverageAvailable: true,
  },
  supplyWorkspace: null,
  selectedSupplyProviderId: null,
  selectedSupplyRouteId: null,
  management: {
    merchants: [], providers: [], organizations: [], assignments: [],
    agentMarginPolicies: [], commissionSummary: {}, available: true,
  },
  rateCardPayload: null,
  lastUpdatedAt: null,
  activeAppView: "leads",
  activeSupplyPage: "providers",
};

const elements = {
  authView: document.getElementById("authView"),
  appView: document.getElementById("appView"),
  loginForm: document.getElementById("loginForm"),
  emailInput: document.getElementById("emailInput"),
  passwordInput: document.getElementById("passwordInput"),
  googleLoginButton: document.getElementById("googleLoginButton"),
  magicLinkButton: document.getElementById("magicLinkButton"),
  authStatus: document.getElementById("authStatus"),
  signOutButton: document.getElementById("signOutButton"),
  userInitial: document.getElementById("userInitial"),
  userName: document.getElementById("userName"),
  userRole: document.getElementById("userRole"),
  refreshButton: document.getElementById("refreshButton"),
  lastUpdated: document.getElementById("lastUpdated"),
  topbarEyebrow: document.getElementById("topbarEyebrow"),
  topbarTitle: document.getElementById("topbarTitle"),
  topbarDescription: document.getElementById("topbarDescription"),
  searchInput: document.getElementById("searchInput"),
  statusFilter: document.getElementById("statusFilter"),
  refreshManagementButton: document.getElementById("refreshManagementButton"),
  managementSummary: document.getElementById("managementSummary"),
  managementMerchantSearch: document.getElementById("managementMerchantSearch"),
  managementMerchantState: document.getElementById("managementMerchantState"),
  managementMerchantList: document.getElementById("managementMerchantList"),
  managementProviderList: document.getElementById("managementProviderList"),
  managedProviderForm: document.getElementById("managedProviderForm"),
  managedProviderId: document.getElementById("managedProviderId"),
  managedProviderHeading: document.getElementById("managedProviderHeading"),
  managedProviderName: document.getElementById("managedProviderName"),
  managedProviderLegalName: document.getElementById("managedProviderLegalName"),
  managedProviderWebsite: document.getElementById("managedProviderWebsite"),
  managedProviderStatus: document.getElementById("managedProviderStatus"),
  managedProviderTier: document.getElementById("managedProviderTier"),
  managedProviderPriority: document.getElementById("managedProviderPriority"),
  managedProviderMarginIncluded: document.getElementById("managedProviderMarginIncluded"),
  managedProviderNotes: document.getElementById("managedProviderNotes"),
  managedProviderStatusMessage: document.getElementById("managedProviderStatusMessage"),
  resetManagedProviderButton: document.getElementById("resetManagedProviderButton"),
  manualOfferForm: document.getElementById("manualOfferForm"),
  manualOfferProvider: document.getElementById("manualOfferProvider"),
  manualOfferTitle: document.getElementById("manualOfferTitle"),
  manualOfferFlow: document.getElementById("manualOfferFlow"),
  manualOfferGeos: document.getElementById("manualOfferGeos"),
  manualOfferCurrencies: document.getElementById("manualOfferCurrencies"),
  manualOfferMethods: document.getElementById("manualOfferMethods"),
  manualOfferVerticals: document.getElementById("manualOfferVerticals"),
  manualOfferRate: document.getElementById("manualOfferRate"),
  manualOfferMin: document.getElementById("manualOfferMin"),
  manualOfferMax: document.getElementById("manualOfferMax"),
  manualOfferLimitCurrency: document.getElementById("manualOfferLimitCurrency"),
  manualOfferSource: document.getElementById("manualOfferSource"),
  manualOfferStatus: document.getElementById("manualOfferStatus"),
  organizationForm: document.getElementById("organizationForm"),
  organizationId: document.getElementById("organizationId"),
  organizationHeading: document.getElementById("organizationHeading"),
  organizationType: document.getElementById("organizationType"),
  organizationName: document.getElementById("organizationName"),
  organizationLegalName: document.getElementById("organizationLegalName"),
  organizationStatus: document.getElementById("organizationStatus"),
  organizationTier: document.getElementById("organizationTier"),
  organizationNotes: document.getElementById("organizationNotes"),
  organizationStatusMessage: document.getElementById("organizationStatusMessage"),
  resetOrganizationButton: document.getElementById("resetOrganizationButton"),
  organizationList: document.getElementById("organizationList"),
  agentAssignmentForm: document.getElementById("agentAssignmentForm"),
  assignmentAgent: document.getElementById("assignmentAgent"),
  assignmentMerchant: document.getElementById("assignmentMerchant"),
  assignmentStatus: document.getElementById("assignmentStatus"),
  agentMarginForm: document.getElementById("agentMarginForm"),
  agentMarginAgent: document.getElementById("agentMarginAgent"),
  agentMarginMerchant: document.getElementById("agentMarginMerchant"),
  agentMarginFlow: document.getElementById("agentMarginFlow"),
  agentMarginMode: document.getElementById("agentMarginMode"),
  agentMarginPercent: document.getElementById("agentMarginPercent"),
  agentMarginFixed: document.getElementById("agentMarginFixed"),
  agentMarginCurrency: document.getElementById("agentMarginCurrency"),
  agentMarginNotes: document.getElementById("agentMarginNotes"),
  assignmentList: document.getElementById("assignmentList"),
  managementStatus: document.getElementById("managementStatus"),
  resultCount: document.getElementById("resultCount"),
  loadingState: document.getElementById("loadingState"),
  emptyState: document.getElementById("emptyState"),
  leadsTableWrap: document.getElementById("leadsTableWrap"),
  leadsTableBody: document.getElementById("leadsTableBody"),
  statTotal: document.getElementById("statTotal"),
  statNew: document.getElementById("statNew"),
  statMatching: document.getElementById("statMatching"),
  statReady: document.getElementById("statReady"),
  statWon: document.getElementById("statWon"),
  statWonRate: document.getElementById("statWonRate"),
  conversionRate: document.getElementById("conversionRate"),
  funnelSubmitted: document.getElementById("funnelSubmitted"),
  funnelQualified: document.getElementById("funnelQualified"),
  funnelMatched: document.getElementById("funnelMatched"),
  funnelIntroduced: document.getElementById("funnelIntroduced"),
  funnelWon: document.getElementById("funnelWon"),
  funnelSubmittedBar: document.getElementById("funnelSubmittedBar"),
  funnelQualifiedBar: document.getElementById("funnelQualifiedBar"),
  funnelMatchedBar: document.getElementById("funnelMatchedBar"),
  funnelIntroducedBar: document.getElementById("funnelIntroducedBar"),
  funnelWonBar: document.getElementById("funnelWonBar"),
  analyticsBottleneck: document.getElementById("analyticsBottleneck"),
  analyticsBottleneckCopy: document.getElementById("analyticsBottleneckCopy"),
  analyticsStageChart: document.getElementById("analyticsStageChart"),
  analyticsSourceChart: document.getElementById("analyticsSourceChart"),
  providerCount: document.getElementById("providerCount"),
  batchCount: document.getElementById("batchCount"),
  rateCardImportForm: document.getElementById("rateCardImportForm"),
  rateCardFileInput: document.getElementById("rateCardFileInput"),
  rateCardPreview: document.getElementById("rateCardPreview"),
  importRateCardButton: document.getElementById("importRateCardButton"),
  supplyStatus: document.getElementById("supplyStatus"),
  refreshSupplyButton: document.getElementById("refreshSupplyButton"),
  supplyLoadingState: document.getElementById("supplyLoadingState"),
  supplyEmptyState: document.getElementById("supplyEmptyState"),
  providerList: document.getElementById("providerList"),
  batchList: document.getElementById("batchList"),
  coverageSearch: document.getElementById("coverageSearch"),
  coverageStatusFilter: document.getElementById("coverageStatusFilter"),
  coverageSummary: document.getElementById("coverageSummary"),
  coverageUnavailable: document.getElementById("coverageUnavailable"),
  coverageEmpty: document.getElementById("coverageEmpty"),
  coverageTableWrap: document.getElementById("coverageTableWrap"),
  coverageTableBody: document.getElementById("coverageTableBody"),
  supplyDrawerBackdrop: document.getElementById("supplyDrawerBackdrop"),
  supplyDrawer: document.getElementById("supplyDrawer"),
  closeSupplyDrawerButton: document.getElementById("closeSupplyDrawerButton"),
  supplyDrawerTitle: document.getElementById("supplyDrawerTitle"),
  supplyDrawerCode: document.getElementById("supplyDrawerCode"),
  supplyWorkspaceSummary: document.getElementById("supplyWorkspaceSummary"),
  supplyWorkspaceStatus: document.getElementById("supplyWorkspaceStatus"),
  confirmSupplyFreshnessButton: document.getElementById("confirmSupplyFreshnessButton"),
  supplyBrandName: document.getElementById("supplyBrandName"),
  supplyLegalName: document.getElementById("supplyLegalName"),
  supplyWebsite: document.getElementById("supplyWebsite"),
  supplyRelationshipStatus: document.getElementById("supplyRelationshipStatus"),
  supplyRelationshipTier: document.getElementById("supplyRelationshipTier"),
  supplyPriority: document.getElementById("supplyPriority"),
  supplyMarginIncluded: document.getElementById("supplyMarginIncluded"),
  supplyRelationshipNotes: document.getElementById("supplyRelationshipNotes"),
  saveSupplyProviderButton: document.getElementById("saveSupplyProviderButton"),
  supplyContactList: document.getElementById("supplyContactList"),
  supplyContactForm: document.getElementById("supplyContactForm"),
  supplyContactId: document.getElementById("supplyContactId"),
  supplyContactName: document.getElementById("supplyContactName"),
  supplyContactRole: document.getElementById("supplyContactRole"),
  supplyContactRegion: document.getElementById("supplyContactRegion"),
  supplyContactTelegram: document.getElementById("supplyContactTelegram"),
  supplyContactEmail: document.getElementById("supplyContactEmail"),
  supplyContactPhone: document.getElementById("supplyContactPhone"),
  supplyContactChannel: document.getElementById("supplyContactChannel"),
  supplyContactActive: document.getElementById("supplyContactActive"),
  supplyContactNotes: document.getElementById("supplyContactNotes"),
  resetSupplyContactButton: document.getElementById("resetSupplyContactButton"),
  supplyMarginList: document.getElementById("supplyMarginList"),
  supplyMarginForm: document.getElementById("supplyMarginForm"),
  supplyMarginRoute: document.getElementById("supplyMarginRoute"),
  supplyMarginFlow: document.getElementById("supplyMarginFlow"),
  supplyMarginMode: document.getElementById("supplyMarginMode"),
  supplyMarginPercent: document.getElementById("supplyMarginPercent"),
  supplyMarginFixed: document.getElementById("supplyMarginFixed"),
  supplyMarginCurrency: document.getElementById("supplyMarginCurrency"),
  supplyMarginNotes: document.getElementById("supplyMarginNotes"),
  supplyRouteList: document.getElementById("supplyRouteList"),
  supplyRouteForm: document.getElementById("supplyRouteForm"),
  supplyRouteId: document.getElementById("supplyRouteId"),
  supplyRouteCode: document.getElementById("supplyRouteCode"),
  supplyRouteHeading: document.getElementById("supplyRouteHeading"),
  supplyRouteStatus: document.getElementById("supplyRouteStatus"),
  supplyRouteTitle: document.getElementById("supplyRouteTitle"),
  supplyRouteFlow: document.getElementById("supplyRouteFlow"),
  supplyRouteCoverage: document.getElementById("supplyRouteCoverage"),
  supplyRouteGeos: document.getElementById("supplyRouteGeos"),
  supplyRouteBlockedGeos: document.getElementById("supplyRouteBlockedGeos"),
  supplyRouteCurrencies: document.getElementById("supplyRouteCurrencies"),
  supplyRouteMethods: document.getElementById("supplyRouteMethods"),
  supplyRouteTraffic: document.getElementById("supplyRouteTraffic"),
  supplyRouteVerticals: document.getElementById("supplyRouteVerticals"),
  supplyRouteIntegrations: document.getElementById("supplyRouteIntegrations"),
  supplyRouteMinVolume: document.getElementById("supplyRouteMinVolume"),
  supplyRouteMaxVolume: document.getElementById("supplyRouteMaxVolume"),
  supplyRouteVolumeCurrency: document.getElementById("supplyRouteVolumeCurrency"),
  supplyRouteFreshness: document.getElementById("supplyRouteFreshness"),
  supplyRouteEffectiveFrom: document.getElementById("supplyRouteEffectiveFrom"),
  supplyRouteExpiresAt: document.getElementById("supplyRouteExpiresAt"),
  supplyRouteNotes: document.getElementById("supplyRouteNotes"),
  supplyFeeRows: document.getElementById("supplyFeeRows"),
  addSupplyFeeButton: document.getElementById("addSupplyFeeButton"),
  supplyLimitRows: document.getElementById("supplyLimitRows"),
  addSupplyLimitButton: document.getElementById("addSupplyLimitButton"),
  supplySettlementRows: document.getElementById("supplySettlementRows"),
  addSupplySettlementButton: document.getElementById("addSupplySettlementButton"),
  saveSupplyRouteButton: document.getElementById("saveSupplyRouteButton"),
  pauseSupplyRouteButton: document.getElementById("pauseSupplyRouteButton"),
  resumeSupplyRouteButton: document.getElementById("resumeSupplyRouteButton"),
  archiveSupplyRouteButton: document.getElementById("archiveSupplyRouteButton"),
  reviseSupplyRouteButton: document.getElementById("reviseSupplyRouteButton"),
  supplyOpenChecks: document.getElementById("supplyOpenChecks"),
  supplyAnomalyList: document.getElementById("supplyAnomalyList"),
  supplyBatchHistory: document.getElementById("supplyBatchHistory"),
  supplyActivityList: document.getElementById("supplyActivityList"),
  drawerBackdrop: document.getElementById("drawerBackdrop"),
  leadDrawer: document.getElementById("leadDrawer"),
  closeDrawerButton: document.getElementById("closeDrawerButton"),
  drawerCompany: document.getElementById("drawerCompany"),
  drawerContact: document.getElementById("drawerContact"),
  drawerEmailLink: document.getElementById("drawerEmailLink"),
  drawerTelegramLink: document.getElementById("drawerTelegramLink"),
  drawerOfferButton: document.getElementById("drawerOfferButton"),
  drawerLeadId: document.getElementById("drawerLeadId"),
  drawerStatus: document.getElementById("drawerStatus"),
  drawerScore: document.getElementById("drawerScore"),
  drawerGrade: document.getElementById("drawerGrade"),
  drawerOwner: document.getElementById("drawerOwner"),
  workspaceNextAction: document.getElementById("workspaceNextAction"),
  dossierCompleteness: document.getElementById("dossierCompleteness"),
  workspaceSummary: document.getElementById("workspaceSummary"),
  profileDetails: document.getElementById("profileDetails"),
  dossierStatus: document.getElementById("dossierStatus"),
  dossierMissing: document.getElementById("dossierMissing"),
  dossierCompany: document.getElementById("dossierCompany"),
  dossierContactName: document.getElementById("dossierContactName"),
  dossierTelegram: document.getElementById("dossierTelegram"),
  dossierCompanyUrl: document.getElementById("dossierCompanyUrl"),
  dossierRegistrationGeo: document.getElementById("dossierRegistrationGeo"),
  dossierTargetGeos: document.getElementById("dossierTargetGeos"),
  dossierVertical: document.getElementById("dossierVertical"),
  dossierBusinessModel: document.getElementById("dossierBusinessModel"),
  dossierLicenseStatus: document.getElementById("dossierLicenseStatus"),
  dossierLicenseJurisdiction: document.getElementById("dossierLicenseJurisdiction"),
  dossierLicenseNumber: document.getElementById("dossierLicenseNumber"),
  dossierLicenseEvidenceUrl: document.getElementById("dossierLicenseEvidenceUrl"),
  dossierMonthlyVolume: document.getElementById("dossierMonthlyVolume"),
  dossierVolumeCurrency: document.getElementById("dossierVolumeCurrency"),
  dossierCurrencies: document.getElementById("dossierCurrencies"),
  dossierMethods: document.getElementById("dossierMethods"),
  dossierFlows: document.getElementById("dossierFlows"),
  dossierTrafficTypes: document.getElementById("dossierTrafficTypes"),
  dossierMinTransaction: document.getElementById("dossierMinTransaction"),
  dossierMaxTransaction: document.getElementById("dossierMaxTransaction"),
  dossierTransactionCurrency: document.getElementById("dossierTransactionCurrency"),
  dossierLaunchTimeline: document.getElementById("dossierLaunchTimeline"),
  dossierProcessingSetup: document.getElementById("dossierProcessingSetup"),
  saveDossierButton: document.getElementById("saveDossierButton"),
  dossierSaveStatus: document.getElementById("dossierSaveStatus"),
  runMatchingButton: document.getElementById("runMatchingButton"),
  createShortlistButton: document.getElementById("createShortlistButton"),
  shareShortlistButton: document.getElementById("shareShortlistButton"),
  matchSummary: document.getElementById("matchSummary"),
  matchesList: document.getElementById("matchesList"),
  shortlistPreview: document.getElementById("shortlistPreview"),
  manualOfferSearch: document.getElementById("manualOfferSearch"),
  manualOfferRouteList: document.getElementById("manualOfferRouteList"),
  manualOfferSelectionCount: document.getElementById("manualOfferSelectionCount"),
  manualShortlistTitle: document.getElementById("manualShortlistTitle"),
  manualShortlistIntroduction: document.getElementById("manualShortlistIntroduction"),
  manualShortlistNote: document.getElementById("manualShortlistNote"),
  createManualShortlistButton: document.getElementById("createManualShortlistButton"),
  dealDeskList: document.getElementById("dealDeskList"),
  saveLeadButton: document.getElementById("saveLeadButton"),
  merchantRecordState: document.getElementById("merchantRecordState"),
  merchantRecordForm: document.getElementById("merchantRecordForm"),
  merchantRecordCompany: document.getElementById("merchantRecordCompany"),
  merchantRecordName: document.getElementById("merchantRecordName"),
  merchantRecordEmail: document.getElementById("merchantRecordEmail"),
  merchantRecordTelegram: document.getElementById("merchantRecordTelegram"),
  merchantRecordUrl: document.getElementById("merchantRecordUrl"),
  merchantRecordVertical: document.getElementById("merchantRecordVertical"),
  merchantRecordGeos: document.getElementById("merchantRecordGeos"),
  merchantRecordVolume: document.getElementById("merchantRecordVolume"),
  merchantRecordMethods: document.getElementById("merchantRecordMethods"),
  merchantRecordDetails: document.getElementById("merchantRecordDetails"),
  saveMerchantRecordButton: document.getElementById("saveMerchantRecordButton"),
  archiveMerchantButton: document.getElementById("archiveMerchantButton"),
  restoreMerchantButton: document.getElementById("restoreMerchantButton"),
  purgeMerchantButton: document.getElementById("purgeMerchantButton"),
  merchantRecordStatus: document.getElementById("merchantRecordStatus"),
  drawerStatusMessage: document.getElementById("drawerStatusMessage"),
  noteInput: document.getElementById("noteInput"),
  addNoteButton: document.getElementById("addNoteButton"),
  taskTitleInput: document.getElementById("taskTitleInput"),
  taskPriorityInput: document.getElementById("taskPriorityInput"),
  taskDueInput: document.getElementById("taskDueInput"),
  addTaskButton: document.getElementById("addTaskButton"),
  taskList: document.getElementById("taskList"),
  activityList: document.getElementById("activityList"),
  adminMessageList: document.getElementById("adminMessageList"),
  adminMessageInput: document.getElementById("adminMessageInput"),
  sendAdminMessageButton: document.getElementById("sendAdminMessageButton"),
  menuButton: document.getElementById("menuButton"),
  sidebar: document.querySelector(".sidebar"),
  toast: document.getElementById("toast"),
};

function setAuthStatus(message = "", type = "") {
  elements.authStatus.textContent = message;
  elements.authStatus.className = `form-status${type ? ` ${type}` : ""}`;
}

function setDrawerStatus(message = "", type = "") {
  elements.drawerStatusMessage.textContent = message;
  elements.drawerStatusMessage.className = `form-status${type ? ` ${type}` : ""}`;
}

function setDossierSaveStatus(message = "", type = "") {
  elements.dossierSaveStatus.textContent = message;
  elements.dossierSaveStatus.className = `form-status${type ? ` ${type}` : ""}`;
}

function setSupplyStatus(message = "", type = "") {
  elements.supplyStatus.textContent = message;
  elements.supplyStatus.className = `form-status${type ? ` ${type}` : ""}`;
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("is-visible");
  window.clearTimeout(showToast.timeoutId);
  showToast.timeoutId = window.setTimeout(() => {
    elements.toast.classList.remove("is-visible");
  }, 3200);
}

function setButtonLoading(button, loading, label) {
  if (!button.dataset.defaultLabel) {
    button.dataset.defaultLabel = button.textContent;
  }
  button.disabled = loading;
  button.textContent = loading ? label : button.dataset.defaultLabel;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(value, withTime = false) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(i18n?.getLanguage() === "ru" ? "ru-RU" : "en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(date);
}

function cleanText(value) {
  const text = String(value ?? "").trim();
  return text || "—";
}

function listValue(value) {
  if (Array.isArray(value)) return value;
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function listInput(value) {
  return Array.isArray(value) ? value.join(", ") : String(value ?? "");
}

function friendlyError(error, fallback = "The action could not be completed.") {
  const message = String(error?.message || "");
  const known = [
    ["Merchant dossier is incomplete", "Complete the highlighted merchant dossier fields first."],
    ["Select at least one eligible route match", "Select at least one route for the shortlist."],
    ["Every selected route must be a current eligible match", "One of the selected routes is no longer current. Run matching again."],
    ["PSP acceptance is required", "The PSP must accept the merchant before the introduction."],
    ["Telegram introduction must exist", "Create the Telegram introduction before scheduling Zoom."],
  ];
  return known.find(([needle]) => message.includes(needle))?.[1] || fallback;
}

function isShareableShortlist(shortlist) {
  const items = shortlist?.offerpsp_shortlist_items;
  if (!Array.isArray(items) || !items.length) return false;
  return items.every((item) => {
    const snapshot = item.client_snapshot;
    const hasGeos = snapshot?.coverage_scope !== "specific"
      || (Array.isArray(snapshot?.geos) && snapshot.geos.length > 0);
    return Boolean(
      item.private_provider_id
      && item.offer_route_id
      && snapshot?.title?.trim()
      && Array.isArray(snapshot?.currencies) && snapshot.currencies.length
      && Array.isArray(snapshot?.methods) && snapshot.methods.length
      && Array.isArray(snapshot?.client_fees) && snapshot.client_fees.length
      && hasGeos
    );
  });
}

function linkValue(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "—";
  const href = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener">${escapeHtml(raw)}</a>`;
}

function statusLabel(status) {
  return i18n?.t(STATUS_LABELS[status] || status || "New") || STATUS_LABELS[status] || status || "New";
}

const APP_VIEW_COPY = {
  leads: {
    ru: ["Операции", "Заявки мерчантов", "Разбирайте входящие запросы и двигайте каждого мерчанта к следующему действию."],
    en: ["Operations", "Merchant requests", "Review incoming requests and move every merchant to the next action."],
  },
  supply: {
    ru: ["Приватная база", "PSP и офферы", "Управляйте партнёрами, маршрутами, ставками и актуальностью условий."],
    en: ["Private supply", "PSPs and offers", "Manage partners, routes, pricing and offer freshness."],
  },
  management: {
    ru: ["Справочники", "Управление сетью", "Редактируйте мерчантов, PSP, офферы, агентов и связи между ними."],
    en: ["Control center", "Network management", "Edit merchants, PSPs, offers, agents and their relationships."],
  },
  analytics: {
    ru: ["Коммерческий контроль", "Аналитика", "Находите узкое место воронки, рабочие источники и зависшие сделки."],
    en: ["Commercial control", "Analytics", "Find funnel bottlenecks, productive sources and stalled deals."],
  },
};

function activateAppView(view, { resetScroll = true } = {}) {
  const selected = APP_VIEW_COPY[view] ? view : "leads";
  state.activeAppView = selected;
  document.querySelectorAll("[data-app-view]").forEach((panel) => {
    panel.classList.toggle("is-hidden", panel.dataset.appView !== selected);
  });
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.view === selected);
  });
  const language = i18n?.getLanguage() === "ru" ? "ru" : "en";
  const [eyebrow, title, description] = APP_VIEW_COPY[selected][language];
  elements.topbarEyebrow.textContent = eyebrow;
  elements.topbarTitle.textContent = title;
  elements.topbarDescription.textContent = description;
  elements.refreshButton.setAttribute("aria-label", language === "ru" ? "Обновить текущий раздел" : "Refresh current section");
  elements.sidebar.classList.remove("is-open");
  if (resetScroll) window.scrollTo({ top: 0, behavior: "auto" });
}

function activateSupplyPage(page) {
  const allowed = new Set(["providers", "coverage", "import", "history"]);
  const selected = allowed.has(page) ? page : "providers";
  state.activeSupplyPage = selected;
  document.querySelectorAll("[data-supply-page-panel]").forEach((panel) => {
    panel.classList.toggle("is-hidden", panel.dataset.supplyPagePanel !== selected);
  });
  document.querySelectorAll("[data-supply-page]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.supplyPage === selected);
  });
}

async function refreshActiveView() {
  if (state.activeAppView === "supply") await loadSupply();
  else if (state.activeAppView === "management") await loadManagement();
  else await loadLeads();
}

async function verifyStaff(user) {
  const { data, error } = await supabase
    .from("offerpsp_staff_members")
    .select("role, display_name, active")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) throw error;
  if (!data?.active) {
    await supabase.auth.signOut();
    throw new Error("This account is not approved for the OfferPSP desk.");
  }

  return data;
}

async function enterApp(session) {
  if (!session?.user) {
    state.user = null;
    state.staff = null;
    elements.appView.classList.add("is-hidden");
    elements.authView.classList.remove("is-hidden");
    return;
  }

  try {
    state.user = session.user;
    state.staff = await verifyStaff(session.user);
    const displayName = state.staff.display_name || session.user.email?.split("@")[0] || "User";

    elements.userName.textContent = displayName;
    elements.userInitial.textContent = displayName.charAt(0).toUpperCase();
    elements.userRole.textContent = state.staff.role;
    elements.authView.classList.add("is-hidden");
    elements.appView.classList.remove("is-hidden");
    activateAppView("leads", { resetScroll: false });
    activateSupplyPage("providers");
    await loadStaffMembers();
    await Promise.all([loadLeads(), loadSupply(), loadManagement()]);
  } catch (error) {
    setAuthStatus(error.message || "Could not verify access.", "error");
    elements.appView.classList.add("is-hidden");
    elements.authView.classList.remove("is-hidden");
  }
}

async function loadStaffMembers() {
  const { data, error } = await supabase
    .from("offerpsp_staff_members")
    .select("user_id, display_name, role, active")
    .eq("active", true)
    .order("display_name", { ascending: true });
  state.staffMembers = error ? [] : data || [];
  elements.drawerOwner.innerHTML = `<option value="">${escapeHtml(i18n?.t("Unassigned") || "Unassigned")}</option>${state.staffMembers.map((member) => `<option value="${escapeHtml(member.user_id)}">${escapeHtml(member.display_name || member.role)}</option>`).join("")}`;
}

function setManagementStatus(message = "", tone = "") {
  elements.managementStatus.textContent = message;
  elements.managementStatus.className = `form-status${tone ? ` ${tone}` : ""}`;
}

async function loadManagement() {
  elements.refreshManagementButton.disabled = true;
  const { data, error } = await supabase.rpc("get_offerpsp_management_registry");
  elements.refreshManagementButton.disabled = false;
  if (error) {
    state.management.available = false;
    setManagementStatus("Control center will become available after its database migration is applied.", "error");
    return;
  }
  state.management = {
    merchants: Array.isArray(data?.merchants) ? data.merchants : [],
    providers: Array.isArray(data?.providers) ? data.providers : [],
    organizations: Array.isArray(data?.organizations) ? data.organizations : [],
    assignments: Array.isArray(data?.assignments) ? data.assignments : [],
    agentMarginPolicies: Array.isArray(data?.agent_margin_policies) ? data.agent_margin_policies : [],
    commissionSummary: data?.commission_summary || {},
    available: true,
  };
  setManagementStatus();
  renderManagement();
}

function renderManagement() {
  const { merchants, providers, organizations, assignments } = state.management;
  const agents = organizations.filter((item) => item.organization_type === "agent");
  elements.managementSummary.innerHTML = [
    ["Active merchants", merchants.filter((item) => item.record_state === "active").length],
    ["PSPs", providers.filter((item) => item.relationship_status !== "archived").length],
    ["Active offers", providers.reduce((sum, item) => sum + Number(item.published_route_count || 0), 0)],
    ["Agents", agents.filter((item) => item.status === "active").length],
  ].map(([label, value]) => `<article><span>${escapeHtml(label)}</span><strong>${Number(value)}</strong></article>`).join("");
  renderManagementMerchants();
  renderManagementProviders();
  renderManagementOrganizations();
}

function renderManagementMerchants() {
  const search = elements.managementMerchantSearch.value.trim().toLowerCase();
  const recordState = elements.managementMerchantState.value;
  const merchants = state.management.merchants.filter((merchant) => {
    if (recordState !== "all" && merchant.record_state !== recordState) return false;
    return !search || [merchant.company, merchant.name, merchant.work_email, merchant.telegram, merchant.vertical]
      .join(" ").toLowerCase().includes(search);
  });
  elements.managementMerchantList.innerHTML = merchants.length ? merchants.map((merchant) => `
    <article class="registry-row">
      <div><strong>${escapeHtml(merchant.company)}</strong><span>${escapeHtml(merchant.name)} · ${escapeHtml(merchant.work_email)}</span></div>
      <div class="registry-meta"><span class="status-pill status-${escapeHtml(merchant.status)}">${escapeHtml(statusLabel(merchant.status))}</span><span>${escapeHtml(merchant.vertical || "—")}</span></div>
      <div class="registry-actions">
        <button class="text-button open-managed-merchant" type="button" data-id="${escapeHtml(merchant.lead_id)}">Open</button>
        ${merchant.record_state === "active"
          ? `<button class="text-button archive-managed-merchant" type="button" data-id="${escapeHtml(merchant.lead_id)}">Archive</button>`
          : `<button class="text-button restore-managed-merchant" type="button" data-id="${escapeHtml(merchant.lead_id)}">Restore</button><button class="text-button danger purge-managed-merchant" type="button" data-id="${escapeHtml(merchant.lead_id)}">Delete</button>`}
      </div>
    </article>`).join("") : '<p class="supply-empty">No merchant records match this filter.</p>';
  elements.managementMerchantList.querySelectorAll(".open-managed-merchant").forEach((button) => button.addEventListener("click", () => openLead(button.dataset.id)));
  elements.managementMerchantList.querySelectorAll(".archive-managed-merchant").forEach((button) => button.addEventListener("click", () => changeMerchantRecordState(button.dataset.id, "archived", button)));
  elements.managementMerchantList.querySelectorAll(".restore-managed-merchant").forEach((button) => button.addEventListener("click", () => changeMerchantRecordState(button.dataset.id, "active", button)));
  elements.managementMerchantList.querySelectorAll(".purge-managed-merchant").forEach((button) => button.addEventListener("click", () => purgeMerchant(button.dataset.id, button)));
}

function resetManagedProviderForm() {
  elements.managedProviderForm.reset();
  elements.managedProviderId.value = "";
  elements.managedProviderPriority.value = "50";
  elements.managedProviderTier.value = "standard";
  elements.managedProviderHeading.textContent = "Add PSP";
  elements.managedProviderStatusMessage.textContent = "";
}

function editManagedProvider(providerId) {
  const provider = state.management.providers.find((item) => item.id === providerId);
  if (!provider) return;
  elements.managedProviderId.value = provider.id;
  elements.managedProviderHeading.textContent = provider.brand_name;
  elements.managedProviderName.value = provider.brand_name || "";
  elements.managedProviderLegalName.value = provider.legal_name || "";
  elements.managedProviderWebsite.value = provider.website || "";
  elements.managedProviderStatus.value = provider.relationship_status;
  elements.managedProviderTier.value = provider.relationship_tier || "standard";
  elements.managedProviderPriority.value = provider.strategic_priority ?? 50;
  elements.managedProviderMarginIncluded.checked = Boolean(provider.margin_included_default);
  elements.managedProviderNotes.value = provider.relationship_notes || "";
  elements.managedProviderForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderManagementProviders() {
  const providers = state.management.providers;
  elements.managementProviderList.innerHTML = providers.length ? providers.map((provider) => `
    <article class="registry-row">
      <div><strong>${escapeHtml(provider.brand_name)}</strong><span>${escapeHtml(provider.internal_code)} · ${escapeHtml(provider.relationship_tier || "standard")}</span></div>
      <div class="registry-meta"><span class="status-pill status-${escapeHtml(provider.relationship_status)}">${escapeHtml(statusLabel(provider.relationship_status))}</span><span>${Number(provider.published_route_count || 0)} live / ${Number(provider.route_count || 0)} routes</span></div>
      <div class="registry-actions"><button class="text-button edit-managed-provider" type="button" data-id="${escapeHtml(provider.id)}">Edit</button><button class="text-button open-managed-provider" type="button" data-id="${escapeHtml(provider.id)}">Offers</button></div>
    </article>`).join("") : '<p class="supply-empty">No PSP records yet.</p>';
  elements.managementProviderList.querySelectorAll(".edit-managed-provider").forEach((button) => button.addEventListener("click", () => editManagedProvider(button.dataset.id)));
  elements.managementProviderList.querySelectorAll(".open-managed-provider").forEach((button) => button.addEventListener("click", () => openSupplyWorkspace(button.dataset.id)));
  elements.manualOfferProvider.innerHTML = `<option value="">Choose PSP</option>${providers.filter((item) => item.relationship_status !== "archived").map((provider) => `<option value="${escapeHtml(provider.id)}">${escapeHtml(provider.brand_name)} · ${escapeHtml(provider.internal_code)}</option>`).join("")}`;
}

function resetOrganizationForm() {
  elements.organizationForm.reset();
  elements.organizationId.value = "";
  elements.organizationType.disabled = false;
  elements.organizationStatus.value = "active";
  elements.organizationTier.value = "standard";
  elements.organizationHeading.textContent = "Add agent or merchant company";
  elements.organizationStatusMessage.textContent = "";
}

function editOrganization(organizationId) {
  const organization = state.management.organizations.find((item) => item.id === organizationId);
  if (!organization) return;
  elements.organizationId.value = organization.id;
  elements.organizationType.value = organization.organization_type;
  elements.organizationType.disabled = true;
  elements.organizationName.value = organization.name || "";
  elements.organizationLegalName.value = organization.legal_name || "";
  elements.organizationStatus.value = organization.status;
  elements.organizationTier.value = organization.relationship_tier || "standard";
  elements.organizationNotes.value = organization.relationship_notes || "";
  elements.organizationHeading.textContent = organization.name;
  elements.organizationForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderManagementOrganizations() {
  const organizations = state.management.organizations;
  const agents = organizations.filter((item) => item.organization_type === "agent" && item.status !== "archived");
  const merchants = organizations.filter((item) => item.organization_type === "merchant" && item.status !== "archived");
  elements.organizationList.innerHTML = organizations.length ? organizations.map((organization) => `
    <article class="registry-row">
      <div><strong>${escapeHtml(organization.name)}</strong><span>${escapeHtml(organization.internal_code)} · ${escapeHtml(organization.organization_type)} · ${escapeHtml(organization.relationship_tier || "standard")}</span></div>
      <div class="registry-meta"><span class="status-pill status-${escapeHtml(organization.status)}">${escapeHtml(statusLabel(organization.status))}</span><span>${Number(organization.member_count || 0)} members${organization.organization_type === "agent" ? ` · ${Number(organization.merchant_count || 0)} merchants` : ""}</span></div>
      <div class="registry-actions"><button class="text-button edit-organization" type="button" data-id="${escapeHtml(organization.id)}">Edit</button></div>
    </article>`).join("") : '<p class="supply-empty">No agent or merchant organizations yet.</p>';
  elements.organizationList.querySelectorAll(".edit-organization").forEach((button) => button.addEventListener("click", () => editOrganization(button.dataset.id)));
  const agentOptions = agents.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join("");
  const merchantOptions = merchants.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join("");
  elements.assignmentAgent.innerHTML = `<option value="">Choose agent</option>${agentOptions}`;
  elements.agentMarginAgent.innerHTML = `<option value="">Choose agent</option>${agentOptions}`;
  elements.assignmentMerchant.innerHTML = `<option value="">Choose merchant</option>${merchantOptions}`;
  elements.agentMarginMerchant.innerHTML = `<option value="">All assigned merchants</option>${merchantOptions}`;
  elements.assignmentList.innerHTML = state.management.assignments.length ? state.management.assignments.map((assignment) => `
    <article class="registry-row"><div><strong>${escapeHtml(assignment.agent_name)} → ${escapeHtml(assignment.merchant_name)}</strong><span>Portfolio assignment</span></div><div class="registry-meta"><span class="status-pill status-${escapeHtml(assignment.status)}">${escapeHtml(statusLabel(assignment.status))}</span></div></article>`).join("") : '<p class="supply-empty">No merchant portfolios assigned to agents.</p>';
}

async function saveManagedProvider(event) {
  event.preventDefault();
  const submit = elements.managedProviderForm.querySelector('button[type="submit"]');
  setButtonLoading(submit, true, "Saving…");
  const { data, error } = await supabase.rpc("save_offerpsp_managed_provider", {
    p_provider_id: elements.managedProviderId.value || null,
    p_payload: {
      brand_name: elements.managedProviderName.value.trim(), legal_name: elements.managedProviderLegalName.value.trim(),
      website: elements.managedProviderWebsite.value.trim(), relationship_status: elements.managedProviderStatus.value,
      relationship_tier: elements.managedProviderTier.value, strategic_priority: elements.managedProviderPriority.value,
      margin_included_default: elements.managedProviderMarginIncluded.checked, relationship_notes: elements.managedProviderNotes.value.trim(),
    },
  });
  setButtonLoading(submit, false);
  if (error) { elements.managedProviderStatusMessage.textContent = friendlyError(error, "Could not save PSP."); return; }
  elements.managedProviderStatusMessage.textContent = "PSP saved.";
  elements.managedProviderId.value = data.id;
  await Promise.all([loadManagement(), loadSupply()]);
}

async function createManualOffer(event) {
  event.preventDefault();
  const submit = elements.manualOfferForm.querySelector('button[type="submit"]');
  const providerId = elements.manualOfferProvider.value;
  const currency = elements.manualOfferLimitCurrency.value.trim().toUpperCase() || elements.manualOfferCurrencies.value.split(",")[0]?.trim().toUpperCase();
  const flow = elements.manualOfferFlow.value;
  const rate = optionalNumber(elements.manualOfferRate);
  const fees = rate === null ? [] : [{ flow: flow === "both" ? "payin" : flow, fee_type: "percent", base_percent: rate, applies_on: "success", source_text: elements.manualOfferSource.value.trim() }];
  const min = optionalNumber(elements.manualOfferMin);
  const max = optionalNumber(elements.manualOfferMax);
  const limits = (min !== null || max !== null) && currency ? [{ flow, currency, minimum_amount: min, maximum_amount: max }] : [];
  setButtonLoading(submit, true, "Creating…");
  const { data, error } = await supabase.rpc("create_offerpsp_manual_route", {
    p_provider_id: providerId,
    p_payload: {
      client_title: elements.manualOfferTitle.value.trim(), flow, coverage_scope: "specific",
      geos: listValue(elements.manualOfferGeos.value), currencies: listValue(elements.manualOfferCurrencies.value),
      methods: listValue(elements.manualOfferMethods.value), verticals: listValue(elements.manualOfferVerticals.value),
      fees, limits, settlements: [], source_reference: elements.manualOfferSource.value.trim(),
      operational_notes: elements.manualOfferSource.value.trim(),
    },
  });
  setButtonLoading(submit, false);
  if (error) { elements.manualOfferStatus.textContent = friendlyError(error, "Could not create offer draft."); return; }
  elements.manualOfferStatus.textContent = `Private draft ${data.route_code} created.`;
  elements.manualOfferForm.reset();
  await Promise.all([loadManagement(), loadSupply()]);
  await openSupplyWorkspace(providerId);
  state.selectedSupplyRouteId = data.route_id;
  renderSupplyWorkspace();
}

async function saveOrganization(event) {
  event.preventDefault();
  const submit = elements.organizationForm.querySelector('button[type="submit"]');
  setButtonLoading(submit, true, "Saving…");
  const { data, error } = await supabase.rpc("save_offerpsp_organization", {
    p_organization_id: elements.organizationId.value || null,
    p_organization_type: elements.organizationType.value,
    p_payload: { name: elements.organizationName.value.trim(), legal_name: elements.organizationLegalName.value.trim(), status: elements.organizationStatus.value, relationship_tier: elements.organizationTier.value, relationship_notes: elements.organizationNotes.value.trim() },
  });
  setButtonLoading(submit, false);
  if (error) { elements.organizationStatusMessage.textContent = friendlyError(error, "Could not save organization."); return; }
  elements.organizationStatusMessage.textContent = "Organization saved.";
  elements.organizationId.value = data.id;
  await loadManagement();
}

async function saveAgentAssignment(event) {
  event.preventDefault();
  const submit = elements.agentAssignmentForm.querySelector('button[type="submit"]');
  setButtonLoading(submit, true, "Saving…");
  const { error } = await supabase.rpc("set_offerpsp_agent_assignment", { p_agent_organization_id: elements.assignmentAgent.value, p_merchant_organization_id: elements.assignmentMerchant.value, p_status: elements.assignmentStatus.value });
  setButtonLoading(submit, false);
  if (error) return setManagementStatus(friendlyError(error, "Could not save assignment."), "error");
  await loadManagement();
  setManagementStatus("Merchant portfolio assignment saved.", "success");
}

async function saveAgentMargin(event) {
  event.preventDefault();
  const submit = elements.agentMarginForm.querySelector('button[type="submit"]');
  setButtonLoading(submit, true, "Saving…");
  const { error } = await supabase.rpc("set_offerpsp_agent_margin_policy", {
    p_agent_organization_id: elements.agentMarginAgent.value, p_merchant_organization_id: elements.agentMarginMerchant.value || null,
    p_flow: elements.agentMarginFlow.value, p_mode: elements.agentMarginMode.value,
    p_percent_value: optionalNumber(elements.agentMarginPercent), p_fixed_value: optionalNumber(elements.agentMarginFixed),
    p_fixed_currency: elements.agentMarginCurrency.value.trim() || null, p_notes: elements.agentMarginNotes.value.trim() || null,
  });
  setButtonLoading(submit, false);
  if (error) return setManagementStatus(friendlyError(error, "Could not save agent margin."), "error");
  elements.agentMarginForm.reset();
  await loadManagement();
  setManagementStatus("New agent margin version is active; the previous version was closed.", "success");
}

async function loadSupply() {
  elements.supplyLoadingState.classList.remove("is-hidden");
  elements.supplyEmptyState.classList.add("is-hidden");
  elements.providerList.classList.add("is-hidden");
  elements.refreshSupplyButton.disabled = true;

  const [supplyResult, coverageResult] = await Promise.all([
    supabase.rpc("list_offerpsp_supply"),
    supabase.rpc("get_offerpsp_supply_coverage"),
  ]);
  const { data, error } = supplyResult;

  elements.refreshSupplyButton.disabled = false;
  elements.supplyLoadingState.classList.add("is-hidden");
  if (error) {
    elements.providerCount.textContent = "—";
    elements.batchCount.textContent = "—";
    elements.supplyEmptyState.textContent = "Private supply is unavailable until its database migration is applied.";
    elements.supplyEmptyState.classList.remove("is-hidden");
    return;
  }

  state.supply = {
    providers: Array.isArray(data?.providers) ? data.providers : [],
    batches: Array.isArray(data?.batches) ? data.batches : [],
    coverage: Array.isArray(coverageResult.data?.routes) ? coverageResult.data.routes : [],
    coverageAvailable: !coverageResult.error,
  };
  renderSupply();
  if (state.selectedLead) renderManualOfferRoutes();
}

function renderSupply() {
  const { providers, batches } = state.supply;
  elements.providerCount.textContent = String(providers.length);
  elements.batchCount.textContent = String(batches.length);
  elements.supplyEmptyState.classList.toggle("is-hidden", providers.length > 0);
  elements.providerList.classList.toggle("is-hidden", providers.length === 0);
  elements.providerList.innerHTML = providers.map((provider) => `
    <article class="provider-card">
      <div class="provider-card-head">
        <div>
          <strong>${escapeHtml(provider.brand_name)}</strong>
          <small>${escapeHtml(provider.internal_code)}</small>
        </div>
        <span class="status-pill status-${escapeHtml(provider.relationship_status)}">${escapeHtml(provider.relationship_status)}</span>
      </div>
      <dl>
        <div><dt>Rate cards</dt><dd>${Number(provider.batch_count || 0)}</dd></div>
        <div><dt>Published routes</dt><dd>${Number(provider.published_route_count || 0)}</dd></div>
        <div><dt>Client rate</dt><dd>${provider.margin_included_default ? "Included by PSP" : "Margin policy"}</dd></div>
      </dl>
      <button class="button button-secondary button-compact open-supply-button" type="button" data-provider-id="${escapeHtml(provider.id)}">Open workspace</button>
    </article>
  `).join("");

  elements.providerList.querySelectorAll(".open-supply-button").forEach((button) => {
    button.addEventListener("click", () => openSupplyWorkspace(button.dataset.providerId));
  });

  if (!batches.length) {
    elements.batchList.innerHTML = '<div class="supply-empty">No import batches yet.</div>';
    renderSupplyCoverage();
    return;
  }

  elements.batchList.innerHTML = batches.map((batch) => {
    const canPublish = ["draft", "review"].includes(batch.status);
    return `
      <article class="batch-card">
        <div class="batch-main">
          <div class="batch-title">
            <strong>${escapeHtml(batch.provider_name)}</strong>
            <span>v${Number(batch.batch_version || 0)}</span>
            <span class="status-pill status-${escapeHtml(batch.status)}">${escapeHtml(batch.status)}</span>
          </div>
          <p>${escapeHtml(batch.source_reference || batch.source_type)} · ${formatDate(batch.source_effective_date || batch.received_at)}</p>
        </div>
        <div class="batch-metrics">
          <span><strong>${Number(batch.route_count || 0)}</strong> routes</span>
          <span class="${Number(batch.open_anomaly_count || 0) > 0 ? "has-warning" : ""}"><strong>${Number(batch.open_anomaly_count || 0)}</strong> open checks</span>
        </div>
        ${canPublish ? `<button class="button button-secondary button-compact publish-batch-button" type="button" data-batch-id="${escapeHtml(batch.id)}">Publish</button>` : ""}
      </article>
    `;
  }).join("");

  elements.batchList.querySelectorAll(".publish-batch-button").forEach((button) => {
    button.addEventListener("click", () => publishRateCard(button.dataset.batchId, button));
  });
  renderSupplyCoverage();
}

function coverageReadiness(route) {
  if (Number(route.open_error_count || 0) > 0) return { key: "blocked", label: "Blocked by errors" };
  if (!route.margin_ready) return { key: "margin", label: "Margin required" };
  if (route.status === "published") return route.is_stale
    ? { key: "stale", label: "Published · stale" }
    : { key: "live", label: "Published · live" };
  if (route.status === "paused") return { key: "paused", label: "Paused" };
  return { key: "review", label: route.is_stale ? "Review · stale" : "Ready for review" };
}

function routeCoverage(route) {
  if (route.geos?.length) return route.geos.join(", ");
  if (route.coverage_scope === "global") return "Worldwide";
  if (route.coverage_scope === "regional") return "Regional";
  return "Not specified";
}

function renderSupplyCoverage() {
  const available = state.supply.coverageAvailable;
  elements.coverageUnavailable.classList.toggle("is-hidden", available);
  elements.coverageTableWrap.classList.toggle("is-hidden", !available);
  elements.coverageSummary.classList.toggle("is-hidden", !available);
  if (!available) {
    elements.coverageEmpty.classList.add("is-hidden");
    return;
  }

  const search = elements.coverageSearch.value.trim().toLowerCase();
  const statusFilter = elements.coverageStatusFilter.value;
  const routes = state.supply.coverage.filter((route) => {
    const readiness = coverageReadiness(route);
    const statusMatches = statusFilter === "all"
      || (statusFilter === "published" && route.status === "published")
      || (statusFilter === "draft" && ["draft", "review"].includes(route.status))
      || (statusFilter === "attention" && ["blocked", "margin", "stale", "paused"].includes(readiness.key));
    if (!statusMatches) return false;
    if (!search) return true;
    return [
      routeCoverage(route), route.provider_name, route.provider_code, route.route_code,
      route.client_title, route.flow, ...(route.currencies || []), ...(route.methods || []),
      ...(route.verticals || []), ...(route.traffic_types || []), readiness.label,
    ].join(" ").toLowerCase().includes(search);
  });

  const uniqueValues = (key) => new Set(routes.flatMap((route) => route[key] || [])).size;
  const geos = new Set(routes.flatMap((route) => route.geos?.length ? route.geos : [routeCoverage(route)])).size;
  elements.coverageSummary.innerHTML = [
    ["Routes", routes.length], ["GEOs", geos], ["Currencies", uniqueValues("currencies")],
    ["Methods", uniqueValues("methods")], ["PSP", new Set(routes.map((route) => route.provider_id)).size],
  ].map(([label, value]) => `<article><span>${escapeHtml(label)}</span><strong>${Number(value)}</strong></article>`).join("");

  elements.coverageEmpty.classList.toggle("is-hidden", routes.length > 0);
  elements.coverageTableWrap.classList.toggle("is-hidden", routes.length === 0);
  elements.coverageTableBody.innerHTML = routes.map((route) => {
    const readiness = coverageReadiness(route);
    return `<tr class="coverage-row" tabindex="0" data-provider-id="${escapeHtml(route.provider_id)}" data-route-id="${escapeHtml(route.route_id)}">
      <td data-label="Coverage"><strong>${escapeHtml(routeCoverage(route))}</strong><small>${escapeHtml(route.coverage_scope)}</small></td>
      <td data-label="PSP / route"><strong>${escapeHtml(route.provider_name)}</strong><small>${escapeHtml(route.route_code)} · ${escapeHtml(route.client_title)}</small></td>
      <td data-label="Flow">${escapeHtml(route.flow)}</td>
      <td data-label="Currencies">${escapeHtml((route.currencies || []).join(", ") || "—")}</td>
      <td data-label="Methods">${escapeHtml((route.methods || []).join(", ") || "—")}</td>
      <td data-label="Verticals">${escapeHtml((route.verticals || []).join(", ") || "Not confirmed")}</td>
      <td data-label="Readiness"><span class="coverage-readiness is-${escapeHtml(readiness.key)}">${escapeHtml(readiness.label)}</span>${Number(route.open_warning_count || 0) ? `<small>${Number(route.open_warning_count)} warnings</small>` : ""}</td>
    </tr>`;
  }).join("");

  elements.coverageTableBody.querySelectorAll(".coverage-row").forEach((row) => {
    const open = () => openCoverageRoute(row.dataset.providerId, row.dataset.routeId);
    row.addEventListener("click", open);
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); open(); }
    });
  });
}

async function openCoverageRoute(providerId, routeId) {
  await openSupplyWorkspace(providerId);
  if (!state.supplyWorkspace) return;
  state.selectedSupplyRouteId = routeId;
  renderSupplyRoutes((state.supplyWorkspace.routes || []).filter((route) => route.status !== "archived"));
  renderSupplyRouteEditor();
  document.getElementById("supplyRoutes")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function setSupplyWorkspaceStatus(message = "", tone = "") {
  elements.supplyWorkspaceStatus.textContent = message;
  elements.supplyWorkspaceStatus.className = `form-status${tone ? ` ${tone}` : ""}`;
}

function closeSupplyWorkspace() {
  elements.supplyDrawer.classList.remove("is-open");
  elements.supplyDrawer.setAttribute("aria-hidden", "true");
  elements.supplyDrawerBackdrop.classList.add("is-hidden");
  state.supplyWorkspace = null;
  state.selectedSupplyProviderId = null;
  state.selectedSupplyRouteId = null;
  document.body.classList.remove("drawer-open");
}

async function openSupplyWorkspace(providerId) {
  state.selectedSupplyProviderId = providerId;
  state.selectedSupplyRouteId = null;
  elements.supplyDrawerBackdrop.classList.remove("is-hidden");
  elements.supplyDrawer.classList.add("is-open");
  elements.supplyDrawer.setAttribute("aria-hidden", "false");
  document.body.classList.add("drawer-open");
  elements.supplyDrawerTitle.textContent = "Loading PSP…";
  elements.supplyDrawerCode.textContent = "—";
  activateSupplyWorkspace("supplyOverview");
  setSupplyWorkspaceStatus("Loading private supply workspace…");
  await loadSupplyWorkspace(providerId);
}

async function loadSupplyWorkspace(providerId = state.selectedSupplyProviderId) {
  if (!providerId) return;
  const { data, error } = await supabase.rpc("get_offerpsp_supply_workspace", { p_provider_id: providerId });
  if (error) {
    setSupplyWorkspaceStatus(friendlyError(error, "Could not load the PSP workspace."), "error");
    return;
  }
  state.supplyWorkspace = data;
  if (state.selectedSupplyRouteId && !(data.routes || []).some((route) => route.id === state.selectedSupplyRouteId && route.status !== "archived")) {
    state.selectedSupplyRouteId = null;
  }
  renderSupplyWorkspace();
  setSupplyWorkspaceStatus();
}

function renderSupplyWorkspace() {
  const workspace = state.supplyWorkspace;
  if (!workspace?.provider) return;
  const provider = workspace.provider;
  const routes = workspace.routes || [];
  const activeRoutes = routes.filter((route) => route.status !== "archived");
  const batches = workspace.batches || [];
  const contacts = workspace.contacts || [];
  const policies = workspace.margin_policies || [];
  const openAnomalies = activeRoutes.flatMap((route) => (route.anomalies || []).map((anomaly) => ({ ...anomaly, route })));
  const openErrors = openAnomalies.filter((item) => item.status === "open" && item.severity === "error").length;
  const openWarnings = openAnomalies.filter((item) => item.status === "open" && item.severity === "warning").length;
  const published = activeRoutes.filter((route) => route.status === "published").length;
  const stale = activeRoutes.filter((route) => route.is_stale && route.status !== "expired").length;

  elements.supplyDrawerTitle.textContent = provider.brand_name;
  elements.supplyDrawerCode.textContent = provider.internal_code;
  elements.supplyWorkspaceSummary.innerHTML = [
    ["Published routes", String(published)],
    ["Open errors / warnings", `${openErrors} / ${openWarnings}`],
    ["Stale routes", String(stale)],
    ["Last confirmed", provider.last_verified_at ? formatDate(provider.last_verified_at, true) : "Never"],
  ].map(([label, value]) => `<article><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`).join("");

  elements.supplyBrandName.value = provider.brand_name || "";
  elements.supplyLegalName.value = provider.legal_name || "";
  elements.supplyWebsite.value = provider.website || "";
  elements.supplyRelationshipStatus.value = provider.relationship_status || "prospect";
  elements.supplyRelationshipTier.value = provider.relationship_tier || "standard";
  elements.supplyPriority.value = provider.strategic_priority ?? 50;
  elements.supplyMarginIncluded.checked = Boolean(provider.margin_included_default);
  elements.supplyRelationshipNotes.value = provider.relationship_notes || "";

  renderSupplyContacts(contacts);
  renderSupplyMargins(policies, activeRoutes);
  renderSupplyRoutes(activeRoutes);
  renderSupplyAnomalies(openAnomalies);
  renderSupplyHistory(batches, workspace.activity || []);
}

function renderSupplyContacts(contacts) {
  elements.supplyContactList.innerHTML = contacts.length ? contacts.map((contact) => `
    <article class="contact-card${contact.active ? "" : " is-inactive"}">
      <div><strong>${escapeHtml(contact.full_name)}</strong><span>${escapeHtml(contact.role_title || "Contact")}${contact.region ? ` · ${escapeHtml(contact.region)}` : ""}</span></div>
      <div class="contact-channels">${[contact.telegram, contact.email, contact.phone].filter(Boolean).map((value) => `<span>${escapeHtml(value)}</span>`).join("")}</div>
      <button class="text-button edit-supply-contact" type="button" data-contact-id="${escapeHtml(contact.id)}">Edit</button>
    </article>
  `).join("") : '<p class="supply-empty">No working contacts yet.</p>';
  elements.supplyContactList.querySelectorAll(".edit-supply-contact").forEach((button) => {
    button.addEventListener("click", () => editSupplyContact(button.dataset.contactId));
  });
}

function resetSupplyContactForm() {
  elements.supplyContactForm.reset();
  elements.supplyContactId.value = "";
  elements.supplyContactActive.checked = true;
}

function editSupplyContact(contactId) {
  const contact = (state.supplyWorkspace?.contacts || []).find((item) => item.id === contactId);
  if (!contact) return;
  elements.supplyContactId.value = contact.id;
  elements.supplyContactName.value = contact.full_name || "";
  elements.supplyContactRole.value = contact.role_title || "";
  elements.supplyContactRegion.value = contact.region || "";
  elements.supplyContactTelegram.value = contact.telegram || "";
  elements.supplyContactEmail.value = contact.email || "";
  elements.supplyContactPhone.value = contact.phone || "";
  elements.supplyContactChannel.value = contact.preferred_channel || "";
  elements.supplyContactActive.checked = Boolean(contact.active);
  elements.supplyContactNotes.value = contact.notes || "";
  elements.supplyContactName.focus();
}

function marginDescription(policy) {
  if (policy.mode === "included") return "Included by PSP";
  const parts = [];
  if (policy.percent_value !== null && policy.percent_value !== undefined) parts.push(`${Number(policy.percent_value)}%`);
  if (policy.fixed_value !== null && policy.fixed_value !== undefined) parts.push(`${Number(policy.fixed_value)} ${policy.fixed_currency || ""}`.trim());
  return parts.join(" + ") || policy.mode;
}

function renderSupplyMargins(policies, routes) {
  const active = policies.filter((policy) => policy.active);
  elements.supplyMarginList.innerHTML = policies.length ? policies.slice(0, 20).map((policy) => {
    const route = routes.find((item) => item.id === policy.route_id);
    return `<article class="margin-card${policy.active ? "" : " is-inactive"}"><div><strong>${escapeHtml(route?.client_title || "All PSP routes")}</strong><span>${escapeHtml(policy.flow)} · ${escapeHtml(policy.mode)} · ${policy.active ? "current" : `closed ${escapeHtml(formatDate(policy.effective_to))}`}</span></div><b>${escapeHtml(marginDescription(policy))}</b>${policy.active ? `<button class="text-button deactivate-margin" type="button" data-id="${escapeHtml(policy.id)}">Deactivate</button>` : ""}</article>`;
  }).join("") : '<p class="supply-empty">No margin history. Publication is blocked unless the PSP rate already includes commission.</p>';
  if (!active.length && policies.length) elements.supplyMarginList.insertAdjacentHTML("afterbegin", '<p class="supply-empty">No active margin policy.</p>');
  elements.supplyMarginList.querySelectorAll(".deactivate-margin").forEach((button) => button.addEventListener("click", () => deactivateSupplyMargin(button.dataset.id, button)));
  elements.supplyMarginRoute.innerHTML = `<option value="">All PSP routes</option>${routes.filter((route) => route.status !== "archived").map((route) => `<option value="${escapeHtml(route.id)}">${escapeHtml(route.internal_code)} · ${escapeHtml(route.client_title)}</option>`).join("")}`;
}

async function deactivateSupplyMargin(policyId, button) {
  const reason = window.prompt("Why is this margin being deactivated?");
  if (!reason?.trim()) return;
  setButtonLoading(button, true, "Saving…");
  const { error } = await supabase.rpc("deactivate_offerpsp_margin_policy", { p_policy_id: policyId, p_reason: reason.trim() });
  setButtonLoading(button, false);
  if (error) return setSupplyWorkspaceStatus(friendlyError(error, "Could not deactivate margin."), "error");
  await Promise.all([loadSupplyWorkspace(), loadManagement()]);
  setSupplyWorkspaceStatus("Margin policy deactivated; its history was retained.", "success");
}

function renderSupplyRoutes(routes) {
  elements.supplyRouteList.innerHTML = routes.length ? routes.map((route) => `
    <button class="route-list-item${state.selectedSupplyRouteId === route.id ? " is-active" : ""}" type="button" data-route-id="${escapeHtml(route.id)}">
      <span><strong>${escapeHtml(route.client_title)}</strong><small>${escapeHtml(route.internal_code)} · v${Number(route.batch_version || 0)}</small></span>
      <span class="route-health"><i class="status-pill status-${escapeHtml(route.status)}">${escapeHtml(route.status)}</i>${Number(route.open_error_count || 0) ? `<b>${Number(route.open_error_count)} errors</b>` : route.is_stale ? "<b>stale</b>" : ""}</span>
    </button>
  `).join("") : '<p class="supply-empty">No normalized routes.</p>';
  elements.supplyRouteList.querySelectorAll(".route-list-item").forEach((button) => {
    button.addEventListener("click", () => selectSupplyRoute(button.dataset.routeId));
  });
  if (state.selectedSupplyRouteId) renderSupplyRouteEditor();
}

function selectSupplyRoute(routeId) {
  state.selectedSupplyRouteId = routeId;
  renderSupplyRoutes((state.supplyWorkspace?.routes || []).filter((route) => route.status !== "archived"));
  renderSupplyRouteEditor();
}

function inputDate(value) {
  return value ? String(value).slice(0, 10) : "";
}

function renderSupplyRouteEditor() {
  const route = (state.supplyWorkspace?.routes || []).find((item) => item.id === state.selectedSupplyRouteId);
  if (!route) {
    elements.supplyRouteForm.classList.add("is-hidden");
    return;
  }
  elements.supplyRouteForm.classList.remove("is-hidden");
  elements.supplyRouteId.value = route.id;
  elements.supplyRouteCode.textContent = `${route.internal_code} · rate card v${Number(route.batch_version || 0)}`;
  elements.supplyRouteHeading.textContent = route.client_title;
  elements.supplyRouteStatus.textContent = route.status;
  elements.supplyRouteStatus.className = `status-pill status-${escapeHtml(route.status)}`;
  elements.supplyRouteTitle.value = route.client_title || "";
  elements.supplyRouteFlow.value = route.flow;
  elements.supplyRouteCoverage.value = route.coverage_scope;
  elements.supplyRouteGeos.value = listInput(route.geos);
  elements.supplyRouteBlockedGeos.value = listInput(route.blocked_geos);
  elements.supplyRouteCurrencies.value = listInput(route.currencies);
  elements.supplyRouteMethods.value = listInput(route.methods);
  elements.supplyRouteTraffic.value = listInput(route.traffic_types);
  elements.supplyRouteVerticals.value = listInput(route.verticals);
  elements.supplyRouteIntegrations.value = listInput(route.integrations);
  elements.supplyRouteMinVolume.value = route.min_monthly_volume ?? "";
  elements.supplyRouteMaxVolume.value = route.max_monthly_volume ?? "";
  elements.supplyRouteVolumeCurrency.value = route.volume_currency || "";
  elements.supplyRouteFreshness.value = route.freshness_days ?? 30;
  elements.supplyRouteEffectiveFrom.value = inputDate(route.effective_from);
  elements.supplyRouteExpiresAt.value = inputDate(route.expires_at);
  elements.supplyRouteNotes.value = route.operational_notes || "";
  elements.supplyFeeRows.replaceChildren(...(route.fees || []).map(createSupplyFeeRow));
  elements.supplyLimitRows.replaceChildren(...(route.limits || []).map(createSupplyLimitRow));
  elements.supplySettlementRows.replaceChildren(...(route.settlements || []).map(createSupplySettlementRow));
  const editable = !["published", "paused"].includes(route.status);
  elements.saveSupplyRouteButton.disabled = !editable;
  elements.reviseSupplyRouteButton.classList.toggle("is-hidden", !["published", "paused"].includes(route.status));
  elements.pauseSupplyRouteButton.classList.toggle("is-hidden", route.status !== "published");
  elements.resumeSupplyRouteButton.classList.toggle("is-hidden", route.status !== "paused");
  elements.archiveSupplyRouteButton.classList.toggle("is-hidden", !["draft", "review", "paused"].includes(route.status));
}

function componentRemoveButton(row) {
  const button = row.querySelector(".remove-component");
  button?.addEventListener("click", () => row.remove());
  return row;
}

function createSupplyFeeRow(fee = {}) {
  const row = document.createElement("div");
  row.className = "component-row fee-row";
  row.innerHTML = `
    <select data-field="flow"><option value="payin">Pay-in</option><option value="payout">Pay-out</option><option value="settlement">Settlement</option><option value="refund">Refund</option><option value="chargeback">Chargeback</option><option value="decline">Decline</option></select>
    <select data-field="fee_type"><option value="percent">Percent</option><option value="fixed">Fixed</option><option value="percent_plus_fixed">Percent + fixed</option></select>
    <input data-field="base_percent" type="number" step="0.01" placeholder="%">
    <input data-field="base_fixed" type="number" step="0.01" placeholder="Fixed">
    <input data-field="base_fixed_currency" type="text" placeholder="Currency">
    <select data-field="applies_on"><option value="success">Success</option><option value="decline">Decline</option><option value="both">Both</option><option value="event">Event</option></select>
    <button class="remove-component" type="button" aria-label="Remove fee">×</button>`;
  for (const [key, value] of Object.entries(fee)) {
    const input = row.querySelector(`[data-field="${key}"]`);
    if (input && value !== null) input.value = value;
  }
  return componentRemoveButton(row);
}

function createSupplyLimitRow(limit = {}) {
  const row = document.createElement("div");
  row.className = "component-row limit-row";
  row.innerHTML = `
    <select data-field="flow"><option value="payin">Pay-in</option><option value="payout">Pay-out</option><option value="both">Both</option></select>
    <input data-field="currency" type="text" placeholder="Currency">
    <input data-field="minimum_amount" type="number" step="any" placeholder="Minimum">
    <input data-field="maximum_amount" type="number" step="any" placeholder="Maximum">
    <input data-field="maximum_count" type="number" step="1" placeholder="Max count">
    <button class="remove-component" type="button" aria-label="Remove limit">×</button>`;
  for (const [key, value] of Object.entries(limit)) {
    const input = row.querySelector(`[data-field="${key}"]`);
    if (input && value !== null) input.value = value;
  }
  return componentRemoveButton(row);
}

function createSupplySettlementRow(term = {}) {
  const row = document.createElement("div");
  row.className = "component-row settlement-row";
  row.innerHTML = `
    <input data-field="currency" type="text" placeholder="Currency">
    <input data-field="fee_percent" type="number" step="0.01" placeholder="Fee %">
    <input data-field="period" type="text" placeholder="T+1 / Weekly">
    <input data-field="minimum_amount" type="number" step="any" placeholder="Minimum">
    <input data-field="exchange_rule" type="text" placeholder="Exchange rule">
    <button class="remove-component" type="button" aria-label="Remove settlement">×</button>`;
  for (const [key, value] of Object.entries(term)) {
    const input = row.querySelector(`[data-field="${key}"]`);
    if (input && value !== null) input.value = value;
  }
  return componentRemoveButton(row);
}

function collectComponentRows(container) {
  return [...container.querySelectorAll(".component-row")].map((row) => Object.fromEntries(
    [...row.querySelectorAll("[data-field]")].map((input) => [input.dataset.field, input.value.trim() || null]),
  ));
}

function renderSupplyAnomalies(anomalies) {
  const open = anomalies.filter((item) => item.status === "open");
  elements.supplyOpenChecks.textContent = `${open.length} open`;
  elements.supplyAnomalyList.innerHTML = anomalies.length ? anomalies.map((item) => `
    <article class="anomaly-card severity-${escapeHtml(item.severity)}${item.status === "open" ? "" : " is-resolved"}">
      <div class="anomaly-head"><div><strong>${escapeHtml(item.message)}</strong><span>${escapeHtml(item.route.internal_code)} · ${escapeHtml(item.field_name || item.anomaly_code)}</span></div><span class="status-pill">${escapeHtml(item.severity)} · ${escapeHtml(item.status)}</span></div>
      ${item.source_excerpt ? `<blockquote>${escapeHtml(item.source_excerpt)}</blockquote>` : ""}
      ${item.resolution_note ? `<p>${escapeHtml(item.resolution_note)}</p>` : ""}
      ${item.status === "open" ? `<div class="section-actions"><button class="text-button resolve-anomaly" type="button" data-id="${escapeHtml(item.id)}" data-status="resolved">Resolved after correction</button><button class="text-button resolve-anomaly" type="button" data-id="${escapeHtml(item.id)}" data-status="accepted">Accept as confirmed</button><button class="text-button resolve-anomaly" type="button" data-id="${escapeHtml(item.id)}" data-status="ignored">Ignore duplicate/noise</button></div>` : ""}
    </article>
  `).join("") : '<p class="supply-empty">No parser checks for this PSP.</p>';
  elements.supplyAnomalyList.querySelectorAll(".resolve-anomaly").forEach((button) => {
    button.addEventListener("click", () => resolveSupplyAnomaly(button.dataset.id, button.dataset.status, button));
  });
}

function renderSupplyHistory(batches, activity) {
  elements.supplyBatchHistory.innerHTML = batches.length ? batches.map((batch) => `
    <article class="batch-card"><div class="batch-main"><div class="batch-title"><strong>Rate card v${Number(batch.batch_version)}</strong><span class="status-pill status-${escapeHtml(batch.status)}">${escapeHtml(batch.status)}</span></div><p>${escapeHtml(batch.source_reference || batch.source_type)} · ${formatDate(batch.received_at, true)}</p></div><div class="batch-metrics"><span><strong>${Number(batch.route_count || 0)}</strong> routes</span><span class="${Number(batch.open_error_count || 0) ? "has-warning" : ""}"><strong>${Number(batch.open_error_count || 0)}</strong> errors</span><span><strong>${Number(batch.open_warning_count || 0)}</strong> warnings</span></div></article>
  `).join("") : '<p class="supply-empty">No rate-card versions.</p>';
  elements.supplyActivityList.innerHTML = activity.length ? activity.map((item) => `<article><span>${formatDate(item.created_at, true)}</span><div><strong>${escapeHtml(item.summary)}</strong><p>${escapeHtml(item.action_type.replaceAll("_", " "))}</p></div></article>`).join("") : '<p class="supply-empty">No operational changes recorded yet.</p>';
}

async function saveSupplyProvider() {
  if (!state.selectedSupplyProviderId) return;
  setButtonLoading(elements.saveSupplyProviderButton, true, "Saving…");
  const { error } = await supabase.rpc("save_offerpsp_managed_provider", {
    p_provider_id: state.selectedSupplyProviderId,
    p_payload: {
      brand_name: elements.supplyBrandName.value.trim(), legal_name: elements.supplyLegalName.value.trim(),
      website: elements.supplyWebsite.value.trim(), relationship_status: elements.supplyRelationshipStatus.value,
      relationship_tier: elements.supplyRelationshipTier.value,
      strategic_priority: elements.supplyPriority.value, margin_included_default: elements.supplyMarginIncluded.checked,
      relationship_notes: elements.supplyRelationshipNotes.value.trim(),
    },
  });
  setButtonLoading(elements.saveSupplyProviderButton, false);
  if (error) return setSupplyWorkspaceStatus(friendlyError(error, "Could not save the PSP profile."), "error");
  await Promise.all([loadSupply(), loadSupplyWorkspace()]);
  setSupplyWorkspaceStatus("PSP profile saved.", "success");
}

async function reviseSupplyRoute() {
  if (!state.selectedSupplyRouteId) return;
  const current = (state.supplyWorkspace?.routes || []).find((route) => route.id === state.selectedSupplyRouteId);
  if (!current || !window.confirm(`Create an editable revision of ${current.internal_code}? The current live route will stay unchanged.`)) return;
  setButtonLoading(elements.reviseSupplyRouteButton, true, "Creating…");
  const { data, error } = await supabase.rpc("revise_offerpsp_route", { p_route_id: state.selectedSupplyRouteId });
  setButtonLoading(elements.reviseSupplyRouteButton, false);
  if (error) return setSupplyWorkspaceStatus(friendlyError(error, "Could not create route revision."), "error");
  await Promise.all([loadSupply(), loadSupplyWorkspace()]);
  state.selectedSupplyRouteId = data.route_id;
  renderSupplyWorkspace();
  setSupplyWorkspaceStatus(`Editable revision created in rate card v${data.batch_version}.`, "success");
}

async function saveSupplyContact(event) {
  event.preventDefault();
  const submit = elements.supplyContactForm.querySelector('button[type="submit"]');
  setButtonLoading(submit, true, "Saving…");
  const { error } = await supabase.rpc("save_offerpsp_provider_contact", {
    p_provider_id: state.selectedSupplyProviderId,
    p_contact_id: elements.supplyContactId.value || null,
    p_payload: {
      full_name: elements.supplyContactName.value.trim(), role_title: elements.supplyContactRole.value.trim(),
      region: elements.supplyContactRegion.value.trim(), telegram: elements.supplyContactTelegram.value.trim(),
      email: elements.supplyContactEmail.value.trim(), phone: elements.supplyContactPhone.value.trim(),
      preferred_channel: elements.supplyContactChannel.value, active: elements.supplyContactActive.checked,
      notes: elements.supplyContactNotes.value.trim(),
    },
  });
  setButtonLoading(submit, false);
  if (error) return setSupplyWorkspaceStatus(friendlyError(error, "Could not save the PSP contact."), "error");
  resetSupplyContactForm();
  await loadSupplyWorkspace();
  setSupplyWorkspaceStatus("PSP contact saved.", "success");
}

function optionalNumber(input) {
  return input.value.trim() === "" ? null : Number(input.value);
}

async function saveSupplyMargin(event) {
  event.preventDefault();
  const submit = elements.supplyMarginForm.querySelector('button[type="submit"]');
  setButtonLoading(submit, true, "Saving…");
  const { error } = await supabase.rpc("set_offerpsp_margin_policy", {
    p_provider_id: state.selectedSupplyProviderId, p_route_id: elements.supplyMarginRoute.value || null,
    p_flow: elements.supplyMarginFlow.value, p_mode: elements.supplyMarginMode.value,
    p_percent_value: optionalNumber(elements.supplyMarginPercent), p_fixed_value: optionalNumber(elements.supplyMarginFixed),
    p_fixed_currency: elements.supplyMarginCurrency.value.trim() || null, p_notes: elements.supplyMarginNotes.value.trim() || null,
  });
  setButtonLoading(submit, false);
  if (error) return setSupplyWorkspaceStatus(friendlyError(error, "Could not save the margin policy."), "error");
  elements.supplyMarginForm.reset();
  await loadSupplyWorkspace();
  setSupplyWorkspaceStatus("New margin policy is active. Previous policy for this scope was closed.", "success");
}

async function saveSupplyRoute(event) {
  event.preventDefault();
  const routeId = elements.supplyRouteId.value;
  if (!routeId) return;
  setButtonLoading(elements.saveSupplyRouteButton, true, "Saving…");
  const { error } = await supabase.rpc("save_offerpsp_route", {
    p_route_id: routeId,
    p_payload: {
      client_title: elements.supplyRouteTitle.value.trim(), flow: elements.supplyRouteFlow.value,
      coverage_scope: elements.supplyRouteCoverage.value, geos: listValue(elements.supplyRouteGeos.value),
      blocked_geos: listValue(elements.supplyRouteBlockedGeos.value), currencies: listValue(elements.supplyRouteCurrencies.value),
      methods: listValue(elements.supplyRouteMethods.value), traffic_types: listValue(elements.supplyRouteTraffic.value),
      verticals: listValue(elements.supplyRouteVerticals.value), integrations: listValue(elements.supplyRouteIntegrations.value),
      min_monthly_volume: elements.supplyRouteMinVolume.value, max_monthly_volume: elements.supplyRouteMaxVolume.value,
      volume_currency: elements.supplyRouteVolumeCurrency.value.trim(), freshness_days: elements.supplyRouteFreshness.value,
      effective_from: elements.supplyRouteEffectiveFrom.value, expires_at: elements.supplyRouteExpiresAt.value,
      operational_notes: elements.supplyRouteNotes.value.trim(), fees: collectComponentRows(elements.supplyFeeRows),
      limits: collectComponentRows(elements.supplyLimitRows), settlements: collectComponentRows(elements.supplySettlementRows),
    },
  });
  setButtonLoading(elements.saveSupplyRouteButton, false);
  if (error) return setSupplyWorkspaceStatus(friendlyError(error, "Could not save the normalized route."), "error");
  await loadSupplyWorkspace();
  setSupplyWorkspaceStatus("Route saved and moved to review.", "success");
}

async function setSupplyRouteStatus(status, button) {
  if (!state.selectedSupplyRouteId) return;
  if (status === "archived" && !window.confirm("Archive this route? It will be excluded from future matching.")) return;
  setButtonLoading(button, true, "Saving…");
  const { error } = await supabase.rpc("set_offerpsp_route_status", { p_route_id: state.selectedSupplyRouteId, p_status: status });
  setButtonLoading(button, false);
  if (error) return setSupplyWorkspaceStatus(friendlyError(error, "Could not change the route status."), "error");
  await Promise.all([loadSupply(), loadSupplyWorkspace()]);
  setSupplyWorkspaceStatus(`Route ${status}.`, "success");
}

async function resolveSupplyAnomaly(anomalyId, status, button) {
  const note = window.prompt("Explain what was checked and why this decision is safe:");
  if (!note?.trim()) return;
  setButtonLoading(button, true, "Saving…");
  const { error } = await supabase.rpc("resolve_offerpsp_route_anomaly", { p_anomaly_id: anomalyId, p_status: status, p_resolution_note: note.trim() });
  setButtonLoading(button, false);
  if (error) return setSupplyWorkspaceStatus(friendlyError(error, "Could not resolve the parser check."), "error");
  await Promise.all([loadSupply(), loadSupplyWorkspace()]);
  setSupplyWorkspaceStatus(`Parser check marked ${status}.`, "success");
}

async function confirmSupplyFreshness() {
  if (!state.selectedSupplyProviderId || !window.confirm("Confirm that the PSP terms were checked and are current today?")) return;
  setButtonLoading(elements.confirmSupplyFreshnessButton, true, "Confirming…");
  const { error } = await supabase.rpc("confirm_offerpsp_provider_freshness", { p_provider_id: state.selectedSupplyProviderId });
  setButtonLoading(elements.confirmSupplyFreshnessButton, false);
  if (error) return setSupplyWorkspaceStatus(friendlyError(error, "Could not confirm PSP terms."), "error");
  await Promise.all([loadSupply(), loadSupplyWorkspace()]);
  setSupplyWorkspaceStatus("PSP terms confirmed as current.", "success");
}

function validateRateCardPayload(payload) {
  if (!payload || typeof payload !== "object") throw new Error("The JSON payload is empty.");
  if (!payload.provider?.brand_name) throw new Error("Provider brand_name is required.");
  if (!payload.batch?.source_text) throw new Error("Original rate-card source text is required.");
  if (!Array.isArray(payload.batch?.routes)) throw new Error("The rate-card routes must be an array.");
  if (!payload.batch.routes.length) throw new Error("No normalized offer routes were found. Review the source extraction before import.");
  return payload;
}

async function readRateCardFile(file) {
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) throw new Error("The prepared JSON file must be smaller than 10 MB.");
  const payload = validateRateCardPayload(JSON.parse(await file.text()));
  state.rateCardPayload = payload;
  elements.rateCardPreview.innerHTML = `
    <strong>${escapeHtml(payload.provider.brand_name)}</strong>
    <span>${payload.batch.routes.length} routes · ${Number(payload.batch.parser_metadata?.blocking_anomaly_count || 0)} blocking checks · ${escapeHtml(payload.batch.source_reference || payload.batch.source_type || "rate card")}</span>
  `;
  elements.rateCardPreview.classList.remove("is-hidden");
  setSupplyStatus();
}

async function importRateCard(event) {
  event.preventDefault();
  if (!state.rateCardPayload) {
    setSupplyStatus("Choose a valid prepared JSON file first.", "error");
    return;
  }

  const { provider, batch } = state.rateCardPayload;
  setButtonLoading(elements.importRateCardButton, true, "Importing…");
  setSupplyStatus();

  try {
    const existing = state.supply.providers.find(
      (item) => item.brand_name.toLowerCase() === provider.brand_name.toLowerCase(),
    );
    const { data: savedProvider, error: providerError } = await supabase.rpc("upsert_offerpsp_provider", {
      p_brand_name: provider.brand_name,
      p_internal_code: existing?.internal_code || null,
      p_legal_name: provider.legal_name || null,
      p_website: provider.website || null,
      p_relationship_status: provider.relationship_status || "onboarding",
      p_strategic_priority: provider.strategic_priority ?? 50,
      p_margin_included_default: Boolean(provider.margin_included_default),
      p_relationship_notes: provider.relationship_notes || "Imported from a prepared rate-card payload",
    });
    if (providerError) throw providerError;

    const { data: imported, error: importError } = await supabase.rpc("import_offerpsp_rate_card", {
      p_provider_code: savedProvider.internal_code,
      p_source_type: batch.source_type || "document",
      p_source_text: batch.source_text,
      p_source_reference: batch.source_reference || null,
      p_source_effective_date: batch.source_effective_date || null,
      p_parser_version: batch.parser_version || "manual-v1",
      p_parser_metadata: batch.parser_metadata || {},
      p_routes: batch.routes,
    });
    if (importError) throw importError;

    const message = imported.duplicate
      ? "This exact source was already imported; no duplicate was created."
      : `Private draft imported: ${imported.route_count} routes, ${imported.anomaly_count} checks.`;
    setSupplyStatus(message, "success");
    state.rateCardPayload = null;
    elements.rateCardImportForm.reset();
    elements.rateCardPreview.classList.add("is-hidden");
    await loadSupply();
  } catch (error) {
    setSupplyStatus(error.message || "Could not import the rate card.", "error");
  } finally {
    setButtonLoading(elements.importRateCardButton, false);
  }
}

async function publishRateCard(batchId, button) {
  const batch = state.supply.batches.find((item) => item.id === batchId);
  if (!batch) return;
  const confirmed = window.confirm(
    `Publish ${batch.provider_name} rate card v${batch.batch_version}? It will replace the provider's currently published routes.`,
  );
  if (!confirmed) return;

  setButtonLoading(button, true, "Publishing…");
  setSupplyStatus();
  const { data, error } = await supabase.rpc("publish_offerpsp_rate_card", { p_batch_id: batchId });
  setButtonLoading(button, false);
  if (error) {
    setSupplyStatus(error.message, "error");
    return;
  }
  setSupplyStatus(`${data.provider_code} published with ${data.route_count} routes.`, "success");
  await loadSupply();
}

async function loadLeads() {
  elements.loadingState.classList.remove("is-hidden");
  elements.emptyState.classList.add("is-hidden");
  elements.leadsTableWrap.classList.add("is-hidden");
  elements.refreshButton.disabled = true;

  const { data, error } = await supabase
    .from("offerpsp_leads")
    .select("*")
    .order("submitted_at", { ascending: false });

  elements.refreshButton.disabled = false;
  elements.loadingState.classList.add("is-hidden");

  if (error) {
    elements.resultCount.textContent = "Could not load requests";
    showToast(error.message);
    return;
  }

  state.leads = data || [];
  state.lastUpdatedAt = new Date();
  elements.lastUpdated.textContent = `Updated ${new Intl.DateTimeFormat(
    i18n?.getLanguage() === "ru" ? "ru-RU" : "en-GB",
    {
    hour: "2-digit",
    minute: "2-digit",
    },
  ).format(state.lastUpdatedAt)}`;
  renderStats();
  renderLeads();
  renderRequestWorkspace();
}

function filteredLeads() {
  const search = elements.searchInput.value.trim().toLowerCase();
  const status = elements.statusFilter.value;

  return state.leads.filter((lead) => {
    if (lead.record_state === "archived") return false;
    const matchesStatus = status === "all" || lead.status === status;
    if (!matchesStatus) return false;
    if (!search) return true;

    return [
      lead.company,
      lead.name,
      lead.work_email,
      lead.company_url,
      lead.geos,
      lead.vertical,
      lead.methods,
      lead.telegram,
    ].some((value) => String(value ?? "").toLowerCase().includes(search));
  });
}

function renderStats() {
  const activeLeads = state.leads.filter((lead) => lead.record_state !== "archived");
  const count = (...statuses) => activeLeads.filter((lead) => statuses.includes(lead.status)).length;
  const total = activeLeads.length;
  const qualified = count(
    "matching", "matched", "shortlist_ready", "shared", "option_selected", "dossier_ready",
    "provider_reviewing", "provider_needs_info", "provider_accepted", "provider_declined",
    "telegram_created", "zoom_scheduled", "negotiating", "won",
  );
  const matched = count(
    "matched", "shortlist_ready", "shared", "option_selected", "dossier_ready",
    "provider_reviewing", "provider_needs_info", "provider_accepted", "provider_declined",
    "telegram_created", "zoom_scheduled", "negotiating", "won",
  );
  const introduced = count("telegram_created", "zoom_scheduled", "negotiating", "won");
  const won = count("won");
  const conversion = total ? Math.round((won / total) * 100) : 0;
  elements.statTotal.textContent = total;
  elements.statNew.textContent = count("new", "reviewing", "qualifying");
  elements.statMatching.textContent = count("matching", "matched");
  elements.statReady.textContent = count("shortlist_ready", "shared", "option_selected", "dossier_ready");
  elements.statWon.textContent = won;
  elements.statWonRate.textContent = `${conversion}% conversion`;
  elements.conversionRate.textContent = `${conversion}%`;

  const funnel = [
    [elements.funnelSubmitted, elements.funnelSubmittedBar, total],
    [elements.funnelQualified, elements.funnelQualifiedBar, qualified],
    [elements.funnelMatched, elements.funnelMatchedBar, matched],
    [elements.funnelIntroduced, elements.funnelIntroducedBar, introduced],
    [elements.funnelWon, elements.funnelWonBar, won],
  ];
  for (const [numberElement, barElement, value] of funnel) {
    numberElement.textContent = value;
    barElement.style.width = `${total ? Math.max(2, (value / total) * 100) : 0}%`;
  }

  renderCommercialAnalytics(activeLeads, [total, qualified, matched, introduced, won]);
}

function renderCommercialAnalytics(leads, funnelValues) {
  const isRu = i18n?.getLanguage() === "ru";
  const stageDefinitions = [
    [isRu ? "Новые / уточнение" : "New / clarification", ["new", "reviewing", "qualifying", "needs_clarification"]],
    [isRu ? "Подбор / shortlist" : "Matching / shortlist", ["matching", "matched", "shortlist_ready"]],
    [isRu ? "Отправлено / выбор" : "Shared / selected", ["shared", "option_selected", "dossier_ready"]],
    [isRu ? "PSP / знакомство" : "PSP / introduction", ["provider_reviewing", "provider_needs_info", "provider_accepted", "provider_declined", "telegram_created", "zoom_scheduled", "negotiating"]],
    [isRu ? "Запущено" : "Won", ["won"]],
    [isRu ? "Потеряно" : "Lost", ["lost"]],
  ];
  const stageCounts = stageDefinitions.map(([label, statuses]) => ({
    label,
    count: leads.filter((lead) => statuses.includes(lead.status)).length,
  }));
  const stageMax = Math.max(1, ...stageCounts.map((item) => item.count));
  elements.analyticsStageChart.innerHTML = stageCounts.map((item) => `
    <div class="analytics-bar-row"><span>${escapeHtml(item.label)}</span><div><i style="width:${(item.count / stageMax) * 100}%"></i></div><strong>${item.count}</strong></div>
  `).join("");

  const sources = new Map();
  for (const lead of leads) {
    const source = cleanText(lead.utm_source || lead.source || (isRu ? "Без источника" : "Unknown"));
    const value = sources.get(source) || { total: 0, won: 0 };
    value.total += 1;
    if (lead.status === "won") value.won += 1;
    sources.set(source, value);
  }
  const sourceRows = [...sources.entries()].sort((a, b) => b[1].total - a[1].total).slice(0, 8);
  elements.analyticsSourceChart.innerHTML = sourceRows.length
    ? sourceRows.map(([source, value]) => `<div class="analytics-source-row"><strong>${escapeHtml(source)}</strong><span>${value.total} ${isRu ? "лидов" : "leads"}</span><em>${value.won} ${isRu ? "успех" : "won"}</em></div>`).join("")
    : `<p class="form-status">${isRu ? "Источников пока нет." : "No source data yet."}</p>`;

  const stageLabels = isRu
    ? ["получение → квалификация", "квалификация → shortlist", "shortlist → знакомство", "знакомство → запуск"]
    : ["submitted → qualified", "qualified → shortlist", "shortlist → introduction", "introduction → won"];
  const drops = funnelValues.slice(0, -1).map((value, index) => ({
    label: stageLabels[index],
    from: value,
    to: funnelValues[index + 1],
    loss: value ? Math.round(((value - funnelValues[index + 1]) / value) * 100) : 0,
  }));
  const bottleneck = drops.filter((item) => item.from > 0).sort((a, b) => b.loss - a.loss)[0];
  if (!bottleneck) {
    elements.analyticsBottleneck.textContent = isRu ? "Пока недостаточно данных" : "Not enough data yet";
    elements.analyticsBottleneckCopy.textContent = isRu ? "После появления заявок здесь будет показан самый большой провал воронки." : "The largest funnel loss will appear here after requests arrive.";
  } else {
    elements.analyticsBottleneck.textContent = `${bottleneck.label}: −${bottleneck.loss}%`;
    elements.analyticsBottleneckCopy.textContent = isRu
      ? `${bottleneck.from} вошли в этап, ${bottleneck.to} прошли дальше. Это первая точка для проверки процесса.`
      : `${bottleneck.from} entered the stage and ${bottleneck.to} moved forward. Review this process first.`;
  }
}

function renderLeads() {
  const leads = filteredLeads();
  elements.resultCount.textContent = `${leads.length} ${leads.length === 1 ? "request" : "requests"}`;
  elements.leadsTableBody.replaceChildren();

  if (!leads.length) {
    elements.emptyState.classList.remove("is-hidden");
    elements.leadsTableWrap.classList.add("is-hidden");
    return;
  }

  elements.emptyState.classList.add("is-hidden");
  elements.leadsTableWrap.classList.remove("is-hidden");

  for (const lead of leads) {
    const row = document.createElement("tr");
    const score = Number.isFinite(Number(lead.quality_score)) ? Number(lead.quality_score) : null;
    const profileTags = [lead.vertical, lead.geos]
      .filter(Boolean)
      .map((value) => `<span>${escapeHtml(value)}</span>`)
      .join("");

    row.innerHTML = `
      <td>
        <div class="merchant-cell">
          <strong>${escapeHtml(cleanText(lead.company))}</strong>
          <span>${escapeHtml(cleanText(lead.work_email))}</span>
        </div>
      </td>
      <td><div class="profile-cell">${profileTags || "<span>Unspecified</span>"}</div></td>
      <td>${escapeHtml(cleanText(lead.monthly_volume))}</td>
      <td><span class="score${score !== null ? " has-score" : ""}">${score ?? "—"}</span></td>
      <td><span class="status-pill status-${escapeHtml(lead.status)}">${escapeHtml(statusLabel(lead.status))}</span></td>
      <td>${escapeHtml(formatDate(lead.submitted_at))}</td>
      <td><button class="open-button" type="button" aria-label="Open ${escapeHtml(cleanText(lead.company))}">→</button></td>
    `;

    row.querySelector(".open-button").addEventListener("click", () => openLead(lead.lead_id));
    elements.leadsTableBody.append(row);
  }
}

function renderProfile(lead) {
  const details = [
    ["Contact", cleanText(lead.name)],
    ["Work email", cleanText(lead.work_email)],
    ["Telegram", cleanText(lead.telegram)],
    ["Company URL", linkValue(lead.company_url), true],
    ["Vertical", cleanText(lead.vertical)],
    ["Monthly volume", cleanText(lead.monthly_volume)],
    ["Markets / GEOs", cleanText(lead.geos)],
    ["Payment methods", cleanText(lead.methods)],
    ["Source", cleanText(lead.source)],
    ["Consent", lead.consent ? "Confirmed" : "Not confirmed"],
    ["Submitted", formatDate(lead.submitted_at, true)],
    ["Details", cleanText(lead.details)],
  ];

  elements.profileDetails.innerHTML = details.map(([label, value, isHtml]) => `
    <div>
      <dt>${escapeHtml(label)}</dt>
      <dd>${isHtml ? value : escapeHtml(value)}</dd>
    </div>
  `).join("");
  renderMerchantRecord(lead);
}

function renderMerchantRecord(lead) {
  const archived = lead.record_state === "archived";
  elements.merchantRecordState.textContent = archived ? "archived" : "active";
  elements.merchantRecordState.className = `status-pill status-${archived ? "archived" : "active"}`;
  elements.merchantRecordCompany.value = lead.company || "";
  elements.merchantRecordName.value = lead.name || "";
  elements.merchantRecordEmail.value = lead.work_email || "";
  elements.merchantRecordTelegram.value = lead.telegram || "";
  elements.merchantRecordUrl.value = lead.company_url || "";
  elements.merchantRecordVertical.value = lead.vertical || "";
  elements.merchantRecordGeos.value = lead.geos || "";
  elements.merchantRecordVolume.value = lead.monthly_volume || "";
  elements.merchantRecordMethods.value = lead.methods || "";
  elements.merchantRecordDetails.value = lead.details || "";
  elements.archiveMerchantButton.classList.toggle("is-hidden", archived);
  elements.restoreMerchantButton.classList.toggle("is-hidden", !archived);
  elements.purgeMerchantButton.classList.toggle("is-hidden", !archived || state.staff?.role !== "owner");
  elements.saveMerchantRecordButton.disabled = archived;
  elements.merchantRecordForm.querySelectorAll("input, textarea").forEach((input) => { input.disabled = archived; });
  [elements.drawerStatus, elements.drawerScore, elements.drawerGrade, elements.drawerOwner, elements.saveLeadButton]
    .forEach((control) => { control.disabled = archived; });
  elements.merchantRecordStatus.textContent = archived && lead.archive_reason ? `Archived: ${lead.archive_reason}` : "";
}

const DOSSIER_REQUIRED_FIELDS = [
  "legal_name", "contact_name", "contact_email", "product_url", "target_geos",
  "vertical", "license_status", "expected_monthly_volume", "volume_currency",
  "requested_methods", "requested_flows",
];

const DOSSIER_FIELD_LABELS = {
  legal_name: "Company name",
  contact_name: "Contact name",
  contact_email: "Contact email",
  product_url: "Product URL",
  target_geos: "Target GEOs",
  vertical: "Vertical",
  license_status: "Licence status",
  license_jurisdiction: "Licence jurisdiction",
  expected_monthly_volume: "Expected monthly volume",
  volume_currency: "Volume currency",
  requested_methods: "Payment methods",
  requested_flows: "Payment flows",
  requested_currencies: "Processing currencies",
  traffic_types: "Traffic types",
  min_transaction_amount: "Minimum transaction",
  max_transaction_amount: "Maximum transaction",
  transaction_currency: "Transaction currency",
};

function matchingMissingLabel(field) {
  const label = DOSSIER_FIELD_LABELS[field] || field.replaceAll("_", " ");
  return i18n?.t(label) || label;
}

function renderRequestWorkspace() {
  const lead = state.selectedLead;
  if (!lead) return;
  const workspace = state.requestWorkspace || {};
  const dossier = workspace.dossier || {};
  const missing = Array.isArray(dossier.missing_fields) ? dossier.missing_fields : DOSSIER_REQUIRED_FIELDS.filter((field) => {
    const fallback = {
      legal_name: lead.company,
      contact_name: lead.name,
      contact_email: lead.work_email,
      product_url: lead.company_url,
      target_geos: lead.target_geos,
      vertical: lead.vertical,
      license_status: lead.license_status && lead.license_status !== "unknown" ? lead.license_status : null,
      expected_monthly_volume: lead.expected_monthly_volume,
      volume_currency: lead.volume_currency,
      requested_methods: lead.requested_methods,
      requested_flows: lead.requested_flows,
    }[field];
    return Array.isArray(fallback) ? fallback.length === 0 : !fallback;
  });
  const requiredCount = DOSSIER_REQUIRED_FIELDS.length + (lead.license_status === "licensed" ? 1 : 0);
  const completeness = Math.round((Math.max(0, requiredCount - missing.length) / requiredCount) * 100);
  const requestedItems = (workspace.shortlist_items || []).filter((item) => item.introduction_requested_at);
  const activeReviews = (workspace.reviews || []).filter((item) => ["pending", "reviewing", "needs_info", "accepted"].includes(item.status));
  const introductions = workspace.introductions || [];
  const openTasks = state.tasks.filter((task) => !["done", "cancelled"].includes(task.status));
  const nextDue = openTasks.filter((task) => task.due_at).sort((a, b) => new Date(a.due_at) - new Date(b.due_at))[0];
  const isRu = i18n?.getLanguage() === "ru";
  const owner = state.staffMembers.find((member) => member.user_id === lead.assigned_to);

  elements.dossierCompleteness.textContent = `${completeness}% ${isRu ? "досье" : "dossier"}`;
  elements.workspaceNextAction.textContent = missing.length
    ? (isRu ? `Заполните поля досье: ${missing.length}` : `Complete ${missing.length} dossier field${missing.length === 1 ? "" : "s"}`)
    : requestedItems.length && activeReviews.length === 0
      ? (isRu ? "Отправьте выбранный маршрут на проверку PSP" : "Send the selected merchant route to PSP review")
      : activeReviews.some((review) => review.status === "needs_info")
        ? (isRu ? "Ответьте на запрос данных от PSP" : "Resolve the PSP information request")
        : activeReviews.some((review) => review.status === "accepted") && introductions.length === 0
          ? (isRu ? "Создайте контролируемое знакомство в Telegram" : "Create the controlled Telegram introduction")
          : introductions.some((item) => item.status === "telegram_created")
            ? (isRu ? "Назначьте встречу в Zoom" : "Schedule the Zoom meeting")
            : (isRu ? "Проверьте заявку и выполните следующий реальный шаг" : "Review the request and move the next real step");
  elements.workspaceSummary.innerHTML = [
    [isRu ? "Ответственный" : "Owner", owner?.display_name || (lead.assigned_to ? (isRu ? "Назначен" : "Assigned") : (isRu ? "Не назначен" : "Unassigned"))],
    [isRu ? "Задачи / ближайший срок" : "Tasks / next deadline", `${openTasks.length}${nextDue ? ` · ${formatDate(nextDue.due_at)}` : ""}`],
    [isRu ? "Выбор клиента" : "Client choices", String(requestedItems.length)],
    [isRu ? "PSP review / знакомство" : "PSP review / intro", `${activeReviews.length} / ${introductions.length}`],
  ].map(([label, value]) => `<article><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`).join("");

  elements.dossierStatus.textContent = dossier.status === "ready"
    ? statusLabel("dossier_ready")
    : dossier.status === "needs_clarification"
      ? statusLabel("needs_clarification")
      : i18n?.t(dossier.status || (missing.length ? "Needs clarification" : "Dossier ready"));
  elements.dossierStatus.className = `status-pill status-${escapeHtml(dossier.status || (missing.length ? "needs_clarification" : "dossier_ready"))}`;
  elements.dossierMissing.innerHTML = missing.length
    ? missing.map((field) => `<span>${escapeHtml(i18n?.t(DOSSIER_FIELD_LABELS[field] || field.replaceAll("_", " ")))}</span>`).join("")
    : '<span class="is-complete">Required PSP review information is complete</span>';

  elements.dossierCompany.value = lead.company || "";
  elements.dossierContactName.value = lead.name || "";
  elements.dossierTelegram.value = lead.telegram || "";
  elements.dossierCompanyUrl.value = lead.company_url || "";
  elements.dossierRegistrationGeo.value = lead.registration_geo || "";
  elements.dossierTargetGeos.value = listInput(lead.target_geos);
  elements.dossierVertical.value = lead.vertical || "";
  elements.dossierBusinessModel.value = lead.business_model || "";
  elements.dossierLicenseStatus.value = lead.license_status || "unknown";
  elements.dossierLicenseJurisdiction.value = lead.license_jurisdiction || "";
  elements.dossierLicenseNumber.value = lead.license_number || "";
  elements.dossierLicenseEvidenceUrl.value = lead.license_evidence_url || "";
  elements.dossierMonthlyVolume.value = lead.expected_monthly_volume ?? "";
  elements.dossierVolumeCurrency.value = lead.volume_currency || "";
  elements.dossierCurrencies.value = listInput(lead.requested_currencies);
  elements.dossierMethods.value = listInput(lead.requested_methods);
  elements.dossierFlows.value = listInput(lead.requested_flows);
  elements.dossierTrafficTypes.value = listInput(lead.traffic_types);
  elements.dossierMinTransaction.value = lead.min_transaction_amount ?? "";
  elements.dossierMaxTransaction.value = lead.max_transaction_amount ?? "";
  elements.dossierTransactionCurrency.value = lead.transaction_currency || "";
  elements.dossierLaunchTimeline.value = lead.launch_timeline || "";
  elements.dossierProcessingSetup.value = lead.current_processing_setup || "";
  renderDealDesk();
}

async function loadRequestWorkspace(leadId) {
  const { data, error } = await supabase.rpc("get_offerpsp_staff_request_workspace", { p_lead_id: leadId });
  if (error) {
    state.requestWorkspace = { dossier: {}, shortlist_items: [], reviews: [], introductions: [] };
    elements.dealDeskList.innerHTML = '<p class="form-status">Deal desk will become available after the operational workspace migration.</p>';
    return;
  }
  state.requestWorkspace = data || { dossier: {}, shortlist_items: [], reviews: [], introductions: [] };
  renderRequestWorkspace();
}

async function saveDossier() {
  if (!state.selectedLead) return;
  setButtonLoading(elements.saveDossierButton, true, "Saving…");
  setDossierSaveStatus();
  const profile = {
    company: elements.dossierCompany.value.trim(),
    name: elements.dossierContactName.value.trim(),
    telegram: elements.dossierTelegram.value.trim(),
    company_url: elements.dossierCompanyUrl.value.trim(),
    registration_geo: elements.dossierRegistrationGeo.value.trim(),
    target_geos: listValue(elements.dossierTargetGeos.value),
    vertical: elements.dossierVertical.value.trim(),
    business_model: elements.dossierBusinessModel.value.trim(),
    license_status: elements.dossierLicenseStatus.value,
    license_jurisdiction: elements.dossierLicenseJurisdiction.value.trim(),
    license_number: elements.dossierLicenseNumber.value.trim(),
    license_evidence_url: elements.dossierLicenseEvidenceUrl.value.trim(),
    expected_monthly_volume: elements.dossierMonthlyVolume.value.trim(),
    volume_currency: elements.dossierVolumeCurrency.value.trim(),
    requested_currencies: listValue(elements.dossierCurrencies.value),
    requested_methods: listValue(elements.dossierMethods.value),
    requested_flows: listValue(elements.dossierFlows.value),
    traffic_types: listValue(elements.dossierTrafficTypes.value),
    min_transaction_amount: elements.dossierMinTransaction.value.trim(),
    max_transaction_amount: elements.dossierMaxTransaction.value.trim(),
    transaction_currency: elements.dossierTransactionCurrency.value.trim(),
    launch_timeline: elements.dossierLaunchTimeline.value.trim(),
    current_processing_setup: elements.dossierProcessingSetup.value.trim(),
  };
  const { data, error } = await supabase.rpc("update_offerpsp_client_dossier", {
    p_lead_id: state.selectedLead.lead_id,
    p_profile: profile,
  });
  setButtonLoading(elements.saveDossierButton, false);
  if (error) {
    setDossierSaveStatus(friendlyError(error, "Could not save the merchant dossier."), "error");
    return;
  }
  await Promise.all([loadLeads(), loadRequestWorkspace(state.selectedLead.lead_id), loadActivities(state.selectedLead.lead_id)]);
  const refreshed = state.leads.find((lead) => lead.lead_id === state.selectedLead.lead_id);
  if (refreshed) state.selectedLead = refreshed;
  renderRequestWorkspace();
  setDossierSaveStatus(data.complete ? "Dossier saved and ready for PSP review." : "Dossier saved. Complete the highlighted fields before PSP review.", data.complete ? "success" : "error");
}

function activateWorkspace(target) {
  document.querySelectorAll("[data-workspace-panel]").forEach((panel) => {
    panel.classList.toggle("is-hidden", panel.dataset.workspacePanel !== target);
  });
  document.querySelectorAll("[data-workspace-target]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.workspaceTarget === target);
  });
  elements.leadDrawer.querySelector(".drawer-body")?.scrollTo({ top: 0, behavior: "smooth" });
}

function activateSupplyWorkspace(target) {
  document.querySelectorAll("[data-supply-panel]").forEach((panel) => {
    panel.classList.toggle("is-hidden", panel.dataset.supplyPanel !== target);
  });
  document.querySelectorAll("[data-supply-target]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.supplyTarget === target);
  });
  elements.supplyDrawer.querySelector(".drawer-body")?.scrollTo({ top: 0, behavior: "smooth" });
}

function renderLeadContactActions(lead) {
  const email = String(lead.work_email || "").trim();
  elements.drawerEmailLink.classList.toggle("is-hidden", !email);
  elements.drawerEmailLink.href = email ? `mailto:${email}` : "#";
  const telegram = String(lead.telegram || "").trim();
  const telegramHref = /^https?:\/\//i.test(telegram)
    ? telegram
    : telegram ? `https://t.me/${telegram.replace(/^@/, "")}` : "";
  elements.drawerTelegramLink.classList.toggle("is-hidden", !telegramHref);
  elements.drawerTelegramLink.href = telegramHref || "#";
}

async function openLead(leadId) {
  const lead = state.leads.find((item) => item.lead_id === leadId);
  if (!lead) return;

  state.selectedLead = lead;
  state.activities = [];
  state.tasks = [];
  state.matches = [];
  state.selectedMatchIds = new Set();
  state.selectedManualRouteIds = new Set();
  state.shortlists = [];
  state.requestWorkspace = null;
  state.conversationId = null;
  state.messages = [];
  elements.drawerCompany.textContent = cleanText(lead.company);
  elements.drawerContact.textContent = `${cleanText(lead.name)} · ${cleanText(lead.work_email)}`;
  renderLeadContactActions(lead);
  elements.drawerLeadId.textContent = lead.lead_id.slice(0, 8);
  elements.drawerStatus.value = lead.status || "new";
  elements.drawerScore.value = lead.quality_score ?? "";
  elements.drawerGrade.value = lead.quality_grade || "";
  elements.drawerOwner.value = lead.assigned_to || "";
  elements.noteInput.value = "";
  elements.taskTitleInput.value = "";
  elements.taskPriorityInput.value = "normal";
  elements.taskDueInput.value = "";
  setDrawerStatus();
  renderProfile(lead);
  elements.activityList.innerHTML = '<div class="state-card">Loading activity…</div>';
  elements.taskList.innerHTML = "";
  elements.matchSummary.textContent = "Loading candidates…";
  elements.matchesList.innerHTML = "";
  elements.shortlistPreview.classList.add("is-hidden");
  elements.shortlistPreview.innerHTML = "";
  elements.dealDeskList.innerHTML = '<div class="state-card">Loading deal desk…</div>';
  elements.adminMessageList.innerHTML = '<p class="form-status">Loading conversation…</p>';
  elements.adminMessageInput.value = "";
  elements.manualOfferSearch.value = "";
  elements.manualShortlistTitle.value = i18n?.getLanguage() === "ru" ? "Подобранные платёжные маршруты" : "Selected payment routes";
  elements.manualShortlistIntroduction.value = i18n?.getLanguage() === "ru" ? "OfferPSP подобрал эти конфиденциальные платёжные маршруты для вашего рассмотрения." : "OfferPSP selected these anonymous payment routes for your review.";
  elements.manualShortlistNote.value = i18n?.getLanguage() === "ru" ? "Выбрано специалистом OfferPSP для вашего рассмотрения." : "Selected manually by OfferPSP for your review.";
  activateWorkspace("workspaceOverview");
  renderManualOfferRoutes();
  elements.drawerBackdrop.classList.remove("is-hidden");
  elements.leadDrawer.classList.add("is-open");
  elements.leadDrawer.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";

  await Promise.all([
    loadActivities(leadId),
    loadTasks(leadId),
    loadMatches(leadId),
    loadShortlists(leadId),
    loadRequestWorkspace(leadId),
    loadAdminConversation(leadId),
  ]);
  renderRequestWorkspace();
}

function closeDrawer() {
  elements.leadDrawer.classList.remove("is-open");
  elements.leadDrawer.setAttribute("aria-hidden", "true");
  elements.drawerBackdrop.classList.add("is-hidden");
  document.body.style.overflow = "";
  state.selectedLead = null;
  state.requestWorkspace = null;
  state.selectedMatchIds = new Set();
  state.selectedManualRouteIds = new Set();
}

async function loadActivities(leadId) {
  const { data, error } = await supabase
    .from("offerpsp_lead_activities")
    .select("*")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false });

  if (error) {
    elements.activityList.innerHTML = `<p class="form-status error">${escapeHtml(error.message)}</p>`;
    return;
  }

  state.activities = data || [];
  renderActivities();
}

function renderActivities() {
  if (!state.activities.length) {
    elements.activityList.innerHTML = '<p class="form-status">No activity yet.</p>';
    return;
  }

  elements.activityList.innerHTML = state.activities.map((item) => `
    <article class="timeline-item">
      <strong>${escapeHtml(item.title)}</strong>
      ${item.body ? `<p>${escapeHtml(item.body)}</p>` : ""}
      <time>${escapeHtml(formatDate(item.created_at, true))} · ${escapeHtml(item.actor_type)}</time>
    </article>
  `).join("");
}

async function loadTasks(leadId) {
  const { data, error } = await supabase
    .from("offerpsp_tasks")
    .select("*")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false });

  if (error) {
    elements.taskList.innerHTML = `<p class="form-status error">${escapeHtml(error.message)}</p>`;
    return;
  }

  state.tasks = data || [];
  renderTasks();
}

function renderTasks() {
  if (!state.tasks.length) {
    elements.taskList.innerHTML = '<p class="form-status">No tasks for this request.</p>';
    return;
  }

  elements.taskList.replaceChildren();
  for (const task of state.tasks) {
    const item = document.createElement("article");
    const done = task.status === "done";
    item.className = `task-item${done ? " is-done" : ""}`;
    item.innerHTML = `
      <button class="task-check" type="button" aria-label="${done ? "Reopen" : "Complete"} task">${done ? "✓" : ""}</button>
      <span>
        <strong>${escapeHtml(task.title)}</strong>
        <small>${escapeHtml(task.priority)}${task.due_at ? ` · due ${escapeHtml(formatDate(task.due_at))}` : ""}</small>
      </span>
    `;
    item.querySelector(".task-check").addEventListener("click", () => toggleTask(task));
    elements.taskList.append(item);
  }
}

async function loadMatches(leadId) {
  const { data, error } = await supabase.rpc("list_offerpsp_route_matches", {
    p_lead_id: leadId,
  });

  if (error) {
    elements.matchSummary.textContent = "Could not load candidates";
    elements.matchesList.innerHTML = `<p class="form-status error">${escapeHtml(error.message)}</p>`;
    return;
  }

  state.matches = data || [];
  renderMatches();
}

function renderMatches() {
  const currentShortlist = state.shortlists[0];
  const shareable = isShareableShortlist(currentShortlist);
  elements.matchSummary.textContent = state.matches.length
    ? `${state.matches.length} candidates · ${currentShortlist?.status === "shared" && shareable
      ? "shortlist shared"
      : currentShortlist && shareable
        ? "normalized shortlist ready"
        : currentShortlist
          ? "legacy shortlist blocked — run matching to rebuild"
          : "review eligible routes"}`
    : "No candidates generated yet";
  elements.shareShortlistButton.classList.toggle(
    "is-hidden",
    !currentShortlist || currentShortlist.status === "shared" || !shareable,
  );
  elements.createShortlistButton.classList.toggle("is-hidden", state.selectedMatchIds.size === 0);
  renderShortlistPreview();
  renderManualOfferRoutes();

  if (!state.matches.length) {
    elements.matchesList.innerHTML = '<p class="form-status">Run matching to compare this request with the PSP database.</p>';
    return;
  }

  elements.matchesList.innerHTML = state.matches.slice(0, 20).map((match, index) => {
    const strengths = Array.isArray(match.strengths) ? match.strengths.map((item) => i18n?.t(item)).join(" · ") : "";
    const risks = Array.isArray(match.risks) ? match.risks.map((item) => i18n?.t(item)).join(" · ") : "";
    const pricing = Array.isArray(match.client_pricing)
      ? match.client_pricing.map((price) => price.client_percent != null ? `${price.client_percent}%` : price.client_fixed != null ? String(price.client_fixed) : "").filter(Boolean).join(" · ")
      : "";
    const selected = state.selectedMatchIds.has(match.match_id);
    return `
      <article class="match-card${selected ? " is-selected" : ""}">
        <input class="match-select" type="checkbox" data-match-id="${escapeHtml(match.match_id)}" ${selected ? "checked" : ""} aria-label="Select ${escapeHtml(cleanText(match.client_title))}">
        <span class="match-rank">#${index + 1}</span>
        <div class="match-info">
          <strong>${escapeHtml(cleanText(match.provider_name))} · ${escapeHtml(cleanText(match.client_title))}</strong>
          <p>${escapeHtml(strengths || "Manual verification required")}</p>
          <div class="match-meta">${escapeHtml([listInput(match.geos), listInput(match.currencies), String(match.flow || "").toUpperCase(), listInput(match.methods), pricing].filter(Boolean).join(" · "))}</div>
          ${risks ? `<div class="match-risks">${escapeHtml(i18n?.t("Risk"))}: ${escapeHtml(risks)}</div>` : ""}
        </div>
        <span class="match-score">${escapeHtml(match.score)}</span>
      </article>
    `;
  }).join("");

  elements.matchesList.querySelectorAll("[data-match-id]").forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) state.selectedMatchIds.add(checkbox.dataset.matchId);
      else state.selectedMatchIds.delete(checkbox.dataset.matchId);
      renderMatches();
    });
  });
}

function renderManualOfferRoutes() {
  const isRu = i18n?.getLanguage() === "ru";
  const search = elements.manualOfferSearch.value.trim().toLowerCase();
  const routes = state.supply.coverage.filter((route) => {
    if (route.status !== "published" || Number(route.open_error_count || 0) > 0 || !route.margin_ready) return false;
    if (!search) return true;
    return [
      route.provider_name, route.provider_code, route.route_code, route.client_title, routeCoverage(route),
      route.flow, ...(route.currencies || []), ...(route.methods || []), ...(route.verticals || []),
      ...(route.traffic_types || []),
    ].join(" ").toLowerCase().includes(search);
  });
  elements.manualOfferSelectionCount.textContent = `${state.selectedManualRouteIds.size} ${isRu ? "выбрано" : "selected"}`;
  elements.createManualShortlistButton.disabled = state.selectedManualRouteIds.size === 0;
  if (!state.supply.coverageAvailable) {
    elements.manualOfferRouteList.innerHTML = `<p class="form-status error">${isRu ? "Каталог офферов недоступен." : "The offer catalog is unavailable."}</p>`;
    return;
  }
  if (!routes.length) {
    elements.manualOfferRouteList.innerHTML = `<p class="form-status">${isRu ? "Опубликованные офферы не найдены." : "No published offers found."}</p>`;
    return;
  }
  elements.manualOfferRouteList.innerHTML = routes.map((route) => {
    const selected = state.selectedManualRouteIds.has(route.route_id);
    const readiness = coverageReadiness(route);
    return `<label class="manual-route-card${selected ? " is-selected" : ""}">
      <input type="checkbox" data-manual-route-id="${escapeHtml(route.route_id)}" ${selected ? "checked" : ""}>
      <span><strong>${escapeHtml(route.client_title)}</strong><span>${escapeHtml([routeCoverage(route), (route.currencies || []).join(", "), String(route.flow || "").toUpperCase(), (route.methods || []).join(", ")].filter(Boolean).join(" · "))}</span><small>${escapeHtml(route.provider_name)} · ${escapeHtml(readiness.label)}</small></span>
    </label>`;
  }).join("");
  elements.manualOfferRouteList.querySelectorAll("[data-manual-route-id]").forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) state.selectedManualRouteIds.add(checkbox.dataset.manualRouteId);
      else state.selectedManualRouteIds.delete(checkbox.dataset.manualRouteId);
      renderManualOfferRoutes();
    });
  });
}

function renderShortlistPreview() {
  const shortlist = state.shortlists[0];
  const items = shortlist?.offerpsp_shortlist_items || [];
  if (!shortlist || !items.length) {
    elements.shortlistPreview.classList.add("is-hidden");
    elements.shortlistPreview.innerHTML = "";
    return;
  }
  elements.shortlistPreview.classList.remove("is-hidden");
  elements.shortlistPreview.innerHTML = `
    <div><div><p class="eyebrow">Client preview</p><h4>${escapeHtml(shortlist.title)} · v${escapeHtml(shortlist.version)}</h4></div><span class="status-pill status-${escapeHtml(shortlist.status)}">${escapeHtml(shortlist.status)}</span></div>
    <div class="preview-options">${items.map((item, index) => {
      const snapshot = item.client_snapshot || {};
      const feeText = (fee) => [
        fee.client_percent != null ? `${fee.client_percent}%` : "",
        fee.client_fixed != null ? `${fee.client_fixed} ${fee.client_fixed_currency || ""}`.trim() : "",
      ].filter(Boolean).join(" + ") || "—";
      const commercialFees = ["payin", "payout"].map((flow) => {
        const fee = (snapshot.client_fees || []).find((candidate) => candidate.flow === flow);
        return fee ? `${flow === "payin" ? "PayIn" : "PayOut"}: ${feeText(fee)}` : "";
      }).filter(Boolean).join(" · ") || "—";
      return `<article class="preview-option"><div><strong>${escapeHtml(i18n?.t("Option"))} ${index + 1}: ${escapeHtml(snapshot.title || i18n?.t("Incomplete legacy option"))}</strong><p>${escapeHtml([listInput(snapshot.geos), listInput(snapshot.currencies), listInput(snapshot.methods)].filter(Boolean).join(" · ") || i18n?.t("Missing normalized route details"))}</p></div><strong>${escapeHtml(commercialFees)}</strong></article>`;
    }).join("")}</div>`;
}

async function loadShortlists(leadId) {
  const { data, error } = await supabase
    .from("offerpsp_shortlists")
    .select("id, lead_id, version, title, status, shared_at, created_at, offerpsp_shortlist_items(id, offer_route_id, private_provider_id, client_snapshot)")
    .eq("lead_id", leadId)
    .order("version", { ascending: false });

  if (error) {
    showToast(error.message);
    return;
  }

  state.shortlists = data || [];
  renderMatches();
}

async function runMatching() {
  if (!state.selectedLead) return;
  setButtonLoading(elements.runMatchingButton, true, "Matching…");
  setDrawerStatus();

  const { data, error } = await supabase.rpc("rebuild_offerpsp_route_matches", {
    p_lead_id: state.selectedLead.lead_id,
  });

  if (error) {
    setButtonLoading(elements.runMatchingButton, false);
    setDrawerStatus(error.message, "error");
    return;
  }

  state.selectedMatchIds = new Set();

  await Promise.all([
    loadMatches(state.selectedLead.lead_id),
    loadShortlists(state.selectedLead.lead_id),
    loadActivities(state.selectedLead.lead_id),
    loadLeads(),
  ]);

  const refreshed = state.leads.find((lead) => lead.lead_id === state.selectedLead.lead_id);
  if (refreshed) {
    state.selectedLead = refreshed;
    elements.drawerStatus.value = refreshed.status;
    elements.drawerScore.value = refreshed.quality_score ?? "";
    elements.drawerGrade.value = refreshed.quality_grade || "";
  }

  setButtonLoading(elements.runMatchingButton, false);
  const missingLabels = (data?.missing_fields || []).map(matchingMissingLabel);
  setDrawerStatus(
    data?.status === "needs_clarification"
      ? `${i18n?.getLanguage() === "ru" ? "Для автоматического подбора заполните" : "Complete for automatic matching"}: ${missingLabels.join(", ")}. ${i18n?.getLanguage() === "ru" ? "Ручная отправка офферов доступна без этих данных." : "Manual offer sending remains available."}`
      : `Matching complete: ${data?.match_count ?? state.matches.length} eligible routes. Review and select the routes manually.`,
    "success",
  );
}

async function createShortlist() {
  if (!state.selectedLead || state.selectedMatchIds.size === 0) return;
  setButtonLoading(elements.createShortlistButton, true, "Creating preview…");
  setDrawerStatus();
  const { error } = await supabase.rpc("create_offerpsp_route_shortlist", {
    p_lead_id: state.selectedLead.lead_id,
    p_route_match_ids: [...state.selectedMatchIds],
    p_title: "Recommended payment routes",
    p_introduction: "These anonymous routes were checked against your payment profile and reviewed by OfferPSP.",
  });
  setButtonLoading(elements.createShortlistButton, false);
  if (error) {
    setDrawerStatus(friendlyError(error, "Could not create the shortlist preview."), "error");
    return;
  }
  state.selectedMatchIds = new Set();
  await Promise.all([
    loadShortlists(state.selectedLead.lead_id),
    loadRequestWorkspace(state.selectedLead.lead_id),
    loadActivities(state.selectedLead.lead_id),
    loadLeads(),
  ]);
  setDrawerStatus("Shortlist preview created. Check the client-facing terms before sharing.", "success");
}

async function createManualShortlist() {
  if (!state.selectedLead || state.selectedManualRouteIds.size === 0) return;
  setButtonLoading(elements.createManualShortlistButton, true, "Creating preview…");
  setDrawerStatus();
  const { error } = await supabase.rpc("create_offerpsp_manual_shortlist", {
    p_lead_id: state.selectedLead.lead_id,
    p_route_ids: [...state.selectedManualRouteIds],
    p_title: elements.manualShortlistTitle.value.trim(),
    p_introduction: elements.manualShortlistIntroduction.value.trim(),
    p_client_note: elements.manualShortlistNote.value.trim(),
  });
  setButtonLoading(elements.createManualShortlistButton, false);
  if (error) {
    setDrawerStatus(friendlyError(error, "Could not create the manual offer preview."), "error");
    return;
  }
  state.selectedManualRouteIds = new Set();
  await Promise.all([
    loadShortlists(state.selectedLead.lead_id),
    loadRequestWorkspace(state.selectedLead.lead_id),
    loadActivities(state.selectedLead.lead_id),
    loadLeads(),
  ]);
  renderManualOfferRoutes();
  setDrawerStatus("Manual preview created. Check the client-facing prices and press Share shortlist.", "success");
}

async function shareShortlist() {
  const shortlist = state.shortlists[0];
  if (!shortlist || !state.selectedLead) return;
  if (!isShareableShortlist(shortlist)) {
    setDrawerStatus("This is a legacy or incomplete shortlist. Run matching to rebuild it from normalized routes.", "error");
    return;
  }

  setButtonLoading(elements.shareShortlistButton, true, "Sharing…");
  setDrawerStatus();
  const { error } = await supabase.rpc("share_offerpsp_shortlist", {
    p_shortlist_id: shortlist.id,
  });

  if (error) {
    setButtonLoading(elements.shareShortlistButton, false);
    setDrawerStatus(friendlyError(error, "Could not share the shortlist."), "error");
    return;
  }

  await Promise.all([
    loadShortlists(state.selectedLead.lead_id),
    loadActivities(state.selectedLead.lead_id),
    loadRequestWorkspace(state.selectedLead.lead_id),
    loadLeads(),
  ]);
  setButtonLoading(elements.shareShortlistButton, false);
  setDrawerStatus("Shortlist shared in the client cabinet.", "success");
}

function dealDeskStatusLabel(status) {
  const labels = {
    dossier_ready: ["ready for review", "готово к проверке"], pending: ["pending", "ожидает"],
    reviewing: ["PSP reviewing", "PSP рассматривает"], needs_info: ["needs information", "нужны данные"],
    accepted: ["PSP accepted", "PSP согласовал"], declined: ["PSP declined", "PSP отказал"],
    telegram_created: ["Telegram created", "Telegram создан"], zoom_scheduled: ["Zoom scheduled", "Zoom назначен"],
    won: ["won", "успешно"], lost: ["lost", "потеряно"],
  };
  return labels[status]?.[i18n?.getLanguage() === "ru" ? 1 : 0] || status;
}

function renderDealDesk() {
  const workspace = state.requestWorkspace || {};
  const requestedItems = (workspace.shortlist_items || []).filter((item) => item.introduction_requested_at);
  const reviews = workspace.reviews || [];
  const introductions = workspace.introductions || [];
  if (!requestedItems.length) {
    elements.dealDeskList.innerHTML = '<div class="state-card">The Deal Desk starts when the client selects an option and requests an introduction.</div>';
    return;
  }

  elements.dealDeskList.innerHTML = requestedItems.map((item) => {
    const review = reviews.find((candidate) => candidate.shortlist_item_id === item.item_id);
    const introduction = review ? introductions.find((candidate) => candidate.review_id === review.review_id) : null;
    let controls = "";
    if (!review) {
      controls = `<div class="deal-form">
        <label>Review channel<select data-field="review-channel"><option value="telegram">Telegram</option><option value="email">Email</option><option value="portal">Portal</option><option value="other">Other</option></select></label>
        <label>External reference<input data-field="review-reference" type="text" placeholder="Chat, ticket or message reference"></label>
      </div><div class="deal-actions-admin"><button class="button button-primary button-compact" type="button" data-deal-action="submit-review" data-item-id="${escapeHtml(item.item_id)}">Send dossier to PSP review</button></div>`;
    } else if (["reviewing", "pending", "needs_info"].includes(review.status)) {
      controls = `<div class="deal-form">
        <label class="span-2">Internal decision note<textarea data-field="review-note" rows="2">${escapeHtml(review.internal_notes || "")}</textarea></label>
        <label class="span-2">Information requested from merchant<textarea data-field="requested-information" rows="2">${escapeHtml(review.requested_information || "")}</textarea></label>
      </div><div class="deal-actions-admin">
        ${review.status === "needs_info" ? `<button class="button button-secondary button-compact" type="button" data-deal-action="submit-review" data-item-id="${escapeHtml(item.item_id)}">Resubmit updated dossier</button>` : ""}
        <button class="button button-primary button-compact" type="button" data-deal-action="review-decision" data-decision="accepted" data-review-id="${escapeHtml(review.review_id)}">PSP accepted</button>
        <button class="button button-secondary button-compact" type="button" data-deal-action="review-decision" data-decision="needs_info" data-review-id="${escapeHtml(review.review_id)}">Request information</button>
        <button class="button button-secondary button-compact" type="button" data-deal-action="review-decision" data-decision="declined" data-review-id="${escapeHtml(review.review_id)}">PSP declined</button>
      </div>`;
    } else if (review.status === "accepted" && !introduction) {
      controls = `<div class="deal-form">
        <label>Telegram group title<input data-field="telegram-title" type="text" placeholder="Merchant × PSP × OfferPSP"></label>
        <label>Telegram group URL<input data-field="telegram-url" type="url" placeholder="https://t.me/..."></label>
      </div><div class="deal-actions-admin"><button class="button button-primary button-compact" type="button" data-deal-action="create-telegram" data-review-id="${escapeHtml(review.review_id)}">Record Telegram introduction</button></div>`;
    } else if (introduction?.status === "telegram_created") {
      controls = `<div class="deal-form">
        <label>Zoom URL<input data-field="zoom-url" type="url" placeholder="https://zoom.us/..."></label>
        <label>Meeting date and time<input data-field="zoom-date" type="datetime-local"></label>
      </div><div class="deal-actions-admin"><button class="button button-primary button-compact" type="button" data-deal-action="schedule-zoom" data-introduction-id="${escapeHtml(introduction.introduction_id)}">Schedule Zoom</button></div>`;
    } else if (introduction?.status === "zoom_scheduled") {
      controls = `<div class="deal-form"><label class="span-2">Outcome note<textarea data-field="result-note" rows="2"></textarea></label></div><div class="deal-actions-admin">
        <button class="button button-primary button-compact" type="button" data-deal-action="close-introduction" data-result="won" data-introduction-id="${escapeHtml(introduction.introduction_id)}">Mark live / won</button>
        <button class="button button-secondary button-compact" type="button" data-deal-action="close-introduction" data-result="lost" data-introduction-id="${escapeHtml(introduction.introduction_id)}">Mark lost</button>
      </div>`;
    }
    return `<article class="deal-card-admin">
      <div class="deal-card-admin-head"><div><strong>${escapeHtml(item.provider_name || "Unknown PSP")} · ${escapeHtml(item.route_title || item.option_code)}</strong><p>${escapeHtml(item.provider_code || "—")} · ${escapeHtml(item.route_code || "—")} · ${escapeHtml(i18n?.getLanguage() === "ru" ? "вариант клиента" : "client option")} ${escapeHtml(item.option_code)}</p></div><span class="status-pill status-${escapeHtml(introduction?.status || review?.status || "dossier_ready")}">${escapeHtml(dealDeskStatusLabel(introduction?.status || review?.status || "dossier_ready"))}</span></div>
      ${review?.requested_information ? `<p class="match-risks">PSP requested: ${escapeHtml(review.requested_information)}</p>` : ""}
      ${introduction?.telegram_group_url ? `<p><a href="${escapeHtml(introduction.telegram_group_url)}" target="_blank" rel="noopener">Open Telegram group</a>${introduction.zoom_url ? ` · <a href="${escapeHtml(introduction.zoom_url)}" target="_blank" rel="noopener">Open Zoom</a>` : ""}</p>` : ""}
      ${controls}
    </article>`;
  }).join("");
}

async function refreshOperationalWorkspace() {
  if (!state.selectedLead) return;
  const leadId = state.selectedLead.lead_id;
  await Promise.all([loadLeads(), loadRequestWorkspace(leadId), loadActivities(leadId)]);
  const refreshed = state.leads.find((lead) => lead.lead_id === leadId);
  if (refreshed) {
    state.selectedLead = refreshed;
    elements.drawerStatus.value = refreshed.status;
    renderProfile(refreshed);
  }
  renderRequestWorkspace();
}

async function handleDealDeskAction(button) {
  const card = button.closest(".deal-card-admin");
  const field = (name) => card?.querySelector(`[data-field="${name}"]`)?.value.trim() || null;
  const action = button.dataset.dealAction;
  setButtonLoading(button, true, "Saving…");
  setDrawerStatus();
  let result;
  if (action === "submit-review") {
    result = await supabase.rpc("submit_offerpsp_dossier_for_review", {
      p_shortlist_item_id: button.dataset.itemId,
      p_channel: field("review-channel") || "telegram",
      p_external_reference: field("review-reference"),
    });
  } else if (action === "review-decision") {
    result = await supabase.rpc("record_offerpsp_provider_review", {
      p_review_id: button.dataset.reviewId,
      p_decision: button.dataset.decision,
      p_notes: field("review-note"),
      p_requested_information: field("requested-information"),
    });
  } else if (action === "create-telegram") {
    result = await supabase.rpc("record_offerpsp_telegram_introduction", {
      p_review_id: button.dataset.reviewId,
      p_group_title: field("telegram-title"),
      p_group_url: field("telegram-url"),
    });
  } else if (action === "schedule-zoom") {
    const scheduledAt = field("zoom-date");
    result = await supabase.rpc("record_offerpsp_zoom", {
      p_introduction_id: button.dataset.introductionId,
      p_zoom_url: field("zoom-url"),
      p_scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
    });
  } else if (action === "close-introduction") {
    result = await supabase.rpc("close_offerpsp_introduction", {
      p_introduction_id: button.dataset.introductionId,
      p_result: button.dataset.result,
      p_notes: field("result-note"),
    });
  }
  setButtonLoading(button, false);
  if (result?.error) {
    setDrawerStatus(friendlyError(result.error, "The Deal Desk action could not be completed."), "error");
    return;
  }
  await refreshOperationalWorkspace();
  setDrawerStatus("Deal Desk updated.", "success");
}

async function loadAdminConversation(leadId) {
  const { data: conversationId, error } = await supabase.rpc(
    "ensure_offerpsp_portal_conversation",
    { p_lead_id: leadId },
  );

  if (error) {
    elements.adminMessageList.innerHTML = `<p class="form-status error">${escapeHtml(error.message)}</p>`;
    return;
  }

  state.conversationId = conversationId;
  const { data, error: messageError } = await supabase
    .from("offerpsp_messages")
    .select("id, sender_type, body, sent_at")
    .eq("conversation_id", conversationId)
    .order("sent_at", { ascending: true });

  if (messageError) {
    elements.adminMessageList.innerHTML = `<p class="form-status error">${escapeHtml(messageError.message)}</p>`;
    return;
  }

  state.messages = data || [];
  renderAdminMessages();
}

function renderAdminMessages() {
  if (!state.messages.length) {
    elements.adminMessageList.innerHTML = '<p class="form-status">No client messages yet.</p>';
    return;
  }

  elements.adminMessageList.innerHTML = state.messages.map((message) => `
    <article class="admin-message${message.sender_type === "staff" ? " staff" : ""}">
      ${escapeHtml(message.body)}
      <small>${escapeHtml(formatDate(message.sent_at, true))} · ${escapeHtml(message.sender_type)}</small>
    </article>
  `).join("");
  elements.adminMessageList.scrollTop = elements.adminMessageList.scrollHeight;
}

async function sendAdminMessage() {
  if (!state.conversationId || !state.selectedLead) return;
  const body = elements.adminMessageInput.value.trim();
  if (!body) {
    setDrawerStatus("Write a reply first.", "error");
    return;
  }

  setButtonLoading(elements.sendAdminMessageButton, true, "Sending…");
  const { error } = await supabase.from("offerpsp_messages").insert({
    conversation_id: state.conversationId,
    sender_type: "staff",
    sender_user_id: state.user.id,
    direction: "outbound",
    body,
  });
  setButtonLoading(elements.sendAdminMessageButton, false);

  if (error) {
    setDrawerStatus(error.message, "error");
    return;
  }

  await supabase.from("offerpsp_lead_activities").insert({
    lead_id: state.selectedLead.lead_id,
    actor_user_id: state.user.id,
    actor_type: "staff",
    activity_type: "portal_reply_sent",
    title: "Reply sent in client cabinet",
    client_visible: true,
  });

  elements.adminMessageInput.value = "";
  await Promise.all([
    loadAdminConversation(state.selectedLead.lead_id),
    loadActivities(state.selectedLead.lead_id),
  ]);
  setDrawerStatus("Reply published in the client cabinet.", "success");
}

async function saveLeadChanges() {
  if (!state.selectedLead) return;
  setButtonLoading(elements.saveLeadButton, true, "Saving…");
  setDrawerStatus();

  const scoreValue = elements.drawerScore.value.trim();
  const score = scoreValue === "" ? null : Number(scoreValue);
  if (score !== null && (!Number.isInteger(score) || score < 0 || score > 100)) {
    setButtonLoading(elements.saveLeadButton, false);
    setDrawerStatus("Score must be a whole number between 0 and 100.", "error");
    return;
  }

  const previousStatus = state.selectedLead.status;
  const previousOwner = state.selectedLead.assigned_to || null;
  const updates = {
    status: elements.drawerStatus.value,
    quality_score: score,
    quality_grade: elements.drawerGrade.value || null,
    assigned_to: elements.drawerOwner.value || null,
  };

  const { data, error } = await supabase
    .from("offerpsp_leads")
    .update(updates)
    .eq("lead_id", state.selectedLead.lead_id)
    .select()
    .single();

  if (error) {
    setButtonLoading(elements.saveLeadButton, false);
    setDrawerStatus(error.message, "error");
    return;
  }

  const title = previousStatus !== updates.status
    ? `Status changed to ${statusLabel(updates.status)}`
    : "Lead qualification updated";

  const { error: activityError } = await supabase.from("offerpsp_lead_activities").insert({
    lead_id: data.lead_id,
    actor_user_id: state.user.id,
    actor_type: "staff",
    activity_type: previousStatus !== updates.status ? "status_changed" : "qualification_updated",
    title,
    metadata: {
      previous_status: previousStatus,
      status: updates.status,
      quality_score: score,
      quality_grade: updates.quality_grade,
      previous_assigned_to: previousOwner,
      assigned_to: updates.assigned_to,
    },
  });

  state.selectedLead = data;
  state.leads = state.leads.map((lead) => lead.lead_id === data.lead_id ? data : lead);
  renderStats();
  renderLeads();
  renderRequestWorkspace();
  await loadActivities(data.lead_id);
  setButtonLoading(elements.saveLeadButton, false);
  setDrawerStatus(activityError ? "Lead saved, but the activity record failed." : "Changes saved.", activityError ? "error" : "success");
}

async function saveMerchantRecord() {
  if (!state.selectedLead) return;
  setButtonLoading(elements.saveMerchantRecordButton, true, "Saving…");
  const { data, error } = await supabase.rpc("save_offerpsp_managed_merchant", {
    p_lead_id: state.selectedLead.lead_id,
    p_payload: {
      company: elements.merchantRecordCompany.value.trim(), name: elements.merchantRecordName.value.trim(),
      work_email: elements.merchantRecordEmail.value.trim(), telegram: elements.merchantRecordTelegram.value.trim(),
      company_url: elements.merchantRecordUrl.value.trim(), vertical: elements.merchantRecordVertical.value.trim(),
      geos: elements.merchantRecordGeos.value.trim(), monthly_volume: elements.merchantRecordVolume.value.trim(),
      methods: elements.merchantRecordMethods.value.trim(), details: elements.merchantRecordDetails.value.trim(),
    },
  });
  setButtonLoading(elements.saveMerchantRecordButton, false);
  if (error) { elements.merchantRecordStatus.textContent = friendlyError(error, "Could not save merchant."); return; }
  state.selectedLead = data;
  state.leads = state.leads.map((lead) => lead.lead_id === data.lead_id ? data : lead);
  elements.drawerCompany.textContent = cleanText(data.company);
  elements.drawerContact.textContent = `${cleanText(data.name)} · ${cleanText(data.work_email)}`;
  renderLeadContactActions(data);
  renderProfile(data);
  renderLeads();
  await Promise.all([loadManagement(), loadActivities(data.lead_id)]);
  elements.merchantRecordStatus.textContent = "Merchant record saved.";
}

async function changeMerchantRecordState(leadId, recordState, button) {
  const merchant = state.management.merchants.find((item) => item.lead_id === leadId)
    || state.leads.find((item) => item.lead_id === leadId);
  if (!merchant) return;
  let reason = null;
  if (recordState === "archived") {
    reason = window.prompt("Why is this merchant being archived?", "Not relevant / no active opportunity");
    if (!reason?.trim()) return;
  } else if (!window.confirm(`Restore ${merchant.company} to active work?`)) return;
  setButtonLoading(button, true, "Saving…");
  const { data, error } = await supabase.rpc("set_offerpsp_merchant_record_state", { p_lead_id: leadId, p_record_state: recordState, p_reason: reason?.trim() || null });
  setButtonLoading(button, false);
  if (error) { setManagementStatus(friendlyError(error, "Could not change merchant state."), "error"); return; }
  state.leads = state.leads.map((lead) => lead.lead_id === leadId ? data : lead);
  if (state.selectedLead?.lead_id === leadId) { state.selectedLead = data; renderProfile(data); elements.drawerStatus.value = data.status; }
  await Promise.all([loadLeads(), loadManagement()]);
  setManagementStatus(recordState === "archived" ? "Merchant archived and removed from active work." : "Merchant restored to active work.", "success");
}

async function purgeMerchant(leadId, button) {
  const merchant = state.management.merchants.find((item) => item.lead_id === leadId)
    || state.leads.find((item) => item.lead_id === leadId);
  if (!merchant) return;
  const expected = `DELETE ${merchant.company}`;
  const confirmation = window.prompt(`This permanently deletes the merchant and its operational data. Type exactly:\n${expected}`);
  if (confirmation !== expected) return;
  setButtonLoading(button, true, "Deleting…");
  const { error } = await supabase.rpc("purge_offerpsp_merchant", { p_lead_id: leadId, p_confirmation: confirmation });
  setButtonLoading(button, false);
  if (error) { setManagementStatus(friendlyError(error, "Could not permanently delete merchant."), "error"); return; }
  if (state.selectedLead?.lead_id === leadId) closeDrawer();
  await Promise.all([loadLeads(), loadManagement()]);
  setManagementStatus(`${merchant.company} permanently deleted. The deletion audit event was retained.`, "success");
}

async function addNote() {
  if (!state.selectedLead) return;
  const body = elements.noteInput.value.trim();
  if (!body) {
    setDrawerStatus("Write a note first.", "error");
    return;
  }

  setButtonLoading(elements.addNoteButton, true, "Adding…");
  const { error } = await supabase.from("offerpsp_lead_activities").insert({
    lead_id: state.selectedLead.lead_id,
    actor_user_id: state.user.id,
    actor_type: "staff",
    activity_type: "internal_note",
    title: "Internal note",
    body,
    client_visible: false,
  });
  setButtonLoading(elements.addNoteButton, false);

  if (error) {
    setDrawerStatus(error.message, "error");
    return;
  }

  elements.noteInput.value = "";
  setDrawerStatus("Note added.", "success");
  await loadActivities(state.selectedLead.lead_id);
}

async function addTask() {
  if (!state.selectedLead) return;
  const title = elements.taskTitleInput.value.trim();
  if (!title) {
    setDrawerStatus("Give the task a title.", "error");
    return;
  }

  setButtonLoading(elements.addTaskButton, true, "Creating…");
  const dueDate = elements.taskDueInput.value
    ? new Date(`${elements.taskDueInput.value}T12:00:00`).toISOString()
    : null;

  const { data, error } = await supabase
    .from("offerpsp_tasks")
    .insert({
      lead_id: state.selectedLead.lead_id,
      assigned_to: state.selectedLead.assigned_to || state.user.id,
      created_by: state.user.id,
      source: "staff",
      title,
      priority: elements.taskPriorityInput.value,
      due_at: dueDate,
    })
    .select()
    .single();

  setButtonLoading(elements.addTaskButton, false);
  if (error) {
    setDrawerStatus(error.message, "error");
    return;
  }

  await supabase.from("offerpsp_lead_activities").insert({
    lead_id: state.selectedLead.lead_id,
    actor_user_id: state.user.id,
    actor_type: "staff",
    activity_type: "task_created",
    title: `Task created: ${title}`,
    metadata: { task_id: data.id, priority: data.priority, due_at: data.due_at },
  });

  elements.taskTitleInput.value = "";
  elements.taskDueInput.value = "";
  state.tasks.unshift(data);
  renderTasks();
  await loadActivities(state.selectedLead.lead_id);
  setDrawerStatus("Task created.", "success");
}

async function toggleTask(task) {
  const nextStatus = task.status === "done" ? "pending" : "done";
  const { data, error } = await supabase
    .from("offerpsp_tasks")
    .update({
      status: nextStatus,
      completed_at: nextStatus === "done" ? new Date().toISOString() : null,
    })
    .eq("id", task.id)
    .select()
    .single();

  if (error) {
    showToast(error.message);
    return;
  }

  state.tasks = state.tasks.map((item) => item.id === data.id ? data : item);
  renderTasks();
}

elements.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = elements.emailInput.value.trim();
  const password = elements.passwordInput.value;
  const submitButton = elements.loginForm.querySelector('button[type="submit"]');

  if (!password) {
    setAuthStatus("Enter your password or request a secure email link.", "error");
    return;
  }

  setButtonLoading(submitButton, true, "Signing in…");
  setAuthStatus();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  setButtonLoading(submitButton, false);

  if (error) {
    setAuthStatus(error.message, "error");
    return;
  }

  await enterApp(data.session);
});

elements.magicLinkButton.addEventListener("click", async () => {
  const email = elements.emailInput.value.trim();
  if (!email) {
    setAuthStatus("Enter your work email first.", "error");
    return;
  }

  setButtonLoading(elements.magicLinkButton, true, "Sending…");
  setAuthStatus();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${window.location.origin}/admin/`,
      shouldCreateUser: false,
    },
  });
  setButtonLoading(elements.magicLinkButton, false);
  setAuthStatus(
    error ? error.message : "Secure link sent. Check your inbox.",
    error ? "error" : "success",
  );
});

elements.googleLoginButton.addEventListener("click", async () => {
  setButtonLoading(elements.googleLoginButton, true, "Opening Google…");
  setAuthStatus();
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${window.location.origin}/admin/`,
    },
  });

  if (error) {
    setButtonLoading(elements.googleLoginButton, false);
    setAuthStatus(error.message, "error");
  }
});

elements.signOutButton.addEventListener("click", async () => {
  await supabase.auth.signOut();
  closeDrawer();
  closeSupplyWorkspace();
  await enterApp(null);
});

elements.refreshButton.addEventListener("click", refreshActiveView);
elements.refreshSupplyButton.addEventListener("click", loadSupply);
elements.refreshManagementButton.addEventListener("click", loadManagement);
elements.managementMerchantSearch.addEventListener("input", renderManagementMerchants);
elements.managementMerchantState.addEventListener("change", renderManagementMerchants);
elements.managedProviderForm.addEventListener("submit", saveManagedProvider);
elements.resetManagedProviderButton.addEventListener("click", resetManagedProviderForm);
elements.manualOfferForm.addEventListener("submit", createManualOffer);
elements.organizationForm.addEventListener("submit", saveOrganization);
elements.resetOrganizationButton.addEventListener("click", resetOrganizationForm);
elements.agentAssignmentForm.addEventListener("submit", saveAgentAssignment);
elements.agentMarginForm.addEventListener("submit", saveAgentMargin);
elements.coverageSearch.addEventListener("input", renderSupplyCoverage);
elements.coverageStatusFilter.addEventListener("change", renderSupplyCoverage);
elements.rateCardFileInput.addEventListener("change", async () => {
  try {
    await readRateCardFile(elements.rateCardFileInput.files?.[0]);
  } catch (error) {
    state.rateCardPayload = null;
    elements.rateCardPreview.classList.add("is-hidden");
    setSupplyStatus(error.message || "Could not read the prepared JSON file.", "error");
  }
});
elements.rateCardImportForm.addEventListener("submit", importRateCard);
elements.closeSupplyDrawerButton.addEventListener("click", closeSupplyWorkspace);
elements.supplyDrawerBackdrop.addEventListener("click", closeSupplyWorkspace);
elements.saveSupplyProviderButton.addEventListener("click", saveSupplyProvider);
elements.confirmSupplyFreshnessButton.addEventListener("click", confirmSupplyFreshness);
elements.supplyContactForm.addEventListener("submit", saveSupplyContact);
elements.resetSupplyContactButton.addEventListener("click", resetSupplyContactForm);
elements.supplyMarginForm.addEventListener("submit", saveSupplyMargin);
elements.supplyRouteForm.addEventListener("submit", saveSupplyRoute);
elements.addSupplyFeeButton.addEventListener("click", () => elements.supplyFeeRows.append(createSupplyFeeRow()));
elements.addSupplyLimitButton.addEventListener("click", () => elements.supplyLimitRows.append(createSupplyLimitRow()));
elements.addSupplySettlementButton.addEventListener("click", () => elements.supplySettlementRows.append(createSupplySettlementRow()));
elements.pauseSupplyRouteButton.addEventListener("click", () => setSupplyRouteStatus("paused", elements.pauseSupplyRouteButton));
elements.resumeSupplyRouteButton.addEventListener("click", () => setSupplyRouteStatus("published", elements.resumeSupplyRouteButton));
elements.archiveSupplyRouteButton.addEventListener("click", () => setSupplyRouteStatus("archived", elements.archiveSupplyRouteButton));
elements.reviseSupplyRouteButton.addEventListener("click", reviseSupplyRoute);
elements.searchInput.addEventListener("input", renderLeads);
elements.statusFilter.addEventListener("change", renderLeads);
elements.closeDrawerButton.addEventListener("click", closeDrawer);
elements.drawerBackdrop.addEventListener("click", closeDrawer);
elements.saveLeadButton.addEventListener("click", saveLeadChanges);
elements.saveMerchantRecordButton.addEventListener("click", saveMerchantRecord);
elements.archiveMerchantButton.addEventListener("click", () => state.selectedLead && changeMerchantRecordState(state.selectedLead.lead_id, "archived", elements.archiveMerchantButton));
elements.restoreMerchantButton.addEventListener("click", () => state.selectedLead && changeMerchantRecordState(state.selectedLead.lead_id, "active", elements.restoreMerchantButton));
elements.purgeMerchantButton.addEventListener("click", () => state.selectedLead && purgeMerchant(state.selectedLead.lead_id, elements.purgeMerchantButton));
elements.saveDossierButton.addEventListener("click", saveDossier);
elements.addNoteButton.addEventListener("click", addNote);
elements.addTaskButton.addEventListener("click", addTask);
elements.runMatchingButton.addEventListener("click", runMatching);
elements.createShortlistButton.addEventListener("click", createShortlist);
elements.createManualShortlistButton.addEventListener("click", createManualShortlist);
elements.manualOfferSearch.addEventListener("input", renderManualOfferRoutes);
elements.shareShortlistButton.addEventListener("click", shareShortlist);
elements.drawerOfferButton.addEventListener("click", () => activateWorkspace("workspaceMatching"));
elements.sendAdminMessageButton.addEventListener("click", sendAdminMessage);
elements.dealDeskList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-deal-action]");
  if (button) handleDealDeskAction(button);
});
document.querySelectorAll("[data-workspace-target]").forEach((button) => {
  button.addEventListener("click", () => activateWorkspace(button.dataset.workspaceTarget));
});
document.querySelectorAll("[data-supply-target]").forEach((button) => {
  button.addEventListener("click", () => activateSupplyWorkspace(button.dataset.supplyTarget));
});
document.querySelectorAll("[data-management-tab]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll("[data-management-tab]").forEach((item) => item.classList.toggle("is-active", item === button));
    const selected = button.dataset.managementTab;
    document.querySelectorAll(".management-view").forEach((view) => view.classList.add("is-hidden"));
    document.getElementById(`management${selected.charAt(0).toUpperCase()}${selected.slice(1)}`)?.classList.remove("is-hidden");
  });
});
document.querySelectorAll("[data-view]").forEach((button) => {
  button.addEventListener("click", () => activateAppView(button.dataset.view));
});
document.querySelectorAll("[data-supply-page]").forEach((button) => {
  button.addEventListener("click", () => activateSupplyPage(button.dataset.supplyPage));
});
elements.menuButton.addEventListener("click", () => elements.sidebar.classList.toggle("is-open"));
window.addEventListener("offerpsp:languagechange", () => {
  document.querySelectorAll("[data-default-label]").forEach((button) => {
    delete button.dataset.defaultLabel;
  });
  if (state.lastUpdatedAt) {
    elements.lastUpdated.textContent = `Updated ${new Intl.DateTimeFormat(
      i18n?.getLanguage() === "ru" ? "ru-RU" : "en-GB",
      { hour: "2-digit", minute: "2-digit" },
    ).format(state.lastUpdatedAt)}`;
  }
  renderStats();
  renderLeads();
  renderSupply();
  renderManagement();
  if (state.supplyWorkspace) renderSupplyWorkspace();
  if (state.selectedLead) {
    renderProfile(state.selectedLead);
    renderActivities();
    renderTasks();
    renderMatches();
    renderRequestWorkspace();
    renderAdminMessages();
  }
  i18n?.translate();
  activateAppView(state.activeAppView, { resetScroll: false });
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (state.selectedSupplyProviderId) closeSupplyWorkspace();
  else if (state.selectedLead) closeDrawer();
});

const { data: { session } } = await supabase.auth.getSession();
await enterApp(session);
supabase.auth.onAuthStateChange((event, nextSession) => {
  if (event === "SIGNED_OUT") enterApp(null);
  else if (event === "SIGNED_IN" && nextSession?.user && nextSession.user.id !== state.user?.id) enterApp(nextSession);
});
