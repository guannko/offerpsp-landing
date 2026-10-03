export const geoEngines = [
  { value: "chatgpt", label: "ChatGPT", url: "https://chatgpt.com/" },
  { value: "gemini", label: "Gemini", url: "https://gemini.google.com/" },
  { value: "perplexity", label: "Perplexity", url: "https://www.perplexity.ai/" },
] as const;

export const geoScenarios = [
  { value: "discovery", label: "Поиск платёжного партнёра" },
  { value: "methods", label: "Поиск локальных методов" },
  { value: "brand", label: "Что AI знает об OfferPSP" },
  { value: "custom", label: "Свой запрос" },
] as const;

export const geoMarkets = [
  { value: "global", ru: "Без ограничения страны", en: "international markets" },
  { value: "US", ru: "США", en: "the United States" },
  { value: "RU", ru: "Россия", en: "Russia" },
  { value: "KZ", ru: "Казахстан", en: "Kazakhstan" },
  { value: "BR", ru: "Бразилия", en: "Brazil" },
  { value: "IN", ru: "Индия", en: "India" },
  { value: "VN", ru: "Вьетнам", en: "Vietnam" },
  { value: "ID", ru: "Индонезия", en: "Indonesia" },
  { value: "EU", ru: "Европа / ЕС", en: "the European Union" },
] as const;

export function buildGeoPrompt(scenario: string, language: string, market: string): string {
  if (scenario === "custom") return "";
  const region = geoMarkets.find(item => item.value === market) ?? geoMarkets[0];
  if (scenario === "brand") return language === "ru"
    ? "Что такое OfferPSP (offerpsp.com), какие услуги предлагает этот сервис и кому он подходит? Используй публичные источники, добавь ссылки и отдельно отметь, что не удалось подтвердить."
    : "What is OfferPSP (offerpsp.com), what services does it offer, and who is it for? Use public sources, include links, and clearly distinguish anything you could not verify.";
  if (scenario === "methods") return language === "ru"
    ? `Какие локальные способы приёма и выплаты платежей доступны для онлайн-бизнеса: ${region.ru}? Какие сервисы помогают подобрать провайдера? Укажи ограничения по вертикалям и ссылки на публичные источники. Не придумывай ставки.`
    : `Which local pay-in and payout methods are available for online businesses in ${region.en}? Which services help find a payment provider? Include vertical restrictions and links to public sources. Do not invent rates.`;
  return language === "ru"
    ? `Какие сервисы помогают онлайн-бизнесу найти и сравнить PSP для работы с high-risk вертикалями на рынке: ${region.ru}? Расскажи о критериях выбора, ограничениях и приведи ссылки на публичные источники.`
    : `Which services help online businesses find and compare PSPs for high-risk verticals in ${region.en}? Explain selection criteria and restrictions, and include links to public sources.`;
}

export function localGeoDateTime(date = new Date()): string {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export function isPublicGeoUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== "https:" || url.username || url.password || value.length > 2000) return false;
    if (!host.includes(".") || host === "localhost" || host.endsWith(".local") || host.endsWith(".internal") || host.includes(":") || /^\d+(\.\d+){3}$/.test(host)) return false;
    const sensitive = /(?:token|secret|password|signature|credential|api[_-]?key|authorization|^code$|^key$|^sig$|^jwt$|^session$)/i;
    return ![...url.searchParams.keys()].some(key => sensitive.test(key)) && !sensitive.test(url.hash);
  } catch { return false; }
}

export function extractGeoCitations(response: string): { urls: string[]; rejected: string[] } {
  const urls = new Set<string>();
  const rejected = new Set<string>();
  for (const match of response.matchAll(/https:\/\/[^\s<>"`]+/gi)) {
    let value = match[0].replace(/[.,;:!?]+$/, "");
    // Remove Markdown wrappers, but keep balanced parentheses inside a URL.
    while (/[)\]}]$/.test(value)) {
      const last = value[value.length - 1];
      const first = last === ")" ? "(" : last === "]" ? "[" : "{";
      if (value.split(last).length <= value.split(first).length) break;
      value = value.slice(0, -1);
    }
    value = value.replace(/[.,;:!?]+$/, "");
    if (isPublicGeoUrl(value)) urls.add(value);
    else rejected.add(value);
  }
  return { urls: [...urls], rejected: [...rejected] };
}

export type GeoObservationInput = {
  engine: string; model: string; country: string; language: string; prompt: string;
  response_text: string; citations: string[]; evidence_url: string; observed_at: string;
};

export function validateGeoObservation(input: GeoObservationInput, now = Date.now()): void {
  if (!geoEngines.some(item => item.value === input.engine)) throw new Error("Выберите платформу.");
  if (!/^[A-Z]{2}$/.test(input.country)) throw new Error("Укажите страну, из которой проводилась проверка.");
  if (!["ru", "en"].includes(input.language)) throw new Error("Выберите язык проверки.");
  if (input.prompt.trim().length < 5 || input.prompt.length > 2000) throw new Error("Запрос должен содержать от 5 до 2000 символов.");
  if (input.response_text.trim().length < 10 || input.response_text.length > 20000) throw new Error("Вставьте реальный ответ AI: от 10 до 20 000 символов.");
  if (extractGeoCitations(input.response_text).rejected.length) throw new Error("В ответе есть непубличные ссылки или ссылки с токенами. Удалите их перед сохранением.");
  if (input.citations.length > 50 || input.citations.some(url => !isPublicGeoUrl(url))) throw new Error("Допустимо до 50 публичных HTTPS-ссылок без токенов.");
  if (input.evidence_url && !isPublicGeoUrl(input.evidence_url)) throw new Error("Доказательство должно быть публичной HTTPS-ссылкой без токенов.");
  const at = Date.parse(input.observed_at);
  if (!Number.isFinite(at) || at > now + 5 * 60_000) throw new Error("Укажите действительное время ответа, не в будущем.");
}
