import { HttpError } from './staff-auth.mjs';

// Structured data only. No natural-language identity matching or inferred rates.
export function providerReliabilityItems(input) {
  let items = input?.provider_reliability;
  const instruction = String(input?.instruction || '');
  if (items === undefined && instruction.startsWith('PSP_RELIABILITY_BATCH:')) {
    if (instruction.length > 20_000) throw new HttpError(400, 'Reliability batch text exceeds 20000 characters');
    try { items = JSON.parse(instruction.slice('PSP_RELIABILITY_BATCH:'.length)).items; }
    catch { throw new HttpError(400, 'Reliability batch requires valid JSON items'); }
  }
  if (items === undefined) return null;
  if (!Array.isArray(items) || !items.length || items.length > 50) throw new HttpError(400, 'Reliability batch requires 1 to 50 PSPs');
  for (const item of items) {
    if (!item || typeof item !== 'object' || typeof item.name !== 'string' || typeof item.website !== 'string'
      || !['provider', 'research_psp'].includes(item.entity_type)
      || (item.entity_id !== null && typeof item.entity_id !== 'string')
      || !item.payload || typeof item.payload !== 'object' || Array.isArray(item.payload)) {
      throw new HttpError(400, 'Exact PSP identity and assessment payload required');
    }
  }
  return items.map(({ name, website, entity_type, entity_id, payload }) => ({ name, website, entity_type, entity_id, payload }));
}
