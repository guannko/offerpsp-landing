export const INTAKE_UNKNOWN = "not_sure_yet";

const clean = (value, max = 500) => String(value ?? "").trim().slice(0, max);

export const splitBriefList = (value, maxItems = 30) => {
  const source = Array.isArray(value) ? value : String(value ?? "").split(/[,;\n]/);
  return [...new Set(source.map((item) => clean(item, 120)).filter(Boolean))].slice(0, maxItems);
};

const positiveNumber = (value) => {
  const normalized = String(value ?? "").trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

const hasUnknown = (unknownFields, key) => unknownFields.includes(key);

export function validateIntakeBrief(values) {
  const unknownFields = splitBriefList(values.unknown_fields);
  const missing = [];
  const requireTextOrUnknown = (key, label) => {
    if (!clean(values[key]) && !hasUnknown(unknownFields, key)) missing.push(label);
  };
  const requireListOrUnknown = (key, label) => {
    if (!splitBriefList(values[key]).length && !hasUnknown(unknownFields, key)) missing.push(label);
  };

  for (const [key, label] of [
    ["name", "name"], ["work_email", "work email"], ["company", "company"], ["vertical", "vertical"],
  ]) requireTextOrUnknown(key, label);
  requireTextOrUnknown("company_url", "website");
  requireTextOrUnknown("license_status", "licence or legal status");
  requireListOrUnknown("target_geos", "target countries");
  requireListOrUnknown("requested_currencies", "currencies");
  requireListOrUnknown("requested_flows", "PayIn / PayOut");
  requireListOrUnknown("requested_methods", "payment methods");
  requireListOrUnknown("traffic_types", "traffic type");

  const volumeUnknown = hasUnknown(unknownFields, "expected_monthly_volume");
  if (!volumeUnknown && (positiveNumber(values.expected_monthly_volume) === null || !clean(values.volume_currency))) {
    missing.push("monthly volume and currency");
  }
  const ticketUnknown = hasUnknown(unknownFields, "average_ticket_amount");
  if (!ticketUnknown && (positiveNumber(values.average_ticket_amount) === null || !clean(values.average_ticket_currency))) {
    missing.push("average ticket and currency");
  }
  return { valid: missing.length === 0, missing, unknown_fields: unknownFields };
}

export function buildIntakeBriefPayload(values) {
  const validation = validateIntakeBrief(values);
  if (!validation.valid) throw new Error(`Incomplete merchant brief: ${validation.missing.join(", ")}`);

  const unknownFields = validation.unknown_fields;
  const targetGeos = hasUnknown(unknownFields, "target_geos") ? [] : splitBriefList(values.target_geos);
  const currencies = hasUnknown(unknownFields, "requested_currencies") ? [] : splitBriefList(values.requested_currencies).map((item) => item.toUpperCase());
  const flows = hasUnknown(unknownFields, "requested_flows") ? [] : splitBriefList(values.requested_flows)
    .map((item) => item.toUpperCase()).filter((item) => ["PAYIN", "PAYOUT"].includes(item));
  const methods = hasUnknown(unknownFields, "requested_methods") ? [] : splitBriefList(values.requested_methods);
  const trafficTypes = hasUnknown(unknownFields, "traffic_types") ? [] : splitBriefList(values.traffic_types);
  const volume = hasUnknown(unknownFields, "expected_monthly_volume") ? null : positiveNumber(values.expected_monthly_volume);
  const averageTicket = hasUnknown(unknownFields, "average_ticket_amount") ? null : positiveNumber(values.average_ticket_amount);
  const licenseStatus = hasUnknown(unknownFields, "license_status") ? "unknown" : clean(values.license_status, 40);

  return {
    name: clean(values.name, 120),
    work_email: clean(values.work_email, 254).toLowerCase(),
    company: clean(values.company, 160),
    company_url: hasUnknown(unknownFields, "company_url") ? null : clean(values.company_url, 500) || null,
    vertical: clean(values.vertical, 80),
    license_status: licenseStatus,
    target_geos: targetGeos,
    requested_currencies: currencies,
    requested_flows: flows,
    requested_methods: methods,
    traffic_types: trafficTypes,
    expected_monthly_volume: volume,
    volume_currency: volume === null ? null : clean(values.volume_currency, 12).toUpperCase(),
    average_ticket_amount: averageTicket,
    average_ticket_currency: averageTicket === null ? null : clean(values.average_ticket_currency, 12).toUpperCase(),
    profile_unknown_fields: unknownFields,
    geos: targetGeos.join(", ") || "Not sure yet",
    methods: methods.join(", ") || "Not sure yet",
    monthly_volume: volume === null ? "Not sure yet" : `${volume} ${clean(values.volume_currency, 12).toUpperCase()}`,
  };
}
