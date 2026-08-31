import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const { createCanvas, loadImage } = require("../../../platform-v2/node_modules/@napi-rs/canvas");

const outputDirectory = fileURLToPath(new URL(".", import.meta.url));
const width = 1080;
const height = 1350;

const slides = [
  {
    eyebrow: "A MATCHABLE MERCHANT REQUEST",
    headlineSize: 82,
    headline: ["“We need a PSP”", "is only the", "starting point."],
    body: ["A provider needs operating context", "before it can review the case."],
  },
  {
    eyebrow: "01 · APPLICANT",
    headlineSize: 78,
    headline: ["Business model,", "legal entity", "& licence."],
    body: ["Company · website · jurisdiction", "Vertical · licence status"],
  },
  {
    eyebrow: "02 · MARKETS",
    headlineSize: 84,
    headline: ["Operating and", "target GEOs."],
    body: ["Where are the company, customers", "and payment flows?"],
  },
  {
    eyebrow: "03 · PAYMENT FLOWS",
    headlineSize: 84,
    headline: ["Currencies,", "methods & flows."],
    body: ["PayIn · PayOut · cards · banks", "Local methods · settlement currencies"],
  },
  {
    eyebrow: "04 · COMMERCIAL SCALE",
    headlineSize: 82,
    headline: ["Volume, ticket", "& settlement."],
    body: ["Expected monthly volume · average ticket", "Limits · settlement cadence"],
  },
  {
    eyebrow: "05 · RISK & DELIVERY",
    headlineSize: 82,
    headline: ["Traffic, risk", "& integration."],
    body: ["Traffic source · material restrictions", "Current setup · API/hosted page · timing"],
  },
  {
    eyebrow: "WHAT THE BRIEF DOES",
    headlineSize: 82,
    headline: ["Better input", "speeds provider", "review."],
    body: ["It improves relevance.", "It never guarantees approval."],
  },
];

const escapeXml = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

const textLines = (lines, { x, y, lineHeight, size, weight, fill, letterSpacing = 0 }) => lines
  .map((line, index) => `<text x="${x}" y="${y + index * lineHeight}" fill="${fill}" font-family="Arial, Helvetica, sans-serif" font-size="${size}" font-weight="${weight}" letter-spacing="${letterSpacing}">${escapeXml(line)}</text>`)
  .join("\n");

const renderSvg = (slide, index) => `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">
  <title id="title">OfferPSP merchant brief carousel slide ${index + 1}</title>
  <desc id="desc">${escapeXml([...slide.headline, ...slide.body].join(" "))}</desc>
  <defs>
    <linearGradient id="background" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#080a13"/>
      <stop offset="0.62" stop-color="#0d101c"/>
      <stop offset="1" stop-color="#210c21"/>
    </linearGradient>
    <linearGradient id="brand" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#ff4778"/>
      <stop offset="1" stop-color="#ff7899"/>
    </linearGradient>
    <radialGradient id="glow" cx="78%" cy="24%" r="62%">
      <stop offset="0" stop-color="#ff4778" stop-opacity="0.20"/>
      <stop offset="1" stop-color="#ff4778" stop-opacity="0"/>
    </radialGradient>
    <pattern id="grid" width="54" height="54" patternUnits="userSpaceOnUse">
      <path d="M54 0H0V54" fill="none" stroke="#ffffff" stroke-opacity="0.035" stroke-width="1"/>
    </pattern>
  </defs>
  <rect width="1080" height="1350" fill="url(#background)"/>
  <rect width="1080" height="1350" fill="url(#glow)"/>
  <rect width="1080" height="1350" fill="url(#grid)"/>
  <rect x="0" y="0" width="18" height="1350" fill="url(#brand)"/>
  <circle cx="1000" cy="110" r="180" fill="#ff4778" opacity="0.055"/>
  <circle cx="1020" cy="1220" r="260" fill="#ff7899" opacity="0.04"/>

  <text x="90" y="130" fill="url(#brand)" font-family="Arial Black, Arial, sans-serif" font-size="48" font-weight="900">OfferPSP</text>
  <text x="990" y="126" text-anchor="end" fill="#b9beca" font-family="Arial, Helvetica, sans-serif" font-size="26" font-weight="700">${String(index + 1).padStart(2, "0")} / ${String(slides.length).padStart(2, "0")}</text>

  <rect x="90" y="245" width="130" height="8" rx="4" fill="url(#brand)"/>
  <text x="90" y="322" fill="#ff7899" font-family="Arial, Helvetica, sans-serif" font-size="25" font-weight="800" letter-spacing="2.6">${escapeXml(slide.eyebrow)}</text>

  ${textLines(slide.headline, { x: 90, y: 475, lineHeight: 106, size: slide.headlineSize, weight: 800, fill: "#fffaf4", letterSpacing: -1.2 })}
  ${textLines(slide.body, { x: 92, y: 910, lineHeight: 56, size: 37, weight: 500, fill: "#c2c6d1" })}

  <line x1="90" y1="1190" x2="990" y2="1190" stroke="#ffffff" stroke-opacity="0.12"/>
  <circle cx="100" cy="1260" r="9" fill="#ff4778"/>
  <text x="126" y="1272" fill="#dfe2ea" font-family="Arial, Helvetica, sans-serif" font-size="30" font-weight="700">Structured briefs before introductions</text>
  <text x="990" y="1272" text-anchor="end" fill="#ff7899" font-family="Arial, Helvetica, sans-serif" font-size="27" font-weight="800">offerpsp.com</text>
</svg>`;

await mkdir(outputDirectory, { recursive: true });
const renderedPngPaths = [];

for (const [index, slide] of slides.entries()) {
  const basename = `slide-${String(index + 1).padStart(2, "0")}`;
  const svg = renderSvg(slide, index);
  const svgPath = path.join(outputDirectory, `${basename}.svg`);
  const pngPath = path.join(outputDirectory, `${basename}.png`);
  await writeFile(svgPath, svg, "utf8");
  const image = await loadImage(Buffer.from(svg));
  const canvas = createCanvas(width, height);
  canvas.getContext("2d").drawImage(image, 0, 0, width, height);
  await writeFile(pngPath, canvas.toBuffer("image/png"));
  renderedPngPaths.push(pngPath);
}

const columns = 3;
const previewTileWidth = 320;
const previewTileHeight = 400;
const previewGap = 24;
const rows = Math.ceil(renderedPngPaths.length / columns);
const previewWidth = previewTileWidth * columns + previewGap * (columns + 1);
const previewHeight = previewTileHeight * rows + previewGap * (rows + 1);
const previewCanvas = createCanvas(previewWidth, previewHeight);
const previewContext = previewCanvas.getContext("2d");
previewContext.fillStyle = "#080a13";
previewContext.fillRect(0, 0, previewWidth, previewHeight);
for (const [index, pngPath] of renderedPngPaths.entries()) {
  const image = await loadImage(pngPath);
  const column = index % columns;
  const row = Math.floor(index / columns);
  previewContext.drawImage(
    image,
    previewGap + column * (previewTileWidth + previewGap),
    previewGap + row * (previewTileHeight + previewGap),
    previewTileWidth,
    previewTileHeight,
  );
}
await writeFile(path.join(outputDirectory, "preview.png"), previewCanvas.toBuffer("image/png"));

console.log(`Rendered ${slides.length} OfferPSP merchant-brief slides to ${outputDirectory}`);
