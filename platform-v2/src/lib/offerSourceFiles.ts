const MAX_SOURCE_SIZE = 15 * 1024 * 1024;

export type ExtractedOfferSource = {
  text: string;
  format: string;
  extractionMethod: string;
  sha256: string;
  size: number;
  mimeType: string;
};

const normalizeText = (value: string) => value
  .replace(/\r\n?/g, "\n")
  .split("\n")
  .map((line) => line.trimEnd())
  .join("\n")
  .replace(/\n{4,}/g, "\n\n\n")
  .trim();

const digestHex = async (buffer: ArrayBuffer) => {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
};

const valueToText = (value: unknown) => {
  if (value instanceof Date) return value.toISOString();
  if (value === null || value === undefined) return "";
  return String(value);
};

async function extractPdf(buffer: ArrayBuffer) {
  const [{ getDocument, GlobalWorkerOptions }, workerUrl] = await Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
  ]);
  GlobalWorkerOptions.workerSrc = workerUrl.default;
  const document = await getDocument({ data: new Uint8Array(buffer) }).promise;
  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => ("str" in item ? item.str : "")).join(" "));
  }
  const text = normalizeText(pages.join("\n\n"));
  if (!text) throw new Error("В PDF нет извлекаемого текста. Нужен OCR или ручная проверка.");
  return text;
}

async function extractDocx(buffer: ArrayBuffer) {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ arrayBuffer: buffer });
  return normalizeText(result.value);
}

async function extractXlsx(file: File) {
  const { default: readWorkbook } = await import("read-excel-file/browser");
  const sheets = await readWorkbook(file);
  return normalizeText(sheets.map(({ sheet, data }) => {
    const rows = data.map((row) => row.map(valueToText).join("\t")).join("\n");
    return `# ${sheet}\n${rows}`;
  }).join("\n\n"));
}

export async function extractOfferSource(file: File): Promise<ExtractedOfferSource> {
  if (file.size > MAX_SOURCE_SIZE) throw new Error("Максимальный размер исходника — 15 МБ.");
  const buffer = await file.arrayBuffer();
  const suffix = file.name.split(".").pop()?.toLowerCase() || "";
  let text = "";
  const format = suffix || "text";

  if (["txt", "md", "csv", "tsv", "json", "html", "xml"].includes(suffix)) {
    text = normalizeText(new TextDecoder("utf-8").decode(buffer));
  } else if (suffix === "pdf") {
    text = await extractPdf(buffer);
  } else if (suffix === "docx") {
    text = await extractDocx(buffer);
  } else if (suffix === "xlsx") {
    text = await extractXlsx(file);
  } else {
    throw new Error("Поддерживаются TXT, CSV, JSON, PDF, DOCX и XLSX.");
  }

  if (!text) throw new Error("Из файла не удалось извлечь текст.");
  return {
    text,
    format,
    extractionMethod: `offerpsp-browser-adapter:${format}`,
    sha256: await digestHex(buffer),
    size: file.size,
    mimeType: file.type || "application/octet-stream",
  };
}

export const safeStorageName = (name: string) => name
  .normalize("NFKD")
  .replace(/[^a-zA-Z0-9._-]+/g, "-")
  .replace(/^-+|-+$/g, "")
  .slice(0, 120) || "offer-source";
