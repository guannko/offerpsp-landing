const STORAGE_KEY = "offerpsp_acquisition_v2";

export const MARKETING_PARAMETER_KEYS = [
  "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
  "gclid", "gbraid", "wbraid", "dclid", "gad_source", "gad_campaignid",
  "msclkid", "fbclid", "li_fat_id", "ttclid",
  "affiliate_id", "affiliate_click_id", "aff_id", "click_id",
  "sub_id", "sub1", "sub2", "sub3", "sub4", "sub5",
];

const PAID_MEDIUM = /^(cpc|ppc|paid(?:[-_ ]?(?:search|social))?|display|cpm|cpa|retargeting)$/i;
const GOOGLE_CLICK_KEYS = ["gclid", "gbraid", "wbraid", "dclid"];

const sourceDirectory = [
  { platform: "chatgpt", category: "ai", domains: ["chatgpt.com", "chat.openai.com", "openai.com"], aliases: ["chatgpt", "openai"] },
  { platform: "gemini", category: "ai", domains: ["gemini.google.com", "bard.google.com"], aliases: ["gemini", "google-gemini", "bard"] },
  { platform: "claude", category: "ai", domains: ["claude.ai"], aliases: ["claude", "anthropic"] },
  { platform: "perplexity", category: "ai", domains: ["perplexity.ai"], aliases: ["perplexity"] },
  { platform: "copilot", category: "ai", domains: ["copilot.microsoft.com"], aliases: ["copilot", "microsoft-copilot"] },
  { platform: "grok", category: "ai", domains: ["grok.com"], aliases: ["grok", "xai"] },
  { platform: "deepseek", category: "ai", domains: ["chat.deepseek.com", "deepseek.com"], aliases: ["deepseek"] },
  { platform: "mistral", category: "ai", domains: ["chat.mistral.ai", "mistral.ai"], aliases: ["mistral", "le-chat", "lechat"] },
  { platform: "meta-ai", category: "ai", domains: ["meta.ai"], aliases: ["meta-ai", "metaai"] },
  { platform: "you-com", category: "ai", domains: ["you.com"], aliases: ["you", "you-com"] },
  { platform: "poe", category: "ai", domains: ["poe.com"], aliases: ["poe"] },
  { platform: "phind", category: "ai", domains: ["phind.com"], aliases: ["phind"] },
  { platform: "qwen", category: "ai", domains: ["qwen.ai", "chat.qwen.ai"], aliases: ["qwen", "tongyi"] },
  { platform: "kimi", category: "ai", domains: ["kimi.com", "kimi.moonshot.cn"], aliases: ["kimi", "moonshot"] },
  { platform: "doubao", category: "ai", domains: ["doubao.com"], aliases: ["doubao"] },
  { platform: "huggingchat", category: "ai", domains: ["huggingface.co"], aliases: ["huggingchat"] },
  { platform: "google", category: "search", domains: ["google.com", "google.co.uk", "google.de", "google.fr", "google.it"], aliases: ["google"] },
  { platform: "bing", category: "search", domains: ["bing.com"], aliases: ["bing"] },
  { platform: "duckduckgo", category: "search", domains: ["duckduckgo.com"], aliases: ["duckduckgo", "ddg"] },
  { platform: "brave-search", category: "search", domains: ["search.brave.com"], aliases: ["brave", "brave-search"] },
  { platform: "ecosia", category: "search", domains: ["ecosia.org"], aliases: ["ecosia"] },
  { platform: "baidu", category: "search", domains: ["baidu.com"], aliases: ["baidu"] },
  { platform: "yahoo", category: "search", domains: ["search.yahoo.com", "yahoo.com"], aliases: ["yahoo"] },
  { platform: "yandex", category: "search", domains: ["yandex.com", "yandex.ru"], aliases: ["yandex"] },
  { platform: "linkedin", category: "social", domains: ["linkedin.com"], aliases: ["linkedin"] },
  { platform: "telegram", category: "social", domains: ["t.me", "telegram.org"], aliases: ["telegram", "tg"] },
  { platform: "x", category: "social", domains: ["x.com", "twitter.com"], aliases: ["x", "twitter"] },
  { platform: "facebook", category: "social", domains: ["facebook.com", "m.facebook.com"], aliases: ["facebook", "fb"] },
  { platform: "instagram", category: "social", domains: ["instagram.com"], aliases: ["instagram"] },
  { platform: "youtube", category: "social", domains: ["youtube.com", "youtu.be"], aliases: ["youtube"] },
  { platform: "reddit", category: "social", domains: ["reddit.com"], aliases: ["reddit"] },
  { platform: "tiktok", category: "social", domains: ["tiktok.com"], aliases: ["tiktok"] },
];

const trimText = (value, max = 300) => String(value || "").trim().slice(0, max);
const normalizeSource = (value) => trimText(value, 160)
  .toLowerCase()
  .replace(/^https?:\/\//, "")
  .replace(/^www\./, "")
  .split(/[/?#]/)[0]
  .replace(/[^a-z0-9._-]/g, "-")
  .slice(0, 80);
const hostMatches = (host, domain) => host === domain || host.endsWith(`.${domain}`);
const resolveDirectoryEntry = ({ host = "", alias = "" } = {}) => sourceDirectory.find((entry) =>
  entry.domains.some((domain) => hostMatches(host, domain)) || entry.aliases.includes(alias)
);

const safeReferrer = (referrer) => {
  if (!referrer) return "";
  try {
    const url = new URL(referrer);
    return `${url.origin}${url.pathname}`.slice(0, 500);
  } catch {
    return "";
  }
};

const readStored = (storage) => {
  if (!storage) return {};
  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEY) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const writeStored = (storage, value) => {
  if (!storage) return;
  try { storage.setItem(STORAGE_KEY, JSON.stringify(value)); } catch { /* storage can be unavailable */ }
};

const randomSessionId = (cryptoApi, now) => {
  if (typeof cryptoApi?.randomUUID === "function") return cryptoApi.randomUUID();
  return `${now.getTime()}-${Math.random().toString(36).slice(2)}`;
};

export function buildAcquisitionTouch({ href, referrer = "", capturedAt = new Date().toISOString() }) {
  const url = new URL(href);
  const params = url.searchParams;
  const sanitizedReferrer = safeReferrer(referrer);
  const explicitSource = normalizeSource(params.get("utm_source"));
  const medium = trimText(params.get("utm_medium"), 160);
  let referrerHost = "";
  if (sanitizedReferrer) {
    try { referrerHost = new URL(sanitizedReferrer).hostname.toLowerCase(); } catch { referrerHost = ""; }
  }

  const hasGoogleClick = GOOGLE_CLICK_KEYS.some((key) => params.has(key));
  const hasAffiliateClick = ["affiliate_id", "affiliate_click_id", "aff_id", "click_id"].some((key) => params.has(key));
  const hasMarketingParams = MARKETING_PARAMETER_KEYS.some((key) => params.has(key));
  const isInternal = Boolean(referrerHost && hostMatches(referrerHost, url.hostname.toLowerCase()));
  const directoryEntry = resolveDirectoryEntry({ host: referrerHost, alias: explicitSource });

  let platform = directoryEntry?.platform || explicitSource || (referrerHost && !isInternal ? referrerHost.replace(/^www\./, "") : "direct");
  let category = directoryEntry?.category || (hasMarketingParams ? "campaign" : (referrerHost && !isInternal ? "referral" : "direct"));
  if (hasGoogleClick || (explicitSource === "google" && PAID_MEDIUM.test(medium))) {
    platform = "google-ads";
    category = "campaign";
  } else if (hasAffiliateClick || PAID_MEDIUM.test(medium)) {
    platform = explicitSource || "affiliate";
    category = "campaign";
  }

  const touch = {
    source_category: category,
    source_platform: platform,
    referrer: isInternal ? "" : sanitizedReferrer,
    landing_path: url.pathname.slice(0, 300),
    captured_at: capturedAt,
  };
  for (const key of MARKETING_PARAMETER_KEYS) {
    const value = trimText(params.get(key), 300);
    if (value) touch[key] = value;
  }
  return { touch, meaningful: hasMarketingParams || Boolean(referrerHost && !isInternal) };
}

export function collectAcquisitionAttribution({
  href = globalThis.window?.location?.href,
  referrer = globalThis.document?.referrer || "",
  storage = globalThis.window?.sessionStorage,
  cryptoApi = globalThis.crypto,
  now = new Date(),
} = {}) {
  if (!href) return null;
  const stored = readStored(storage);
  const { touch: currentTouch, meaningful } = buildAcquisitionTouch({
    href,
    referrer,
    capturedAt: now.toISOString(),
  });
  const firstTouch = stored.first_touch || currentTouch;
  const lastTouch = meaningful || !stored.last_touch ? currentTouch : stored.last_touch;
  const result = {
    version: 2,
    first_touch: firstTouch,
    last_touch: lastTouch,
    session_id: trimText(stored.session_id, 120) || randomSessionId(cryptoApi, now),
  };
  writeStored(storage, result);
  return result;
}

export function buildLeadAttributionFields(attribution) {
  const lastTouch = attribution?.last_touch || {};
  const firstTouch = attribution?.first_touch || {};
  return {
    source_category: lastTouch.source_category || null,
    source_platform: lastTouch.source_platform || null,
    source_referrer: lastTouch.referrer || null,
    landing_path: lastTouch.landing_path || null,
    utm_source: lastTouch.utm_source || null,
    utm_medium: lastTouch.utm_medium || null,
    utm_campaign: lastTouch.utm_campaign || null,
    utm_term: lastTouch.utm_term || null,
    utm_content: lastTouch.utm_content || null,
    gclid: lastTouch.gclid || null,
    gbraid: lastTouch.gbraid || null,
    wbraid: lastTouch.wbraid || null,
    dclid: lastTouch.dclid || null,
    msclkid: lastTouch.msclkid || null,
    fbclid: lastTouch.fbclid || null,
    li_fat_id: lastTouch.li_fat_id || null,
    ttclid: lastTouch.ttclid || null,
    affiliate_id: lastTouch.affiliate_id || lastTouch.aff_id || null,
    affiliate_click_id: lastTouch.affiliate_click_id || lastTouch.click_id || null,
    first_touch_at: firstTouch.captured_at || null,
    last_touch_at: lastTouch.captured_at || null,
    attribution,
  };
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  window.offerpspAcquisition = collectAcquisitionAttribution();
}
