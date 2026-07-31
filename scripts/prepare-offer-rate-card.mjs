#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";

const PROVIDERS = {
  brpay: {
    brandName: "BR-Pay",
    website: "https://brpay.io",
    strategicPriority: 100,
    marginIncludedDefault: true,
    effectiveDate: "2026-07-23",
  },
  antarex: {
    brandName: "Antarex",
    website: null,
    strategicPriority: 70,
    marginIncludedDefault: false,
    effectiveDate: null,
  },
};

const GEO_RULES = [
  ["UZ", /uzbekistan|узбекистан|\buzs\b/i],
  ["KG", /kyrgyzstan|kyrgyz|киргиз|\bkgs\b/i],
  ["IN", /india|индия|\binr\b/i],
  ["AZ", /azerbaijan|азербайджан|\bazn\b/i],
  ["RU", /russia|россия|\bруб\b|\brub\b/i],
  ["AR", /argentina|аргентина|\bars\b/i],
  ["KR", /south korea|korea|коре|\bkrw\b/i],
  ["TR", /turkey|türkiye|турц|\btry\b/i],
  ["PL", /poland|польш|\bpln\b/i],
  ["AU", /australia|австрал|\baud\b/i],
  ["GB", /united kingdom|\buk\b/i],
  ["CH", /switzerland|\bch\b/i],
  ["EU", /\beea\b|europe|европ/i],
];

const CURRENCY_CODES = [
  "UZS", "KGS", "INR", "AZN", "RUB", "ARS", "KRW", "EUR", "TRY", "PLN", "AUD", "USD", "GBP", "KZT",
];

const METHOD_RULES = [
  ["UPI", /\bupi\b/i],
  ["IMPS", /\bimps\b/i],
  ["SBP", /\bsbp\b|сбп/i],
  ["P2P", /\bp2p\b|р2р/i],
  ["P2C", /\bp2c\b/i],
  ["C2C", /\bc2c\b|с2с/i],
  ["QR", /\bqr\b/i],
  ["HUMO", /humo/i],
  ["UZCARD", /uzcard/i],
  ["BANK_TRANSFER", /bank transfer|account transfer|банковск.*перевод/i],
  ["OPEN_BANKING", /open banking/i],
  ["DEEPLINK", /deep\s?link/i],
  ["OCT", /\boct\b/i],
  ["CARDS", /\bcards?\b|\bvisa\b|master\s?card|карты|картами/i],
];

const TRAFFIC_RULES = [
  ["FTD", /\bftd\b|первичн/i],
  ["TRUSTED", /\btrusted\b|\bstd\b|вторичн/i],
];

const INTEGRATION_RULES = [
  ["H2H", /\bh2h\b|host2host/i],
  ["H2C", /\bh2c\b/i],
  ["API", /\bapi\b/i],
  ["DEEPLINK", /deep\s?link/i],
];

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    args[token.slice(2)] = argv[index + 1];
    index += 1;
  }
  if (!args.provider || !PROVIDERS[args.provider]) {
    throw new Error("Use --provider brpay|antarex");
  }
  if (!args.source || !args.output) {
    throw new Error("Use --source <path> --output <path>");
  }
  return args;
}

function normalizeText(value) {
  return value
    .replaceAll("\r\n", "\n")
    .replaceAll("\r", "\n")
    .replace(/[\u00a0\u2007\u202f]/g, " ")
    .replace(/[–—]/g, "-")
    .trim();
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function startsBlock(line) {
  const value = line.trim();
  if (!value) return false;
  return /^(?:[🇦-🇿]{2}|🌎|🌍|💳)\s*/u.test(value)
    || /^(?:классический p2p|турция\b|payouts?\s+-\s+cards|offers?\s+rf|оффер\s+рф)/i.test(value)
    || /^(?:australia|poland|india|argentina|south korea)\b/i.test(value);
}

function splitBlocks(sourceText) {
  const lines = sourceText.split("\n");
  const blocks = [];
  let current = [];

  for (const line of lines) {
    if (startsBlock(line) && current.some((item) => item.trim())) {
      blocks.push(current.join("\n").trim());
      current = [];
    }
    current.push(line);
  }
  if (current.some((item) => item.trim())) blocks.push(current.join("\n").trim());
  return blocks.filter((block) => block.length >= 30);
}

function extractGeos(block) {
  if (/world\s?wide|worldwide|global/i.test(block)) return { scope: "global", geos: [] };
  const geos = GEO_RULES.filter(([, pattern]) => pattern.test(block)).map(([code]) => code);
  return { scope: geos.includes("EU") ? "regional" : "specific", geos: unique(geos) };
}

function extractCurrencies(block, geos) {
  const explicit = block.match(/(?:currency|валюта)\s*[-:]\s*([A-Z]{3})/i)?.[1]?.toUpperCase();
  if (explicit && CURRENCY_CODES.includes(explicit)) return [explicit];

  const firstLines = block.split("\n").slice(0, 12).join(" ");
  const found = CURRENCY_CODES.filter((code) => new RegExp(`(^|[^A-Z])${code}([^A-Z]|$)`, "i").test(firstLines));
  if (found.length) return found;

  const geoCurrency = {
    UZ: "UZS", KG: "KGS", IN: "INR", AZ: "AZN", RU: "RUB", AR: "ARS", KR: "KRW", TR: "TRY", PL: "PLN", AU: "AUD", GB: "GBP", EU: "EUR",
  };
  return unique(geos.map((geo) => geoCurrency[geo]));
}

function extractByRules(block, rules) {
  return rules.filter(([, pattern]) => pattern.test(block)).map(([value]) => value);
}

function parseDecimal(value) {
  const normalized = value.replace(",", ".").replace(/\s+/g, "");
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function inferFlow(block) {
  const hasPayin = /pay\s?in|deposit fee|при[её]м|входящ/i.test(block);
  const hasPayout = /pay\s?out|payout|выплат/i.test(block);
  if (hasPayin && hasPayout) return "both";
  if (hasPayin) return "payin";
  if (hasPayout) return "payout";
  return null;
}

function inferFeeFlow(line, fallbackFlow) {
  if (/pay\s?out|payout|выплат/i.test(line)) return "payout";
  if (/settlement|сеттл|расч[её]т/i.test(line)) return "settlement";
  if (/refund/i.test(line)) return "refund";
  if (/charge\s?back|chargeback/i.test(line)) return "chargeback";
  if (/decline/i.test(line)) return "decline";
  if (/pay\s?in|deposit|при[её]м|\bmdr\b/i.test(line)) return "payin";
  return fallbackFlow === "both" ? null : fallbackFlow;
}

function extractFees(block, fallbackFlow, currencies) {
  const fees = [];
  for (const rawLine of block.split("\n")) {
    const line = rawLine.trim();
    if (!line.includes("%")) continue;
    if (/rolling reserve|approval|\bar\s*:/i.test(line)) continue;

    const percentMatch = line.match(/(\d+(?:[.,]\d+)?)\s*%/);
    if (!percentMatch) continue;
    const flow = inferFeeFlow(line, fallbackFlow);
    if (!flow) continue;

    const fixedMatch = line.match(/\+\s*(\d+(?:[.,]\d+)?)\s*(€|\$|[A-Z]{3}|руб|₽)/i);
    const fixedCurrency = fixedMatch
      ? ({ "€": "EUR", "$": "USD", "РУБ": "RUB", "₽": "RUB" }[fixedMatch[2].toUpperCase()] || fixedMatch[2].toUpperCase())
      : null;
    const trafficTier = /\bftd\b/i.test(line)
      ? "FTD"
      : /trusted|\bstd\b/i.test(line)
        ? "TRUSTED"
        : null;
    const methodScope = [];
    if (/visa/i.test(line)) methodScope.push("VISA");
    if (/master\s?card/i.test(line)) methodScope.push("MASTERCARD");

    fees.push({
      flow,
      traffic_tier: trafficTier,
      method_scope: methodScope,
      region_scope: /\beea\b|\buk\b|\bch\b/i.test(line) ? ["EEA", "GB", "CH"] : [],
      fee_type: fixedMatch ? "percent_plus_fixed" : "percent",
      base_percent: parseDecimal(percentMatch[1]),
      base_fixed: fixedMatch ? parseDecimal(fixedMatch[1]) : null,
      base_fixed_currency: fixedCurrency || (fixedMatch ? currencies[0] || null : null),
      applies_on: /decline/i.test(line) ? "decline" : "success",
      source_text: line,
    });
  }

  const key = (fee) => [fee.flow, fee.traffic_tier, fee.method_scope.join(","), fee.base_percent, fee.base_fixed, fee.applies_on].join("|");
  return [...new Map(fees.map((fee) => [key(fee), fee])).values()];
}

function parseAmount(value) {
  const digits = value.replace(/[^0-9.,]/g, "").replaceAll(" ", "").replace(",", ".");
  const parsed = Number.parseFloat(digits);
  return Number.isFinite(parsed) ? parsed : null;
}

function extractLimits(block, fallbackFlow, currencies) {
  const limits = [];
  const pattern = /(?:min\s*\/\s*max|мин(?:имум)?\s*[-/]?\s*макс(?:имум)?|limits?)[^\n:]*?(pay\s?in|pay\s?out|при[её]м|выплат)?[^\n:]*[:\s]\s*([\d\s.,]+)\s*[-–—]\s*([\d\s.,]+)\s*([A-Z]{3}|₽|€|\$)?/gi;
  for (const match of block.matchAll(pattern)) {
    const flow = inferFeeFlow(match[1] || "", fallbackFlow) || fallbackFlow || "both";
    const currency = ({ "₽": "RUB", "€": "EUR", "$": "USD" }[match[4]] || match[4] || currencies[0] || "").toUpperCase();
    if (!currency) continue;
    limits.push({
      flow,
      scope: "transaction",
      method_scope: [],
      traffic_tier: null,
      currency,
      minimum_amount: parseAmount(match[2]),
      maximum_amount: parseAmount(match[3]),
      maximum_count: null,
      original_note: match[0].trim(),
    });
  }
  return limits;
}

function extractSettlement(block) {
  const settlementLines = block.split("\n").filter((line) => /settlement|сеттл|курс|usdt|usdc|netting|неттинг/i.test(line));
  if (!settlementLines.length) return [];
  const joined = settlementLines.join(" | ");
  const feeMatch = joined.match(/(?:fee|usdt|usdc|сеттл)[^%]{0,40}(\d+(?:[.,]\d+)?)\s*%/i);
  const fixedMatch = joined.match(/(?:commission|комиссия)[^\d]{0,20}(\d+(?:[.,]\d+)?)\s*(USDT|USDC|EUR|USD)/i);
  const periodMatch = joined.match(/\bT\s*\+\s*\d+\b/i);
  const sourceMatch = joined.match(/(Binance|Bybit|Rapira|Kraken|Google|XE|HTX|Paribu|Uznex)/i);
  return [{
    currency: /usdc/i.test(joined) ? "USDC" : /usdt|crypto/i.test(joined) ? "USDT" : null,
    fee_percent: feeMatch ? parseDecimal(feeMatch[1]) : null,
    fixed_fee: fixedMatch ? parseDecimal(fixedMatch[1]) : null,
    fixed_fee_currency: fixedMatch ? fixedMatch[2].toUpperCase() : null,
    period: periodMatch ? periodMatch[0].replace(/\s+/g, "").toUpperCase() : null,
    minimum_amount: null,
    exchange_source: sourceMatch ? sourceMatch[1] : null,
    exchange_rule: joined,
    weekdays: [],
    netting_percent: /netting|неттинг/i.test(joined) ? parseDecimal(joined.match(/(?:netting|неттинг)[^\d]{0,20}(\d+(?:[.,]\d+)?)\s*%/i)?.[1] || "") : null,
    liquidity_requirement: null,
    original_note: joined,
  }];
}

function buildTitle(geos, methods, flow, scope) {
  const geoLabel = scope === "global" ? "Worldwide" : geos.join(" / ") || "Regional";
  const methodLabel = methods.slice(0, 3).join(" / ") || "Payment";
  const flowLabel = flow === "both" ? "PayIn & PayOut" : flow === "payin" ? "PayIn" : "PayOut";
  return `${geoLabel} · ${methodLabel} · ${flowLabel}`;
}

function parseRoute(block, index) {
  const { scope, geos } = extractGeos(block);
  const currencies = extractCurrencies(block, geos);
  const methods = unique(extractByRules(block, METHOD_RULES));
  const trafficTypes = unique(extractByRules(block, TRAFFIC_RULES));
  const integrations = unique(extractByRules(block, INTEGRATION_RULES));
  const flow = inferFlow(block);
  const fees = extractFees(block, flow, currencies);
  const anomalies = [];

  if (scope === "specific" && !geos.length) anomalies.push({ code: "geo_missing", severity: "error", field: "geos", message: "GEO was not parsed.", source_excerpt: block.slice(0, 240) });
  if (!currencies.length) anomalies.push({ code: "currency_missing", severity: "error", field: "currencies", message: "Transaction currency was not parsed.", source_excerpt: block.slice(0, 240) });
  if (!methods.length) anomalies.push({ code: "method_missing", severity: "error", field: "methods", message: "Payment method was not parsed.", source_excerpt: block.slice(0, 240) });
  if (!flow) anomalies.push({ code: "flow_missing", severity: "error", field: "flow", message: "Payment flow was not parsed.", source_excerpt: block.slice(0, 240) });
  if (!fees.length) anomalies.push({ code: "pricing_missing", severity: "error", field: "fees", message: "No source fee was parsed.", source_excerpt: block.slice(0, 240) });
  if (!trafficTypes.length) anomalies.push({ code: "traffic_unconfirmed", severity: "warning", field: "traffic_types", message: "Traffic type requires staff confirmation.", source_excerpt: block.slice(0, 240) });
  anomalies.push({ code: "vertical_unconfirmed", severity: "warning", field: "verticals", message: "Vertical acceptance is not explicit in the source and requires PSP confirmation.", source_excerpt: block.slice(0, 240) });
  if (/660\s*000\s*00(?:\D|$)/.test(block)) anomalies.push({ code: "malformed_limit", severity: "error", field: "limits", message: "A transaction maximum appears malformed.", source_excerpt: block.match(/[^\n]*660\s*000\s*00[^\n]*/)?.[0] || "" });
  if (/open geo\s*:\s*inr/i.test(block)) anomalies.push({ code: "currency_used_as_geo", severity: "error", field: "geos", message: "The source uses INR where a GEO code is expected.", source_excerpt: "Open GEO: INR" });
  if (/red glass|green glass|красн.*стакан|зел[её]н.*стакан|top\s*\d/i.test(block)) anomalies.push({ code: "exchange_rule_review", severity: "warning", field: "settlement", message: "Order-book settlement rule requires manual review.", source_excerpt: block.split("\n").filter((line) => /стакан|top\s*\d/i.test(line)).join(" | ").slice(0, 400) });

  const limits = extractLimits(block, flow, currencies);
  if (limits.some((limit) => limit.minimum_amount != null && limit.maximum_amount != null && limit.maximum_amount < limit.minimum_amount)) {
    anomalies.push({ code: "invalid_limit_range", severity: "error", field: "limits", message: "A parsed maximum is lower than its minimum.", source_excerpt: block.slice(0, 240) });
  }

  return {
    parser_index: index,
    client_title: buildTitle(geos, methods, flow || "both", scope),
    coverage_scope: scope,
    geos,
    blocked_geos: GEO_RULES.filter(([, pattern]) => /blocked geo/i.test(block) && pattern.test(block)).map(([code]) => code),
    currencies,
    flow: flow || "both",
    methods,
    card_brands: unique([/visa/i.test(block) ? "VISA" : null, /master\s?card/i.test(block) ? "MASTERCARD" : null, /mir|мир/i.test(block) ? "MIR" : null]),
    traffic_types: trafficTypes,
    verticals: [],
    prohibited_verticals: [],
    integrations,
    niche_key: [geos[0] || scope.toUpperCase(), currencies[0] || "UNKNOWN", (flow || "both").toUpperCase(), methods[0] || "UNKNOWN", trafficTypes.join("+") || "ANY"].join("|"),
    effective_from: null,
    expires_at: null,
    freshness_days: 30,
    min_monthly_volume: null,
    max_monthly_volume: null,
    volume_currency: null,
    risk_terms: {
      rolling_reserve: block.match(/rolling reserve[^\n]*/i)?.[0] || null,
      chargeback: block.match(/charge\s?back[^\n]*/i)?.[0] || null,
      refund: block.match(/refund[^\n]*/i)?.[0] || null,
    },
    operational_notes: null,
    raw_block: block,
    fees,
    limits,
    settlement: extractSettlement(block),
    anomalies,
  };
}

function validateAndDeduplicate(routes) {
  const seen = new Map();
  for (const route of routes) {
    const normalized = route.raw_block.toLowerCase().replace(/\s+/g, " ").trim();
    const hash = createHash("sha256").update(normalized).digest("hex");
    if (seen.has(hash)) {
      route.anomalies.push({
        code: "duplicate_block",
        severity: "error",
        field: "raw_block",
        message: `This source block duplicates parser route ${seen.get(hash)}.`,
        source_excerpt: route.raw_block.slice(0, 240),
      });
    } else {
      seen.set(hash, route.parser_index);
    }
  }
  return routes;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const provider = PROVIDERS[args.provider];
  const sourcePath = resolve(args.source);
  const outputPath = resolve(args.output);
  const sourceText = normalizeText(await readFile(sourcePath, "utf8"));
  const blocks = splitBlocks(sourceText);
  const routes = validateAndDeduplicate(blocks.map(parseRoute));
  const blockingCount = routes.reduce((count, route) => count + route.anomalies.filter((item) => item.severity === "error").length, 0);

  const payload = {
    provider: {
      brand_name: provider.brandName,
      website: provider.website,
      strategic_priority: provider.strategicPriority,
      margin_included_default: provider.marginIncludedDefault,
    },
    batch: {
      source_type: args["source-type"] || "telegram",
      source_reference: args.reference || basename(sourcePath),
      source_effective_date: args["effective-date"] || provider.effectiveDate,
      parser_version: "offerpsp-source-parser-v1",
      parser_metadata: {
        source_sha256: createHash("sha256").update(sourceText).digest("hex"),
        source_bytes: Buffer.byteLength(sourceText),
        block_count: blocks.length,
        route_count: routes.length,
        blocking_anomaly_count: blockingCount,
        generated_at: new Date().toISOString(),
        publication_allowed: false,
      },
      source_text: sourceText,
      routes,
    },
  };

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
  process.stdout.write(`${JSON.stringify({
    output: outputPath,
    provider: provider.brandName,
    routes: routes.length,
    blockingAnomalies: blockingCount,
    publicationAllowed: false,
  })}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
