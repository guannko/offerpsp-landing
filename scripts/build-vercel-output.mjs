#!/usr/bin/env node

import { cp, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { writeSeoPages } from "./generate-seo-pages.mjs";

const root = resolve(import.meta.dirname, "..");
const output = resolve(root, ".vercel-static");
const publicFiles = [
  "index.html",
  "privacy.html",
  "terms.html",
  "favicon.svg",
  "og-offerpsp.png",
  "robots.txt",
  "sitemap.xml",
  "llms.txt",
  "service-pages.css",
  "acquisition-attribution.js",
  "legal.css",
  "contact-dialog.css",
  "contact-dialog.js",
];

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

for (const file of publicFiles) {
  await cp(resolve(root, file), resolve(output, file));
}

await writeSeoPages(output);

await cp(resolve(root, "platform-v2/public/brand"), resolve(output, "brand"), { recursive: true });
await cp(resolve(root, "portal"), resolve(output, "portal"), { recursive: true });
await cp(resolve(root, "psp"), resolve(output, "psp"), { recursive: true });

process.stdout.write("PASS assembled public landing, SEO/GEO pages, merchant portal and PSP portal without staff surfaces\n");
