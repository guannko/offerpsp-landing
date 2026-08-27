const OFFERPSP_CONTACT_EMAIL = "bizdev@offerpsp.com";

const contactDialog = document.createElement("dialog");
contactDialog.className = "contact-dialog";
contactDialog.setAttribute("aria-labelledby", "contactDialogTitle");
contactDialog.innerHTML = `
  <section class="contact-dialog-card">
    <button class="contact-dialog-close" type="button" aria-label="Close contact window">×</button>
    <p class="contact-dialog-kicker">OfferPSP contact</p>
    <h2 id="contactDialogTitle">Write from the email service you already use.</h2>
    <p class="contact-dialog-copy">Copy the address or open a browser-based inbox. We will not launch a mail application on your device.</p>
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
