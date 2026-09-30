#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const files = ["index.html", "terms.html", "privacy.html"];
const pages = await Promise.all(files.map((file) => readFile(resolve(root, file), "utf8")));
const [dialogScript, dialogStyles, serviceStyles, legalStyles, buildScript, vercelSource] = await Promise.all([
  readFile(resolve(root, "contact-dialog.js"), "utf8"),
  readFile(resolve(root, "contact-dialog.css"), "utf8"),
  readFile(resolve(root, "service-pages.css"), "utf8"),
  readFile(resolve(root, "legal.css"), "utf8"),
  readFile(resolve(root, "scripts/build-vercel-output.mjs"), "utf8"),
  readFile(resolve(root, "vercel.json"), "utf8"),
]);

for (const [index, page] of pages.entries()) {
  assert.ok(!page.includes("mailto:"), `${files[index]} must not launch a local mail application`);
  assert.ok(page.includes("/contact-dialog.css?v=20260907-5"), `${files[index]} must load contact dialog styles`);
  assert.ok(page.includes("/contact-dialog.js?v=20260907-5"), `${files[index]} must load the contact dialog`);
  assert.ok(page.includes("data-contact-dialog"), `${files[index]} must expose a contact dialog trigger`);
}

for (const [index, page] of pages.slice(1).entries()) {
  assert.ok(!/<style\b/i.test(page), `${files[index + 1]} must use external legal CSS under the global CSP`);
  assert.ok(page.includes("/legal.css?v=20260907-1"), `${files[index + 1]} must load legal page styles`);
}

assert.match(pages[0], /\.back-to-top\s*\{[\s\S]*?bottom:\s*84px;/, "home back-to-top control must sit above the concierge launcher");
assert.match(serviceStyles, /\.back-to-top\s*\{[\s\S]*?bottom:\s*84px;/, "service-page back-to-top control must sit above the concierge launcher");
assert.match(legalStyles, /\.back-to-top\s*\{[\s\S]*?bottom:\s*84px;/, "legal-page back-to-top control must sit above the concierge launcher");
assert.match(dialogStyles, /\.concierge-launch\s*\{[\s\S]*?bottom:\s*22px;/, "desktop concierge launcher baseline must remain stable");

assert.ok(dialogScript.includes("navigator.clipboard.writeText"), "contact dialog must support copying the email address");
assert.ok(dialogScript.includes("mail.google.com"), "contact dialog must offer browser-based Gmail");
assert.ok(dialogScript.includes("outlook.office.com"), "contact dialog must offer browser-based Outlook");
assert.ok(!dialogScript.includes("mailto:"), "contact dialog must never call a local mail handler");
assert.ok(dialogScript.includes("/api/public-concierge"), "public pages must use the same-origin concierge bridge");
assert.ok(dialogScript.includes("offerpsp_concierge_context"), "concierge must preserve a bounded handoff context for the request form");
assert.ok(dialogScript.includes("Request a private match"), "concierge must hand matching requests to the private workspace flow");
assert.ok(!dialogScript.includes("AIBOT_WEBHOOK"), "public script must not know internal webhook credentials");

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
