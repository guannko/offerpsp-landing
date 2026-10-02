// Auth callback errors are presentation only; never treat URL data as a session.
export function readPortalAuthCallbackError(href) {
  const url = new URL(href);
  const fragment = new URLSearchParams(url.hash.slice(1));
  const params = fragment.has("error") || fragment.has("error_code") ? fragment : url.searchParams;
  if (!params.has("error") && !params.has("error_code")) return null;
  return { code: params.get("error_code") === "otp_expired" ? "otp_expired" : "auth_callback_failed" };
}

export function portalAuthErrorMessage(error, language = "ru") {
  const message = String(error?.message || "").toLowerCase();
  if (error?.code === "otp_expired" || message.includes("expired") || message.includes("invalid token")) {
    return language === "ru"
      ? "Ссылка для входа недействительна или истекла. Она одноразовая: введите рабочий email и запросите новую ссылку. Откройте только последнее письмо «Ваша ссылка для входа в OfferPSP готова»."
      : "This sign-in link is invalid or has expired. Links can only be used once. Enter your work email and request a new link, then open only the latest sign-in email.";
  }
  if (message.includes("rate limit")) return language === "ru"
    ? "Слишком много попыток. Подождите немного и запросите новую ссылку."
    : "Too many attempts. Wait a moment before requesting a new link.";
  return language === "ru" ? "Не удалось войти. Введите рабочий email и запросите новую ссылку." : "Could not sign in. Enter your work email and request a new link.";
}
