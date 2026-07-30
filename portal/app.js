import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const supabase = createClient(
  "https://xcizofpejsomjiflesbx.supabase.co",
  "sb_publishable_8VDTb7EC6ZGATqgMZZgghA_95pAushW",
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
);

const MESSAGE_NOTIFICATION_ENDPOINT =
  "https://annoris--n8n-make--xjvz9xynmzwk.code.run/webhook/offerpsp-portal-message-v1";

const STATUS = {
  new: ["Request received", 25],
  reviewing: ["Qualification", 38],
  qualifying: ["Qualification", 38],
  qualified: ["Qualified", 50],
  matching: ["PSP matching", 65],
  matched: ["PSP matching", 65],
  shortlist_ready: ["Shortlist review", 75],
  shared: ["Introductions ready", 88],
  negotiating: ["Introductions active", 94],
  won: ["Completed", 100],
  closed: ["Completed", 100],
  lost: ["Closed", 100],
};

const state = {
  user: null,
  lead: null,
  conversationId: null,
  messages: [],
};

const elements = Object.fromEntries([
  "authView", "portalView", "loginForm", "emailInput", "passwordInput",
  "googleLoginButton", "magicLinkButton", "authStatus", "signOutButton", "userEmail",
  "noRequestState", "requestView", "companyName", "requestMeta", "statusPill",
  "progressLabel", "progressFill", "shortlistPending", "shortlistGrid",
  "shortlistUpdated", "messageList", "messageForm", "messageInput", "messageStatus",
].map((id) => [id, document.getElementById(id)]));

function setStatus(element, message = "", type = "") {
  element.textContent = message;
  element.className = `status${type ? ` ${type}` : ""}`;
}

function setLoading(button, loading, label) {
  if (!button.dataset.label) button.dataset.label = button.textContent;
  button.disabled = loading;
  button.textContent = loading ? label : button.dataset.label;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

async function enterPortal(session) {
  if (!session?.user) {
    state.user = null;
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
  const { data, error } = await supabase
    .from("offerpsp_leads")
    .select("lead_id, company, vertical, geos, methods, monthly_volume, status, submitted_at, updated_at")
    .order("submitted_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    elements.noRequestState.classList.remove("is-hidden");
    elements.requestView.classList.add("is-hidden");
    return;
  }

  if (!data) {
    elements.noRequestState.classList.remove("is-hidden");
    elements.requestView.classList.add("is-hidden");
    return;
  }

  state.lead = data;
  elements.noRequestState.classList.add("is-hidden");
  elements.requestView.classList.remove("is-hidden");
  elements.companyName.textContent = data.company;
  elements.requestMeta.textContent = [data.vertical, data.geos, data.monthly_volume].filter(Boolean).join(" · ");

  const [label, percent] = STATUS[data.status] || ["In review", 35];
  elements.statusPill.textContent = label;
  elements.progressLabel.textContent = label;
  elements.progressFill.style.width = `${percent}%`;

  await Promise.all([
    loadShortlist(data.lead_id),
    loadConversation(data.lead_id),
  ]);
}

async function loadShortlist(leadId) {
  const { data, error } = await supabase
    .from("offerpsp_client_shortlist")
    .select("*")
    .eq("lead_id", leadId)
    .order("rank", { ascending: true });

  if (error || !data?.length) {
    elements.shortlistPending.classList.remove("is-hidden");
    elements.shortlistGrid.classList.add("is-hidden");
    return;
  }

  elements.shortlistPending.classList.add("is-hidden");
  elements.shortlistGrid.classList.remove("is-hidden");
  elements.shortlistUpdated.textContent = data[0].shared_at
    ? `Shared ${formatDate(data[0].shared_at)}`
    : "";
  elements.shortlistGrid.innerHTML = data.map((item) => {
    return `
      <article class="psp-card">
        <div class="psp-card-head">
          <div>
            <span class="psp-rank">OfferPSP option ${escapeHtml(item.rank)}</span>
            <h3>${escapeHtml(item.option_code)}</h3>
          </div>
        </div>
        <p>${escapeHtml(item.client_note)}</p>
        <div class="psp-tags">
          <span>Confidential partner route</span>
        </div>
      </article>
    `;
  }).join("");
}

async function loadConversation(leadId) {
  const { data: conversationId, error } = await supabase.rpc(
    "ensure_offerpsp_portal_conversation",
    { p_lead_id: leadId },
  );

  if (error) {
    setStatus(elements.messageStatus, error.message, "error");
    return;
  }

  state.conversationId = conversationId;
  await loadMessages();
}

async function loadMessages() {
  if (!state.conversationId) return;
  const { data, error } = await supabase
    .from("offerpsp_messages")
    .select("id, sender_type, direction, body, sent_at")
    .eq("conversation_id", state.conversationId)
    .order("sent_at", { ascending: true });

  if (error) {
    setStatus(elements.messageStatus, error.message, "error");
    return;
  }

  state.messages = data || [];
  if (!state.messages.length) {
    elements.messageList.innerHTML = '<p class="status">No messages yet. Use this channel for questions and updates.</p>';
    return;
  }

  elements.messageList.innerHTML = state.messages.map((message) => `
    <article class="message${message.sender_type === "client" ? " client" : ""}">
      ${escapeHtml(message.body)}
      <small>${escapeHtml(formatDate(message.sent_at))}</small>
    </article>
  `).join("");
  elements.messageList.scrollTop = elements.messageList.scrollHeight;
}

elements.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = elements.emailInput.value.trim();
  const password = elements.passwordInput.value;
  const button = elements.loginForm.querySelector('button[type="submit"]');
  if (!password) {
    setStatus(elements.authStatus, "Enter your password or use a secure login link.", "error");
    return;
  }

  setLoading(button, true, "Signing in…");
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  setLoading(button, false);
  if (error) {
    setStatus(elements.authStatus, error.message, "error");
    return;
  }
  await enterPortal(data.session);
});

elements.magicLinkButton.addEventListener("click", async () => {
  const email = elements.emailInput.value.trim();
  if (!email) {
    setStatus(elements.authStatus, "Enter your work email first.", "error");
    return;
  }

  setLoading(elements.magicLinkButton, true, "Sending…");
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${window.location.origin}/portal/`,
      shouldCreateUser: true,
    },
  });
  setLoading(elements.magicLinkButton, false);
  setStatus(
    elements.authStatus,
    error ? error.message : "Secure link sent. Check your inbox.",
    error ? "error" : "success",
  );
});

elements.googleLoginButton.addEventListener("click", async () => {
  setLoading(elements.googleLoginButton, true, "Opening Google…");
  setStatus(elements.authStatus);
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${window.location.origin}/portal/`,
    },
  });

  if (error) {
    setLoading(elements.googleLoginButton, false);
    setStatus(elements.authStatus, error.message, "error");
  }
});

elements.messageForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!state.conversationId) return;
  const body = elements.messageInput.value.trim();
  if (!body) return;
  const button = elements.messageForm.querySelector("button");
  setLoading(button, true, "Sending…");

  const { error } = await supabase.from("offerpsp_messages").insert({
    conversation_id: state.conversationId,
    sender_type: "client",
    sender_user_id: state.user.id,
    direction: "inbound",
    body,
  });

  setLoading(button, false);
  if (error) {
    setStatus(elements.messageStatus, error.message, "error");
    return;
  }

  try {
    await fetch(MESSAGE_NOTIFICATION_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        company: state.lead?.company || "OfferPSP client",
        sender_email: state.user.email,
        message: body,
      }),
    });
  } catch {
    // The message is already saved. A notification failure must not lose client data.
  }

  elements.messageInput.value = "";
  setStatus(elements.messageStatus, "Message sent.", "success");
  await loadMessages();
});

elements.signOutButton.addEventListener("click", async () => {
  await supabase.auth.signOut();
  await enterPortal(null);
});

const { data: { session } } = await supabase.auth.getSession();
await enterPortal(session);

supabase.auth.onAuthStateChange((event, nextSession) => {
  if (event === "SIGNED_OUT") {
    enterPortal(null);
  } else if (event === "SIGNED_IN" && nextSession?.user && nextSession.user.id !== state.user?.id) {
    enterPortal(nextSession);
  }
});
