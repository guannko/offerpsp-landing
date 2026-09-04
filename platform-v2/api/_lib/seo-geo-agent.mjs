const AGENT_NAME = "OfferPSP SEO/GEO Agent";
const AGENT_VERSION = "offerpsp-seo-geo-agent-v1";
const DEFAULT_WEBHOOK_PATH = "offerpsp-seo-geo-agent";
const MAX_PAGES = 40;
const MAX_TEXT_SAMPLE = 3_500;
const SECURITY_HEADERS = [
  "content-security-policy",
  "x-frame-options",
  "x-content-type-options",
  "referrer-policy",
  "permissions-policy",
];

const clampText = (value, maximum = 1_000) => String(value || "").replace(/\s+/g, " ").trim().slice(0, maximum);

function decodeHtml(value) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function tagValues(html, tag, maximum = 10) {
  const pattern = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi");
  return [...String(html || "").matchAll(pattern)]
    .slice(0, maximum)
    .map((match) => clampText(decodeHtml(match[1].replace(/<[^>]+>/g, " ")), 300))
    .filter(Boolean);
}

function metaContent(html, name) {
  const tags = String(html || "").match(/<meta\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const key = tag.match(/(?:name|property)=["']([^"']+)["']/i)?.[1];
    if (String(key || "").toLowerCase() !== name.toLowerCase()) continue;
    return clampText(decodeHtml(tag.match(/content=["']([^"']*)["']/i)?.[1]), 500);
  }
  return "";
}

function linkHref(html, rel) {
  const tags = String(html || "").match(/<link\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const relation = tag.match(/rel=["']([^"']+)["']/i)?.[1];
    if (!String(relation || "").toLowerCase().split(/\s+/).includes(rel.toLowerCase())) continue;
    return clampText(decodeHtml(tag.match(/href=["']([^"']*)["']/i)?.[1]), 1_000);
  }
  return "";
}

function hreflangAlternates(html) {
  const tags = String(html || "").match(/<link\b[^>]*>/gi) || [];
  return tags.map((tag) => {
    const relations = String(tag.match(/rel=["']([^"']+)["']/i)?.[1] || "").toLowerCase().split(/\s+/);
    if (!relations.includes("alternate")) return null;
    const hreflang = clampText(decodeHtml(tag.match(/hreflang=["']([^"']+)["']/i)?.[1]), 40);
    const href = clampText(decodeHtml(tag.match(/href=["']([^"']+)["']/i)?.[1]), 1_000);
    return hreflang && href ? { hreflang, href } : null;
  }).filter(Boolean).slice(0, 20);
}

function visibleText(html) {
  return clampText(decodeHtml(String(html || "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, " ")
    .replace(/<!--([\s\S]*?)-->/g, " ")
    .replace(/<[^>]+>/g, " ")), MAX_TEXT_SAMPLE);
}

function formControlInventory(html) {
  const source = String(html || "");
  const controls = [...source.matchAll(/<(input|select|textarea)\b[^>]*>/gi)]
    .filter((match) => {
      if (match[1].toLowerCase() !== "input") return true;
      const type = match[0].match(/\btype=["']([^"']+)["']/i)?.[1]?.toLowerCase() || "text";
      return !["hidden", "submit", "button", "reset", "image"].includes(type);
    });
  const labelTargets = new Set([...source.matchAll(/<label\b[^>]*\bfor=["']([^"']+)["'][^>]*>/gi)]
    .map((match) => decodeHtml(match[1]).trim())
    .filter(Boolean));
  const unlabeledControls = [];

  for (const match of controls) {
    const tag = match[0];
    const id = decodeHtml(tag.match(/\bid=["']([^"']+)["']/i)?.[1]).trim();
    const name = decodeHtml(tag.match(/\bname=["']([^"']+)["']/i)?.[1]).trim();
    const type = match[1].toLowerCase() === "input"
      ? (tag.match(/\btype=["']([^"']+)["']/i)?.[1]?.toLowerCase() || "text")
      : match[1].toLowerCase();
    const directlyLabeled = /\b(?:aria-label|aria-labelledby|title)=["']\s*[^"'\s][^"']*["']/i.test(tag);
    const explicitLabel = Boolean(id && labelTargets.has(id));
    const before = source.slice(0, match.index);
    const wrappingLabel = before.lastIndexOf("<label") > before.lastIndexOf("</label>");
    if (!directlyLabeled && !explicitLabel && !wrappingLabel) {
      unlabeledControls.push({
        tag: match[1].toLowerCase(),
        id: clampText(id, 120),
        name: clampText(name, 120),
        type: clampText(type, 40),
      });
    }
  }

  return {
    total: controls.length,
    labeled: controls.length - unlabeledControls.length,
    unlabeled: unlabeledControls.length,
    unlabeled_controls: unlabeledControls.slice(0, 20),
  };
}

function jsonLdTypes(html) {
  const types = new Set();
  const blocks = [...String(html || "").matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const visit = (value) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== "object") return;
    const declared = value["@type"];
    (Array.isArray(declared) ? declared : [declared]).filter(Boolean).forEach((type) => types.add(clampText(type, 120)));
    if (value["@graph"]) visit(value["@graph"]);
  };
  for (const block of blocks) {
    try {
      visit(JSON.parse(decodeHtml(block[1])));
    } catch {
      // Invalid JSON-LD remains visible through json_ld_blocks, but no type is asserted.
    }
  }
  return [...types].filter(Boolean).slice(0, 20);
}

function sitemapUrls(xml, targetOrigin) {
  const urls = [...String(xml || "").matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)]
    .map((match) => decodeHtml(match[1]).trim())
    .filter((value) => {
      try {
        return new URL(value).origin === targetOrigin;
      } catch {
        return false;
      }
    });
  return [...new Set(urls)].slice(0, MAX_PAGES);
}

function sameOriginUrls(text, targetOrigin) {
  return [...new Set((String(text || "").match(/https?:\/\/[^\s<>)\]"']+/gi) || [])
    .map((value) => value.replace(/[.,;:]+$/, ""))
    .filter((value) => {
      try {
        return new URL(value).origin === targetOrigin;
      } catch {
        return false;
      }
    }))].slice(0, 100);
}

async function fetchText(url, fetchImpl) {
  const response = await fetchImpl(url, {
    headers: {
      "user-agent": "OfferPSP-SEO-GEO-Agent/1.0",
      "accept-encoding": "br, gzip",
    },
    signal: AbortSignal.timeout(15_000),
  });
  const text = await response.text();
  const headers = Object.fromEntries([
    ...SECURITY_HEADERS,
    "strict-transport-security",
    "content-encoding",
    "cache-control",
  ].map((name) => [name, clampText(response.headers?.get?.(name), 1_000)]));
  return { ok: response.ok, status: response.status, text, headers };
}

function pageBrief(url, result) {
  const html = result.text || "";
  const text = visibleText(html);
  const imageTags = String(html).match(/<img\b[^>]*>/gi) || [];
  const imageSources = imageTags
    .map((tag) => clampText(decodeHtml(tag.match(/\bsrc=["']([^"']+)["']/i)?.[1]), 1_000))
    .filter(Boolean);
  const brandOrUiImages = imageSources.filter((source) =>
    /(?:^|\/)brand\/|(?:^|[-_/])(logo|favicon|icon)(?:[-_.?/]|$)/i.test(source));
  const contentImageSources = imageSources.filter((source) => !brandOrUiImages.includes(source));
  const contentRasterImages = contentImageSources.filter((source) => /\.(?:avif|webp|png|jpe?g)(?:[?#]|$)/i.test(source));
  const socialPreview = metaContent(html, "og:image");
  return {
    url,
    status: result.status,
    title: tagValues(html, "title", 1)[0] || "",
    meta_description: metaContent(html, "description"),
    meta_robots: metaContent(html, "robots"),
    canonical: linkHref(html, "canonical"),
    hreflang_alternates: hreflangAlternates(html),
    h1: tagValues(html, "h1", 5),
    h2: tagValues(html, "h2", 10),
    lang: clampText(html.match(/<html\b[^>]*\blang=["']([^"']+)["']/i)?.[1], 20),
    json_ld_blocks: (html.match(/application\/ld\+json/gi) || []).length,
    json_ld_types: jsonLdTypes(html),
    image_inventory: {
      image_tags: imageSources.length,
      brand_or_ui_images: brandOrUiImages.length,
      content_images: contentImageSources.length,
      content_raster_images: contentRasterImages.length,
      modern_content_images: contentRasterImages.filter((source) => /\.(?:avif|webp)(?:[?#]|$)/i.test(source)).length,
      social_preview_image: socialPreview,
    },
    form_controls: formControlInventory(html),
    word_count: text ? text.split(/\s+/).length : 0,
    response_headers: result.headers || {},
    text_sample: text,
  };
}

export async function collectSeoAgentEvidence(audit, fetchImpl = fetch) {
  const targetUrl = new URL(audit?.target_url || "https://offerpsp.com/");
  const sitemap = await fetchText(new URL("/sitemap.xml", targetUrl).toString(), fetchImpl);
  const llmsTxt = await fetchText(new URL("/llms.txt", targetUrl).toString(), fetchImpl);
  const crawledPageUrls = Array.isArray(audit?.metadata?.crawled_page_urls)
    ? audit.metadata.crawled_page_urls.filter((value) => {
      try {
        return new URL(value).origin === targetUrl.origin;
      } catch {
        return false;
      }
    })
    : [];
  const urls = [...new Set([
    targetUrl.toString(),
    ...crawledPageUrls,
    ...sitemapUrls(sitemap.text, targetUrl.origin),
  ])].slice(0, MAX_PAGES);

  const pages = await Promise.all(urls.slice(0, MAX_PAGES).map(async (url) => {
    try {
      return pageBrief(url, await fetchText(url, fetchImpl));
    } catch (error) {
      return { url, status: 0, error: clampText(error?.message || error, 300) };
    }
  }));

  return {
    target_url: targetUrl.toString(),
    collected_at: new Date().toISOString(),
    siteone: {
      tool: audit?.tool,
      tool_version: audit?.tool_version,
      audited_at: audit?.audited_at,
      overall_score: audit?.overall_score,
      category_scores: audit?.category_scores || {},
      crawl_stats: audit?.crawl_stats || {},
      issues: audit?.issues || [],
      skipped_urls: Array.isArray(audit?.metadata?.skipped_urls) ? audit.metadata.skipped_urls : [],
      crawled_page_count: Array.isArray(audit?.metadata?.crawled_page_urls) ? audit.metadata.crawled_page_urls.length : 0,
    },
    geo_signals: audit?.metadata?.geo_signals || {},
    llms_txt: {
      ok: llmsTxt.ok,
      status: llmsTxt.status,
      content: clampText(llmsTxt.text, 5_000),
      same_origin_urls: sameOriginUrls(llmsTxt.text, targetUrl.origin),
    },
    pages,
  };
}

function normalizePriority(item) {
  const priority = ["P0", "P1", "P2"].includes(item?.priority) ? item.priority : "P2";
  const area = ["SEO", "GEO", "Content", "Technical"].includes(item?.area) ? item.area : "SEO";
  return {
    priority,
    area,
    title: clampText(item?.title, 180),
    evidence: clampText(item?.evidence, 600),
    recommendation: clampText(item?.recommendation, 800),
    affected_urls: Array.isArray(item?.affected_urls)
      ? item.affected_urls.slice(0, 12).map((url) => clampText(url, 1_000)).filter(Boolean)
      : [],
  };
}

function normalizeContentRecommendation(item) {
  return {
    url: clampText(item?.url, 1_000),
    suggested_title: clampText(item?.suggested_title, 180),
    suggested_meta_description: clampText(item?.suggested_meta_description, 260),
    rationale: clampText(item?.rationale, 500),
  };
}

function hasVerifiedSecurityHeaders(evidence) {
  const pages = Array.isArray(evidence?.pages) ? evidence.pages.filter((page) => page.status >= 200 && page.status < 400) : [];
  return pages.length > 0 && pages.every((page) => SECURITY_HEADERS.every((name) => Boolean(page.response_headers?.[name])));
}

function claimsMissingSecurityHeaders(item) {
  const text = [item?.title, item?.evidence, item?.recommendation].join(" ");
  return /(CSP|content-security-policy|x-frame-options|x-content-type-options|referrer-policy|permissions-policy)/i.test(text)
    && /(add|missing|absent|добав|отсутств|не установлен|нет заголов)/i.test(text);
}

function claimsSecurityHeaderAction(item) {
  const text = [item?.title, item?.evidence, item?.recommendation].join(" ");
  return /(security|CSP|content-security-policy|x-frame-options|x-content-type-options|referrer-policy|permissions-policy|заголов)/i.test(text)
    && /(add|missing|absent|check|verify|review|resolve|eliminate|добав|отсутств|не установлен|нет заголов|провер|уточн|устран|свер)/i.test(text);
}

function claimsMissingBrotli(item) {
  const text = [item?.title, item?.evidence, item?.recommendation].join(" ");
  return /brotli/i.test(text) && /(missing|absent|unsupported|support|enable|отсутств|не поддерж|включ|провер)/i.test(text);
}

function claimsMissingModernImages(item) {
  const text = [item?.title, item?.evidence, item?.recommendation].join(" ");
  return /(webp|avif)/i.test(text) && /(add|convert|missing|absent|absence|добав|конверт|отсутств|нет\s+(?:webp|avif))/i.test(text);
}

function claimsMissingStructuredDataTypes(item) {
  const text = [item?.title, item?.evidence, item?.recommendation].join(" ");
  return /(json-?ld|structured data|schema\.org|структурирован)/i.test(text)
    && /(type (?:is )?not specified|type (?:is )?missing|тип не указан|тип отсутств)/i.test(text);
}

function hasVerifiedBrotli(evidence) {
  const pages = Array.isArray(evidence?.pages) ? evidence.pages.filter((page) => page.status >= 200 && page.status < 400) : [];
  return pages.length > 0 && pages.every((page) => /(?:^|[,\s])br(?:$|[,\s])/i.test(page.response_headers?.["content-encoding"] || ""));
}

function hasNoContentRasterImages(evidence) {
  const pages = Array.isArray(evidence?.pages) ? evidence.pages.filter((page) => page.status >= 200 && page.status < 400) : [];
  return pages.length > 0 && pages.every((page) => Number(page.image_inventory?.content_raster_images || 0) === 0);
}

function hasVerifiedStructuredDataTypes(evidence) {
  const pages = Array.isArray(evidence?.pages) ? evidence.pages.filter((page) => page.status >= 200 && page.status < 400) : [];
  return pages.some((page) => Array.isArray(page.json_ld_types) && page.json_ld_types.length > 0);
}

function noindexPageUrls(evidence) {
  return new Set((Array.isArray(evidence?.pages) ? evidence.pages : [])
    .filter((page) => /(?:^|[,\s])noindex(?:$|[,\s])/i.test(page.meta_robots || ""))
    .map((page) => page.url));
}

function claimsMetadataChange(item) {
  const text = [item?.title, item?.evidence, item?.recommendation, item?.rationale,
    item?.suggested_title, item?.suggested_meta_description].join(" ");
  return /(meta[- _]?description|мета-описан|meta title|title)/i.test(text)
    || Boolean(item?.suggested_title)
    || Boolean(item?.suggested_meta_description);
}

function targetsOnlySearchMetadataExcludedPages(item, noindexUrls) {
  const urls = Array.isArray(item?.affected_urls)
    ? item.affected_urls
    : (item?.url ? [item.url] : []);
  return urls.length > 0 && urls.every((url) => {
    if (noindexUrls.has(url)) return true;
    try {
      return /\/(?:privacy|terms)(?:\.html)?\/?$/i.test(new URL(url).pathname);
    } catch {
      return false;
    }
  });
}

function targetsOnlyNoindexPages(item, noindexUrls) {
  const urls = Array.isArray(item?.affected_urls)
    ? item.affected_urls
    : (item?.url ? [item.url] : []);
  return urls.length > 0 && urls.every((url) => noindexUrls.has(url));
}

function allNoindexPagesAreIntentionalPortal(noindexUrls) {
  return noindexUrls.size > 0 && [...noindexUrls].every((url) => {
    try {
      return new URL(url).pathname === "/portal/";
    } catch {
      return false;
    }
  });
}

function claimsNoindexReview(item) {
  const text = [item?.title, item?.evidence, item?.recommendation].join(" ");
  return /noindex/i.test(text) && /(check|verify|ensure|review|провер|убед)/i.test(text);
}

function claimsIntentionalNoindexReview(item, noindexUrls) {
  if (!claimsNoindexReview(item)) return false;
  const urls = Array.isArray(item?.affected_urls)
    ? item.affected_urls
    : (item?.url ? [item.url] : []);
  if (targetsOnlyNoindexPages(item, noindexUrls)) return true;
  return urls.length === 0 && allNoindexPagesAreIntentionalPortal(noindexUrls);
}

function recommendsActualMetadataChange(item, evidence) {
  const suggestedTitle = String(item?.suggested_title || "").trim();
  const suggestedDescription = String(item?.suggested_meta_description || "").trim();
  if (!suggestedTitle && !suggestedDescription) return false;

  const pages = Array.isArray(evidence?.pages) ? evidence.pages : [];
  const page = pages.find((candidate) => candidate.url === item?.url);
  if (!page) return true;

  const titleChanged = suggestedTitle && suggestedTitle !== String(page.title || "").trim();
  const descriptionChanged = suggestedDescription
    && suggestedDescription !== String(page.meta_description || "").trim();
  return Boolean(titleChanged || descriptionChanged);
}

function claimsCreationOfExistingPage(item, evidence) {
  const text = [item?.title, item?.evidence, item?.recommendation].join(" ");
  if (!/(create|develop|add|build|созда|разработ|добав|сделать).*(page|pages|страниц)/i.test(text)) return false;
  const pages = Array.isArray(evidence?.pages) ? evidence.pages : [];
  const explicitlyExisting = pages.some((page) => {
    if (!(page.status >= 200 && page.status < 400)) return false;
    try {
      const path = new URL(page.url).pathname;
      return path !== "/" && text.includes(path);
    } catch {
      return false;
    }
  });
  if (explicitlyExisting) return true;

  const topicPages = [
    [/\bigaming\b/i, /\/psp-for-igaming\.html$/],
    [/\bforex\b/i, /\/psp-for-forex\.html$/],
    [/\b(?:saas|subscription|subscriptions)\b|подпис/i, /\/psp-for-saas\.html$/],
    [/\bcrypto\b|крипто/i, /\/psp-for-crypto-businesses\.html$/],
    [/\bafrica\b|африк/i, /\/payment-provider-africa\.html$/],
    [/\b(?:asia(?:-pacific)?|apac|southeast asia)\b|азиатско-тихоокеан|юго-восточн.*ази|\bази[ия]\b/i, /\/payment-provider-asia-pacific\.html$/],
    [/\blatin america\b|латинск.*америк/i, /\/payment-provider-latin-america\.html$/],
    [/\bmiddle east\b|ближн.*восток/i, /\/payment-provider-middle-east\.html$/],
  ];
  const requestedTopics = topicPages.filter(([pattern]) => pattern.test(text));
  if (requestedTopics.length < 2) return false;
  return requestedTopics.every(([, pathPattern]) => pages.some((page) => {
    if (!(page.status >= 200 && page.status < 400)) return false;
    try {
      return pathPattern.test(new URL(page.url).pathname);
    } catch {
      return false;
    }
  }));
}

function hasCompletePageEvidence(evidence) {
  const crawledPageCount = Number(evidence?.siteone?.crawled_page_count || 0);
  const checkedPages = Array.isArray(evidence?.pages)
    ? evidence.pages.filter((page) => page.status >= 200 && page.status < 400).length
    : 0;
  return crawledPageCount > 0 && checkedPages >= crawledPageCount;
}

function mentionsNoindexPage(value, noindexUrls) {
  const text = String(value || "");
  return [...noindexUrls].some((url) => text.includes(url));
}

function mentionsExcludedSearchPage(value, noindexUrls) {
  const text = String(value || "");
  if (/\/(?:privacy|terms)(?:\.html)?\/?/i.test(text)) return true;
  return [...noindexUrls].some((url) => {
    if (text.includes(url)) return true;
    try {
      return text.includes(new URL(url).pathname);
    } catch {
      return false;
    }
  });
}

function indexedPagesHaveMetaDescriptions(evidence) {
  const pages = Array.isArray(evidence?.pages) ? evidence.pages.filter((page) => page.status >= 200 && page.status < 400) : [];
  const indexedPages = pages.filter((page) => !/(?:^|[,\s])noindex(?:$|[,\s])/i.test(page.meta_robots || ""));
  return indexedPages.length > 0 && indexedPages.every((page) => Boolean(page.meta_description));
}

function hasVerifiedLlmsCoverage(evidence) {
  if (!evidence?.llms_txt?.ok) return false;
  const declared = new Set(Array.isArray(evidence.llms_txt.same_origin_urls)
    ? evidence.llms_txt.same_origin_urls
    : []);
  const indexedPages = (Array.isArray(evidence?.pages) ? evidence.pages : [])
    .filter((page) => page.status >= 200 && page.status < 400)
    .filter((page) => !/(?:^|[,\s])noindex(?:$|[,\s])/i.test(page.meta_robots || ""));
  return indexedPages.length > 0 && indexedPages.every((page) => declared.has(page.url));
}

function claimsLlmsReview(item) {
  const text = [item?.title, item?.evidence, item?.recommendation].join(" ");
  return /llms\.txt/i.test(text)
    && /(check|verify|review|update|include|expand|missing|провер|обнов|включ|расшир|отсутств|содерж)/i.test(text);
}

function claimsUnverifiableAggregateReview(item) {
  const text = [item?.title, item?.evidence, item?.recommendation].join(" ");
  const urls = Array.isArray(item?.affected_urls) ? item.affected_urls : [];
  return urls.length === 0
    && /(skipped|external (?:URLs?|links?)|пропущенн|внешн.*(?:URL|ссыл))/i.test(text)
    && /(check|verify|review|full report|провер|полном отч[её]те)/i.test(text);
}

function hasOnlyExpectedExternalSkips(evidence) {
  const skippedUrls = evidence?.siteone?.skipped_urls;
  return Array.isArray(skippedUrls)
    && skippedUrls.length > 0
    && skippedUrls.every((item) => item?.external === true && /^not allowed host$/i.test(String(item?.reason || "").trim()));
}

function claimsBenignSkippedUrlReview(item, evidence) {
  if (!hasOnlyExpectedExternalSkips(evidence)) return false;
  const text = [item?.title, item?.evidence, item?.recommendation].join(" ");
  return /(skipped|external (?:URLs?|links?)|пропущенн|внешн.*(?:URL|ссыл))/i.test(text)
    && /(check|verify|review|full report|провер|полном отч[её]те|убед)/i.test(text);
}

function translationBasePath(url) {
  try {
    return new URL(url).pathname.replace(/-([a-z]{2,3})(?=\.html$)/i, "");
  } catch {
    return "";
  }
}

function hasDiscoveredTranslation(pageUrl, evidence) {
  const pages = (Array.isArray(evidence?.pages) ? evidence.pages : [])
    .filter((page) => page.status >= 200 && page.status < 400);
  const target = pages.find((page) => page.url === pageUrl);
  const targetBase = translationBasePath(pageUrl);
  if (!target || !targetBase) return false;
  return pages.some((page) => page.url !== pageUrl
    && page.lang
    && target.lang
    && page.lang.toLowerCase() !== target.lang.toLowerCase()
    && translationBasePath(page.url) === targetBase);
}

function claimsHreflangWithoutDiscoveredTranslations(item, evidence) {
  const text = [item?.title, item?.evidence, item?.recommendation].join(" ");
  const urls = Array.isArray(item?.affected_urls) ? item.affected_urls : [];
  return /hreflang/i.test(text)
    && urls.length > 0
    && urls.every((url) => !hasDiscoveredTranslation(url, evidence));
}

function hasCompleteReciprocalHreflang(pageUrl, evidence) {
  const pages = (Array.isArray(evidence?.pages) ? evidence.pages : [])
    .filter((page) => page.status >= 200 && page.status < 400);
  const page = pages.find((candidate) => candidate.url === pageUrl);
  if (!page?.lang || !Array.isArray(page.hreflang_alternates)) return false;
  const translatedPages = pages.filter((candidate) => candidate.url !== pageUrl
    && candidate.lang
    && candidate.lang.toLowerCase() !== page.lang.toLowerCase()
    && translationBasePath(candidate.url) === translationBasePath(pageUrl));
  if (translatedPages.length === 0) return false;

  const ownLanguage = page.lang.toLowerCase();
  const hasSelf = page.hreflang_alternates.some((alternate) =>
    alternate.hreflang?.toLowerCase() === ownLanguage && alternate.href === page.url);
  if (!hasSelf) return false;

  return translatedPages.every((translatedPage) => {
    const translatedLanguage = translatedPage.lang.toLowerCase();
    const linksToTranslation = page.hreflang_alternates.some((alternate) =>
      alternate.hreflang?.toLowerCase() === translatedLanguage && alternate.href === translatedPage.url);
    const translationLinksBack = Array.isArray(translatedPage.hreflang_alternates)
      && translatedPage.hreflang_alternates.some((alternate) =>
        alternate.hreflang?.toLowerCase() === ownLanguage && alternate.href === page.url);
    return linksToTranslation && translationLinksBack;
  });
}

function claimsImplementedHreflangChange(item, evidence) {
  const text = [item?.title, item?.evidence, item?.recommendation].join(" ");
  const urls = Array.isArray(item?.affected_urls) ? item.affected_urls : [];
  return /hreflang/i.test(text)
    && urls.length > 0
    && urls.every((url) => hasCompleteReciprocalHreflang(url, evidence));
}

function hreflangAdviceHasDiscoveredTarget(value, evidence) {
  const text = String(value || "");
  if (!/hreflang/i.test(text)) return true;
  const filenames = [...text.matchAll(/(?:^|[/(\s])([a-z0-9-]+\.html)(?=$|[),\s])/gi)]
    .map((match) => match[1]);
  if (filenames.length === 0) return false;
  const pages = Array.isArray(evidence?.pages) ? evidence.pages : [];
  return filenames.some((filename) => {
    const page = pages.find((candidate) => {
      try {
        return new URL(candidate.url).pathname.endsWith(`/${filename}`);
      } catch {
        return false;
      }
    });
    return Boolean(page && hasDiscoveredTranslation(page.url, evidence));
  });
}

function stripUnsupportedSummarySentences(summary, {
  modernImages,
  brotli,
  metadata,
  llms,
  hreflang,
  noindex,
}) {
  const sentences = String(summary || "").split(/(?<=[.!?])\s+/).filter(Boolean);
  const filtered = sentences.filter((sentence) => {
    if (modernImages && /(webp|avif)/i.test(sentence)) return false;
    if (brotli && /brotli/i.test(sentence)) return false;
    if (metadata && /(meta[- _]?description|мета-описан)/i.test(sentence)) return false;
    if (llms && /llms\.txt/i.test(sentence)) return false;
    if (hreflang && /hreflang/i.test(sentence)) return false;
    if (noindex && /noindex/i.test(sentence)) return false;
    return true;
  });
  return clampText(filtered.join(" ") || "Техническое состояние сайта подтверждено живым crawl и проверкой production-ответов.", 1_200);
}

export function normalizeSeoAgentAnalysis(value, evidence) {
  const source = value?.analysis && typeof value.analysis === "object" ? value.analysis : value;
  if (!source || typeof source !== "object") throw new Error("SEO/GEO agent returned no analysis");
  let executiveSummary = clampText(source.executive_summary, 1_200);
  if (!executiveSummary) throw new Error("SEO/GEO agent returned an empty summary");

  const normalizedPriorities = Array.isArray(source.priorities)
    ? source.priorities.slice(0, 10).map(normalizePriority).filter((item) => item.title)
    : [];
  const normalizedContentRecommendations = Array.isArray(source.content_recommendations)
    ? source.content_recommendations.slice(0, 8).map(normalizeContentRecommendation).filter((item) => item.url)
    : [];
  const verifiedSecurity = hasVerifiedSecurityHeaders(evidence);
  const verifiedBrotli = hasVerifiedBrotli(evidence);
  const noContentRasterImages = hasNoContentRasterImages(evidence);
  const verifiedStructuredDataTypes = hasVerifiedStructuredDataTypes(evidence);
  const noindexUrls = noindexPageUrls(evidence);
  const indexedMetadataComplete = indexedPagesHaveMetaDescriptions(evidence);
  const verifiedLlmsCoverage = hasVerifiedLlmsCoverage(evidence);
  const summaryItem = { title: executiveSummary };
  const removedUnsupportedSecurity = verifiedSecurity
    && (normalizedPriorities.some(claimsSecurityHeaderAction)
      || claimsMissingSecurityHeaders(summaryItem));
  const removedUnsupportedBrotli = verifiedBrotli
    && (normalizedPriorities.some(claimsMissingBrotli) || claimsMissingBrotli(summaryItem));
  const removedUnsupportedImages = noContentRasterImages
    && (normalizedPriorities.some(claimsMissingModernImages) || claimsMissingModernImages(summaryItem));
  const removedUnsupportedStructuredData = verifiedStructuredDataTypes
    && (normalizedPriorities.some(claimsMissingStructuredDataTypes) || claimsMissingStructuredDataTypes(summaryItem));
  const removedNoindexMetadata = (indexedMetadataComplete && claimsMetadataChange(summaryItem))
    || normalizedPriorities.some((item) =>
      claimsMetadataChange(item) && targetsOnlySearchMetadataExcludedPages(item, noindexUrls))
    || normalizedContentRecommendations.some((item) =>
      claimsMetadataChange(item) && targetsOnlySearchMetadataExcludedPages(item, noindexUrls));
  const removedUnsupportedLlms = verifiedLlmsCoverage
    && (normalizedPriorities.some(claimsLlmsReview)
      || claimsLlmsReview(summaryItem)
      || [
        ...(Array.isArray(source.quick_wins) ? source.quick_wins : []),
        ...(Array.isArray(source.geo_recommendations) ? source.geo_recommendations : []),
        ...(Array.isArray(source.limitations) ? source.limitations : []),
      ]
        .some((item) => /llms\.txt/i.test(String(item || ""))));
  const removedUnverifiableAggregate = normalizedPriorities.some(claimsUnverifiableAggregateReview);
  const removedBenignSkippedReview = normalizedPriorities.some((item) => claimsBenignSkippedUrlReview(item, evidence));
  const removedUnsupportedHreflang = normalizedPriorities.some((item) =>
    claimsHreflangWithoutDiscoveredTranslations(item, evidence));
  const removedImplementedHreflang = normalizedPriorities.some((item) =>
    claimsImplementedHreflangChange(item, evidence));
  const removedExistingPageCreation = normalizedPriorities.some((item) => claimsCreationOfExistingPage(item, evidence));
  const removedNoindexReview = normalizedPriorities.some((item) =>
    claimsIntentionalNoindexReview(item, noindexUrls));
  const priorities = normalizedPriorities.filter((item) => {
    if (removedUnsupportedSecurity && claimsSecurityHeaderAction(item)) return false;
    if (removedUnsupportedBrotli && claimsMissingBrotli(item)) return false;
    if (removedUnsupportedImages && claimsMissingModernImages(item)) return false;
    if (removedUnsupportedStructuredData && claimsMissingStructuredDataTypes(item)) return false;
    if (claimsMetadataChange(item) && targetsOnlySearchMetadataExcludedPages(item, noindexUrls)) return false;
    if (removedUnsupportedLlms && claimsLlmsReview(item)) return false;
    if (claimsCreationOfExistingPage(item, evidence)) return false;
    if (claimsIntentionalNoindexReview(item, noindexUrls)) return false;
    if (claimsUnverifiableAggregateReview(item)) return false;
    if (claimsBenignSkippedUrlReview(item, evidence)) return false;
    if (claimsHreflangWithoutDiscoveredTranslations(item, evidence)) return false;
    if (claimsImplementedHreflangChange(item, evidence)) return false;
    return true;
  });
  const limitations = Array.isArray(source.limitations)
    ? source.limitations.slice(0, 8).map((item) => clampText(item, 500)).filter((item) => {
      if (!item) return false;
      if (verifiedSecurity && /(security|CSP|заголов)/i.test(item) && /(verify|check|require|провер|треб)/i.test(item)) return false;
      if (verifiedBrotli && /brotli/i.test(item) && /(verify|check|require|contradict|провер|треб|противореч)/i.test(item)) return false;
      if (verifiedLlmsCoverage && /llms\.txt/i.test(item) && /(no data|not provided|unavailable|нет данных|не предостав|недоступ)/i.test(item)) return false;
      if (evidence?.geo_signals?.robots_txt?.ai_crawlers_allowed && /robots\.txt/i.test(item) && /(no data|not provided|unavailable|нет данных|не предостав|недоступ)/i.test(item)) return false;
      if (/(skipped|external (?:URLs?|links?)|пропущенн|внешн.*(?:URL|ссыл))/i.test(item) && /(no data|not provided|unavailable|недоступ|нет данных|отсутств.*информац)/i.test(item)) return false;
      if (hasCompletePageEvidence(evidence) && /(full (?:url|page) list|полный список (?:url|страниц)|список url)/i.test(item) && /(unavailable|missing|not provided|недоступ|отсутств|невозмож)/i.test(item)) return false;
      return true;
    })
    : [];
  if (removedUnsupportedSecurity) {
    limitations.unshift("Live responses already contain the baseline security headers; the aggregate SiteOne security finding needs URL/check-level evidence.");
  }
  if (removedUnsupportedBrotli) {
    limitations.unshift("Live HTML responses use Brotli when requested; the aggregate SiteOne Brotli finding is not actionable.");
  }
  if (removedUnsupportedImages) {
    limitations.unshift("Indexed pages contain no content raster images; the PNG social preview is intentionally kept for crawler compatibility, so WebP/AVIF absence is not an optimization defect.");
  }
  if (removedUnsupportedStructuredData) {
    limitations.unshift("Live JSON-LD already declares Schema.org types; recommendations claiming the type is unspecified were discarded.");
  }
  if (removedNoindexMetadata) {
    limitations.unshift("The portal is intentionally noindex and legal pages are not acquisition landing pages; unsupported search-snippet metadata recommendations for those surfaces were discarded.");
  }
  if (removedUnsupportedLlms) {
    limitations.unshift("Live llms.txt already describes OfferPSP and links every crawled indexable page; generic expansion recommendations were discarded.");
  }
  if (removedExistingPageCreation) {
    limitations.unshift("Recommendations to create pages that the live crawler successfully loaded were discarded.");
  }
  if (removedNoindexReview) {
    limitations.unshift("The private portal's verified noindex directive is intentional and is not an SEO defect.");
  }
  if (removedBenignSkippedReview) {
    limitations.unshift("SiteOne skipped only expected external hosts; no internal public page was omitted from the crawl.");
  }
  if (removedUnsupportedHreflang) {
    limitations.unshift("Hreflang recommendations without a discovered live translation counterpart were discarded.");
  }
  if (removedImplementedHreflang) {
    limitations.unshift("Live language counterparts already declare reciprocal hreflang links; duplicate implementation recommendations were discarded.");
  }
  executiveSummary = stripUnsupportedSummarySentences(executiveSummary, {
    modernImages: removedUnsupportedImages,
    brotli: removedUnsupportedBrotli,
    metadata: indexedMetadataComplete,
    llms: removedUnsupportedLlms,
    hreflang: removedUnsupportedHreflang || removedImplementedHreflang,
    noindex: removedNoindexReview,
  });
  const quickWins = Array.isArray(source.quick_wins) ? source.quick_wins.slice(0, 8).map((item) => clampText(item, 500)).filter(Boolean) : [];

  return {
    status: "completed",
    agent: AGENT_NAME,
    agent_version: AGENT_VERSION,
    model: clampText(value?.model || source.model || "deepseek-chat", 120),
    generated_at: new Date().toISOString(),
    executive_summary: executiveSummary,
    confidence: removedUnsupportedSecurity || removedUnsupportedBrotli || removedUnsupportedImages || removedUnsupportedStructuredData || removedNoindexMetadata || removedUnsupportedLlms || removedExistingPageCreation || removedNoindexReview || removedUnverifiableAggregate || removedBenignSkippedReview || removedUnsupportedHreflang || removedImplementedHreflang
      ? "medium"
      : (["high", "medium", "low"].includes(source.confidence) ? source.confidence : "medium"),
    priorities,
    quick_wins: quickWins.filter((item) => {
      if (removedUnsupportedBrotli && /brotli/i.test(item)) return false;
      if (removedUnsupportedImages && /(webp|avif)/i.test(item)) return false;
      if (indexedMetadataComplete && /(meta[- _]?description|мета-описан)/i.test(item)) return false;
      if (removedUnsupportedSecurity && /(security|CSP|заголов)/i.test(item)) return false;
      if (removedUnsupportedLlms && /llms\.txt/i.test(item)) return false;
      if (evidence?.geo_signals?.robots_txt?.ai_crawlers_allowed && /robots\.txt/i.test(item)) return false;
      if (/hreflang/i.test(item) && !hreflangAdviceHasDiscoveredTarget(item, evidence)) return false;
      if (/(skipped|пропущенн)/i.test(item) && /(check|verify|провер)/i.test(item)) return false;
      if (mentionsNoindexPage(item, noindexUrls) && /(canonical|meta|SEO|index|hreflang)/i.test(item)) return false;
      if (mentionsExcludedSearchPage(item, noindexUrls) && /(meta[- _]?description|мета-описан|SEO|CTR|поиск|индекс)/i.test(item)) return false;
      return true;
    }),
    content_recommendations: normalizedContentRecommendations.filter((item) =>
      !(claimsMetadataChange(item) && targetsOnlySearchMetadataExcludedPages(item, noindexUrls))
      && recommendsActualMetadataChange(item, evidence)),
    geo_recommendations: Array.isArray(source.geo_recommendations)
      ? source.geo_recommendations.slice(0, 8).map((item) => clampText(item, 600)).filter((item) =>
        item
        && !(removedUnsupportedLlms && /llms\.txt/i.test(item))
        && !(evidence?.geo_signals?.robots_txt?.ai_crawlers_allowed && /(robots\.txt|GPTBot|ClaudeBot|AI[- ]crawler)/i.test(item))
        && !(/hreflang/i.test(item) && !hreflangAdviceHasDiscoveredTarget(item, evidence)))
      : [],
    limitations: limitations.slice(0, 6),
  };
}

export function resolveSeoAgentWebhookUrl(env = process.env) {
  if (env.OFFERPSP_SEO_AGENT_WEBHOOK_URL) return String(env.OFFERPSP_SEO_AGENT_WEBHOOK_URL).trim();
  if (!env.AIBOT_WEBHOOK_URL) throw new Error("SEO/GEO agent webhook is not configured");
  const url = new URL(String(env.AIBOT_WEBHOOK_URL).trim());
  url.pathname = `${url.pathname.replace(/[^/]+\/?$/, "")}${DEFAULT_WEBHOOK_PATH}`;
  return url.toString();
}

export async function runSeoGeoAgent(audit, {
  fetchImpl = fetch,
  env = process.env,
  evidence,
} = {}) {
  const webhookSecret = String(env.AIBOT_WEBHOOK_SECRET || "").trim();
  if (!webhookSecret) throw new Error("SEO/GEO agent authorization is not configured");
  const payload = evidence || await collectSeoAgentEvidence(audit, fetchImpl);
  const response = await fetchImpl(resolveSeoAgentWebhookUrl(env), {
    method: "POST",
    headers: { "content-type": "application/json", "x-captain-secret": webhookSecret },
    body: JSON.stringify({ agent_version: AGENT_VERSION, evidence: payload }),
    signal: AbortSignal.timeout(70_000),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.success === false) {
    throw new Error(clampText(result?.error || `SEO/GEO agent failed with HTTP ${response.status}`, 500));
  }
  return normalizeSeoAgentAnalysis(result, payload);
}

export const seoAgentConstants = { AGENT_NAME, AGENT_VERSION, DEFAULT_WEBHOOK_PATH };
