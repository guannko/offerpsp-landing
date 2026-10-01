import { createDocumentBlock, validateWorkDocument } from "./workDocuments.ts";
import type { WorkDocumentBody } from "./workDocuments.ts";

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
  const view = new DataView(data);
  let end = data.byteLength - 22;
  for (; end >= Math.max(0,data.byteLength-65557); end--) if (view.getUint32(end,true) === 0x06054b50) break;
  if (end < Math.max(0,data.byteLength-65557)) throw new Error("DOCX не содержит корректный ZIP-каталог.");
  const count = view.getUint16(end+10,true), directorySize = view.getUint32(end+12,true), start = view.getUint32(end+16,true);
  if (!count || count > 2000 || view.getUint16(end+4,true) || view.getUint16(end+6,true) || start+directorySize>end) throw new Error("Неподдерживаемый или слишком сложный DOCX.");
  let offset = start, expanded = 0, documentFound = false;
  const parts: { start: number; compressed: number; size: number; method: number }[] = [];
  const decoder = new TextDecoder();
  for (let index=0; index<count; index++) {
    if (offset+46>start+directorySize || view.getUint32(offset,true)!==0x02014b50) throw new Error("Повреждённый ZIP-каталог DOCX.");
    const flags=view.getUint16(offset+8,true), compressed=view.getUint32(offset+20,true), size=view.getUint32(offset+24,true);
    const nameSize=view.getUint16(offset+28,true), extra=view.getUint16(offset+30,true), comment=view.getUint16(offset+32,true);
    if (offset+46+nameSize+extra+comment>start+directorySize || flags&1 || compressed===0xffffffff || size===0xffffffff) throw new Error("Зашифрованный или ZIP64 DOCX не поддерживается.");
    const name=decoder.decode(new Uint8Array(data,offset+46,nameSize));
    const method = view.getUint16(offset+10,true), local = view.getUint32(offset+42,true);
    if (![0,8].includes(method) || local+30>start || view.getUint32(local,true)!==0x04034b50 || view.getUint16(local+8,true)!==method) throw new Error("Неподдерживаемое сжатие DOCX.");
    const content = local+30+view.getUint16(local+26,true)+view.getUint16(local+28,true);
    if (content+compressed>start) throw new Error("Повреждённые данные DOCX.");
    parts.push({start:content,compressed,size,method});
    if (name === "word/document.xml") documentFound=true;
    expanded+=size;
    if (expanded>40*1024*1024 || size>20*1024*1024 || (compressed && size/compressed>200)) throw new Error("DOCX слишком сильно сжат; автоматический разбор остановлен.");
    offset+=46+nameSize+extra+comment;
  }
  if (!documentFound) throw new Error("В файле нет документа Word.");
  return parts;
}

// Count the real output in bounded streams, including ZIP entries with forged
// central-directory sizes. Mammoth only sees archives that pass this check.
export async function validateDocxInflation(data: ArrayBuffer): Promise<void> {
  const parts = checkDocxArchive(data);
  const expires = Date.now()+30000;
  let total = 0;
  for (const part of parts) {
    let stream = new Blob([data.slice(part.start,part.start+part.compressed)]).stream();
    if (part.method === 8) stream = stream.pipeThrough(new DecompressionStream("deflate-raw"));
    const reader = stream.getReader();
    let size = 0, timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_,reject) => { timer=setTimeout(() => reject(new Error("Разбор DOCX занял слишком много времени.")),Math.max(1,expires-Date.now())); });
    try {
      for (;;) {
        const chunk = await Promise.race([reader.read(),timeout]);
        if (chunk.done) break;
        size += chunk.value.byteLength; total += chunk.value.byteLength;
        if (size>part.size || size>20*1024*1024 || total>40*1024*1024) throw new Error("Фактический объём DOCX превышает допустимый.");
      }
      if (size!==part.size) throw new Error("Размер содержимого DOCX не соответствует каталогу.");
    } finally {
      if (timer) clearTimeout(timer);
      void reader.cancel().catch(() => undefined);
    }
  }
}
