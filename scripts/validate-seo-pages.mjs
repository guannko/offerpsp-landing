#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { renderPage, seoPages, siteContentRevision } from "./generate-seo-pages.mjs";

const root = resolve(import.meta.dirname, "..");
const [sitemap, llms, home, terms, privacy, matchingVisual, matchingVisualMobile, briefVisual, briefVisualMobile, visualCss, buildSource, generatorSource, vercelConfigSource] = await Promise.all([
  readFile(resolve(root, "sitemap.xml"), "utf8"),
  readFile(resolve(root, "llms.txt"), "utf8"),
  readFile(resolve(root, "index.html"), "utf8"),
  readFile(resolve(root, "terms.html"), "utf8"),
  readFile(resolve(root, "privacy.html"), "utf8"),
  readFile(resolve(root, "content/offerpsp-matching-flow.svg"), "utf8"),
  readFile(resolve(root, "content/offerpsp-matching-flow-mobile.svg"), "utf8"),
  readFile(resolve(root, "content/payment-brief-map.svg"), "utf8"),
  readFile(resolve(root, "content/payment-brief-map-mobile.svg"), "utf8"),
  readFile(resolve(root, "content-visuals.css"), "utf8"),
  readFile(resolve(root, "scripts/build-vercel-output.mjs"), "utf8"),
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
const metaDescription = (html) => html.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i)?.[1] ?? "";
const contentImages = (html) => [...html.matchAll(/<img\b[^>]*class=["'][^"']*content-visual-image[^"']*["'][^>]*>/gi)]
  .map((match) => ({
    source: match[0].match(/\bsrc=["']([^"']+)["']/i)?.[1] ?? "",
    alt: match[0].match(/\balt=["']([^"']+)["']/i)?.[1] ?? "",
  }));
const normalizeText = (value) => String(value)
  .replace(/<[^>]+>/g, " ")
  .replaceAll("&amp;", "&")
  .replaceAll("&quot;", '"')
  .replaceAll("&#39;", "'")
  .replaceAll("&lt;", "<")
  .replaceAll("&gt;", ">")
  .replace(/\s+/g, " ")
  .trim();
const visibleFaqEntries = (html) => [...html.matchAll(
  /<details\b[^>]*>\s*<summary\b[^>]*>([\s\S]*?)<\/summary>\s*<p\b[^>]*>([\s\S]*?)<\/p>\s*<\/details>/gi,
)].map((match) => ({
  question: normalizeText(match[1]),
  answer: normalizeText(match[2]),
}));
const faqSchemaEntries = (html) => [...html.matchAll(
  /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
)].flatMap((match) => {
  const data = JSON.parse(match[1]);
  const nodes = Array.isArray(data?.["@graph"]) ? data["@graph"] : [data];
  return nodes
    .filter((node) => node?.["@type"] === "FAQPage")
    .flatMap((node) => node.mainEntity || [])
    .map((item) => ({
      question: normalizeText(item.name),
      answer: normalizeText(item.acceptedAnswer?.text),
    }));
});

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
for (const [index, renderedPage] of renderedPages.entries()) {
  const visibleFaq = visibleFaqEntries(renderedPage);
  if (visibleFaq.length === 0) continue;
  const schemaFaq = faqSchemaEntries(renderedPage);
  assert.deepEqual(
    schemaFaq,
    visibleFaq,
    `rendered page ${index + 1} must include every visible FAQ question and answer in FAQPage JSON-LD`,
  );
}

for (const [name, html] of [["home", home], ["privacy", privacy], ["terms", terms]]) {
  const description = metaDescription(html);
  assert.ok(description.length >= 150 && description.length <= 160, `${name} meta description must be 150-160 characters`);
}

const homeImages = contentImages(home);
assert.equal(homeImages.length, 1, "home page must include one meaningful content visual");
assert.equal(homeImages[0].source, "/content/offerpsp-matching-flow.svg?v=20260828-1", "home page must load the matching flow visual");
assert.ok(homeImages[0].alt.length >= 80, "home content visual must have a descriptive alt text");
assert.ok(home.includes('/content/offerpsp-matching-flow-mobile.svg?v=20260828-1'), "home page must provide a mobile matching visual");
for (const visual of [matchingVisual, matchingVisualMobile, briefVisual, briefVisualMobile]) {
  assert.match(visual, /<title\b[^>]*>[^<]+<\/title>/, "content SVG must have an accessible title");
  assert.match(visual, /<desc\b[^>]*>[^<]+<\/desc>/, "content SVG must have an accessible description");
}
assert.match(visualCss, /\.content-visual-image\b/, "content visual stylesheet must size content images");
assert.match(buildSource, /cp\(resolve\(root, "content"\)/, "production build must copy content visuals");

const slugs = seoPages.map((page) => page.slug);
const knownSlugs = new Set(slugs);

assert.equal(knownSlugs.size, slugs.length, "SEO page slugs must be unique");

for (const page of seoPages) {
  const url = `https://offerpsp.com/${page.slug}.html`;
  assert.match(page.title, /OfferPSP$/, `${page.slug} title must identify OfferPSP`);
  assert.ok(page.description.length >= 150 && page.description.length <= 160, `${page.slug} meta description must be 150-160 characters`);
  assert.ok(page.points.length >= 4, `${page.slug} must explain the operating requirements`);
  assert.ok(page.faqs.length >= 4, `${page.slug} must answer concrete merchant questions`);
  assert.ok(sitemap.includes(`<loc>${url}</loc>`), `${page.slug} is missing from sitemap.xml`);
  assert.ok(llms.includes(url), `${page.slug} is missing from llms.txt`);
  assert.ok(
    sitemap.includes(`<loc>${url}</loc>\n    <lastmod>${siteContentRevision}</lastmod>`),
    `${page.slug} sitemap lastmod must reflect the current content revision`,
  );
  const pageImages = contentImages(renderPage(page));
  assert.equal(pageImages.length, 1, `${page.slug} must include one meaningful content visual`);
  assert.equal(pageImages[0].source, "/content/payment-brief-map.svg?v=20260828-1", `${page.slug} must load the payment brief visual`);
  assert.ok(pageImages[0].alt.length >= 80, `${page.slug} content visual must have a descriptive alt text`);
  assert.ok(renderPage(page).includes('/content/payment-brief-map-mobile.svg?v=20260828-1'), `${page.slug} must provide a mobile payment brief visual`);

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

for (const source of ["/content-visuals.css", "/content/(.*)"]) {
  const contentVisualCacheRule = vercelConfig.headers.find((rule) => rule.source === source);
  assert.ok(contentVisualCacheRule, `${source} must have an explicit cache rule`);
  assert.match(
    contentVisualCacheRule.headers.find((header) => header.key === "Cache-Control")?.value ?? "",
    /max-age=31536000.*immutable/,
    `${source} must be cached immutably for one year`,
  );
}

process.stdout.write(`PASS ${seoPages.length} SEO pages are complete, internally valid and discoverable\n`);
