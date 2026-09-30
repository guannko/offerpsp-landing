const arrayFields = new Set(["target_geos", "requested_currencies", "requested_flows", "requested_methods", "traffic_types"]);
const numericFields = new Set(["quality_score", "expected_monthly_volume", "min_transaction_amount", "max_transaction_amount", "average_ticket_amount"]);

/** A request editor must not resend hidden company/contact fields or stale defaults. */
export function merchantRequestPatch(before: Record<string, string>, after: Record<string, string>) {
  return Object.fromEntries(Object.entries(after)
    .filter(([key, value]) => key !== "risk_segment" && value !== before[key])
    .map(([key, value]) => [key, arrayFields.has(key)
      ? value.split(/[,;\n]/).map((item) => item.trim()).filter(Boolean)
      : numericFields.has(key) ? value.trim() === "" ? null : Number(value)
      : key === "assigned_to" ? value || null : value]));
}
