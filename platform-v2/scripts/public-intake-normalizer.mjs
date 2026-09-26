export function normalizePublicIntake(input) {
  let body = input?.body ?? input;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { throw new Error("Invalid request body"); }
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid request body");

  const clean = (value, max = 500) => String(value ?? "").trim().slice(0, max);
  const list = (value, maxItems = 30) => {
    const source = Array.isArray(value) ? value : String(value ?? "").split(/[,;\n]/);
    return [...new Set(source.map((item) => clean(item, 120)).filter(Boolean))].slice(0, maxItems);
  };
  const number = (value) => {
    const normalized = clean(value, 80);
    if (!normalized) return null;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  };
  if (clean(body.website_url, 200)) return { is_spam: true };

  const allowedUnknowns = new Set([
    "company_url", "license_status", "target_geos", "requested_currencies", "requested_flows",
    "requested_methods", "expected_monthly_volume", "average_ticket_amount", "traffic_types",
  ]);
  const unknownFields = list(body.profile_unknown_fields).filter((key) => allowedUnknowns.has(key));
  const unknown = (key) => unknownFields.includes(key);
  const name = clean(body.name, 120);
  const email = clean(body.work_email, 254).toLowerCase();
  const company = clean(body.company, 160);
  const vertical = clean(body.vertical, 80);
  const companyUrl = unknown("company_url") ? null : clean(body.company_url, 500) || null;
  let licenseStatus = clean(body.license_status, 40).toLowerCase();
  if (licenseStatus === "unknown") {
    if (!unknownFields.includes("license_status")) unknownFields.push("license_status");
  } else if (!["licensed", "pending", "not_required", "unlicensed"].includes(licenseStatus)) {
    licenseStatus = "";
  }
  const targetGeos = unknown("target_geos") ? [] : list(body.target_geos);
  const currencies = unknown("requested_currencies") ? [] : list(body.requested_currencies).map((item) => item.toUpperCase());
  const flows = unknown("requested_flows") ? [] : list(body.requested_flows)
    .map((item) => item.toUpperCase()).filter((item) => ["PAYIN", "PAYOUT"].includes(item));
  const methods = unknown("requested_methods") ? [] : list(body.requested_methods);
  const trafficTypes = unknown("traffic_types") ? [] : list(body.traffic_types);
  const monthlyVolume = unknown("expected_monthly_volume") ? null : number(body.expected_monthly_volume);
  const volumeCurrency = monthlyVolume === null ? null : clean(body.volume_currency, 12).toUpperCase();
  const averageTicket = unknown("average_ticket_amount") ? null : number(body.average_ticket_amount);
  const ticketCurrency = averageTicket === null ? null : clean(body.average_ticket_currency, 12).toUpperCase();
  const consent = body.consent === true || body.consent === "true";

  const missing = [];
  if (name.length < 2) missing.push("name");
  if (company.length < 2) missing.push("company");
  if (vertical.length < 2) missing.push("vertical");
  if (!companyUrl && !unknown("company_url")) missing.push("website");
  if (!licenseStatus) missing.push("licence or legal status");
  if (!targetGeos.length && !unknown("target_geos")) missing.push("target countries");
  if (!currencies.length && !unknown("requested_currencies")) missing.push("currencies");
  if (!flows.length && !unknown("requested_flows")) missing.push("PayIn / PayOut");
  if (!methods.length && !unknown("requested_methods")) missing.push("payment methods");
  if (!trafficTypes.length && !unknown("traffic_types")) missing.push("traffic type");
  if ((monthlyVolume === null || !volumeCurrency) && !unknown("expected_monthly_volume")) missing.push("monthly volume and currency");
  if ((averageTicket === null || !ticketCurrency) && !unknown("average_ticket_amount")) missing.push("average ticket and currency");
  if (missing.length) throw new Error(`Required merchant brief fields are missing: ${missing.join(", ")}`);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("A valid work email is required");
  if (!consent) throw new Error("Consent is required");

  const categories = new Set(["ai", "search", "social", "referral", "campaign", "direct"]);
  const cleanTouch = (value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const touch = {};
    const fields = ["source_category", "source_platform", "referrer", "landing_path", "captured_at", "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "gbraid", "wbraid", "dclid", "gad_source", "gad_campaignid", "msclkid", "fbclid", "li_fat_id", "ttclid", "affiliate_id", "affiliate_click_id", "aff_id", "click_id", "sub_id", "sub1", "sub2", "sub3", "sub4", "sub5"];
    for (const key of fields) {
      const cleaned = clean(value[key], key === "referrer" ? 500 : 300);
      if (cleaned) touch[key] = cleaned;
    }
    if (touch.source_category && !categories.has(touch.source_category)) delete touch.source_category;
    return touch;
  };
  const rawAttribution = body.attribution && typeof body.attribution === "object" && !Array.isArray(body.attribution)
    ? body.attribution : {};
  const sourceCategory = categories.has(clean(body.source_category, 40)) ? clean(body.source_category, 40) : null;
  const brief = {
    license_status: licenseStatus || "unknown",
    target_geos: targetGeos,
    requested_currencies: currencies,
    requested_flows: flows,
    requested_methods: methods,
    expected_monthly_volume: monthlyVolume,
    volume_currency: volumeCurrency,
    average_ticket_amount: averageTicket,
    average_ticket_currency: ticketCurrency,
    traffic_types: trafficTypes,
    profile_unknown_fields: unknownFields,
  };
  const attribution = {
    version: Number(rawAttribution.version) === 2 ? 2 : 1,
    first_touch: cleanTouch(rawAttribution.first_touch),
    last_touch: cleanTouch(rawAttribution.last_touch),
    session_id: clean(rawAttribution.session_id, 120) || null,
    intake_brief: brief,
  };

  return {
    is_spam: false, name, work_email: email, telegram: clean(body.telegram, 100) || null,
    company, company_url: companyUrl, vertical,
    monthly_volume: monthlyVolume === null ? "Not sure yet" : `${monthlyVolume} ${volumeCurrency}`,
    geos: targetGeos.join(", ") || "Not sure yet",
    methods: methods.join(", ") || "Not sure yet",
    details: clean(body.details, 4000) || null,
    source: "offerpsp.com", source_category: sourceCategory,
    source_platform: clean(body.source_platform, 80) || null,
    source_referrer: clean(body.source_referrer, 500) || null,
    landing_path: clean(body.landing_path, 300) || null,
    utm_source: clean(body.utm_source, 160) || null, utm_medium: clean(body.utm_medium, 160) || null,
    utm_campaign: clean(body.utm_campaign, 160) || null, utm_term: clean(body.utm_term, 300) || null,
    utm_content: clean(body.utm_content, 300) || null, gclid: clean(body.gclid, 300) || null,
    gbraid: clean(body.gbraid, 300) || null, wbraid: clean(body.wbraid, 300) || null,
    dclid: clean(body.dclid, 300) || null, msclkid: clean(body.msclkid, 300) || null,
    fbclid: clean(body.fbclid, 300) || null, li_fat_id: clean(body.li_fat_id, 300) || null,
    ttclid: clean(body.ttclid, 300) || null,
    affiliate_id: clean(body.affiliate_id || body.aff_id, 300) || null,
    affiliate_click_id: clean(body.affiliate_click_id || body.click_id, 300) || null,
    first_touch_at: /^\d{4}-\d{2}-\d{2}T/.test(clean(body.first_touch_at, 40)) ? clean(body.first_touch_at, 40) : null,
    last_touch_at: /^\d{4}-\d{2}-\d{2}T/.test(clean(body.last_touch_at, 40)) ? clean(body.last_touch_at, 40) : null,
    attribution, status: "new", consent: true,
  };
}

export function buildN8nPublicIntakeNormalizerCode() {
  return `const normalizePublicIntake = ${normalizePublicIntake.toString()};\nreturn [{ json: normalizePublicIntake($input.first().json) }];`;
}
