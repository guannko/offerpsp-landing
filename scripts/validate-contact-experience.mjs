#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const files = ["index.html", "terms.html", "privacy.html"];
const pages = await Promise.all(files.map((file) => readFile(resolve(root, file), "utf8")));
const [dialogScript, buildScript, vercelSource] = await Promise.all([
  readFile(resolve(root, "contact-dialog.js"), "utf8"),
  readFile(resolve(root, "scripts/build-vercel-output.mjs"), "utf8"),
  readFile(resolve(root, "vercel.json"), "utf8"),
]);

for (const [index, page] of pages.entries()) {
  assert.ok(!page.includes("mailto:"), `${files[index]} must not launch a local mail application`);
  assert.ok(page.includes("/contact-dialog.css?v=20260828-1"), `${files[index]} must load contact dialog styles`);
  assert.ok(page.includes("/contact-dialog.js?v=20260828-2"), `${files[index]} must load the contact dialog`);
  assert.ok(page.includes("data-contact-dialog"), `${files[index]} must expose a contact dialog trigger`);
}

for (const [index, page] of pages.slice(1).entries()) {
  assert.ok(!/<style\b/i.test(page), `${files[index + 1]} must use external legal CSS under the global CSP`);
  assert.ok(page.includes("/legal.css?v=20260828-1"), `${files[index + 1]} must load legal page styles`);
}

assert.ok(dialogScript.includes("navigator.clipboard.writeText"), "contact dialog must support copying the email address");
assert.ok(dialogScript.includes("mail.google.com"), "contact dialog must offer browser-based Gmail");
assert.ok(dialogScript.includes("outlook.office.com"), "contact dialog must offer browser-based Outlook");
assert.ok(!dialogScript.includes("mailto:"), "contact dialog must never call a local mail handler");

for (const asset of ["legal.css", "contact-dialog.css", "contact-dialog.js"]) {
  assert.ok(buildScript.includes(`"${asset}"`), `${asset} must be included in the Vercel output`);
}

const vercelConfig = JSON.parse(vercelSource);
const assetCacheRule = vercelConfig.headers.find((rule) => rule.source.includes("contact-dialog.js"));
assert.ok(assetCacheRule, "contact and legal assets must have an explicit cache rule");
assert.ok(
  assetCacheRule.headers.some((header) => header.key === "Cache-Control" && /max-age=31536000.*immutable/.test(header.value)),
  "versioned contact and legal assets must use a one-year immutable browser cache",
);

process.stdout.write("PASS legal pages and browser-based contact dialog are CSP-safe\n");
