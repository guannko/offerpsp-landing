#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { extractPdfText } from "../api/_lib/pdf-text-extractor.mjs";

const source = process.argv[2];
if (!source) throw new Error("Usage: node scripts/test-pdf-extractor.mjs <file.pdf>");

const result = await extractPdfText(await readFile(resolve(source)));
if (!result.text || result.text.length < 100) throw new Error("PDF text extraction returned too little text.");

process.stdout.write(`${JSON.stringify({
  pageCount: result.pageCount,
  textLength: result.text.length,
  extractionMethod: result.extractionMethod,
  containsPayokTable: /Country\s+Type\s+APM/i.test(result.text) && /Indonesia/i.test(result.text) && /India/i.test(result.text),
})}\n`);
