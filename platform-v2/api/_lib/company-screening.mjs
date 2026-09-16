/** Evidence preparation only. Never a KYB, licence verification or clearance decision.
 * Keep this function self-contained: the existing n8n worker embeds the same tested code.
 */
export function buildCompanyScreening(lead = {}, website = {}, rdap = {}, now = new Date()) {
  const clean = (value, limit = 600) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, limit);
  const present = (value) => typeof value === "boolean" ? value : Array.isArray(value) ? value.some((item) => present(item)) :
    Boolean(clean(value) && !/^(unknown|not specified|n\/?a|none|нет|не указано|0|-)$/i.test(clean(value)));
  const decode = (value) => String(value).replace(/&(?:amp|quot|apos|lt|gt|nbsp);/gi, (entity) =>
    ({ "&amp;": "&", "&quot;": '"', "&apos;": "'", "&lt;": "<", "&gt;": ">", "&nbsp;": " " })[entity.toLowerCase()]);
  const text = (value) => clean(decode(String(value).replace(/<(script|style|noscript|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ").replace(/<[^>]+>/g, " ")), 60000);
  const parseUrl = (value) => {
    try {
      const raw = clean(value, 2000);
      if (!raw) return null;
      const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
      if (!/^https?:$/.test(url.protocol) || url.username || url.password) return null;
      url.hash = "";
      // Evidence URLs must not retain form tokens/query strings.
      url.search = "";
      return url;
    } catch { return null; }
  };
  const provider = "n8n-pre-compliance-v2";
  const checkedAt = new Date(now).toISOString();
  const source = parseUrl(lead.company_url);
  const domain = source?.hostname.toLowerCase().replace(/^www\./, "") || "";
  const emailDomain = clean(lead.work_email).split("@")[1]?.toLowerCase() || "";
  const freeMail = /^(gmail\.com|googlemail\.com|yahoo\.[a-z.]+|outlook\.com|hotmail\.com|icloud\.com|proton\.me|protonmail\.com|mail\.ru|yandex\.[a-z.]+)$/i.test(emailDomain);
  const domainMatches = Boolean(domain && emailDomain && (emailDomain === domain || emailDomain.endsWith(`.${domain}`)));
  const status = Number(website.statusCode || 0);
  const rawHtml = typeof website.body === "string" ? website.body.slice(0, 524288) : "";
  const websiteOk = status >= 200 && status < 300 && !website.error;
  const visibleText = websiteOk ? text(rawHtml) : "";
  const title = websiteOk ? text(rawHtml.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "").slice(0, 200) : "";
  const metaTags = websiteOk ? rawHtml.match(/<meta\b[^>]*>/gi) || [] : [];
  const metaDescription = metaTags.find((tag) => /(?:name|property)\s*=\s*["'](?:description|og:description)["']/i.test(tag));
  const description = text(metaDescription?.match(/\bcontent\s*=\s*(["'])(.*?)\1/i)?.[2] || "").slice(0, 500);
  const challenged = /just a moment|checking your browser|verify (?:that )?you are human|access denied|captcha/i.test(`${title} ${visibleText.slice(0, 400)}`);
  const contentUsable = websiteOk && !challenged && visibleText.length >= 80;
  const rdapStatus = Number(rdap.statusCode || 0);
  const rdapBody = rdap.body && typeof rdap.body === "object" ? rdap.body : {};
  const registration = !rdap.error && rdapStatus >= 200 && rdapStatus < 300 && Array.isArray(rdapBody.events)
    ? rdapBody.events.find((event) => /^(registration|registered)$/i.test(event.eventAction || "")) : null;
  const registered = registration?.eventDate ? Date.parse(registration.eventDate) : NaN;
  const age = Number.isFinite(registered) && registered <= new Date(now).valueOf()
    ? Math.floor((new Date(now).valueOf() - registered) / 86400000) : null;
  const checks = [];
  const flags = [];
  const add = (key, checkStatus, heading, detail, sourceUrl = null, evidence = {}) => checks.push({
    check_key: key, status: checkStatus, title: heading, detail, source_url: sourceUrl,
    evidence, provider, checked_at: checkedAt,
  });
  add("website", contentUsable ? "passed" : "unknown", "Доступность сайта",
    contentUsable ? `HTTP ${status}; получен текст страницы.` :
      !source ? "Сайт компании не указан. Почтовый сервис не используется вместо сайта компании." :
        challenged ? "Сайт вернул защитную страницу; содержимое компании не проверено." :
          `Содержимое не получено или недостаточно: HTTP ${status || "нет ответа"}. Это не вывод о добросовестности компании.`, source?.href,
    { http_status: status || null, title, description, content_available: contentUsable,
      fetch_error: typeof website.error === "string" && /^[a-z_]{1,40}$/.test(website.error) ? website.error : website.error ? "fetch_failed" : null,
      final_url: parseUrl(website.final_url)?.href || null });
  add("domain_registration", age === null ? "unknown" : age < 30 ? "warning" : "passed", "Возраст домена",
    age === null ? "Дата регистрации не получена; возраст домена неизвестен." : `По RDAP: ${age} дней. Возраст не подтверждает юридическую компанию.`,
    domain ? `https://rdap.org/domain/${encodeURIComponent(domain)}` : null, { age_days: age });
  add("email_domain", !domain || !emailDomain ? "unknown" : domainMatches ? "passed" : "warning", "Почта и домен",
    domainMatches ? "Почта совпадает с доменом сайта; владение компанией этим не подтверждено." :
      freeMail ? "Указана общедоступная почта; нужен контакт компании." : "Совпадение доменов не подтверждено.");
  if (!contentUsable) flags.push({ key: "website_evidence_unavailable", title: "Сайт не проверен; требуется повторная или ручная проверка" });
  if (age !== null && age < 30) flags.push({ key: "young_domain", title: "Домен зарегистрирован менее 30 дней назад", days: age });
  if (freeMail) flags.push({ key: "free_email", title: "Общедоступная почта" });
  else if (domain && emailDomain && !domainMatches) flags.push({ key: "email_domain_mismatch", title: "Разные домены почты и сайта" });

  const details = clean(lead.details, 12000);
  const positioning = contentUsable ? `${title} ${description} ${visibleText.slice(0, 2500)}` : "";
  const explicitProvider = /\b(?:we (?:are|provide|offer)|our (?:platform|company|solution))\b[^.!?]{0,100}\b(?:payment gateway|payment orchestration|payment processing|acquiring)\b/i.test(positioning);
  const explicitAgent = /\b(?:we represent|representing|our clients|referral partner|sub[- ]?agent)\b/i.test(details);
  const classification = explicitAgent ? "subagent" : explicitProvider ? "psp" :
    /^(merchant|subagent|psp|consultant|other)$/.test(lead.existing_classification || "") ? lead.existing_classification : "unknown";
  const companyTerms = clean(lead.company).toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((term) => term.length > 3 && !["limited", "company", "holdings", "group"].includes(term));
  const nameMentioned = contentUsable && companyTerms.some((term) => positioning.toLowerCase().includes(term));
  add("company_identity", nameMentioned ? "warning" : "unknown", "Идентичность компании",
    `${title ? `Заголовок: ${title}. ` : ""}${nameMentioned ? "Название заявителя встречается на сайте. Юридическое лицо и полномочия заявителя ещё не подтверждены." : "Совпадение заявителя и компании на сайте не установлено."}`, source?.href,
    { submitted_company: clean(lead.company), page_title: title, description, identity_verified: false });
  add("applicant_role", explicitAgent || explicitProvider ? "warning" : "unknown", "Роль заявителя",
    explicitAgent ? "В заявке есть признаки представителя мерчантов; необходимо подтвердить полномочия." :
      explicitProvider ? "На сайте есть позиционирование платёжного провайдера; требуется ручное подтверждение." :
        "Роль не подтверждена автоматически. Поиск PSP не означает, что заявитель сам является PSP.", source?.href,
    { suggested_classification: classification, verified: false });

  const licenceExcerpt = contentUsable ? visibleText.match(/[^.!?]{0,100}\b(?:licen[cs](?:e|ed|ing)|regulated by|licence number)\b[^.!?]{0,180}/i)?.[0] : null;
  add("licence_claim", licenceExcerpt ? "warning" : "unknown", "Лицензия — публичное заявление",
    licenceExcerpt ? `Заявление на сайте: «${clean(licenceExcerpt, 280)}». Реестр регулятора и соответствие юрлицу НЕ проверены.` : "Подтверждённая лицензия не получена. Отсутствие упоминания на странице не означает отсутствия лицензии.", source?.href,
    { excerpt: clean(licenceExcerpt), licence_verified: false });
  add("sanctions_adverse_media", "unknown", "Санкции и негативные публикации", "Проверка по внешним базам в этом проходе не выполнялась. Требуется отдельная проверка.");
  const missing = [];
  const need = (condition, label) => { if (!condition) missing.push(label); };
  need(present(lead.company), "Юридическое лицо и регистрационные данные");
  need(Boolean(source), "Сайт компании / продукта");
  need(present(lead.work_email) || present(lead.telegram), "Контакт представителя");
  need(present(lead.vertical), "Вертикаль бизнеса");
  need(present(lead.target_geos) || present(lead.geos), "Целевые GEO");
  need(present(lead.requested_methods) || present(lead.methods), "Платёжные методы");
  need(present(lead.expected_monthly_volume) || present(lead.monthly_volume), "Ожидаемый месячный объём");
  need(present(lead.requested_currencies), "Валюты обработки");
  need(present(lead.requested_flows) || /\bpay[ -]?(?:in|out)\b/i.test(details), "Требования PayIn / PayOut");
  // An occurrence of the word licence is not evidence, especially 'no licence'.
  const licenceSupplied = lead.license_status === "licensed" && present(lead.license_jurisdiction) && present(lead.license_number) && Boolean(parseUrl(lead.license_evidence_url));
  const licenceNotApplicableClaimed = lead.license_status === "not_required" && present(lead.qualification_notes);
  const completeness = Math.round((9 - missing.length + (licenceSupplied || licenceNotApplicableClaimed ? 1 : 0)) / 11 * 100);
  need(licenceSupplied || licenceNotApplicableClaimed, "Лицензия, юрисдикция и ссылка на реестр либо обоснование неприменимости");
  missing.push("Подтверждение юридического лица и полномочий представителя");
  if (classification === "subagent") missing.push("Мерчанты, их сайты и полномочия представителя по каждому");
  add("dossier_completeness", missing.length ? "warning" : "passed", "Полнота досье",
    `Требуют уточнения: ${missing.join("; ")}.`, null, { missing_information: missing });
  const nextAction = !contentUsable ? "Уточнить сайт и недостающие данные, затем повторить проверку." : "Проверить юридическое лицо и лицензию, подготовить запрос недостающих данных.";
  return {
    classification,
    authenticity_score: null,
    compliance_readiness_score: completeness,
    commercial_value_score: null,
    completeness_score: completeness,
    risk_level: "unknown",
    confidence: null,
    summary: `Первичный сбор фактов ${contentUsable ? "выполнен" : "неполон"}. ${title ? `Сайт: ${title}. ` : ""}${nextAction} Это не KYB, не подтверждение лицензии и не решение о допуске.`,
    missing_information: missing,
    red_flags: [],
    yellow_flags: flags,
    source_links: [source ? { kind: "website", url: source.href } : null, domain ? { kind: "registry", url: `https://rdap.org/domain/${encodeURIComponent(domain)}` } : null].filter(Boolean),
    checks,
    screening_provider: provider,
    screened_at: checkedAt,
  };
}
