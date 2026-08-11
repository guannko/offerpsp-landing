#!/usr/bin/env node

import { cp, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

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
];

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

for (const file of publicFiles) {
  await cp(resolve(root, file), resolve(output, file));
}

await cp(resolve(root, "portal"), resolve(output, "portal"), { recursive: true });

process.stdout.write("PASS assembled public landing and client portal without staff surfaces\n");
