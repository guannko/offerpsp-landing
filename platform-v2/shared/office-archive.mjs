// Browser/server shared structural guard. This is not an antivirus verdict.
export class OfficeFileError extends Error {
  constructor(message) { super(message); this.name = "OfficeFileError"; }
}
const fail = message => { throw new OfficeFileError(message); };

export function checkOfficeArchive(data, kind = "docx") {
  if (!["docx", "xlsx"].includes(kind)) fail("Unsupported Office format");
  const label = kind.toUpperCase();
  const invalid = message => fail(`${label}: ${message}`);
  if (!(data instanceof ArrayBuffer) || data.byteLength < 22) invalid("Некорректный ZIP-каталог.");
  const view = new DataView(data);
  let end = data.byteLength - 22;
  for (; end >= Math.max(0, data.byteLength - 65557); end--) {
    if (view.getUint32(end, true) === 0x06054b50 && end + 22 + view.getUint16(end + 20, true) === data.byteLength) break;
  }
  if (end < Math.max(0, data.byteLength - 65557)) invalid("Некорректный ZIP-каталог.");
  const count = view.getUint16(end + 10, true), directorySize = view.getUint32(end + 12, true), start = view.getUint32(end + 16, true);
  if (!count || count > 2000 || view.getUint16(end + 8, true) !== count || view.getUint16(end + 4, true) || view.getUint16(end + 6, true) || start + directorySize !== end) invalid("Неподдерживаемый или слишком сложный ZIP-каталог.");
  let offset = start, expanded = 0, documentFound = false;
  const parts = [], spans = [], names = new Set(), decoder = new TextDecoder("utf-8", { fatal: true });
  for (let index = 0; index < count; index++) {
    if (offset + 46 > end || view.getUint32(offset, true) !== 0x02014b50) invalid("Повреждённый ZIP-каталог.");
    const flags = view.getUint16(offset + 8, true), compressed = view.getUint32(offset + 20, true), size = view.getUint32(offset + 24, true);
    const nameSize = view.getUint16(offset + 28, true), extra = view.getUint16(offset + 30, true), comment = view.getUint16(offset + 32, true);
    if (offset + 46 + nameSize + extra + comment > end || flags & 1 || compressed === 0xffffffff || size === 0xffffffff || view.getUint16(offset + 34, true)) invalid("Зашифрованный, многотомный или ZIP64 файл не поддерживается.");
    let name;
    try { name = decoder.decode(new Uint8Array(data, offset + 46, nameSize)); } catch { invalid("Некорректное имя части."); }
    const canonical = name.normalize("NFKC").toLowerCase(), segments = canonical.replace(/\/$/, "").split("/");
    if (!nameSize || /[\\:]/.test(canonical) || Array.from(canonical).some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) || segments.some(segment => !segment || segment === "." || segment === "..") || names.has(canonical)) invalid("Небезопасные или повторяющиеся пути.");
    if (/(^|\/)vbaproject[^/]*|(^|\/)vbadata\.xml$|(^|\/)embeddings\//.test(canonical) || /\.(?:exe|dll|com|bat|cmd|js|vbs|hta|ps1|scr|lnk)$/.test(canonical)) invalid("Макросы, вложенные объекты или исполняемые файлы. Используй очищенную DOCX/PDF-копию.");
    if (((view.getUint32(offset + 38, true) >>> 16) & 0xf000) === 0xa000) invalid("Символические ссылки не поддерживаются.");
    names.add(canonical);
    const method = view.getUint16(offset + 10, true), local = view.getUint32(offset + 42, true);
    if (![0, 8].includes(method) || local + 30 > start || view.getUint32(local, true) !== 0x04034b50 || view.getUint16(local + 8, true) !== method) invalid("Неподдерживаемое сжатие.");
    const nameEnd = local + 30 + view.getUint16(local + 26, true), content = nameEnd + view.getUint16(local + 28, true);
    if (content + compressed > start || nameEnd > start) invalid("Повреждённые данные.");
    if (view.getUint16(local + 6, true) !== flags || view.getUint16(local + 26, true) !== nameSize) invalid("Имена или параметры частей не совпадают с каталогом.");
    let localName;
    try { localName = decoder.decode(new Uint8Array(data, local + 30, nameSize)); } catch { invalid("Некорректное локальное имя."); }
    if (localName !== name) invalid("Имена или параметры частей не совпадают с каталогом.");
    if (!(flags & 8) && (view.getUint32(local + 18, true) !== compressed || view.getUint32(local + 22, true) !== size || view.getUint32(local + 14, true) !== view.getUint32(offset + 16, true))) invalid("Размеры или контрольные суммы частей не соответствуют каталогу.");
    spans.push({ start: local, end: content + compressed });
    parts.push({ start: content, compressed, size, method });
    if (name === (kind === "docx" ? "word/document.xml" : "xl/workbook.xml")) documentFound = true;
    expanded += size;
    if (expanded > 40 * 1024 * 1024 || size > 20 * 1024 * 1024 || (compressed && size / compressed > 200)) invalid("Файл слишком сильно сжат; автоматический разбор остановлен.");
    offset += 46 + nameSize + extra + comment;
  }
  spans.sort((a, b) => a.start - b.start);
  for (let index = 1; index < spans.length; index++) if (spans[index].start < spans[index - 1].end) invalid("Части архива перекрываются.");
  if (offset !== end || !documentFound) invalid("Документ Office или размер ZIP-каталога не подтверждён.");
  return parts;
}

export async function validateOfficeInflation(data, kind = "docx") {
  const parts = checkOfficeArchive(data, kind), expires = Date.now() + 30000;
  let total = 0;
  for (const part of parts) {
    let stream = new Blob([data.slice(part.start, part.start + part.compressed)]).stream();
    if (part.method === 8) stream = stream.pipeThrough(new DecompressionStream("deflate-raw"));
    const reader = stream.getReader();
    let size = 0, timer;
    const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new OfficeFileError(`${kind.toUpperCase()}: Разбор занял слишком много времени.`)), Math.max(1, expires - Date.now())); });
    try {
      for (;;) {
        const chunk = await Promise.race([reader.read(), timeout]);
        if (chunk.done) break;
        size += chunk.value.byteLength; total += chunk.value.byteLength;
        if (size > part.size || size > 20 * 1024 * 1024 || total > 40 * 1024 * 1024) fail(`${kind.toUpperCase()}: Фактический объём превышает допустимый.`);
      }
      if (size !== part.size) fail(`${kind.toUpperCase()}: Размер содержимого не соответствует каталогу.`);
    } catch (error) {
      if (error instanceof OfficeFileError) throw error;
      fail(`${kind.toUpperCase()}: Повреждённое сжатое содержимое.`);
    } finally {
      clearTimeout(timer);
      void reader.cancel().catch(() => undefined);
    }
  }
}

export function validatePdfSignature(data) {
  if (!new TextDecoder().decode(new Uint8Array(data, 0, Math.min(data.byteLength, 1024))).includes("%PDF-")) fail("Файл не содержит заголовок PDF.");
}
