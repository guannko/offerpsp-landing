#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { extractPdfText } from "../api/_lib/pdf-text-extractor.mjs";

const source = process.argv[2];

function buildTestPdf() {
  const firstLine = "OfferPSP PDF extraction fixture verifies merchant, payment provider, country, and currency.";
  const secondLine = "It also verifies payment method, limits, fees, settlement terms, and contact details.";
  const stream = `BT\n/F1 12 Tf\n14 TL\n72 720 Td\n(${firstLine}) Tj\nT*\n(${secondLine}) Tj\nET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let body = "%PDF-1.4\n";
  const offsets = [0];
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(Buffer.byteLength(body));
    body += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(body);
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  body += offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(body);
}

const input = source ? await readFile(resolve(source)) : buildTestPdf();
const result = await extractPdfText(input);
if (!result.text || result.text.length < 100) throw new Error("PDF text extraction returned too little text.");
if (!source && (!/OfferPSP PDF extraction fixture/i.test(result.text) || !/settlement terms/i.test(result.text))) {
  throw new Error("Built-in PDF fixture text was not extracted correctly.");
}

process.stdout.write(`${JSON.stringify({
  pageCount: result.pageCount,
  textLength: result.text.length,
  extractionMethod: result.extractionMethod,
  usedBuiltInFixture: !source,
  containsExpectedText: /OfferPSP PDF extraction fixture/i.test(result.text) && /settlement terms/i.test(result.text),
})}\n`);
