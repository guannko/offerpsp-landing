const OFFERPSP_CONTACT_EMAIL = "bizdev@offerpsp.com";

const contactDialog = document.createElement("dialog");
contactDialog.className = "contact-dialog";
contactDialog.setAttribute("aria-labelledby", "contactDialogTitle");
contactDialog.innerHTML = `
  <section class="contact-dialog-card">
    <button class="contact-dialog-close" type="button" aria-label="Close contact window">×</button>
    <p class="contact-dialog-kicker">OfferPSP contact</p>
    <h2 id="contactDialogTitle">Let’s discuss working together.</h2>
    <p class="contact-dialog-copy">For partnership enquiries, contact the OfferPSP team at the email address below.</p>
    <p class="contact-dialog-address"><span>Email</span><strong>${OFFERPSP_CONTACT_EMAIL}</strong></p>
    <p class="contact-dialog-subject">Suggested subject: <span></span></p>
    <div class="contact-dialog-actions">
      <button class="contact-dialog-action contact-dialog-action-primary contact-dialog-action-wide" type="button" data-copy-contact>Copy email address</button>
      <a class="contact-dialog-action" data-open-gmail target="_blank" rel="noopener noreferrer">Open Gmail</a>
      <a class="contact-dialog-action" data-open-outlook target="_blank" rel="noopener noreferrer">Open Outlook Web</a>
    </div>
    <p class="contact-dialog-status" role="status" aria-live="polite"></p>
  </section>
`;
document.body.append(contactDialog);

const closeButton = contactDialog.querySelector(".contact-dialog-close");
const copyButton = contactDialog.querySelector("[data-copy-contact]");
const gmailLink = contactDialog.querySelector("[data-open-gmail]");
const outlookLink = contactDialog.querySelector("[data-open-outlook]");
const subjectText = contactDialog.querySelector(".contact-dialog-subject span");
const statusText = contactDialog.querySelector(".contact-dialog-status");
let contactDialogTrigger = null;

const copyContactEmail = async () => {
  try {
    await navigator.clipboard.writeText(OFFERPSP_CONTACT_EMAIL);
  } catch {
    const helper = document.createElement("textarea");
    helper.className = "contact-copy-helper";
    helper.value = OFFERPSP_CONTACT_EMAIL;
    helper.setAttribute("readonly", "");
    document.body.append(helper);
    helper.select();
    document.execCommand("copy");
    helper.remove();
  }
  statusText.textContent = "Email address copied.";
  copyButton.textContent = "Copied";
};

const openContactDialog = (trigger) => {
  contactDialogTrigger = trigger;
  const subject = trigger.dataset.contactSubject || "OfferPSP enquiry";
  const encodedEmail = encodeURIComponent(OFFERPSP_CONTACT_EMAIL);
  const encodedSubject = encodeURIComponent(subject);
  subjectText.textContent = subject;
  gmailLink.href = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodedEmail}&su=${encodedSubject}`;
  outlookLink.href = `https://outlook.office.com/mail/deeplink/compose?to=${encodedEmail}&subject=${encodedSubject}`;
  statusText.textContent = "";
  copyButton.textContent = "Copy email address";
  contactDialog.showModal();
  closeButton.focus();
};

document.querySelectorAll("[data-contact-dialog]").forEach((trigger) => {
  trigger.addEventListener("click", (event) => {
    event.preventDefault();
    openContactDialog(trigger);
  });
});

copyButton.addEventListener("click", copyContactEmail);
closeButton.addEventListener("click", () => contactDialog.close());
contactDialog.addEventListener("click", (event) => {
  if (event.target === contactDialog) contactDialog.close();
});
contactDialog.addEventListener("close", () => contactDialogTrigger?.focus());

const isRussian = document.documentElement.lang.toLowerCase().startsWith("ru");
const conciergeCopy = isRussian ? {
  launch: "Спросить OfferPSP",
  kicker: "Консультант OfferPSP",
  title: "Чем можем помочь?",
  status: "Онлайн · публичная информация",
  greeting: "Здравствуйте! Я могу рассказать, как работает OfferPSP, что подготовить для заявки и как связаться с командой. Подбор PSP и офферов выполняется только в личном кабинете.",
  placeholder: "Напишите ваш вопрос…",
  send: "Отправить",
  privacy: "Не отправляйте пароли, платёжные данные и документы в чат.",
  request: "Запросить подбор",
  human: "Связаться с Борисом",
  error: "Сейчас я не могу ответить. Оставьте заявку или напишите на bizdev@offerpsp.com.",
  thinking: "Проверяю…",
  quick: ["Как работает OfferPSP?", "Что подготовить для заявки?", "Как стать партнёром?"],
} : {
  launch: "Ask OfferPSP",
  kicker: "OfferPSP concierge",
  title: "How can we help?",
  status: "Online · public information",
  greeting: "Hello! I can explain how OfferPSP works, what to prepare for a request and how to contact the team. PSP and offer matching happens only in the private workspace.",
  placeholder: "Ask your question…",
  send: "Send",
  privacy: "Do not share passwords, payment data or documents in chat.",
  request: "Request a private match",
  human: "Talk to Boris",
  error: "I cannot answer just now. Please submit a request or email bizdev@offerpsp.com.",
  thinking: "Checking…",
  quick: ["How does OfferPSP work?", "What should I prepare?", "How can a PSP partner with you?"],
};

const conciergeButton = document.createElement("button");
conciergeButton.className = "concierge-launch";
conciergeButton.type = "button";
conciergeButton.setAttribute("aria-haspopup", "dialog");
conciergeButton.setAttribute("aria-label", conciergeCopy.launch);
conciergeButton.innerHTML = `<span class="concierge-launch-dot" aria-hidden="true"></span><span>${conciergeCopy.launch}</span>`;

const conciergeDialog = document.createElement("dialog");
conciergeDialog.className = "concierge-dialog";
conciergeDialog.setAttribute("aria-labelledby", "conciergeDialogTitle");
conciergeDialog.innerHTML = `
  <section class="concierge-card">
    <header class="concierge-head">
      <div class="concierge-mark" aria-hidden="true">OP</div>
      <div>
        <p>${conciergeCopy.kicker}</p>
        <h2 id="conciergeDialogTitle">${conciergeCopy.title}</h2>
        <span><i aria-hidden="true"></i>${conciergeCopy.status}</span>
      </div>
      <button class="concierge-close" type="button" aria-label="Close concierge">×</button>
    </header>
    <div class="concierge-log" role="log" aria-live="polite" aria-relevant="additions"></div>
    <div class="concierge-quick" aria-label="Suggested questions"></div>
    <form class="concierge-form">
      <label class="concierge-input-label" for="conciergeInput">${conciergeCopy.placeholder}</label>
      <div class="concierge-input-row">
        <textarea id="conciergeInput" rows="1" maxlength="1200" required placeholder="${conciergeCopy.placeholder}"></textarea>
        <button type="submit">${conciergeCopy.send}</button>
      </div>
    </form>
    <div class="concierge-handoff">
      <a href="/#request" data-concierge-request>${conciergeCopy.request}</a>
      <button type="button" data-concierge-human>${conciergeCopy.human}</button>
    </div>
    <p class="concierge-privacy">${conciergeCopy.privacy}</p>
  </section>`;

document.body.append(conciergeButton, conciergeDialog);

const conciergeLog = conciergeDialog.querySelector(".concierge-log");
const conciergeQuick = conciergeDialog.querySelector(".concierge-quick");
const conciergeForm = conciergeDialog.querySelector(".concierge-form");
const conciergeInput = conciergeDialog.querySelector("#conciergeInput");
const conciergeSend = conciergeForm.querySelector("button[type='submit']");
const conciergeClose = conciergeDialog.querySelector(".concierge-close");
const conciergeHuman = conciergeDialog.querySelector("[data-concierge-human]");
const conciergeRequest = conciergeDialog.querySelector("[data-concierge-request]");
const conciergeHistory = [];

const conciergeFlowId = (() => {
  try {
    const current = sessionStorage.getItem("offerpsp_flow_id");
    if (current) return current;
    const created = crypto.randomUUID();
    sessionStorage.setItem("offerpsp_flow_id", created);
    return created;
  } catch {
    return crypto.randomUUID();
  }
})();

const trackConcierge = (eventName, placement) => {
  void fetch("/api/acquisition-event", {
    method: "POST",
    credentials: "omit",
    keepalive: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      event_name: eventName,
      flow_id: conciergeFlowId,
      page_path: window.location.pathname,
      placement,
      is_qa: !/^(?:www\.)?offerpsp\.com$/i.test(window.location.hostname),
    }),
  }).catch(() => {});
};

const addConciergeMessage = (role, content, pending = false) => {
  const item = document.createElement("div");
  item.className = `concierge-message concierge-message-${role}${pending ? " is-pending" : ""}`;
  item.textContent = content;
  conciergeLog.append(item);
  conciergeLog.scrollTop = conciergeLog.scrollHeight;
  return item;
};

addConciergeMessage("assistant", conciergeCopy.greeting);
conciergeCopy.quick.forEach((question) => {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = question;
  button.addEventListener("click", () => {
    conciergeInput.value = question;
    conciergeForm.requestSubmit();
  });
  conciergeQuick.append(button);
});

const rememberConciergeContext = () => {
  try {
    const context = conciergeHistory.slice(-6).map((entry) => `${entry.role}: ${entry.content}`).join("\n").slice(0, 2800);
    if (context) sessionStorage.setItem("offerpsp_concierge_context", context);
  } catch {
    // Session storage may be unavailable in privacy-restricted browsers.
  }
};

const openHumanHandoff = () => {
  rememberConciergeContext();
  trackConcierge("concierge_handoff", "talk_to_boris");
  const localTrigger = document.querySelector("[data-open-lead-modal]");
  if (localTrigger) {
    conciergeDialog.close();
    localTrigger.click();
    return;
  }
  window.location.href = "/?from=concierge#request";
};

conciergeButton.addEventListener("click", () => {
  trackConcierge("concierge_open", "floating_button");
  conciergeDialog.showModal();
  requestAnimationFrame(() => conciergeInput.focus());
});
conciergeClose.addEventListener("click", () => conciergeDialog.close());
conciergeDialog.addEventListener("click", (event) => {
  if (event.target === conciergeDialog) conciergeDialog.close();
});
conciergeDialog.addEventListener("close", () => conciergeButton.focus());
conciergeHuman.addEventListener("click", openHumanHandoff);
conciergeRequest.addEventListener("click", () => {
  rememberConciergeContext();
  trackConcierge("concierge_handoff", "private_match");
});

conciergeForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = conciergeInput.value.trim();
  if (message.length < 2 || conciergeSend.disabled) return;
  const previousHistory = conciergeHistory.slice(-6);
  addConciergeMessage("user", message);
  conciergeHistory.push({ role: "user", content: message });
  conciergeInput.value = "";
  conciergeInput.style.height = "auto";
  conciergeSend.disabled = true;
  conciergeQuick.hidden = true;
  trackConcierge("concierge_message", "chat_input");
  const pending = addConciergeMessage("assistant", conciergeCopy.thinking, true);
  try {
    const response = await fetch("/api/public-concierge", {
      method: "POST",
      credentials: "omit",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, history: previousHistory, page: window.location.pathname }),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || result?.success !== true || !result.answer) throw new Error("Unconfirmed response");
    pending.remove();
    addConciergeMessage("assistant", result.answer);
    conciergeHistory.push({ role: "assistant", content: String(result.answer).slice(0, 2400) });
  } catch {
    pending.remove();
    addConciergeMessage("assistant", conciergeCopy.error);
  } finally {
    conciergeSend.disabled = false;
    conciergeInput.focus();
  }
});

conciergeInput.addEventListener("input", () => {
  conciergeInput.style.height = "auto";
  conciergeInput.style.height = `${Math.min(conciergeInput.scrollHeight, 112)}px`;
});
