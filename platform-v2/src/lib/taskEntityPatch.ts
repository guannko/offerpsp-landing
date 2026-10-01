// Editing status/deadlines must not silently unlink a task from its company.
export function taskEntityPatch(
  task: { entity_type?: string | null; entity_id?: string | null },
  leadId: string | null,
) {
  if (task.entity_type === "merchant") {
    return { entity_type: leadId ? "merchant" : null, entity_id: leadId };
  }
  return {
    entity_type: task.entity_type || null,
    entity_id: task.entity_id || null,
  };
}
