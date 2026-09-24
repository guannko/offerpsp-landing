const ISO2_CODES = `AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW`.split(" ");

const CUSTOM_ALIASES = {
  "bolivia": "BO",
  "british indian ocean territory": "IO",
  "brunei": "BN",
  "cape verde": "CV",
  "czech republic": "CZ",
  "democratic people's republic of korea": "KP",
  "democratic peoples republic of korea": "KP",
  "dprk": "KP",
  "dominican republic": "DO",
  "east timor": "TL",
  "holy see": "VA",
  "iran": "IR",
  "ivory coast": "CI",
  "laos": "LA",
  "macao": "MO",
  "macedonia": "MK",
  "micronesia": "FM",
  "moldova": "MD",
  "myanmar": "MM",
  "myanmar burma": "MM",
  "north korea": "KP",
  "north macedonia": "MK",
  "palestine": "PS",
  "russia": "RU",
  "south korea": "KR",
  "south korea republic of korea": "KR",
  "swaziland": "SZ",
  "syria": "SY",
  "taiwan province of china": "TW",
  "tanzania": "TZ",
  "the bahamas": "BS",
  "turkey": "TR",
  "turkiye": "TR",
  "u.k.": "GB",
  "uk": "GB",
  "united kingdom": "GB",
  "united states": "US",
  "united states of america": "US",
  "usa": "US",
  "venezuela": "VE",
  "viet nam": "VN",
  "vietnam": "VN",
  "virgin islands british": "VG",
};

function normalizeCountryName(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase();
}

const COUNTRY_NAME_TO_CODE = new Map();
for (const locale of ["en", "en-GB"]) {
  const display = new Intl.DisplayNames([locale], { type: "region" });
  for (const code of ISO2_CODES) {
    COUNTRY_NAME_TO_CODE.set(normalizeCountryName(display.of(code)), code);
  }
}
for (const [name, code] of Object.entries(CUSTOM_ALIASES)) {
  COUNTRY_NAME_TO_CODE.set(normalizeCountryName(name), code);
}

export function normalizeCountryToken(value) {
  const token = normalizeCountryName(value);
  if (!token) return null;
  if (/^[a-z]{2}$/i.test(String(value).trim())) {
    const code = String(value).trim().toUpperCase();
    return ISO2_CODES.includes(code) ? code : null;
  }
  return COUNTRY_NAME_TO_CODE.get(token) || null;
}

export function extractCountryCodes(value) {
  const candidates = String(value || "")
    .replace(/\r/g, "\n")
    .split(/[,;\n]+/)
    .map((item) => item.replace(/^[\s•*-]+|[\s.]+$/g, "").trim())
    .filter(Boolean);
  const codes = [];
  for (const candidate of candidates) {
    const variants = [
      candidate,
      candidate.replace(/\s*\([^)]*\)\s*/g, " ").trim(),
      ...(candidate.match(/\(([^)]*)\)/g) || []).map((part) => part.slice(1, -1).trim()),
    ];
    const code = variants.map(normalizeCountryToken).find(Boolean);
    if (code) codes.push(code);
  }
  return [...new Set(codes)];
}
