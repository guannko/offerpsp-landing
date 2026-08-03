#!/usr/bin/env node

import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const output = resolve(root, ".vercel-static");
const adminDist = resolve(root, "platform-v2", "dist");

const publicFiles = [
  "index.html",
  "privacy.html",
  "terms.html",
  "favicon.svg",
  "og-offerpsp.png",
  "robots.txt",
  "sitemap.xml",
];

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

for (const file of publicFiles) {
  await cp(resolve(root, file), resolve(output, file));
}

await cp(resolve(root, "admin"), resolve(output, "admin-legacy"), { recursive: true });
await cp(resolve(root, "portal"), resolve(output, "portal"), { recursive: true });
await cp(adminDist, resolve(output, "admin"), { recursive: true });

const legacyIndexPath = resolve(output, "admin-legacy", "index.html");
const legacyAppPath = resolve(output, "admin-legacy", "app.js");
const legacyIndex = (await readFile(legacyIndexPath, "utf8")).replaceAll("/admin/", "/admin-legacy/");
const legacyApp = (await readFile(legacyAppPath, "utf8")).replaceAll("/admin/", "/admin-legacy/");
await writeFile(legacyIndexPath, legacyIndex);
await writeFile(legacyAppPath, legacyApp);

process.stdout.write("PASS assembled landing, client portal, Control Bridge admin and legacy fallback\n");
