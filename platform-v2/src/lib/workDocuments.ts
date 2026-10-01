export type DocumentKind = "document" | "note" | "contract";
export type BlockType = "text" | "heading" | "list" | "checklist" | "table" | "callout" | "link";
export type DocumentBlock = {
  id: string;
  type: BlockType;
  text?: string;
  items?: { text: string; checked: boolean }[];
  rows?: string[][];
  label?: string;
  url?: string;
};
export type DocumentSource = { label: string; text: string; url: string };
export type WorkDocumentBody = {
  schema_version: 1;
  title: string;
  kind: DocumentKind;
  links: { lead_id: string | null; provider_id: string | null; direction_id: string | null };
  source: DocumentSource | null;
  blocks: DocumentBlock[];
};
export type WorkDocument = { id: string; revision: number; body: WorkDocumentBody; updated_at: string | null };
export type DocumentSummary = { id: string; revision: number; title: string; kind: DocumentKind; links: WorkDocumentBody["links"]; updated_at: string };
export type DocumentVersion = { revision: number; created_at: string };
export type DocumentRead = WorkDocument & { current_revision: number; history: DocumentVersion[] };
export type DocumentRepository = {
  list: (offset: number) => Promise<{ documents: DocumentSummary[]; total: number }>;
  get: (id: string, revision?: number) => Promise<DocumentRead>;
  save: (draft: WorkDocument) => Promise<WorkDocument>;
};
export const documentKindLabels: Record<DocumentKind, string> = { document: "Документ", note: "Заметка", contract: "Договор" };
export const blockLabels: Record<BlockType, string> = { text: "Текст", heading: "Заголовок", list: "Список", checklist: "Чек-лист", table: "Таблица", callout: "Условия / примечание", link: "Ссылка на материал" };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));
const keys = (value: Record<string, unknown>, allowed: string[]) => Object.keys(value).every((key) => allowed.includes(key));
const text = (value: unknown, max: number) => typeof value === "string" && value.length <= max;
export const safeDocumentUrl = (value: string) => /^https?:\/\/[^\s]+$/i.test(value);

export function createDocumentBlock(type: BlockType): DocumentBlock {
  const base = { id: crypto.randomUUID(), type };
  if (type === "table") return { ...base, rows: [["Параметр", "Значение"], ["", ""]] };
  if (type === "list" || type === "checklist") return { ...base, items: [{ text: "", checked: false }] };
  if (type === "link") return { ...base, label: "", url: "" };
  return { ...base, text: "" };
}
export function newWorkDocument(kind: DocumentKind): WorkDocument {
  const blocks = kind === "contract"
    ? ["Стороны и предмет", "Условия и расчёты", "Ответственность и спорные вопросы", "Срок и реквизиты"].flatMap((title) => [
      { ...createDocumentBlock("heading"), text: title }, createDocumentBlock("text"),
    ]) : [createDocumentBlock("text")];
  return { id: crypto.randomUUID(), revision: 0, updated_at: null, body: {
    schema_version: 1, title: kind === "note" ? "Новая заметка" : kind === "contract" ? "Рабочий проект договора" : "Новый документ",
    kind, links: { lead_id: null, provider_id: null, direction_id: null }, source: null, blocks,
  } };
}
export function validateWorkDocument(body: unknown): string | null {
  if (!object(body) || !keys(body, ["schema_version", "title", "kind", "links", "source", "blocks"]) || body.schema_version !== 1) return "Неподдерживаемый формат документа.";
  if (!text(body.title, 200) || !(body.title as string).trim()) return "Укажи название документа (до 200 символов).";
  if (!["document", "note", "contract"].includes(String(body.kind))) return "Неизвестный тип документа.";
  if (!object(body.links) || Object.keys(body.links).length !== 3 || !keys(body.links, ["lead_id", "provider_id", "direction_id"]) || Object.entries(body.links).some(([key, id]) => id !== null && (typeof id !== "string" || !(key === "direction_id" ? /^[a-zA-Z0-9_-]{1,80}$/.test(id) : uuid.test(id))))) return "Некорректная связь документа.";
  if (body.source !== null && (!object(body.source) || Object.keys(body.source).length !== 3 || !keys(body.source, ["label", "text", "url"]) || !text(body.source.label, 200) || !(body.source.label as string).trim() || !text(body.source.text, 200000) || !text(body.source.url, 2000) || (body.source.url !== "" && !safeDocumentUrl(body.source.url as string)))) return "Проверь исходник: название, текст до 200 000 символов и HTTP(S)-ссылка.";
  if (!Array.isArray(body.blocks) || body.blocks.length > 100) return "Допускается до 100 блоков.";
  const ids = new Set<string>();
  for (const block of body.blocks) {
    if (!object(block) || typeof block.id !== "string" || !uuid.test(block.id) || ids.has(block.id)) return "Некорректный или повторный идентификатор блока.";
    ids.add(block.id);
    if (["text", "heading", "callout"].includes(String(block.type))) {
      if (Object.keys(block).length !== 3 || !keys(block, ["id", "type", "text"]) || !text(block.text, 50000)) return "Текст блока слишком большой или имеет неверный формат.";
    } else if (block.type === "list" || block.type === "checklist") {
      if (Object.keys(block).length !== 3 || !keys(block, ["id", "type", "items"]) || !Array.isArray(block.items) || block.items.length > 100 || block.items.some((item) => !object(item) || Object.keys(item).length !== 2 || !keys(item, ["text", "checked"]) || !text(item.text, 2000) || typeof item.checked !== "boolean")) return "Проверь список (до 100 пунктов по 2000 символов).";
    } else if (block.type === "table") {
      if (Object.keys(block).length !== 3 || !keys(block, ["id", "type", "rows"]) || !Array.isArray(block.rows) || !block.rows.length || block.rows.length > 50 || !Array.isArray(block.rows[0]) || !block.rows[0].length || block.rows[0].length > 8) return "Таблица: от 1 до 50 строк, от 1 до 8 столбцов.";
      const width = block.rows[0].length;
      if (block.rows.some((row) => !Array.isArray(row) || row.length !== width || row.some((cell) => !text(cell, 2000)))) return "У строк таблицы должно быть одинаковое число столбцов; ячейка — до 2000 символов.";
    } else if (block.type === "link") {
      if (Object.keys(block).length !== 4 || !keys(block, ["id", "type", "label", "url"]) || !text(block.label, 200) || !text(block.url, 2000) || !safeDocumentUrl(block.url as string)) return "Для материала нужна HTTP(S)-ссылка, не файл или исполняемый адрес.";
    } else return "Неподдерживаемый блок.";
  }
  if (new TextEncoder().encode(JSON.stringify(body)).length > 1000000) return "Документ слишком большой (лимит 1 МБ).";
  return null;
}
export function moveDocumentBlock(blocks: DocumentBlock[], id: string, shift: -1 | 1): DocumentBlock[] {
  const index = blocks.findIndex((block) => block.id === id);
  const target = index + shift;
  if (index < 0 || target < 0 || target >= blocks.length) return blocks;
  const next = [...blocks]; [next[index], next[target]] = [next[target], next[index]]; return next;
}
export function copyWorkDocument(document: WorkDocument): WorkDocument {
  return { ...structuredClone(document), id: crypto.randomUUID(), revision: 0, updated_at: null,
    body: { ...structuredClone(document.body), title: `${document.body.title.slice(0, 190)} — копия`, blocks: document.body.blocks.map((block) => ({ ...structuredClone(block), id: crypto.randomUUID() })) } };
}
export function documentPlainText(body: WorkDocumentBody): string {
  return [body.title, ...body.blocks.map((block) => {
    if (block.type === "table") return (block.rows || []).map((row) => row.join("\t")).join("\n");
    if (block.type === "list" || block.type === "checklist") return (block.items || []).map((item) => `${block.type === "checklist" ? item.checked ? "[x]" : "[ ]" : "•"} ${item.text}`).join("\n");
    if (block.type === "link") return `${block.label || "Материал"}: ${block.url}`;
    return block.text || "";
  })].join("\n\n");
}
export function documentFromBackup(content: string): WorkDocument {
  if (new TextEncoder().encode(content).length > 1200000) throw new Error("JSON-копия слишком большая (до 1,2 МБ).");
  const parsed: unknown = JSON.parse(content);
  if (!object(parsed) || Object.keys(parsed).length !== 2 || !keys(parsed, ["format", "body"]) || parsed.format !== "offerpsp-work-document") throw new Error("Это не JSON-копия рабочего документа OfferPSP.");
  const invalid = validateWorkDocument(parsed.body);
  if (invalid) throw new Error(invalid);
  return copyWorkDocument({ id: crypto.randomUUID(), revision: 0, updated_at: null, body: parsed.body as WorkDocumentBody });
}
