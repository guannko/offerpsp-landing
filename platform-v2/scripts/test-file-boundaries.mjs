import assert from "node:assert/strict";
import { test } from "node:test";
import JSZip from "jszip";
import { extractOfferEmailAttachment } from "../api/_lib/offer-email-attachments.mjs";
import { checkOfficeArchive, validateOfficeInflation } from "../shared/office-archive.mjs";
import { readBoundedSource } from "../api/_lib/provider-offer-source.mjs";
import { readFile } from "node:fs/promises";

const documentXml = '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Safe OfferPSP fixture</w:t></w:r></w:p></w:body></w:document>';
async function docx(extraName, extraContent = "synthetic harmless payload") {
  const zip = new JSZip();
  zip.file("word/document.xml", documentXml);
  if (extraName) zip.file(extraName, extraContent);
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
test("mail DOCX rejects active/embedded payloads before extraction or persistence", async () => {
  for (const name of ["word/vbaProject.bin", "word/embeddings/payload.doc", "word/payload.exe", "word/payload.js"]) {
    const result = await extractOfferEmailAttachment({ filename: "offer.docx", content: await docx(name) });
    assert.equal(result.accepted, false, `Unsafe entry accepted: ${name}`);
    assert.equal(result.status, "rejected_unsafe");
    assert.equal(result.content_base64, undefined);
    assert.equal(result.extracted_text, undefined);
  }
});
test("normal DOCX remains readable; security rejection does not hide safe text", async () => {
  const result = await extractOfferEmailAttachment({ filename: "offer.docx", content: await docx() });
  assert.equal(result.accepted, true);
  assert.equal(result.status, "extracted");
  assert.match(result.extracted_text, /Safe OfferPSP fixture/);
});
test("invalid PDF signature is rejected, not retained as a reviewable original", async () => {
  const result = await extractOfferEmailAttachment({ filename: "offer.pdf", content: Buffer.from("not a PDF") });
  assert.equal(result.accepted, false);
  assert.equal(result.status, "rejected_unsafe");
  assert.equal(result.content_base64, undefined);
});

test("forged inflation sizes fail before Mammoth", async () => {
  const bytes = await docx(), data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const view = new DataView(data);
  let central = 0;
  for (; central < data.byteLength - 46; central++) {
    if (view.getUint32(central, true) === 0x02014b50 && new TextDecoder().decode(new Uint8Array(data, central + 46, view.getUint16(central + 28, true))) === "word/document.xml") break;
  }
  const local = view.getUint32(central + 42, true);
  view.setUint32(central + 24, 10, true); view.setUint32(local + 22, 10, true);
  await assert.rejects(validateOfficeInflation(data), /Фактический объём|каталогу/);
});
test("very small and encrypted archives fail closed", async () => {
  for (const size of [0, 1, 21]) assert.throws(() => checkOfficeArchive(new ArrayBuffer(size)), /ZIP/);
  const bytes = await docx(), data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), view = new DataView(data);
  for (let i = 0; i < data.byteLength - 46; i++) if (view.getUint32(i, true) === 0x02014b50) { view.setUint16(i + 8, view.getUint16(i + 8, true) | 1, true); break; }
  await assert.rejects(validateOfficeInflation(data), /Зашифрованный/);
});
test("bounded download rejects oversized streams even with a forged content length", async () => {
  let cancelled = false;
  const body = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(6)); controller.enqueue(new Uint8Array(6)); }, cancel() { cancelled = true; } });
  await assert.rejects(readBoundedSource(new Response(body, { headers: { "content-length": "1" } }), 10), /size is invalid/);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(cancelled, true);
  assert.equal((await readBoundedSource(new Response("safe"), 10)).toString(), "safe");
  await assert.rejects(readBoundedSource(new Response("large", { headers: { "content-length": "100" } }), 10), /size is invalid/);
});
test("offer browser adapter guards before attempting server or fallback extraction", async () => {
  const source = await readFile(new URL("../src/lib/offerSourceFiles.ts", import.meta.url), "utf8");
  assert.ok(source.indexOf("await validateOfficeInflation(buffer, suffix)") < source.indexOf("if (SERVER_DOCUMENT_FORMATS.has(suffix)"));
  const provider = await readFile(new URL("../api/_lib/provider-offer-source.mjs", import.meta.url), "utf8");
  assert.ok(provider.indexOf("if (result?.accepted === false)") < provider.indexOf("if ((!result?.extracted_text"));
});
