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

type ExtractionProgress = (message: string) => void;

async function createOcrWorker() {
  const { createWorker } = await import("tesseract.js");
  return createWorker(["eng", "rus"]);
}

async function extractImageWithOcr(image: File, onProgress?: ExtractionProgress) {
  onProgress?.("Запускаю OCR для изображения…");
  const worker = await createOcrWorker();
  try {
    const result = await worker.recognize(image);
    return normalizeText(result.data.text);
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
  const pdfDocument = await getDocument({ data: new Uint8Array(buffer) }).promise;
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
      pages.push(normalizeText(recognized.data.text));
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

export async function extractOfferSource(file: File, onProgress?: ExtractionProgress): Promise<ExtractedOfferSource> {
  if (file.size > MAX_SOURCE_SIZE) throw new Error("Максимальный размер исходника — 15 МБ.");
  const buffer = await file.arrayBuffer();
  const suffix = file.name.split(".").pop()?.toLowerCase() || "";
  let text = "";
  let extractionMethod = `offerpsp-browser-adapter:${suffix || "text"}`;
  const format = suffix || "text";

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
    throw new Error("Поддерживаются TXT, CSV, JSON, PDF, DOCX, XLSX, PNG, JPG и WebP.");
  }

  if (!text) throw new Error("Из файла не удалось извлечь текст.");
  return {
    text,
    format,
    extractionMethod,
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
