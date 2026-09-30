import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(resolve(root, "index.html"), "utf8");

const stripMarkup = (value) => value
  .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
  .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
  .replace(/<[^>]+>/g, " ")
  .replace(/&(?:nbsp|amp|lt|gt|quot|#39);/gi, " ")
  .replace(/\s+/g, " ")
  .trim();

const count = (pattern, value = html) => (value.match(pattern) || []).length;
const includesAll = (...needles) => needles.every((needle) => html.toLowerCase().includes(needle));
const heroHtml = html.match(/<section class="hero"[\s\S]*?<\/section>/i)?.[0] || "";
const heroText = stripMarkup(heroHtml).toLowerCase();
const mainText = stripMarkup(html.match(/<main\b[\s\S]*?<\/main>/i)?.[0] || html);
const sectionIds = [...html.matchAll(/<section\b[^>]*\bid="([^"]+)"/gi)].map((match) => match[1]);
const solutionCount = count(/class="solution-card"/g);

const formHtml = html.match(/<form\b[^>]*id="leadForm"[\s\S]*?<\/form>/i)?.[0] || "";
const visibleFields = [...formHtml.matchAll(/<(input|select|textarea)\b([^>]*)>/gi)]
  .map(([, tag, attributes]) => ({
    tag: tag.toLowerCase(),
    attributes,
    name: attributes.match(/\bname="([^"]+)"/i)?.[1] || null,
    type: attributes.match(/\btype="([^"]+)"/i)?.[1] || tag.toLowerCase(),
    required: /\brequired\b/i.test(attributes),
    autocomplete: attributes.match(/\bautocomplete="([^"]+)"/i)?.[1] || null,
    tabIndex: attributes.match(/\btabindex="([^"]+)"/i)?.[1] || null,
  }))
  .filter((field) => field.type !== "hidden" && field.name !== "website_url");

const checks = [];
const check = (category, id, pass, evidence) => checks.push({ category, id, pass, evidence });

check("technical", "single-h1", count(/<h1\b/gi) === 1, `${count(/<h1\b/gi)} H1`);
check("technical", "semantic-landmarks", includesAll("<main", "<header", "<footer", "<nav"), "main/header/footer/nav present");
check("technical", "skip-link", /class="skip-link"[^>]*href="#main"/i.test(html), "skip link targets #main");
check("technical", "reduced-motion", /prefers-reduced-motion:\s*reduce/i.test(html), "reduced-motion CSS/JS branch present");
check("technical", "live-region", /id="formStatus"[^>]*role="status"[^>]*aria-live="polite"/i.test(html), "form status is announced");

check("logic", "hero-service", /psp matching|payment partner/i.test(heroText), "service category appears in hero");
check("logic", "hero-outcome", /shortlist|introduction/i.test(heroText), "shortlist/introduction outcome appears in hero");
check("logic", "hero-qualification", /geo|vertical|volume|risk|method/i.test(heroText), "qualification dimensions appear in hero");
check("logic", "hero-confidentiality", /private|confidential/i.test(heroText), "privacy signal appears in hero");
check("logic", "process-before-directory", sectionIds.indexOf("process") < sectionIds.indexOf("solutions"), `section order: ${sectionIds.join(" -> ")}`);
check("logic", "bounded-homepage-choice", solutionCount <= 6, `${solutionCount} solution cards before the process`);

check("form", "field-labels", visibleFields.every((field) => field.name && new RegExp(`<label\\b[^>]*for="[^\"]*${field.name}[^\"]*"`, "i").test(formHtml)), `${visibleFields.length} visible business/consent fields checked`);
check("form", "required-email", /name="work_email"[^>]*type="email"[^>]*required|type="email"[^>]*name="work_email"[^>]*required/i.test(formHtml), "work email uses email input and is required");
check("form", "useful-autocomplete", ["name", "work_email", "company", "company_url"].every((name) => {
  const field = visibleFields.find((item) => item.name === name);
  return field?.autocomplete;
}), "identity fields expose autocomplete tokens");
check("form", "consent-not-prechecked", !/id="consent"[^>]*\bchecked\b/i.test(formHtml), "consent is required but not prechecked");
check("form", "honeypot-excluded", /name="website_url"[^>]*tabindex="-1"[^>]*autocomplete="off"/i.test(formHtml), "honeypot excluded from keyboard/autofill");

const deceptivePatterns = [
  /countdown|only \d+ (?:spots|places)|act now|last chance/i,
  /guaranteed approval|100% approval|guaranteed processing/i,
  /<input[^>]+type="checkbox"[^>]+checked/i,
];
check("ethics", "no-false-urgency-or-guarantee", deceptivePatterns.every((pattern) => !pattern.test(mainText)), "no countdown, false scarcity, approval guarantee or prechecked checkbox found");
check("ethics", "limitations", /cannot guarantee|does not guarantee|independent provider|independent psp/i.test(mainText), "approval boundary is disclosed");
check("ethics", "privacy-link", /href="\/privacy\.html"/i.test(html), "privacy notice is linked");
check("ethics", "terms-link", /href="\/terms\.html"/i.test(html), "terms are linked");

check("measurement", "pageview-analytics", /\/_vercel\/insights\/script\.js/i.test(html), "Vercel Web Analytics script present");
const requiredFunnelEvents = ["hero_cta_click", "lead_form_open", "lead_form_start", "lead_submit_success", "lead_submit_failure"];
check("measurement", "behavioural-funnel-events", requiredFunnelEvents.every((eventName) => html.includes(eventName)), "required privacy-safe CTA/form funnel events are present");

const byCategory = checks.reduce((groups, item) => {
  (groups[item.category] ||= []).push(item);
  return groups;
}, {});
const summary = Object.fromEntries(Object.entries(byCategory).map(([category, items]) => [
  category,
  { passed: items.filter((item) => item.pass).length, total: items.length },
]));

console.log(JSON.stringify({
  source: "index.html",
  generatedAt: new Date().toISOString(),
  measurements: {
    wordsInMain: mainText.split(/\s+/).filter(Boolean).length,
    headings: { h1: count(/<h1\b/gi), h2: count(/<h2\b/gi), h3: count(/<h3\b/gi) },
    solutionCards: solutionCount,
    sectionOrder: sectionIds,
    visibleFormFields: visibleFields.map(({ name, type, required, autocomplete }) => ({ name, type, required, autocomplete })),
  },
  summary,
  failures: checks.filter((item) => !item.pass),
  checks,
}, null, 2));
