#!/usr/bin/env node

import { createHash } from "node:crypto";
import { extractCountryCodes } from "./country-geos.mjs";

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
  ["BD", /bangladesh|\bbdt\b/i],
  ["ID", /indonesia|индонези|\bidr\b/i],
  ["UZ", /uzbekistan|узбекистан|\buzs\b/i],
  ["KG", /kyrgyzstan|kyrgyz|киргиз|\bkgs\b/i],
  ["KZ", /kazakhstan|казахстан|\bkzt\b/i],
  ["IN", /india|индия|\binr\b/i],
  ["AZ", /azerbaijan|азербайджан|\bazn\b/i],
  ["RU", /russia|россия|(?:^|\s)рф(?:\s|$)|\bруб\b|\brub\b|₽/i],
  ["AR", /argentina|аргентина|\bars\b/i],
  ["BR", /brazil|brasil|бразили|\bbrl\b/i],
  ["VN", /vietnam|вьетнам|\bvnd\b/i],
  ["CO", /colombia|колумби|\bcop\b/i],
  ["TH", /thailand|thaliand|таиланд|\bthb\b/i],
  ["KR", /south korea|korea|коре|\bkrw\b/i],
  ["TR", /turkey|türkiye|турц|\btry\b/i],
  ["PL", /poland|польш|\bpln\b/i],
  ["AU", /australia|австрал|\baud\b/i],
  ["GB", /united kingdom|\buk\b/i],
  ["CH", /switzerland|\bch\b/i],
  ["NL", /netherlands|нидерланд/i],
  ["EU", /\beea\b|\beu\b|europe|европ/i],
];

const CURRENCY_CODES = [
  "BDT", "IDR", "UZS", "KGS", "INR", "AZN", "RUB", "ARS", "BRL", "VND", "COP", "THB", "KRW", "EUR", "TRY", "PLN", "AUD", "USD", "GBP", "KZT",
];

const METHOD_RULES = [
  ["BANK_VA", /\bbank\s+va\b|virtual account/i],
  ["E_WALLET", /e[-\s]?wallet/i],
  ["BKASH", /\bbkash\b/i],
  ["NAGAD", /\bnagad\b/i],
  ["MOMO", /\bmomo\b/i],
  ["DANA", /\bdana\b/i],
  ["OVO", /\bovo\b/i],
  ["LINKAJA", /\blinkaja\b/i],
  ["SHOPEEPAY", /\bshopee\s*pay\b/i],
  ["VIETQR", /\bviet\s*qr\b/i],
  ["BRE_B", /\bbre[-\s]?b\b/i],
  ["EFECTY", /\befecty\b/i],
  ["QRIS", /\bqris\b/i],
  ["PIX", /\bpix\b/i],
  ["PAPARA", /\bpapara\b/i],
  ["PROMPTPAY", /prompt\s?pay/i],
  ["PSE", /\bpse\b/i],
  ["NEQUI", /\bnequi\b/i],
  ["UPI", /\bupi\b/i],
  ["IMPS", /\bimps\b/i],
  ["SBP", /\bsbp\b|сбп/i],
  ["P2P", /\bp2p\b|р2р/i],
  ["P2C", /\bp2c\b/i],
  ["C2C", /\bc2c\b|с2с/i],
  ["QR", /\bqr\b/i],
  ["HUMO", /humo/i],
  ["UZCARD", /uzcard/i],
  ["BANK_TRANSFER", /bank transfer|account transfer|bank accounts?|банковск.*перевод/i],
  ["CASH", /convenience store|cash payment/i],
  ["OPEN_BANKING", /open banking/i],
  ["DEEPLINK", /deep\s?link/i],
  ["OCT", /\boct\b/i],
  ["BLIK", /\bblik\b/i],
  ["TRUSTLY", /\btrustly\b/i],
  ["IDEAL", /\bideal\b/i],
  ["APPLE_PAY", /apple\s*pay/i],
  ["GOOGLE_PAY", /google\s*pay/i],
  ["MERCADO_PAGO", /mercado\s*pago/i],
  ["TOSS", /\btoss\b/i],
  ["KAKAO", /\bkakao\b/i],
  ["ONE_CLICK", /one\s*click|1\s*click/i],
  ["CARDS", /\bcards?\b|\bvisa\b|master\s?card|карты|картами/i],
  ["KASPI", /\bkaspi\b/i],
  ["KAPITALBANK", /\bkapital\s*bank\b|\bkapitalbank\b/i],
  ["MBANK", /\bmbank\b/i],
  ["OPTIMABANK", /\boptima\s*bank\b|\boptimabank\b/i],
];

const TRAFFIC_RULES = [
  ["FTD", /\bftd\b|первичн/i],
  ["TRUSTED", /\btrusted\b|\bstd\b|\btd\b|вторичн/i],
];

const VERTICAL_RULES = [
  ["IGAMING", /\bigaming\b|\bgaming\b|\bgambling\b|\bbetting\b|казино|ставки/i],
  ["FOREX", /\bforex\b/i],
  ["ADULT", /\badult\b/i],
];

const INTEGRATION_RULES = [
  ["H2H", /\bh2h\b|host2host/i],
  ["H2C", /\bh2c\b/i],
  ["API", /\bapi\b/i],
  ["DEEPLINK", /deep\s?link/i],
  ["REDIRECT", /\bredirect\b/i],
];

export function parseCliArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    args[token.slice(2)] = argv[index + 1];
    index += 1;
  }
  if (!args.provider && !args["provider-name"]) {
    throw new Error("Use --provider brpay|antarex or --provider-name <name>");
  }
  if (args.provider && !PROVIDERS[args.provider] && !args["provider-name"]) {
    throw new Error("Unknown provider preset. Add --provider-name <name> for a new PSP.");
  }
  if (!args.source || !args.output) {
    throw new Error("Use --source <path> --output <path>");
  }
  return args;
}

function parseBoolean(value, fallback = false) {
  if (value == null) return fallback;
  if (/^(?:1|true|yes)$/i.test(value)) return true;
  if (/^(?:0|false|no)$/i.test(value)) return false;
  throw new Error(`Invalid boolean value: ${value}`);
}

function providerFromArgs(args) {
  const preset = args.provider ? PROVIDERS[args.provider] : null;
  return {
    brandName: args["provider-name"] || preset?.brandName,
    website: args["provider-website"] || preset?.website || null,
    strategicPriority: Number(args["strategic-priority"] || preset?.strategicPriority || 50),
    marginIncludedDefault: parseBoolean(args["margin-included"], preset?.marginIncludedDefault || false),
    effectiveDate: args["effective-date"] || preset?.effectiveDate || null,
  };
}

function normalizeText(value) {
  return value
    .replace(/&#(?:x([0-9a-f]+)|(\d+));/gi, (_entity, hex, decimal) => {
      const codePoint = Number.parseInt(hex || decimal, hex ? 16 : 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : _entity;
    })
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replaceAll("\r\n", "\n")
    .replaceAll("\r", "\n")
    .replace(/[\u2028\u2029]/g, "\n")
    .replace(/[\u00a0\u2007\u202f]/g, " ")
    .replace(/[–—]/g, "-")
    .replace(/^\\\s*$/gm, "")
    .trim();
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function isCountryCurrencyHeader(value) {
  if (value.length > 160) return false;
  const countryAtStart = /^(?:bangladesh|indonesia|uzbekistan|kyrgyzstan|kazakhstan|india|azerbaijan|russia|argentina|brazil|brasil|vietnam|colombia|thailand|south korea|korea|turkey|türkiye|poland|australia|united kingdom|switzerland|netherlands|europe)\b/i.test(value);
  const hasCurrency = CURRENCY_CODES.some((code) => new RegExp(`(?:^|[^A-Z])${code}(?:[^A-Z]|$)`, "i").test(value));
  return countryAtStart && hasCurrency;
}

function startsBlock(line) {
  const value = line.trim().replace(/^[*_~`\s]+/, "");
  if (!value) return false;
  return /^(?:[🇦-🇿]{2}|🌎|🌍)\s*/u.test(value)
    || /^country\s*:/i.test(value)
    || /^(?:geo|гео)\s*[-:—]/iu.test(value)
    || /^(?:классический p2p|турция(?:\s|$)|payouts?\s+-\s+cards|offers?\s+rf|оффер\s+рф)/iu.test(value)
    || /^(?:trustly|ideal|apple\s*pay\s*\/\s*google\s*pay)\b/i.test(value)
    || /^(?:australia|poland|india|argentina|south korea)\b/i.test(value)
    || isCountryCurrencyHeader(value);
}

function normalizeFlatCountryTable(sourceText) {
  if (!/country\s*:/i.test(sourceText) || !/pricing\s*\/\s*fee/i.test(sourceText)) return sourceText;

  return sourceText
    .replace(/\s+(?=Country\s*:)/gi, "\n")
    .replace(/\s+(?=Type\s+APMs\s+Pricing\s*\/\s*Fee)/gi, "\n")
    .replace(/\s+(?=Pay-in\b)/gi, "\n")
    .replace(/\s+(?=Pay-out\b)/gi, "\n")
    .replace(/\s+(T\s*\+\s*\d+)\s+/gi, "\nSettlement: $1 ")
    .replace(/\s+(?=PAYOK\.COM\b)/gi, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n +/g, "\n")
    .trim();
}

function needsFollowingHeader(block) {
  return /^apple\s*pay\s*\/\s*google\s*pay\s*$/i.test(block.trim());
}

function splitBlocks(sourceText) {
  const lines = normalizeFlatCountryTable(sourceText).split("\n");
  const blocks = [];
  let current = [];
  let started = false;

  for (const line of lines) {
    const currentMeaningful = current.map((item) => item.trim()).filter(Boolean);
    const geoContinuation = /^(?:[*_~`\s]*)(?:geo|гео)\s*[-:—]/iu.test(line)
      && currentMeaningful.length > 0
      && !/^[-━⸻─_*~`]+$/u.test(currentMeaningful.at(-1));
    const beginsBlock = startsBlock(line) && !geoContinuation;
    if (!started && !beginsBlock) continue;
    if (beginsBlock) started = true;
    if (beginsBlock && current.some((item) => item.trim())) {
      const existing = current.join("\n").trim();
      if (!needsFollowingHeader(existing)) {
        blocks.push(existing);
        current = [];
      }
    }
    current.push(line);
  }
  if (current.some((item) => item.trim())) blocks.push(current.join("\n").trim());
  return blocks.filter((block) => block.length >= 30);
}

function expandFlatCountryTableBlocks(blocks) {
  const expanded = [];
  for (const block of blocks) {
    if (!/^country\s*:/i.test(block) || !/pricing\s*\/\s*fee/i.test(block)) {
      expanded.push(block);
      continue;
    }

    const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
    const countryHeader = lines[0];
    const rowStarts = lines
      .map((line, index) => (/^pay-(?:in|out)\b/i.test(line) ? index : -1))
      .filter((index) => index >= 0);

    rowStarts.forEach((start, position) => {
      const end = rowStarts[position + 1] ?? lines.length;
      const row = lines
        .slice(start, end)
        .filter((line) => !/^PAYOK\.COM$/i.test(line))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      if (row) expanded.push(`${countryHeader}\n${row}`);
    });
  }
  return expanded;
}

function expandCompoundBlocks(blocks) {
  const expanded = [];
  const koreaSection = /(?:account\s+transfer\s*\|\s*pay-?in|p2p\s+pay-?out|toss\s+one\s+click\s*\|\s*pay-?in|kakao\s+one\s+click\s*\|\s*pay-?in)/i;

  for (const block of blocks) {
    if (!/south korea/i.test(block) || !koreaSection.test(block)) {
      expanded.push(block);
      continue;
    }

    const lines = block.split("\n");
    const sectionIndexes = lines
      .map((line, index) => (koreaSection.test(line) ? index : -1))
      .filter((index) => index >= 0);
    const inherited = lines.slice(0, sectionIndexes[0]).filter((line) => !/^[-━⸻─_]+$/u.test(line.trim())).join("\n").trim();

    sectionIndexes.forEach((start, position) => {
      const end = sectionIndexes[position + 1] ?? lines.length;
      const section = lines.slice(start, end).filter((line) => !/^[-━⸻─_]+$/u.test(line.trim())).join("\n").trim();
      expanded.push(`${inherited}\n${section}`);
    });
  }

  return expanded;
}

function stripGeoListSections(block) {
  const lines = block.split("\n");
  const firstSection = lines.findIndex((line) => /(?:visa|master\s*card).*open\s+geo/i.test(line));
  return firstSection >= 0 ? lines.slice(0, firstSection).join("\n").trim() : block;
}

function extractNamedGeoSection(block, scheme) {
  const lines = block.split("\n");
  const heading = scheme === "VISA"
    ? /\bvisa\b.*open\s+geo/i
    : /master\s*card.*open\s+geo/i;
  const start = lines.findIndex((line) => heading.test(line));
  if (start < 0) return [];
  const end = lines.findIndex((line, index) => index > start && /(?:visa|master\s*card).*open\s+geo/i.test(line));
  return extractCountryCodes(lines.slice(start + 1, end < 0 ? lines.length : end).join("\n"));
}

function hasSchemeSpecificLimits(block) {
  const visa = block.split("\n").some((line) => /min\s*\/\s*max.*\bvisa\b|\bvisa\b.*min\s*\/\s*max/i.test(line));
  const mastercard = block.split("\n").some((line) => /min\s*\/\s*max.*(?:master\s*card|\bmc\b)|(?:master\s*card|\bmc\b).*min\s*\/\s*max/i.test(line));
  return visa && mastercard;
}

function expandSchemeSpecificBlocks(blocks) {
  const expanded = [];
  for (const block of blocks) {
    const visaGeos = extractNamedGeoSection(block, "VISA");
    const mastercardGeos = extractNamedGeoSection(block, "MASTERCARD");
    const splitForGeoLists = visaGeos.length > 0 && mastercardGeos.length > 0;
    const splitForLimits = hasSchemeSpecificLimits(block);
    if (!splitForGeoLists && !splitForLimits) {
      expanded.push(block);
      continue;
    }

    const shared = stripGeoListSections(block);
    for (const scheme of ["VISA", "MASTERCARD"]) {
      const ownGeos = scheme === "VISA" ? visaGeos : mastercardGeos;
      const otherPattern = scheme === "VISA" ? /master\s*card|\bmc\b/i : /\bvisa\b/i;
      const routeLines = shared
        .split("\n")
        .filter((line) => !(/min\s*\/\s*max/i.test(line) && otherPattern.test(line)));
      routeLines.push(`Card scheme: ${scheme}`);
      if (ownGeos.length) routeLines.push(`Open GEO codes: ${ownGeos.join(", ")}`);
      expanded.push(routeLines.join("\n").trim());
    }
  }
  return expanded;
}

function extractGeoCoverage(block) {
  const explicitCodeLine = block.match(/open\s+geo\s+codes?\s*:\s*([^\n]+)/i)?.[1] || "";
  const openGeos = unique([
    ...extractCountryCodes(explicitCodeLine),
    ...extractNamedGeoSection(block, "VISA"),
    ...extractNamedGeoSection(block, "MASTERCARD"),
  ]);
  const blockedHeading = block.search(/blocked\s+geo(?:'s|s)?/i);
  const blockedGeos = blockedHeading >= 0
    ? extractCountryCodes(block.slice(blockedHeading).split(/(?:visa|master\s*card).*open\s+geo/i)[0])
    : [];
  const worldwide = /world\s?wide|worldwide|\bww\b|global/i.test(block);
  if (openGeos.length) {
    return { scope: "regional", coverageMode: "allowlist", geos: openGeos, blockedGeos: [] };
  }
  if (worldwide) {
    return { scope: "global", coverageMode: "global_except", geos: [], blockedGeos };
  }
  const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
  const header = lines.slice(0, 4).join(" ");
  const explicit = lines.filter((line) => /^(?:[•-]?\s*)?(?:open\s+geo|geo|гео)\s*[-:—]/i.test(line)).join(" ");
  const searchText = `${header} ${explicit}`;
  const flagGeos = [
    ["🇺🇿", "UZ"], ["🇰🇬", "KG"], ["🇰🇿", "KZ"], ["🇮🇳", "IN"], ["🇦🇿", "AZ"], ["🇷🇺", "RU"],
    ["🇦🇷", "AR"], ["🇰🇷", "KR"], ["🇹🇷", "TR"], ["🇵🇱", "PL"], ["🇦🇺", "AU"], ["🇪🇺", "EU"],
  ].filter(([flag]) => searchText.includes(flag)).map(([, code]) => code);
  const geos = [...flagGeos, ...GEO_RULES.filter(([, pattern]) => pattern.test(searchText)).map(([code]) => code)];
  const scope = geos.includes("EU") ? "regional" : "specific";
  return { scope, coverageMode: scope === "regional" ? "regional" : "specific", geos: unique(geos), blockedGeos: [] };
}

function extractCurrencies(block, geos) {
  const explicit = block.match(/(?:currency|валюта)\s*[-:]\s*([A-Z]{3})/i)?.[1]?.toUpperCase();
  if (explicit && CURRENCY_CODES.includes(explicit)) return [explicit];

  const firstLines = block.split("\n").slice(0, 12).join(" ");
  const found = CURRENCY_CODES.filter((code) => new RegExp(`(^|[^A-Z])${code}([^A-Z]|$)`, "i").test(firstLines));
  if (found.length) return found;

  if (/A\$/i.test(block)) return ["AUD"];
  if (/€/u.test(block)) return ["EUR"];
  if (/₽|\bруб\b/iu.test(block)) return ["RUB"];
  if (/\$/u.test(block)) return ["USD"];

  const geoCurrency = {
    BD: "BDT", ID: "IDR", UZ: "UZS", KG: "KGS", KZ: "KZT", IN: "INR", AZ: "AZN", RU: "RUB", AR: "ARS", BR: "BRL", VN: "VND", CO: "COP", TH: "THB", KR: "KRW", TR: "TRY", PL: "PLN", AU: "AUD", GB: "GBP", CH: "CHF", NL: "EUR", EU: "EUR",
  };
  return unique(geos.map((geo) => geoCurrency[geo]));
}

function extractByRules(block, rules) {
  return rules.filter(([, pattern]) => pattern.test(block)).map(([value]) => value);
}

function extractMethods(block) {
  const paymentScope = block
    .split("\n")
    .map((line) => {
      const settlementIndex = line.search(/\bsettlement\b|сеттл|расч[её]т/i);
      return settlementIndex >= 0 ? line.slice(0, settlementIndex) : line;
    })
    .join("\n");
  return unique(extractByRules(paymentScope, METHOD_RULES));
}

function extractCardBrands(block) {
  const explicit = block.match(/card\s+scheme\s*:\s*(VISA|MASTERCARD|MIR)/i)?.[1]?.toUpperCase();
  if (explicit) return [explicit];
  return unique([
    /visa/i.test(block) ? "VISA" : null,
    /master\s?card|\bmc\b/i.test(block) ? "MASTERCARD" : null,
    /\bmir\b|мир/i.test(block) ? "MIR" : null,
  ]);
}

function parseDecimal(value) {
  const normalized = value.replace(",", ".").replace(/\s+/g, "");
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function inferFlow(block) {
  const flowText = block.split("\n").filter((line) => !/^выплаты?\s*:\s*(?:среда|пятница|понедельник|вторник|четверг|суббота|воскресенье)/i.test(line.trim())).join("\n");
  const hasPayin = /pay[-\s]?in|deposit fee|при[её]м|входящ/i.test(flowText);
  const hasPayout = /pay[-\s]?out|payout|выплат/i.test(flowText);
  if (hasPayin && hasPayout) return { value: "both", inferred: false };
  if (hasPayin) return { value: "payin", inferred: false };
  if (hasPayout) return { value: "payout", inferred: false };
  if (/\b(?:e-?com|ftd|std)\b|\b(?:blik|trustly|ideal)\b|apple\s*pay|google\s*pay|one\s*click|1\s*click|банковская эмиссия/i.test(block)) {
    return { value: "payin", inferred: true };
  }
  return { value: null, inferred: false };
}

function inferFeeFlow(line, fallbackFlow) {
  // Spreadsheet extraction can place notes in later columns on the same line
  // (for example `PayIn 3.8% ... Offer type PayIn / PayOut`). The leading row
  // label is authoritative; scanning the whole line first would misclassify
  // that fee as payout merely because `PayOut` appears in an adjacent cell.
  if (/^(?:pay[-\s]?in|deposit|при[её]м(?:\s+платежей)?|\bmdr\b)(?:\s|:|\t|$)/i.test(line)) return "payin";
  if (/^(?:pay[-\s]?out|payouts?|выплаты?)(?:\s|:|\t|$)/i.test(line)) return "payout";
  if (/pay[-\s]?out|payout|выплат/i.test(line)) return "payout";
  if (/pay[-\s]?in|deposit|при[её]м|\bmdr\b/i.test(line)) return "payin";
  if (/settlement|сеттл|расч[её]т|funding|kraken|binance|bybit|rapira|htx|paribu|uznex|\bxe\b/i.test(line)) return "settlement";
  if (/refund/i.test(line)) return "refund";
  if (/charge\s?back|chargeback/i.test(line)) return "chargeback";
  // A combined "Success + Decline" transaction fee still belongs to the
  // route flow. Only a standalone decline charge is a decline fee component.
  if (/decline/i.test(line) && !/success/i.test(line)) return "decline";
  return fallbackFlow === "both" ? null : fallbackFlow;
}

function extractFixedFee(line) {
  const suffix = line.match(/\+\s*(\d+(?:[.,]\d+)?)\s*(A\$|€|\$|[A-Z]{3}|руб|₽)/i);
  const prefix = line.match(/\+\s*(A\$|€|\$|₽)\s*(\d+(?:[.,]\d+)?)/i);
  const match = suffix || prefix;
  if (!match) return null;
  // Fixed monetary amounts use locale-dependent grouping in incoming rate
  // cards (for example `6,000 IDR`). Percentage values are parsed as
  // decimals elsewhere; monetary amounts must use the grouping-aware parser.
  const amount = parseAmount(suffix ? match[1] : match[2]);
  const symbol = (suffix ? match[2] : match[1]).toUpperCase();
  const currency = ({ "A$": "AUD", "€": "EUR", "$": "USD", "РУБ": "RUB", "₽": "RUB" }[symbol] || symbol);
  if (![...CURRENCY_CODES, "USDT", "USDC"].includes(currency)) return null;
  return { amount, currency };
}

function extractFees(block, fallbackFlow, currencies) {
  const fees = [];
  let contextFlow = fallbackFlow === "both" ? null : fallbackFlow;
  let reserveSection = false;
  for (const rawLine of block.split("\n")) {
    const line = rawLine.replace(/[*_`]/g, "").trim();
    if (/^(?:reserve|rolling reserve|rr)\s*:/i.test(line)) reserveSection = true;
    if (/^(?:pay\s*in|при[её]м(?:\s+платежей)?)[\s:]*$/i.test(line)) contextFlow = "payin";
    if (/^(?:pay\s*out|payouts?|выплаты?)[\s:]*$/i.test(line)) contextFlow = "payout";
    if (/^settlement\s*:/i.test(line)) contextFlow = "settlement";
    if (!line.includes("%")) continue;
    if (reserveSection || /rolling reserve|reserve:|\brr\s*:|netting|неттинг|approval|\bar\s*:/i.test(line)) continue;

    const tieredFees = [...line.matchAll(/\b(FTD|TD|TRUSTED|STD)\b\s*[-:=]?\s*(\d+(?:[.,]\d+)?)\s*%/gi)];
    if (tieredFees.length > 1) {
      const flow = inferFeeFlow(line, contextFlow || fallbackFlow);
      if (flow) {
        for (const tieredFee of tieredFees) {
          fees.push({
            flow,
            traffic_tier: /^FTD$/i.test(tieredFee[1]) ? "FTD" : "TRUSTED",
            method_scope: [],
            region_scope: [],
            fee_type: "percent",
            base_percent: parseDecimal(tieredFee[2]),
            base_fixed: null,
            base_fixed_currency: null,
            applies_on: "success",
            source_text: line,
          });
        }
      }
      continue;
    }

    const percentMatch = line.match(/(\d+(?:[.,]\d+)?)\s*%/);
    if (!percentMatch) continue;
    const flow = inferFeeFlow(line, contextFlow || fallbackFlow);
    if (!flow) continue;

    const fixedFee = extractFixedFee(line);
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
      fee_type: fixedFee ? "percent_plus_fixed" : "percent",
      base_percent: parseDecimal(percentMatch[1]),
      base_fixed: fixedFee?.amount ?? null,
      base_fixed_currency: fixedFee?.currency || (fixedFee ? currencies[0] || null : null),
      applies_on: /success/i.test(line) && /decline/i.test(line) ? "both" : /decline/i.test(line) ? "decline" : "success",
      source_text: line,
    });
  }

  const key = (fee) => [fee.flow, fee.traffic_tier, fee.method_scope.join(","), fee.base_percent, fee.base_fixed, fee.applies_on].join("|");
  return [...new Map(fees.map((fee) => [key(fee), fee])).values()];
}

function parseAmount(value) {
  let digits = value.replace(/[^0-9.,]/g, "").replaceAll(" ", "");
  if (digits.includes(",") && digits.includes(".")) {
    digits = digits.replaceAll(",", "");
  } else if (/^\d{1,3}(?:,\d{3})+$/.test(digits)) {
    digits = digits.replaceAll(",", "");
  } else if (/^\d{1,3}(?:\.\d{3})+$/.test(digits)) {
    digits = digits.replaceAll(".", "");
  } else {
    digits = digits.replace(",", ".");
  }
  const parsed = Number.parseFloat(digits);
  return Number.isFinite(parsed) ? parsed : null;
}

function extractLimits(block, fallbackFlow, currencies) {
  const limits = [];
  let contextFlow = fallbackFlow === "both" ? null : fallbackFlow;
  let limitContext = false;
  let pendingMinimum = null;
  const rangePattern = /(A\$|€|\$|₽|[A-Z]{3})?\s*([\d][\d\s.,]*)\s*(?:[A-Z]{3}|A\$|€|\$|₽)?\s*-\s*(A\$|€|\$|₽|[A-Z]{3})?\s*([\d][\d\s.,]*)\s*(A\$|€|\$|₽|[A-Z]{3})?/i;
  const fromToPattern = /от\s*(A\$|€|\$|₽|[A-Z]{3})?\s*([\d][\d\s.,]*)\s*(?:[A-Z]{3}|A\$|€|\$|₽)?\s*до\s*(A\$|€|\$|₽|[A-Z]{3})?\s*([\d][\d\s.,]*)\s*(A\$|€|\$|₽|[A-Z]{3})?/i;
  const englishFromToPattern = /from\s*(A\$|€|\$|₽|[A-Z]{3})?\s*([\d][\d\s.,]*)\s*(?:[A-Z]{3}|A\$|€|\$|₽)?\s*to\s*(A\$|€|\$|₽|[A-Z]{3})?\s*([\d][\d\s.,]*)\s*(A\$|€|\$|₽|[A-Z]{3})?/i;

  for (const rawLine of block.split("\n")) {
    const line = rawLine.replace(/[*_`]/g, "").trim();
    if (/^(?:pay[-\s]*in|при[её]м(?:\s+платежей)?)(?:\s|:|$)/i.test(line)) contextFlow = "payin";
    if (/^(?:pay[-\s]*out|payouts?|выплаты?)(?:\s|:|$)/i.test(line)) contextFlow = "payout";
    if (/^(?:limits?|лимиты)[\s:]*$/i.test(line)) {
      limitContext = true;
      continue;
    }
    const match = line.match(rangePattern) || line.match(fromToPattern) || line.match(englishFromToPattern);
    const bareRangeLine = Boolean(contextFlow) && Boolean(match) && line.replace(match?.[0] || "", "").replace(/[•:]/g, "").trim() === "";
    const isLimitLine = /limit|\blim\b|лим|min\s*\/\s*max|мин|макс|transaction|транзакц|чек|деп\b/i.test(line)
      || /^(?:pay-in|pay-out)\b/i.test(line)
      || limitContext
      || bareRangeLine;
    const singleAmount = line.match(/(?:мин(?:\.\s*деп)?|макс(?:\.\s*деп)?)[^\d]*(\d[\d\s.,]*)\s*(A\$|€|\$|₽|[A-Z]{3}|руб)?/i);
    if (!match && singleAmount) {
      const isMaximum = /макс/i.test(line);
      const symbol = (singleAmount[2] || "").toUpperCase();
      const currency = ({ "A$": "AUD", "₽": "RUB", "€": "EUR", "$": "USD", "РУБ": "RUB" }[symbol] || symbol || currencies[0] || "").toUpperCase();
      if (!isMaximum) {
        pendingMinimum = { amount: parseAmount(singleAmount[1]), currency, flow: contextFlow || fallbackFlow || "both", note: line };
      } else if (pendingMinimum && currency) {
        limits.push({
          flow: pendingMinimum.flow,
          scope: "transaction",
          method_scope: [],
          traffic_tier: null,
          currency,
          minimum_amount: pendingMinimum.amount,
          maximum_amount: parseAmount(singleAmount[1]),
          maximum_count: null,
          original_note: `${pendingMinimum.note} | ${line}`,
        });
        pendingMinimum = null;
      }
      continue;
    }
    if (!match || !isLimitLine) continue;
    const flow = inferFeeFlow(line, contextFlow || fallbackFlow) || fallbackFlow || "both";
    const symbol = (match[5] || match[3] || match[1] || "").toUpperCase();
    const parsedCurrency = ({ "A$": "AUD", "₽": "RUB", "€": "EUR", "$": "USD" }[symbol] || symbol || "").toUpperCase();
    const currency = ([...CURRENCY_CODES, "USDT", "USDC"].includes(parsedCurrency) ? parsedCurrency : currencies[0] || "").toUpperCase();
    if (!currency) continue;
    limits.push({
      flow,
      scope: "transaction",
      method_scope: unique([
        /\bvisa\b/i.test(line) ? "VISA" : null,
        /master\s*card|\bmc\b/i.test(line) ? "MASTERCARD" : null,
      ]),
      traffic_tier: null,
      currency,
      minimum_amount: parseAmount(match[2]),
      maximum_amount: parseAmount(match[4]),
      maximum_count: null,
      original_note: line,
    });
    limitContext = false;
  }
  return limits;
}

function extractSettlement(block) {
  const settlementLines = block.split("\n").filter((line) => /settlement|сеттл|курс|usdt|usdc|netting|неттинг|\bT\s*\+\s*\d+\b|binance|bybit|kraken|\bxe\b/i.test(line));
  if (!settlementLines.length) return [];
  const joined = settlementLines.join(" | ");
  const feeMatch = joined.match(/\bT\s*\+\s*\d+\b[^%]{0,100}?\+\s*(\d+(?:[.,]\d+)?)\s*%/i)
    || joined.match(/(?:fee|usdt|usdc|сеттл)[^%]{0,40}(\d+(?:[.,]\d+)?)\s*%/i);
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

function buildTitle(geos, methods, flow, scope, cardBrands = []) {
  const geoLabel = scope === "global" ? "Worldwide" : geos.join(" / ") || "Regional";
  const methodLabel = [methods.slice(0, 3).join(" / ") || "Payment", cardBrands.length === 1 ? cardBrands[0] : null].filter(Boolean).join(" · ");
  const flowLabel = flow === "both" ? "PayIn & PayOut" : flow === "payin" ? "PayIn" : "PayOut";
  return `${geoLabel} · ${methodLabel} · ${flowLabel}`;
}

function buildRouteFamilyKey({ coverageMode, geos, currencies, flow, methods, cardBrands, trafficTypes, integrations }) {
  const coverageAnchor = ["specific", "regional"].includes(coverageMode)
    ? [...geos].sort().join("+") || "UNKNOWN"
    : coverageMode.toUpperCase();
  const part = (values, fallback = "ANY") => [...values].sort().join("+") || fallback;
  return [
    `GEO:${coverageAnchor}`,
    `CURRENCY:${part(currencies, "UNKNOWN")}`,
    `FLOW:${(flow || "both").toUpperCase()}`,
    `METHOD:${part(methods, "UNKNOWN")}`,
    `SCHEME:${part(cardBrands)}`,
    `TRAFFIC:${part(trafficTypes)}`,
    `INTEGRATION:${part(integrations)}`,
  ].join("|");
}

function parseRoute(block, index) {
  const { scope, coverageMode, geos, blockedGeos } = extractGeoCoverage(block);
  const currencies = extractCurrencies(block, geos);
  let methods = extractMethods(block);
  const trafficTypes = unique(extractByRules(block, TRAFFIC_RULES));
  const verticals = unique(extractByRules(block, VERTICAL_RULES));
  const integrations = unique(extractByRules(block, INTEGRATION_RULES));
  const cardBrands = extractCardBrands(block);
  const flowResult = inferFlow(block);
  const flow = flowResult.value;
  let methodInferred = false;
  if (!methods.length && /\b(?:e-?com|eur\s+ftd|aud\s+std)\b|турция/i.test(block)) {
    methods = ["CARDS"];
    methodInferred = true;
  }
  const fees = extractFees(block, flow, currencies);
  const anomalies = [];

  if (scope === "specific" && !geos.length) anomalies.push({ code: "geo_missing", severity: "error", field: "geos", message: "GEO was not parsed.", source_excerpt: block.slice(0, 240) });
  if (!currencies.length) anomalies.push({ code: "currency_missing", severity: "error", field: "currencies", message: "Transaction currency was not parsed.", source_excerpt: block.slice(0, 240) });
  if (!methods.length) anomalies.push({ code: "method_missing", severity: "error", field: "methods", message: "Payment method was not parsed.", source_excerpt: block.slice(0, 240) });
  if (!flow) anomalies.push({ code: "flow_missing", severity: "error", field: "flow", message: "Payment flow was not parsed.", source_excerpt: block.slice(0, 240) });
  if (!fees.length) anomalies.push({ code: "pricing_missing", severity: "error", field: "fees", message: "No source fee was parsed.", source_excerpt: block.slice(0, 240) });
  if (methodInferred) anomalies.push({ code: "method_inferred", severity: "warning", field: "methods", message: "Card method was inferred from the offer heading and requires staff confirmation.", source_excerpt: block.split("\n").slice(0, 3).join(" | ") });
  if (flowResult.inferred) anomalies.push({ code: "flow_inferred", severity: "warning", field: "flow", message: "PayIn flow was inferred from the offer heading and requires staff confirmation.", source_excerpt: block.split("\n").slice(0, 3).join(" | ") });
  if (!trafficTypes.length) anomalies.push({ code: "traffic_unconfirmed", severity: "warning", field: "traffic_types", message: "Traffic type requires staff confirmation.", source_excerpt: block.slice(0, 240) });
  if (!verticals.length) anomalies.push({ code: "vertical_unconfirmed", severity: "warning", field: "verticals", message: "Vertical acceptance is not explicit in the source and requires PSP confirmation.", source_excerpt: block.slice(0, 240) });
  if (/660\s*000\s*00(?:\D|$)/.test(block)) anomalies.push({ code: "malformed_limit", severity: "error", field: "limits", message: "A transaction maximum appears malformed.", source_excerpt: block.match(/[^\n]*660\s*000\s*00[^\n]*/)?.[0] || "" });
  if (/pay\s*out\s+min\/max[^\n]*\b1\s*-\s*660\s*000\s*00[\s\S]*limits\s+pay\s*out:[\s\S]*pay\s*out\s+min\/max[^\n]*\b5\s*000\s*-\s*660\s*000\s*00/i.test(block)) {
    anomalies.push({ code: "conflicting_limit_minimum", severity: "error", field: "limits", message: "The source gives two different PayOut minimum amounts (1 and 5,000).", source_excerpt: "PayOut minimum: 1 / 5 000" });
  }
  if (/open geo\s*:\s*inr/i.test(block)) anomalies.push({ code: "currency_used_as_geo", severity: "warning", field: "geos", message: "The source uses INR where a GEO code is expected; India was inferred from the route heading.", source_excerpt: "Open GEO: INR" });
  if (/red glass|green glass|красн.*стакан|зел[её]н.*стакан|top\s*\d/i.test(block)) anomalies.push({ code: "exchange_rule_review", severity: "warning", field: "settlement", message: "Order-book settlement rule requires manual review.", source_excerpt: block.split("\n").filter((line) => /стакан|top\s*\d/i.test(line)).join(" | ").slice(0, 400) });

  const limits = extractLimits(block, flow, currencies);
  if (limits.some((limit) => limit.minimum_amount != null && limit.maximum_amount != null && limit.maximum_amount < limit.minimum_amount)) {
    anomalies.push({ code: "invalid_limit_range", severity: "error", field: "limits", message: "A parsed maximum is lower than its minimum.", source_excerpt: block.slice(0, 240) });
  }

  return {
    parser_index: index,
    client_title: buildTitle(geos, methods, flow || "both", scope, cardBrands),
    coverage_scope: scope,
    coverage_mode: coverageMode,
    geos,
    blocked_geos: blockedGeos,
    currencies,
    flow: flow || "both",
    methods,
    card_brands: cardBrands,
    traffic_types: trafficTypes,
    verticals,
    prohibited_verticals: [],
    integrations,
    niche_key: buildRouteFamilyKey({ coverageMode, geos, currencies, flow, methods, cardBrands, trafficTypes, integrations }),
    route_family_key: buildRouteFamilyKey({ coverageMode, geos, currencies, flow, methods, cardBrands, trafficTypes, integrations }),
    effective_from: null,
    expires_at: null,
    freshness_days: 30,
    min_monthly_volume: null,
    max_monthly_volume: null,
    volume_currency: null,
    risk_terms: {
      rolling_reserve: block.match(/(?:rolling reserve|(?:^|\n)\s*RR\s*(?::|-))[^\n]*/i)?.[0]?.trim() || null,
      chargeback: block.match(/(?:charge\s?back|(?:^|\n)\s*CB\s*(?::|-))[^\n]*/i)?.[0]?.trim() || null,
      refund: block.match(/refund(?:\s+fee)?[^\n]*/i)?.[0]?.trim() || null,
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
  const uniqueRoutes = [];
  let duplicateBlockCount = 0;
  for (const route of routes) {
    const normalized = route.raw_block.toLowerCase().replace(/\s+/g, " ").trim();
    const hash = createHash("sha256").update(normalized).digest("hex");
    if (seen.has(hash)) {
      duplicateBlockCount += 1;
    } else {
      seen.set(hash, uniqueRoutes.length);
      route.parser_index = uniqueRoutes.length;
      uniqueRoutes.push(route);
    }
  }
  return { routes: uniqueRoutes, duplicateBlockCount };
}

export function parseOfferSource({
  providerKey = null,
  providerName = null,
  providerWebsite = null,
  strategicPriority = null,
  marginIncluded = null,
  effectiveDate = null,
  sourceText: rawSourceText,
  sourceType = "telegram",
  sourceReference = "inline-source",
  sourceFormat = null,
  originalSource = null,
  extractionMethod = "plain-text",
  extractorVersion = null,
  sourceMetadata = {},
}) {
  if (typeof rawSourceText !== "string" || !rawSourceText.trim()) {
    throw new Error("source_text is required");
  }

  const providerArgs = {};
  if (providerKey) providerArgs.provider = providerKey;
  if (providerName) providerArgs["provider-name"] = providerName;
  if (providerWebsite) providerArgs["provider-website"] = providerWebsite;
  if (strategicPriority != null) providerArgs["strategic-priority"] = strategicPriority;
  if (marginIncluded != null) providerArgs["margin-included"] = marginIncluded;
  if (effectiveDate) providerArgs["effective-date"] = effectiveDate;
  if (!providerArgs.provider && !providerArgs["provider-name"]) {
    throw new Error("provider_name is required");
  }

  const provider = providerFromArgs(providerArgs);
  const sourceText = normalizeText(rawSourceText);
  const sourceBlocks = splitBlocks(sourceText);
  const expandedBlocks = expandSchemeSpecificBlocks(expandCompoundBlocks(expandFlatCountryTableBlocks(sourceBlocks)));
  const { routes, duplicateBlockCount } = validateAndDeduplicate(expandedBlocks.map(parseRoute));
  const batchAnomalies = routes.length ? [] : [{
    code: "source_unparsed",
    severity: "error",
    field: "source",
    message: "The source produced no normalized offer routes. Use a format adapter, OCR/AI extraction or manual review.",
    source_excerpt: sourceText.slice(0, 400),
  }];
  const blockingCount = batchAnomalies.length
    + routes.reduce((count, route) => count + route.anomalies.filter((item) => item.severity === "error").length, 0);

  const payload = {
    provider: {
      brand_name: provider.brandName,
      website: provider.website,
      strategic_priority: provider.strategicPriority,
      margin_included_default: provider.marginIncludedDefault,
    },
    batch: {
      source_type: sourceType,
      source_reference: sourceReference,
      source_effective_date: effectiveDate || provider.effectiveDate,
      parser_version: "offerpsp-source-parser-v4",
      parser_metadata: {
        ...sourceMetadata,
        ingestion_standard: "offerpsp-universal-source-v1",
        presentation_standard: "offerpsp-telegram-offer-v1",
        source_format: sourceFormat || sourceType || "text",
        original_source_reference: originalSource || sourceReference,
        extraction_method: extractionMethod,
        extractor_version: extractorVersion,
        source_sha256: createHash("sha256").update(sourceText).digest("hex"),
        source_bytes: Buffer.byteLength(sourceText),
        source_block_count: sourceBlocks.length,
        expanded_block_count: expandedBlocks.length,
        duplicate_source_block_count: duplicateBlockCount,
        route_count: routes.length,
        blocking_anomaly_count: blockingCount,
        batch_anomalies: batchAnomalies,
        generated_at: new Date().toISOString(),
        publication_allowed: false,
      },
      source_text: sourceText,
      routes,
    },
  };

  return payload;
}
