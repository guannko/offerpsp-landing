const COUNTRY_ALIASES = {
  russia: "RU", россия: "RU", kyrgyzstan: "KG", kyrgyz: "KG", киргизия: "KG", кыргызстан: "KG",
  india: "IN", индия: "IN", azerbaijan: "AZ", азербайджан: "AZ", uzbekistan: "UZ", узбекистан: "UZ",
  argentina: "AR", аргентина: "AR", "south korea": "KR", "южная корея": "KR", turkey: "TR", турция: "TR",
  poland: "PL", польша: "PL", australia: "AU", австралия: "AU", switzerland: "CH", швейцария: "CH",
  netherlands: "NL", нидерланды: "NL", "united kingdom": "GB", "великобритания": "GB",
};

const LOCALIZED = {
  ru: {
    notApplicable: "Не применяется",
    yes: "Да",
    no: "Нет",
    firstRefundRule: "Первый возврат по плательщику проводится без дополнительных вопросов; последующие возвраты по этому плательщику проверяет служба поддержки.",
  },
  en: {
    notApplicable: "N/A",
    yes: "Yes",
    no: "No",
    firstRefundRule: "The first refund for a payer is processed without additional questions; subsequent refunds for the same payer are investigated by support.",
  },
};

function languageCode(language) {
  return language === "ru" ? "ru" : "en";
}

export function localizedCountryName(value, language) {
  const source = String(value || "").trim();
  const code = /^[A-Za-z]{2}$/.test(source) ? source.toUpperCase() : COUNTRY_ALIASES[source.toLowerCase()];
  if (!code) return source;
  try {
    return new Intl.DisplayNames([languageCode(language)], { type: "region" }).of(code) || code;
  } catch {
    return code;
  }
}

export function readableOfferCode(value, language) {
  const normalized = String(value || "").trim().toUpperCase();
  if (!normalized) return "";
  if (normalized === "TRUSTED") return "Trusted";
  if (normalized === "CARDS") return language === "ru" ? "Карты" : "Cards";
  if (normalized === "BANK_TRANSFER") return language === "ru" ? "Банковский перевод" : "Bank transfer";
  if (normalized === "OPEN_BANKING") return language === "ru" ? "Открытый банкинг" : "Open banking";
  if (normalized === "MASTERCARD") return "MasterCard";
  if (normalized === "VISA") return "Visa";
  return normalized;
}

export function localizedCommercialValue(value, language) {
  if (value && typeof value === "object") {
    return String(value[languageCode(language)] || value.en || value.ru || "").trim();
  }
  const normalized = String(value || "").trim();
  const copy = LOCALIZED[languageCode(language)];
  if (/^(?:n\/?a|not applicable)$/i.test(normalized)) return copy.notApplicable;
  if (/^(?:no|none|нет)$/i.test(normalized)) return copy.no;
  if (/^(?:yes|да)$/i.test(normalized)) return copy.yes;
  if (/^первый рефанд по плательщику делается без дополнительных вопросов, последующие рефанды по этому плательщику служба поддержки расследует$/i.test(normalized)) {
    return copy.firstRefundRule;
  }
  return normalized;
}

export function localizedCommercialLine(label, value, sourcePattern, language) {
  const normalized = String(value || "").trim();
  if (!normalized) return "";
  const withoutSourceLabel = normalized.replace(sourcePattern, "").replace(/^\s*[-:—]\s*/, "").trim();
  return `${label}: ${localizedCommercialValue(withoutSourceLabel || normalized, language)}`;
}

export function localizedClientNote(value, language, fallback) {
  const normalized = String(value || "").trim();
  if (!normalized) return fallback;
  if (/^(?:Выбрано специалистом OfferPSP для вашего рассмотрения\.|Selected (?:by an OfferPSP specialist|for your operating profile).*)$/i.test(normalized)) {
    return fallback;
  }
  const sourceIsRussian = /[А-ЯЁа-яё]/.test(normalized);
  if ((language === "en" && sourceIsRussian) || (language === "ru" && !sourceIsRussian)) return fallback;
  return normalized;
}
