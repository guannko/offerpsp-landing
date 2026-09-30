// The portal submits the same structured brief as the public three-step form.
export function syncPortalIntakeUnknowns(form) {
  for (const control of form.querySelectorAll("[data-unknown-for]")) {
    for (const field of form.querySelectorAll(`[data-brief-field="${control.dataset.unknownFor}"]`)) {
      field.disabled = control.checked;
      if (field.dataset.required === "true") field.required = !control.checked;
      // Preserve typed values when toggling, but never serialize disabled fields.
    }
  }
}

export function collectPortalIntakeBrief(form, email) {
  const data = new FormData(form);
  const unknownFields = [...form.querySelectorAll("[data-unknown-for]:checked")]
    .map((control) => control.dataset.unknownFor);
  const flowsUnknown = data.get("requested_flows") === "unknown";
  if (flowsUnknown) unknownFields.push("requested_flows");
  if (data.get("license_status") === "unknown") unknownFields.push("license_status");
  return {
    ...Object.fromEntries(data.entries()),
    work_email: email,
    requested_flows: flowsUnknown ? [] : String(data.get("requested_flows") || "").split(",").filter(Boolean),
    unknown_fields: [...new Set(unknownFields)],
  };
}
