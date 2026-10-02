import { createDocumentBlock, validateWorkDocument } from "./workDocuments.ts";
import type { WorkDocumentBody } from "./workDocuments.ts";
import { checkOfficeArchive, validateOfficeInflation } from "../../shared/office-archive.mjs";

export const WORK_FILE_BUCKET = "offerpsp-work-originals";
export const MAX_WORK_FILE_BYTES = 15 * 1024 * 1024;
export type WorkOriginal = { id: string; document_id: string; attached_revision: number; filename: string; format: "pdf" | "docx"; size_bytes: number; sha256: string; object_path: string; status: "pending" | "ready"; created_at: string; completed_at: string | null };
export type OriginalContent = WorkOriginal & { extracted_text: string };
export function workFileFormat(name: string, size: number): "pdf" | "docx" {
  const extension = name.split(".").pop()?.toLowerCase();
  if (extension !== "pdf" && extension !== "docx") throw new Error("Поддерживаются DOCX и PDF. Старый .doc сначала сохрани как .docx.");
  if (!size || size > MAX_WORK_FILE_BYTES) throw new Error("Размер оригинала — от 1 байта до 15 МБ.");
  if (name.length > 200 || Array.from(name).some(char => char.charCodeAt(0)<32 || char.charCodeAt(0)===127)) throw new Error("Слишком длинное или недопустимое имя файла.");
  return extension;
}
export async function workFileHash(data: ArrayBuffer): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", data)), value => value.toString(16).padStart(2,"0")).join("");
}
export function appendOriginalText(body: WorkDocumentBody, label: string, text: string, attachSource: boolean): WorkDocumentBody {
  if (!text.trim() || text.length > 200000) throw new Error("Нет извлечённого текста или он превышает 200 000 символов. Оригинал доступен отдельно.");
  const chunks = text.match(/[\s\S]{1,50000}/g) || [];
  const next: WorkDocumentBody = { ...body, source: attachSource && !body.source ? { label, text, url: "" } : body.source,
    blocks: [...body.blocks, { ...createDocumentBlock("heading"), text: label }, ...chunks.map(chunk => ({ ...createDocumentBlock("text"), text: chunk }))] };
  const error = validateWorkDocument(next);
  if (error) throw new Error(error);
  return next;
}

// Metadata is a first filter, not proof of the actual inflated size.
export function checkDocxArchive(data: ArrayBuffer): { start: number; compressed: number; size: number; method: number }[] {
  return checkOfficeArchive(data, "docx");
}

// Count the real output in bounded streams, including ZIP entries with forged
// central-directory sizes. Mammoth only sees archives that pass this check.
export async function validateDocxInflation(data: ArrayBuffer): Promise<void> {
  return validateOfficeInflation(data, "docx");
}
