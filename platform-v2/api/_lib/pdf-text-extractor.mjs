import { DOMMatrix, ImageData, Path2D } from "@napi-rs/canvas";
import { WorkerMessageHandler } from "pdfjs-dist/legacy/build/pdf.worker.mjs";

if (!globalThis.DOMMatrix) globalThis.DOMMatrix = DOMMatrix;
if (!globalThis.ImageData) globalThis.ImageData = ImageData;
if (!globalThis.Path2D) globalThis.Path2D = Path2D;
if (!globalThis.pdfjsWorker) globalThis.pdfjsWorker = { WorkerMessageHandler };

const MAX_PDF_PAGES = 50;

function normalizeText(value) {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

function textContentToLines(content) {
  let output = "";
  for (const item of content.items || []) {
    if (!("str" in item)) continue;
    const value = String(item.str || "").trim();
    if (value) output += value;
    output += item.hasEOL ? "\n" : " ";
  }
  return normalizeText(output);
}

export async function extractPdfText(buffer) {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const document = await getDocument({
    data: new Uint8Array(buffer),
    disableFontFace: true,
    useSystemFonts: false,
  }).promise;

  if (document.numPages > MAX_PDF_PAGES) {
    throw new Error(`PDF has ${document.numPages} pages; maximum is ${MAX_PDF_PAGES}.`);
  }

  const pages = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent({ includeMarkedContent: false });
    const text = textContentToLines(content);
    if (text) pages.push(text);
    page.cleanup();
  }

  const text = normalizeText(pages.join("\n\n"));
  return {
    text,
    pageCount: document.numPages,
    extractionMethod: text ? "offerpsp-server-pdfjs-v1" : "offerpsp-server-pdfjs-empty-v1",
  };
}
