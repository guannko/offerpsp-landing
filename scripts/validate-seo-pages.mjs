#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { seoPages } from "./generate-seo-pages.mjs";

const root = resolve(import.meta.dirname, "..");
const [sitemap, llms, home, generatorSource, vercelConfigSource] = await Promise.all([
  readFile(resolve(root, "sitemap.xml"), "utf8"),
  readFile(resolve(root, "llms.txt"), "utf8"),
  readFile(resolve(root, "index.html"), "utf8"),
  readFile(resolve(root, "scripts/generate-seo-pages.mjs"), "utf8"),
  readFile(resolve(root, "vercel.json"), "utf8"),
]);

const vercelConfig = JSON.parse(vercelConfigSource);

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
