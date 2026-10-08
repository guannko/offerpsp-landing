export const reliabilityCriteria = [
  { key: "legal", label: "Юрлицо и регуляторная опора", maximum: 25 },
  { key: "funds", label: "Защита средств и расчёты", maximum: 25 },
  { key: "operations", label: "Операционная устойчивость", maximum: 20 },
  { key: "reputation", label: "Независимая репутация", maximum: 15 },
  { key: "transparency", label: "Прозрачность условий", maximum: 15 },
] as const;
export type ReliabilityCriterion = typeof reliabilityCriteria[number]["key"];
export type ReliabilityPoints = Record<ReliabilityCriterion, number | null>;
export type ProviderReliability = {
  entity_type: "provider" | "research_psp";
  entity_id: string;
  category: "working" | "review_later";
  decision: "pending" | "conditional" | "restricted" | "approved";
  score: number;
  points: ReliabilityPoints;
  confidence: "low" | "medium" | "high";
  scope: string;
  reason: string;
  next_step: string;
  sources: string[];
  methodology: string;
  updated_at: string;
};
export const reliabilityDisclaimer = "Внутренний рейтинг по доказательствам, не вероятность сохранности денег. Неизвестное — не доказанный дефект; баллы не означают допуск к работе.";
export const reliabilityDecisions = { pending: "Не проверен полностью", conditional: "Нужна дополнительная проверка", restricted: "Есть ограничение", approved: "Допущен по указанному направлению" };
export const blankReliabilityPoints: ReliabilityPoints = { legal: null, funds: null, operations: null, reputation: null, transparency: null };
export function reliabilityScore(points: ReliabilityPoints): number {
  return reliabilityCriteria.reduce((sum, criterion) => {
    const value = points[criterion.key];
    if (value === null) return sum;
    if (!Number.isInteger(value) || value < 0 || value > criterion.maximum) throw new Error(`Некорректный балл: ${criterion.label}`);
    return sum + value;
  }, 0);
}
export function reliabilityCoverage(points: ReliabilityPoints): number {
  return reliabilityCriteria.reduce((sum, criterion) => sum + (typeof points[criterion.key] === "number" ? criterion.maximum : 0), 0);
}
export function resolveProviderReliability(rows: ProviderReliability[], providerId: string, researchId?: number | null) {
  return rows.find((row) => row.entity_type === "provider" && row.entity_id === providerId)
    || rows.find((row) => row.entity_type === "research_psp" && researchId != null && row.entity_id === String(researchId));
}
export function providerInReliabilityScope(scope: string, hidden: boolean, kind: string, assessment?: ProviderReliability) {
  if (scope === "hidden") return hidden;
  if (scope === "all") return true;
  if (hidden) return false;
  if (scope === "review_later") return assessment?.category === "review_later";
  return assessment?.category !== "review_later" && kind === scope;
}
