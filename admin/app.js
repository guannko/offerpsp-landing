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
  leads: [],
  selectedLead: null,
  activities: [],
  tasks: [],
  matches: [],
  shortlists: [],
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
  profileDetails: document.getElementById("profileDetails"),
  runMatchingButton: document.getElementById("runMatchingButton"),
  shareShortlistButton: document.getElementById("shareShortlistButton"),
  matchSummary: document.getElementById("matchSummary"),
  matchesList: document.getElementById("matchesList"),
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
    await Promise.all([loadLeads(), loadSupply()]);
  } catch (error) {
    setAuthStatus(error.message || "Could not verify access.", "error");
    elements.appView.classList.add("is-hidden");
    elements.authView.classList.remove("is-hidden");
  }
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

async function openLead(leadId) {
  const lead = state.leads.find((item) => item.lead_id === leadId);
  if (!lead) return;

  state.selectedLead = lead;
  state.activities = [];
  state.tasks = [];
  state.matches = [];
  state.shortlists = [];
  state.conversationId = null;
  state.messages = [];
  elements.drawerCompany.textContent = cleanText(lead.company);
  elements.drawerContact.textContent = `${cleanText(lead.name)} · ${cleanText(lead.work_email)}`;
  elements.drawerLeadId.textContent = lead.lead_id.slice(0, 8);
  elements.drawerStatus.value = lead.status || "new";
  elements.drawerScore.value = lead.quality_score ?? "";
  elements.drawerGrade.value = lead.quality_grade || "";
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
    loadAdminConversation(leadId),
  ]);
}

function closeDrawer() {
  elements.leadDrawer.classList.remove("is-open");
  elements.leadDrawer.setAttribute("aria-hidden", "true");
  elements.drawerBackdrop.classList.add("is-hidden");
  document.body.style.overflow = "";
  state.selectedLead = null;
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
  elements.matchSummary.textContent = state.matches.length
    ? `${state.matches.length} candidates · ${currentShortlist?.status === "shared" ? "shortlist shared" : currentShortlist ? "draft shortlist ready" : "review eligible routes"}`
    : "No candidates generated yet";
  elements.shareShortlistButton.classList.toggle(
    "is-hidden",
    !currentShortlist || currentShortlist.status === "shared",
  );

  if (!state.matches.length) {
    elements.matchesList.innerHTML = '<p class="form-status">Run matching to compare this request with the PSP database.</p>';
    return;
  }

  elements.matchesList.innerHTML = state.matches.slice(0, 5).map((match, index) => {
    const strengths = Array.isArray(match.strengths) ? match.strengths.join(" · ") : "";
    return `
      <article class="match-card">
        <span class="match-rank">#${index + 1}</span>
        <div class="match-info">
          <strong>${escapeHtml(cleanText(match.provider_name))} · ${escapeHtml(cleanText(match.client_title))}</strong>
          <p>${escapeHtml(strengths || "Manual verification required")}</p>
        </div>
        <span class="match-score">${escapeHtml(match.score)}</span>
      </article>
    `;
  }).join("");
}

async function loadShortlists(leadId) {
  const { data, error } = await supabase
    .from("offerpsp_shortlists")
    .select("id, lead_id, version, title, status, shared_at, created_at")
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

  if ((data?.match_count || 0) > 0) {
    const { data: matches, error: matchesError } = await supabase.rpc("list_offerpsp_route_matches", {
      p_lead_id: state.selectedLead.lead_id,
    });
    if (matchesError) {
      setButtonLoading(elements.runMatchingButton, false);
      setDrawerStatus(matchesError.message, "error");
      return;
    }

    const selectedMatchIds = (matches || []).slice(0, 5).map((match) => match.match_id);
    const { error: shortlistError } = await supabase.rpc("create_offerpsp_route_shortlist", {
      p_lead_id: state.selectedLead.lead_id,
      p_route_match_ids: selectedMatchIds,
      p_title: "Recommended payment routes",
      p_introduction: "These anonymous options passed the current eligibility checks and were reviewed by OfferPSP.",
    });
    if (shortlistError) {
      setButtonLoading(elements.runMatchingButton, false);
      setDrawerStatus(shortlistError.message, "error");
      return;
    }
  }

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
      : `Matching complete: ${data?.match_count ?? state.matches.length} eligible routes.`,
    "success",
  );
}

async function shareShortlist() {
  const shortlist = state.shortlists[0];
  if (!shortlist || !state.selectedLead) return;

  setButtonLoading(elements.shareShortlistButton, true, "Sharing…");
  setDrawerStatus();
  const { error } = await supabase.rpc("share_offerpsp_shortlist", {
    p_shortlist_id: shortlist.id,
  });

  if (error) {
    setButtonLoading(elements.shareShortlistButton, false);
    setDrawerStatus(error.message, "error");
    return;
  }

  await Promise.all([
    loadShortlists(state.selectedLead.lead_id),
    loadActivities(state.selectedLead.lead_id),
    loadLeads(),
  ]);
  setButtonLoading(elements.shareShortlistButton, false);
  setDrawerStatus("Shortlist shared in the client cabinet.", "success");
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
  const updates = {
    status: elements.drawerStatus.value,
    quality_score: score,
    quality_grade: elements.drawerGrade.value || null,
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
    },
  });

  state.selectedLead = data;
  state.leads = state.leads.map((lead) => lead.lead_id === data.lead_id ? data : lead);
  renderStats();
  renderLeads();
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
elements.addNoteButton.addEventListener("click", addNote);
elements.addTaskButton.addEventListener("click", addTask);
elements.runMatchingButton.addEventListener("click", runMatching);
elements.shareShortlistButton.addEventListener("click", shareShortlist);
elements.sendAdminMessageButton.addEventListener("click", sendAdminMessage);
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
  if (event === "SIGNED_OUT") {
    enterApp(null);
  } else if (event === "SIGNED_IN" && nextSession?.user && nextSession.user.id !== state.user?.id) {
    enterApp(nextSession);
  }
});
