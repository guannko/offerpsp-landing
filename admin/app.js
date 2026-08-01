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
  shortlists: [],
  requestWorkspace: null,
  conversationId: null,
  messages: [],
  supply: {
    providers: [],
    batches: [],
  },
  rateCardPayload: null,
  lastUpdatedAt: null,
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
  searchInput: document.getElementById("searchInput"),
  statusFilter: document.getElementById("statusFilter"),
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
  drawerBackdrop: document.getElementById("drawerBackdrop"),
  leadDrawer: document.getElementById("leadDrawer"),
  closeDrawerButton: document.getElementById("closeDrawerButton"),
  drawerCompany: document.getElementById("drawerCompany"),
  drawerContact: document.getElementById("drawerContact"),
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
  dealDeskList: document.getElementById("dealDeskList"),
  saveLeadButton: document.getElementById("saveLeadButton"),
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
    await loadStaffMembers();
    await Promise.all([loadLeads(), loadSupply()]);
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

async function loadSupply() {
  elements.supplyLoadingState.classList.remove("is-hidden");
  elements.supplyEmptyState.classList.add("is-hidden");
  elements.providerList.classList.add("is-hidden");
  elements.refreshSupplyButton.disabled = true;

  const { data, error } = await supabase.rpc("list_offerpsp_supply");

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
  };
  renderSupply();
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
    </article>
  `).join("");

  if (!batches.length) {
    elements.batchList.innerHTML = '<div class="supply-empty">No import batches yet.</div>';
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
}

function validateRateCardPayload(payload) {
  if (!payload || typeof payload !== "object") throw new Error("The JSON payload is empty.");
  if (!payload.provider?.brand_name) throw new Error("Provider brand_name is required.");
  if (!payload.batch?.source_text) throw new Error("Original rate-card source text is required.");
  if (!Array.isArray(payload.batch?.routes)) throw new Error("The rate-card routes must be an array.");
  return payload;
}

async function readRateCardFile(file) {
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) throw new Error("The prepared JSON file must be smaller than 10 MB.");
  const payload = validateRateCardPayload(JSON.parse(await file.text()));
  state.rateCardPayload = payload;
  elements.rateCardPreview.innerHTML = `
    <strong>${escapeHtml(payload.provider.brand_name)}</strong>
    <span>${payload.batch.routes.length} routes · ${escapeHtml(payload.batch.source_reference || payload.batch.source_type || "rate card")}</span>
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
  const count = (...statuses) => state.leads.filter((lead) => statuses.includes(lead.status)).length;
  const total = state.leads.length;
  const qualified = count(
    "qualified", "matching", "matched", "shortlist_ready", "shared", "negotiating", "won",
  );
  const matched = count("matched", "shortlist_ready", "shared", "negotiating", "won");
  const introduced = count("shared", "negotiating", "won");
  const won = count("won", "closed");
  const conversion = total ? Math.round((won / total) * 100) : 0;
  elements.statTotal.textContent = state.leads.length;
  elements.statNew.textContent = count("new", "reviewing", "qualifying");
  elements.statMatching.textContent = count("matching", "matched");
  elements.statReady.textContent = count("shortlist_ready", "shared");
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
};

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

async function openLead(leadId) {
  const lead = state.leads.find((item) => item.lead_id === leadId);
  if (!lead) return;

  state.selectedLead = lead;
  state.activities = [];
  state.tasks = [];
  state.matches = [];
  state.selectedMatchIds = new Set();
  state.shortlists = [];
  state.requestWorkspace = null;
  state.conversationId = null;
  state.messages = [];
  elements.drawerCompany.textContent = cleanText(lead.company);
  elements.drawerContact.textContent = `${cleanText(lead.name)} · ${cleanText(lead.work_email)}`;
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
      const fees = (snapshot.client_fees || []).map((fee) => fee.client_percent != null ? `${fee.client_percent}%` : fee.client_fixed != null ? String(fee.client_fixed) : "").filter(Boolean).join(" · ") || "—";
      return `<article class="preview-option"><div><strong>${escapeHtml(i18n?.t("Option"))} ${index + 1}: ${escapeHtml(snapshot.title || i18n?.t("Incomplete legacy option"))}</strong><p>${escapeHtml([listInput(snapshot.geos), listInput(snapshot.currencies), listInput(snapshot.methods)].filter(Boolean).join(" · ") || i18n?.t("Missing normalized route details"))}</p></div><strong>${escapeHtml(fees)}</strong></article>`;
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
  setDrawerStatus(
    data?.status === "needs_clarification"
      ? `Matching needs clarification: ${(data.missing_fields || []).join(", ")}.`
      : `Matching complete: ${data?.match_count ?? state.matches.length} eligible routes. Review and select the routes manually.`,
    data?.status === "needs_clarification" ? "error" : "success",
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
  await enterApp(null);
});

elements.refreshButton.addEventListener("click", loadLeads);
elements.refreshSupplyButton.addEventListener("click", loadSupply);
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
elements.searchInput.addEventListener("input", renderLeads);
elements.statusFilter.addEventListener("change", renderLeads);
elements.closeDrawerButton.addEventListener("click", closeDrawer);
elements.drawerBackdrop.addEventListener("click", closeDrawer);
elements.saveLeadButton.addEventListener("click", saveLeadChanges);
elements.saveDossierButton.addEventListener("click", saveDossier);
elements.addNoteButton.addEventListener("click", addNote);
elements.addTaskButton.addEventListener("click", addTask);
elements.runMatchingButton.addEventListener("click", runMatching);
elements.createShortlistButton.addEventListener("click", createShortlist);
elements.shareShortlistButton.addEventListener("click", shareShortlist);
elements.sendAdminMessageButton.addEventListener("click", sendAdminMessage);
elements.dealDeskList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-deal-action]");
  if (button) handleDealDeskAction(button);
});
document.querySelectorAll("[data-workspace-target]").forEach((button) => {
  button.addEventListener("click", () => {
    document.getElementById(button.dataset.workspaceTarget)?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
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
  if (state.selectedLead) {
    renderProfile(state.selectedLead);
    renderActivities();
    renderTasks();
    renderMatches();
    renderRequestWorkspace();
    renderAdminMessages();
  }
  i18n?.translate();
});
document.querySelectorAll("[data-scroll]").forEach((button) => {
  button.addEventListener("click", () => {
    document.getElementById(button.dataset.scroll)?.scrollIntoView({ behavior: "smooth" });
    elements.sidebar.classList.remove("is-open");
  });
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && state.selectedLead) closeDrawer();
});

const { data: { session } } = await supabase.auth.getSession();
await enterApp(session);
supabase.auth.onAuthStateChange((event, nextSession) => {
  if (event === "SIGNED_OUT") enterApp(null);
  else if (event === "SIGNED_IN" && nextSession?.user && nextSession.user.id !== state.user?.id) enterApp(nextSession);
});
