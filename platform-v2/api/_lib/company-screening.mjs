/** Evidence preparation only. Never a KYB, licence verification or clearance decision.
 * Keep this function self-contained: the existing n8n worker embeds the same tested code.
 */
export function buildCompanyScreening(lead = {}, website = {}, rdap = {}, now = new Date(), officialEvidence = {}) {
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
  const provider = "offerpsp-public-evidence-v5";
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
  const add = (key, checkStatus, heading, detail, sourceUrl = null, evidence = {}, evidenceLevel = "not_checked", sourceType = "none") => checks.push({
    check_key: key, status: checkStatus, title: heading, detail, source_url: sourceUrl,
    evidence, evidence_level: evidenceLevel, source_type: sourceType, provider, checked_at: checkedAt,
  });
  add("website", contentUsable ? "passed" : "unknown", "Доступность сайта",
    contentUsable ? `HTTP ${status}; получен текст страницы.` :
      !source ? "Сайт компании не указан. Почтовый сервис не используется вместо сайта компании." :
        challenged ? "Сайт вернул защитную страницу; содержимое компании не проверено." :
          `Содержимое не получено или недостаточно: HTTP ${status || "нет ответа"}. Это не вывод о добросовестности компании.`, source?.href,
    { http_status: status || null, title, description, content_available: contentUsable,
      fetch_error: typeof website.error === "string" && /^[a-z_]{1,40}$/.test(website.error) ? website.error : website.error ? "fetch_failed" : null,
      final_url: parseUrl(website.final_url)?.href || null }, contentUsable ? "observed" : source ? "unavailable" : "not_checked", "company_website");
  add("domain_registration", age === null ? "unknown" : age < 30 ? "warning" : "passed", "Возраст домена",
    age === null ? "Дата регистрации не получена; возраст домена неизвестен." : `По RDAP: ${age} дней. Возраст не подтверждает юридическую компанию.`,
    domain ? `https://rdap.org/domain/${encodeURIComponent(domain)}` : null, { age_days: age }, age === null ? domain ? "unavailable" : "not_checked" : "observed", "rdap_registry");
  add("email_domain", !domain || !emailDomain ? "unknown" : domainMatches ? "passed" : "warning", "Почта и домен",
    domainMatches ? "Почта совпадает с доменом сайта; владение компанией этим не подтверждено." :
      freeMail ? "Указана общедоступная почта; нужен контакт компании." : "Совпадение доменов не подтверждено.",
    null, {}, domain && emailDomain ? "computed" : "not_checked", "system_comparison");
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
    { submitted_company: clean(lead.company), page_title: title, description, identity_verified: false }, nameMentioned ? "inferred" : "not_checked", "company_website");
  add("applicant_role", explicitAgent || explicitProvider ? "warning" : "unknown", "Роль заявителя",
    explicitAgent ? "В заявке есть признаки представителя мерчантов; необходимо подтвердить полномочия." :
      explicitProvider ? "На сайте есть позиционирование платёжного провайдера; требуется ручное подтверждение." :
        "Роль не подтверждена автоматически. Поиск PSP не означает, что заявитель сам является PSP.", source?.href,
    { suggested_classification: classification, verified: false }, explicitAgent || explicitProvider ? "inferred" : "not_checked", "company_website_and_submission");

  const licenceExcerpt = contentUsable ? visibleText.match(/[^.!?]{0,100}\b(?:licen[cs](?:e|ed|ing)|regulated by|licence number)\b[^.!?]{0,180}/i)?.[0] : null;
  add("licence_claim", licenceExcerpt ? "warning" : "unknown", "Лицензия — публичное заявление",
    licenceExcerpt ? `Заявление на сайте: «${clean(licenceExcerpt, 280)}». Реестр регулятора и соответствие юрлицу НЕ проверены.` : "Подтверждённая лицензия не получена. Отсутствие упоминания на странице не означает отсутствия лицензии.", source?.href,
    { excerpt: clean(licenceExcerpt), licence_verified: false }, licenceExcerpt ? "claimed" : "not_checked", "company_website");
  const gamingLicence = officialEvidence?.gambling_licence || { outcome: "disabled", verified: false, regulator: null };
  const licenceAdverse = ["inactive_or_adverse_status", "not_found", "invalid_evidence_url"].includes(gamingLicence.outcome);
  const licenceObserved = ["verified_identifier_match", "verified_registry_match", "candidate_match", "inactive_or_adverse_status", "not_found"].includes(gamingLicence.outcome);
  const regulatorName = clean(gamingLicence.regulator || "регулятор", 40);
  const licenceDetail = gamingLicence.verified ?
    gamingLicence.public_licence_number === false ?
      `${regulatorName} подтвердил действующую запись, точное юридическое лицо и домен. Публичный реестр этого регулятора не публикует номер лицензии.` :
      `${regulatorName} подтвердил действующую лицензию, юридическое лицо, номер лицензии и домен.` :
    gamingLicence.outcome === "candidate_match" ? `${regulatorName}: официальный документ найден, но не все идентификаторы заявки совпали. Автоматическое подтверждение не выдано.` :
      gamingLicence.outcome === "inactive_or_adverse_status" ? `${regulatorName}: официальный источник показывает статус «${clean(gamingLicence.status || "неактивна")}». Требуется ручное решение до передачи PSP.` :
        gamingLicence.outcome === "not_found" ? `${regulatorName}: предоставленный официальный идентификатор не найден. Это требует уточнения, но само по себе не доказывает подделку.` :
          gamingLicence.outcome === "evidence_url_required" ? `${regulatorName}: для проверки нужна ссылка на официальный динамический сертификат регулятора.` :
            gamingLicence.outcome === "invalid_evidence_url" ? `${regulatorName}: предоставленная ссылка не ведёт на допустимый официальный домен или формат сертификата.` :
              gamingLicence.outcome === "unsupported_or_unspecified_regulator" ? "Регулятор не указан либо пока не поддерживается автоматическим коннектором." :
                gamingLicence.outcome === "unavailable" ? `${regulatorName}: официальный источник был недоступен; проверка не завершена.` :
                  gamingLicence.outcome === "not_applicable" ? "Заявление о лицензии азартных игр не обнаружено; проверка не применялась." : "Проверка реестра регулятора не включена.";
  add("gambling_licence_registry", gamingLicence.verified ? "passed" : licenceAdverse || gamingLicence.outcome === "candidate_match" ? "warning" : "unknown",
    "Лицензия азартных игр — официальный регулятор", licenceDetail, gamingLicence.source_url || null,
    { ...gamingLicence, verified: Boolean(gamingLicence.verified) }, gamingLicence.verified ? "verified" : licenceObserved ? "observed" :
      gamingLicence.outcome === "unavailable" ? "unavailable" : "not_checked",
    ({ MGA: "mga_authorisation", CGA: "cga_certificate", UKGC: "ukgc_register", GIBRALTAR: "gibraltar_gambling_register",
      IOM_GSC: "iom_gsc_register", KGC: "kahnawake_permit_holders", SGA: "swedish_gambling_register",
      ONTARIO: "ontario_igo_directory" })[gamingLicence.regulator] || "none");
  if (gamingLicence.outcome === "candidate_match") flags.push({ key: "gambling_licence_partial_match", title: "Официальная запись лицензии найдена, но идентификаторы совпали не полностью", regulator: gamingLicence.regulator || null });
  const gleif = officialEvidence?.gleif || { outcome: "disabled", verified: false };
  const gleifRecord = gleif.record && typeof gleif.record === "object" ? gleif.record : null;
  add("legal_entity_reference", gleif.verified ? "passed" : gleif.outcome === "candidate_match" ? "warning" : "unknown",
    "Юридическое лицо — GLEIF / LEI",
    gleif.verified ? `GLEIF подтвердил совпадение юридического названия и регистрационного номера: ${clean(gleifRecord?.legal_name)} (${clean(gleifRecord?.registered_as)}).` :
      gleif.outcome === "candidate_match" ? `В GLEIF найден кандидат «${clean(gleifRecord?.legal_name)}», но идентификаторов недостаточно для подтверждения юридического лица.` :
        gleif.outcome === "not_found" ? "Точное совпадение в GLEIF не найдено. Это не означает, что компания не существует: LEI есть не у всех юридических лиц." :
          gleif.outcome === "unavailable" ? "GLEIF был недоступен; проверка не завершена." : "Проверка GLEIF не включена.",
    gleifRecord?.source_url || gleif.source_url || null,
    { outcome: gleif.outcome || "disabled", match_basis: gleif.match_basis || "none", record: gleifRecord,
      candidate_count: Number.isFinite(Number(gleif.candidate_count)) ? Number(gleif.candidate_count) : null,
      golden_copy_published_at: gleif.golden_copy_published_at || null },
    gleif.verified ? "verified" : ["candidate_match", "not_found"].includes(gleif.outcome) ? "observed" : gleif.outcome === "unavailable" ? "unavailable" : "not_checked",
    "gleif_lei_registry");

  const sanctionsSources = Array.isArray(officialEvidence?.sanctions?.sources) ? officialEvidence.sanctions.sources : [];
  const exactSanctionsMatches = sanctionsSources.flatMap((item) => Array.isArray(item.matches) ? item.matches.map((match) => ({ source: item.source, ...match })) : []);
  const sanctionsChecked = sanctionsSources.filter((item) => ["exact_name_match", "no_exact_name_match"].includes(item.outcome));
  if (exactSanctionsMatches.length) flags.push({ key: "potential_sanctions_name_match", title: "Точное совпадение имени в санкционном списке требует ручной идентификации", count: exactSanctionsMatches.length });
  add("sanctions_screen", exactSanctionsMatches.length ? "warning" : "unknown", "Санкционные списки",
    exactSanctionsMatches.length ? `Найдено точных совпадений по имени: ${exactSanctionsMatches.length}. Это потенциальное совпадение, а не установленная идентичность; требуется ручная проверка идентификаторов.` :
      sanctionsChecked.length ? `Проверен список ООН; точных совпадений по переданным именам нет. Это не санкционный допуск и не покрытие всех юрисдикций.` :
        sanctionsSources.some((item) => item.outcome === "unavailable") ? "Санкционный источник был недоступен; проверка не завершена." : "Автоматическая санкционная проверка не включена.",
    sanctionsChecked[0]?.source_url || sanctionsSources[0]?.source_url || null,
    { coverage: officialEvidence?.sanctions?.coverage || "none", checked_sources: sanctionsChecked.map((item) => item.source),
      exact_name_matches: exactSanctionsMatches },
    sanctionsChecked.length ? "observed" : sanctionsSources.some((item) => item.outcome === "unavailable") ? "unavailable" : "not_checked",
    "official_sanctions_lists");
  add("adverse_media", "unknown", "Негативные публикации и enforcement",
    "Проверка adverse media, судебных и регуляторных событий в этом проходе не выполнялась.", null, {}, "not_checked", "none");
  const missing = [];
  // An occurrence of the word licence is not evidence, especially 'no licence'.
  const licenceSupplied = lead.license_status === "licensed" && present(lead.license_jurisdiction) && present(lead.license_number) && Boolean(parseUrl(lead.license_evidence_url));
  const licenceNotApplicableClaimed = lead.license_status === "not_required" && present(lead.qualification_notes);
  const dossierFields = [
    [present(lead.company), "Юридическое лицо и регистрационные данные"],
    [Boolean(source), "Сайт компании / продукта"],
    [present(lead.work_email) || present(lead.telegram), "Контакт представителя"],
    [present(lead.vertical), "Вертикаль бизнеса"],
    [present(lead.target_geos) || present(lead.geos), "Целевые GEO"],
    [present(lead.requested_methods) || present(lead.methods), "Платёжные методы"],
    [present(lead.expected_monthly_volume) || present(lead.monthly_volume), "Ожидаемый месячный объём"],
    [present(lead.requested_currencies), "Валюты обработки"],
    [present(lead.requested_flows) || /\bpay[ -]?(?:in|out)\b/i.test(details), "Требования PayIn / PayOut"],
    [licenceSupplied || licenceNotApplicableClaimed, "Лицензия, юрисдикция и ссылка на реестр либо обоснование неприменимости"],
    [present(lead.representative_authority) || Boolean(parseUrl(lead.representative_authority_evidence_url)), "Подтверждение юридического лица и полномочий представителя"],
  ];
  for (const [available, label] of dossierFields) if (!available) missing.push(label);
  const completedFields = dossierFields.filter(([available]) => available).length;
  const completeness = Math.round(completedFields / dossierFields.length * 100);
  if (classification === "subagent") missing.push("Мерчанты, их сайты и полномочия представителя по каждому");
  add("dossier_completeness", missing.length ? "warning" : "passed", "Полнота досье",
    missing.length ? `Требуют уточнения: ${missing.join("; ")}.` : "Все обязательные поля анкеты заполнены. Это не означает, что сведения подтверждены внешними источниками.",
    null, { missing_information: missing, submitted_fields: dossierFields.length, completed_fields: completedFields }, "computed", "submitted_data");
  const criticalChecks = [
    { key: "website_presence", title: "Доступность официального сайта", status: contentUsable ? "observed" : "unverified" },
    { key: "legal_entity_registry", title: "Юридическое лицо: название и регистрационный номер", status: gleif.verified ? "verified" : gleif.outcome === "candidate_match" ? "observed" : "not_checked" },
    { key: "licence_registry", title: "Лицензия в реестре регулятора", status: gamingLicence.verified ? "verified" : licenceAdverse ? "adverse_or_unresolved" : licenceObserved ? "observed" : "not_checked" },
    { key: "representative_authority", title: "Полномочия представителя", status: "not_checked" },
    { key: "sanctions", title: "Санкционные списки", status: exactSanctionsMatches.length ? "potential_match" : sanctionsChecked.length ? "checked_no_exact_match" : "not_checked" },
    { key: "adverse_media", title: "Негативные публикации", status: "not_checked" },
  ];
  const coverage = checks.reduce((result, check) => {
    const key = check.evidence_level || "not_checked";
    result[key] = (result[key] || 0) + 1;
    return result;
  }, {});
  const nextAction = exactSanctionsMatches.length ? "Разрешить потенциальное санкционное совпадение по дополнительным идентификаторам до любых дальнейших действий." :
    licenceAdverse ? "Разрешить расхождение по лицензии азартных игр до передачи мерчанта PSP." :
    !contentUsable ? "Уточнить сайт и недостающие данные, затем повторить проверку." : "Проверить национальный реестр и лицензию, подготовить запрос недостающих данных.";
  return {
    audit_version: "public-evidence-v5",
    audit_level: "preliminary_public_evidence",
    decision_status: "manual_review_required",
    classification,
    authenticity_score: null,
    compliance_readiness_score: completeness,
    commercial_value_score: null,
    completeness_score: completeness,
    risk_level: "unknown",
    confidence: null,
    summary: `Первичный сбор фактов ${contentUsable ? "выполнен" : "неполон"}. ${title ? `Сайт: ${title}. ` : ""}${nextAction} Это не KYB, не подтверждение лицензии и не решение о допуске.`,
    missing_information: missing,
    red_flags: [
      ...(exactSanctionsMatches.length ? [{ key: "potential_sanctions_name_match", title: "В официальном санкционном списке найдено точное совпадение имени; идентичность не установлена", count: exactSanctionsMatches.length }] : []),
      ...(licenceAdverse ? [{ key: "gambling_licence_requires_resolution", title: "Заявленная лицензия азартных игр не подтверждена официальным источником", regulator: gamingLicence.regulator || null, outcome: gamingLicence.outcome }] : []),
    ],
    yellow_flags: flags,
    source_links: [source ? { kind: "website", url: source.href } : null,
      domain ? { kind: "domain_registry", url: `https://rdap.org/domain/${encodeURIComponent(domain)}` } : null,
      gleifRecord?.source_url ? { kind: "legal_entity_reference", url: gleifRecord.source_url } : null,
      gamingLicence.source_url ? { kind: "gambling_licence", url: gamingLicence.source_url } : null,
      sanctionsChecked[0]?.source_url ? { kind: "sanctions_list", url: sanctionsChecked[0].source_url } : null].filter(Boolean),
    checks,
    audit_coverage: {
      status: "partial",
      total_checks: checks.length,
      evidence_levels: coverage,
      critical_checks: criticalChecks,
      critical_confirmed: criticalChecks.filter((item) => item.status === "verified").length,
      critical_total: criticalChecks.length,
      sanctions_sources_checked: sanctionsChecked.map((item) => item.source),
      limitations: [
        gleif.verified ? "GLEIF подтвердил идентификаторы, но национальный реестр не проверен напрямую." : "Национальный реестр юридических лиц не проверен.",
        gamingLicence.verified ? `${regulatorName} подтвердил текущую запись по доступным официальным идентификаторам; лицензии в других юрисдикциях не проверены.` :
          licenceObserved ? "Запись регулятора получена, но лицензия не подтверждена по полному набору идентификаторов." : "Лицензия в реестре регулятора не проверена.",
        sanctionsChecked.length ? "Санкционный охват частичный; PEP и остальные национальные/региональные списки не проверены." : "Санкционные списки и PEP не проверены.",
        "Негативные публикации и судебные дела не проверены.",
        "Полномочия представителя не подтверждены.",
      ],
    },
    screening_provider: provider,
    screened_at: checkedAt,
  };
}
