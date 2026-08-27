#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { renderPage, seoPages } from "./generate-seo-pages.mjs";

const root = resolve(import.meta.dirname, "..");
const [sitemap, llms, home, terms, privacy, generatorSource, vercelConfigSource] = await Promise.all([
  readFile(resolve(root, "sitemap.xml"), "utf8"),
  readFile(resolve(root, "llms.txt"), "utf8"),
  readFile(resolve(root, "index.html"), "utf8"),
  readFile(resolve(root, "terms.html"), "utf8"),
  readFile(resolve(root, "privacy.html"), "utf8"),
  readFile(resolve(root, "scripts/generate-seo-pages.mjs"), "utf8"),
  readFile(resolve(root, "vercel.json"), "utf8"),
]);

const vercelConfig = JSON.parse(vercelConfigSource);

const cspRule = vercelConfig.headers.find((rule) => rule.source === "/(.*)");
const csp = cspRule?.headers?.find((header) => header.key === "Content-Security-Policy")?.value ?? "";
const cspDirective = (name) => csp
  .split(";")
  .map((directive) => directive.trim())
  .find((directive) => directive.startsWith(`${name} `)) ?? "";
const sha256 = (value) => `'sha256-${createHash("sha256").update(value).digest("base64")}'`;
const executableInlineScripts = (html) => [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
  .filter((match) => !/\bsrc\s*=/.test(match[1]))
  .filter((match) => !/type=["']application\/ld\+json["']/i.test(match[1]))
  .map((match) => match[2]);
const inlineStyles = (html) => [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)]
  .map((match) => match[1]);

const renderedPages = [home, terms, privacy, ...seoPages.map(renderPage)];
const scriptDirective = cspDirective("script-src");
const styleDirective = cspDirective("style-src");
assert.ok(scriptDirective, "CSP must define script-src");
assert.ok(styleDirective, "CSP must define style-src");
assert.ok(!scriptDirective.includes("'unsafe-inline'"), "script-src must not allow arbitrary inline JavaScript");
assert.ok(!styleDirective.includes("'unsafe-inline'"), "style-src must not allow arbitrary inline CSS");
for (const source of renderedPages.flatMap(executableInlineScripts)) {
  assert.ok(scriptDirective.includes(sha256(source)), "every executable inline script must be covered by a CSP hash");
}
for (const source of renderedPages.flatMap(inlineStyles)) {
  assert.ok(styleDirective.includes(sha256(source)), "every inline style block must be covered by a CSP hash");
}

const slugs = seoPages.map((page) => page.slug);
const knownSlugs = new Set(slugs);

assert.equal(knownSlugs.size, slugs.length, "SEO page slugs must be unique");

for (const page of seoPages) {
  const url = `https://offerpsp.com/${page.slug}.html`;
  assert.match(page.title, /OfferPSP$/, `${page.slug} title must identify OfferPSP`);
  assert.ok(page.description.length >= 80 && page.description.length <= 170, `${page.slug} meta description must be useful and concise`);
  assert.ok(page.points.length >= 4, `${page.slug} must explain the operating requirements`);
  assert.ok(page.faqs.length >= 4, `${page.slug} must answer concrete merchant questions`);
  assert.ok(sitemap.includes(`<loc>${url}</loc>`), `${page.slug} is missing from sitemap.xml`);
  assert.ok(llms.includes(url), `${page.slug} is missing from llms.txt`);

  for (const relatedSlug of page.related) {
    assert.ok(knownSlugs.has(relatedSlug), `${page.slug} links to unknown SEO page ${relatedSlug}`);
  }
}

for (const slug of [
  "high-risk-payment-provider",
  "payment-provider-for-ecommerce",
  "psp-for-video-games",
  "psp-for-igaming",
  "psp-for-forex",
]) {
  assert.ok(home.includes(`href="/${slug}.html"`), `${slug} must be linked from the home page`);
}

for (const slug of [
  "payment-provider-europe",
  "high-risk-payment-provider",
  "psp-for-forex",
  "psp-for-igaming",
  "psp-for-video-games",
]) {
  const page = seoPages.find((candidate) => candidate.slug === slug);
  assert.ok(page, `${slug} must exist`);
  assert.match(page.description, /^Private\b/i, `${slug} must lead with the private matching proposition`);
  assert.match(page.description, /qualified introductions/i, `${slug} must describe the qualified outcome`);
  assert.match(page.description, /without a public provider list/i, `${slug} must explain the non-directory model`);
  assert.ok(page.description.length <= 160, `${slug} meta description must remain snippet-sized`);
  assert.equal(page.modified, "2026-08-28", `${slug} structured data must record the content update`);
  assert.ok(
    sitemap.includes(`<loc>https://offerpsp.com/${slug}.html</loc>\n    <lastmod>2026-08-28</lastmod>`),
    `${slug} sitemap lastmod must reflect the content update`,
  );
}

const attributionAsset = "/acquisition-attribution.js?v=20260827-1";
assert.ok(home.includes(attributionAsset), "home page must use a versioned acquisition attribution asset");
assert.ok(generatorSource.includes(attributionAsset), "SEO pages must use a versioned acquisition attribution asset");

const attributionCacheRule = vercelConfig.headers.find((rule) => rule.source === "/acquisition-attribution.js");
assert.ok(attributionCacheRule, "acquisition attribution asset must have an explicit cache rule");
const browserCacheHeader = attributionCacheRule.headers.find((header) => header.key === "Cache-Control");
assert.match(
  browserCacheHeader?.value ?? "",
  /max-age=31536000.*immutable/,
  "versioned acquisition attribution asset must be cached immutably for one year",
);

process.stdout.write(`PASS ${seoPages.length} SEO pages are complete, internally valid and discoverable\n`);
