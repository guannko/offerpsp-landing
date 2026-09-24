const MAX_SOURCE_SIZE = 15 * 1024 * 1024;
// Vercel request bodies are substantially smaller than the private source
// storage limit. Larger files keep using the local adapters until the server
// receives storage references instead of base64 payloads.
const MAX_SERVER_EXTRACTION_SIZE = 3 * 1024 * 1024;

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

const normalizeOcrText = (value: string) => normalizeText(value)
  .replace(/\bPayl[iI]n\b/g, "PayIn")
  .replace(/[МM][ОO0][ЕER]\s+[РP][аa][уy][!Il1n]*/giu, "MDR PayIn")
  .replace(/\bPay0ut\b/gi, "PayOut");

const digestHex = async (buffer: ArrayBuffer) => {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
};

const valueToText = (value: unknown) => {
  if (value instanceof Date) return value.toISOString();
  if (value === null || value === undefined) return "";
  return String(value);
};

type ExtractionProgress = (message: string) => void;

type ExtractionOptions = {
  accessToken?: string | null;
};

const SERVER_DOCUMENT_FORMATS = new Set([
  "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "eml", "msg", "tif", "tiff",
]);

const LOCAL_DOCUMENT_FORMATS = new Set([
  "txt", "md", "csv", "tsv", "json", "html", "xml", "pdf", "docx", "xlsx", "png", "jpg", "jpeg", "webp",
]);

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  const chunks: string[] = [];
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + chunkSize)));
  }
  return btoa(chunks.join(""));
}

async function extractOnServer(file: File, buffer: ArrayBuffer, accessToken: string, onProgress?: ExtractionProgress) {
  onProgress?.("Разбираю документ серверным модулем…");
  const response = await fetch("/api/extract-document", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      filename: file.name,
      mime_type: file.type || "application/octet-stream",
      file_base64: arrayBufferToBase64(buffer),
    }),
  });
  const payload = await response.json().catch(() => ({})) as {
    text?: string;
    extraction_method?: string;
    error?: string;
    message?: string;
  };
  if (!response.ok) throw new Error(payload.message || payload.error || `Серверный разбор вернул ${response.status}.`);
  const text = normalizeText(String(payload.text || ""));
  if (!text) throw new Error("Серверный модуль не извлёк текст.");
  return {
    text,
    extractionMethod: payload.extraction_method || "docling",
  };
}

async function createOcrWorker() {
  const { createWorker } = await import("tesseract.js");
  return createWorker(["eng", "rus"]);
}

async function extractImageWithOcr(image: File, onProgress?: ExtractionProgress) {
  onProgress?.("Запускаю OCR для изображения…");
  const worker = await createOcrWorker();
  try {
    const result = await worker.recognize(image);
    return normalizeOcrText(result.data.text);
  } finally {
    await worker.terminate();
  }
}

async function extractPdf(buffer: ArrayBuffer, onProgress?: ExtractionProgress) {
  const [{ getDocument, GlobalWorkerOptions }, workerUrl] = await Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
  ]);
  GlobalWorkerOptions.workerSrc = workerUrl.default;
  // pdf.js may transfer/detach the supplied ArrayBuffer. Keep the caller's
  // buffer intact because it is also used for the immutable source hash.
  const pdfDocument = await getDocument({ data: new Uint8Array(buffer.slice(0)) }).promise;
  const pages: string[] = [];
  let ocrWorker: Awaited<ReturnType<typeof createOcrWorker>> | null = null;
  let usedOcr = false;
  try {
    for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
      const page = await pdfDocument.getPage(pageNumber);
      const content = await page.getTextContent();
      const embeddedText = normalizeText(content.items.map((item) => ("str" in item ? item.str : "")).join(" "));
      if (embeddedText.length >= 20) {
        pages.push(embeddedText);
        continue;
      }

      usedOcr = true;
      onProgress?.(`Распознаю сканированную страницу ${pageNumber} из ${pdfDocument.numPages}…`);
      ocrWorker ||= await createOcrWorker();
      const viewport = page.getViewport({ scale: 2 });
      const canvas = window.document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("Браузер не смог подготовить страницу PDF для OCR.");
      await page.render({ canvas, canvasContext: context, viewport }).promise;
      const recognized = await ocrWorker.recognize(canvas);
      pages.push(normalizeOcrText(recognized.data.text));
    }
  } finally {
    if (ocrWorker) await ocrWorker.terminate();
  }
  const text = normalizeText(pages.join("\n\n"));
  if (!text) throw new Error("В PDF не удалось распознать текст. Нужна ручная проверка.");
  return { text, usedOcr };
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

export async function extractOfferSource(
  file: File,
  onProgress?: ExtractionProgress,
  options: ExtractionOptions = {},
): Promise<ExtractedOfferSource> {
  if (file.size > MAX_SOURCE_SIZE) throw new Error("Максимальный размер исходника — 15 МБ.");
  const buffer = await file.arrayBuffer();
  // Calculate this before any extractor can transfer or detach the buffer.
  const sha256 = await digestHex(buffer.slice(0));
  const suffix = file.name.split(".").pop()?.toLowerCase() || "";
  let text = "";
  let extractionMethod = `offerpsp-browser-adapter:${suffix || "text"}`;
  const format = suffix || "text";

  if (SERVER_DOCUMENT_FORMATS.has(suffix) && options.accessToken && file.size <= MAX_SERVER_EXTRACTION_SIZE) {
    try {
      const extracted = await extractOnServer(file, buffer, options.accessToken, onProgress);
      return {
        text: extracted.text,
        format,
        extractionMethod: extracted.extractionMethod,
        sha256,
        size: file.size,
        mimeType: file.type || "application/octet-stream",
      };
    } catch (error) {
      if (!LOCAL_DOCUMENT_FORMATS.has(suffix)) throw error;
      onProgress?.(`Серверный разбор недоступен, использую резервный: ${error instanceof Error ? error.message : "неизвестная ошибка"}`);
    }
  }

  if (["txt", "md", "csv", "tsv", "json", "html", "xml"].includes(suffix)) {
    text = normalizeText(new TextDecoder("utf-8").decode(buffer));
  } else if (suffix === "pdf") {
    const extracted = await extractPdf(buffer, onProgress);
    text = extracted.text;
    if (extracted.usedOcr) extractionMethod = "offerpsp-browser-adapter:pdf+ocr";
  } else if (suffix === "docx") {
    text = await extractDocx(buffer);
  } else if (suffix === "xlsx") {
    text = await extractXlsx(file);
  } else if (["png", "jpg", "jpeg", "webp"].includes(suffix)) {
    text = await extractImageWithOcr(file, onProgress);
    extractionMethod = `offerpsp-browser-adapter:${format}+ocr`;
  } else {
    if (SERVER_DOCUMENT_FORMATS.has(suffix) && file.size > MAX_SERVER_EXTRACTION_SIZE) {
      throw new Error("Этот формат пока разбирается сервером только до 3 МБ. Уменьшите файл или загрузите PDF/DOCX/XLSX.");
    }
    if (SERVER_DOCUMENT_FORMATS.has(suffix) && !options.accessToken) {
      throw new Error("Для этого формата нужна активная staff-сессия Captain's Bridge.");
    }
    throw new Error("Поддерживаются TXT, CSV, JSON, PDF, DOC/DOCX, XLS/XLSX, PPT/PPTX, EML/MSG и изображения.");
  }

  if (!text) throw new Error("Из файла не удалось извлечь текст.");
  return {
    text,
    format,
    extractionMethod,
    sha256,
    size: file.size,
    mimeType: file.type || "application/octet-stream",
  };
}

export const safeStorageName = (name: string) => name
  .normalize("NFKD")
  .replace(/[^a-zA-Z0-9._-]+/g, "-")
  .replace(/^-+|-+$/g, "")
  .slice(0, 120) || "offer-source";
