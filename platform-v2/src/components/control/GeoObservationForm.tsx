import { useMemo, useState } from "react";
import { buildGeoPrompt, extractGeoCitations, geoEngines, geoMarkets, geoScenarios, localGeoDateTime, validateGeoObservation } from "../../lib/geoObservationForm";
import type { GeoObservationInput } from "../../lib/geoObservationForm";

const inputClass = "mt-1 w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2 text-base";
const buttonClass = "rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium disabled:opacity-50";

export default function GeoObservationForm({ busy, onSave }: { busy: boolean; onSave: (input: GeoObservationInput) => Promise<void> }) {
  const [scenario, setScenario] = useState("discovery");
  const [language, setLanguage] = useState("ru");
  const [market, setMarket] = useState("global");
  const [engine, setEngine] = useState("chatgpt");
  const [customPrompt, setCustomPrompt] = useState("");
  const [response, setResponse] = useState("");
  const [observedAt, setObservedAt] = useState("");
  const [country, setCountry] = useState("");
  const [otherCountry, setOtherCountry] = useState("");
  const [manualCitations, setManualCitations] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [started, setStarted] = useState(false);
  const [answerVersion, setAnswerVersion] = useState(0);
  const [confirmReset, setConfirmReset] = useState(false);
  const prompt = scenario === "custom" ? customPrompt : buildGeoPrompt(scenario, language, market);
  const extracted = useMemo(() => extractGeoCitations(response), [response]);
  const platform = geoEngines.find(item => item.value === engine)!;
  const lock = started || !!response.trim();

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(prompt);
      setStarted(true); setMessage("Запрос скопирован. Вставьте его в выбранную AI-платформу, затем вернитесь с полным ответом.");
    } catch { setMessage("Браузер не разрешил копирование. Выделите и скопируйте запрос вручную."); }
  }
  function resetAnswer() {
    setResponse(""); setObservedAt(""); setManualCitations(""); setStarted(false); setMessage(""); setError("");
    setConfirmReset(false);
    setAnswerVersion(value => value + 1);
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    const fields = new FormData(event.currentTarget);
    try {
      const input: GeoObservationInput = {
        engine, language, country: country === "other" ? otherCountry.toUpperCase() : country,
        model: String(fields.get("model") || "").trim(), prompt, response_text: response,
        citations: [...new Set([...extracted.urls, ...manualCitations.split(/\n/).map(url => url.trim()).filter(Boolean)])],
        evidence_url: String(fields.get("evidence_url") || "").trim(),
        observed_at: observedAt ? new Date(observedAt).toISOString() : "",
      };
      validateGeoObservation(input);
      await onSave(input);
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  }

  return <form onSubmit={event => void submit(event)} className="mt-5 space-y-5 text-base text-gray-700">
    <p className="rounded-lg bg-gray-50 p-3">Это журнал реальных ответов AI. Выберите готовый запрос, проверьте его в AI и вставьте ответ сюда. Платные API не используются; автоматически ответы не запрашиваются.</p>
    <fieldset disabled={busy} className="space-y-5">
      <section className="space-y-3" aria-labelledby="geo-prepare-title">
        <h3 id="geo-prepare-title" className="text-lg font-semibold">1. Подготовить запрос</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <label>Сценарий<select className={inputClass} value={scenario} disabled={lock} onChange={event => setScenario(event.target.value)}>{geoScenarios.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          <label>AI-платформа<select className={inputClass} value={engine} disabled={lock} onChange={event => setEngine(event.target.value)}>{geoEngines.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          <label>Рынок в запросе<select className={inputClass} value={market} disabled={lock || scenario === "brand" || scenario === "custom"} onChange={event => setMarket(event.target.value)}>{geoMarkets.map(item => <option key={item.value} value={item.value}>{item.ru}</option>)}</select></label>
          <label>Язык запроса<select className={inputClass} value={language} disabled={lock} onChange={event => setLanguage(event.target.value)}><option value="ru">Русский</option><option value="en">English</option></select></label>
        </div>
        <label className="block">Точный запрос<textarea required minLength={5} maxLength={2000} rows={4} className={inputClass} value={prompt} readOnly={lock} onChange={event => { setScenario("custom"); setCustomPrompt(event.target.value); }} /></label>
        {scenario === "brand" && <p className="text-sm text-gray-500">Запрос с названием бренда проверяет знания об OfferPSP, а не органическую рекомендацию среди конкурентов.</p>}
        <div className="flex flex-wrap gap-2">
          <button type="button" className={buttonClass} disabled={!prompt.trim()} onClick={() => void copyPrompt()}>Скопировать запрос</button>
          <a href={platform.url} target="_blank" rel="noopener noreferrer" className={buttonClass} onClick={() => setStarted(true)}>Открыть {platform.label} ↗</a>
          {lock && <button type="button" className={buttonClass} onClick={() => response.trim() ? setConfirmReset(true) : resetAnswer()}>Новая проверка</button>}
        </div>
        {confirmReset && <div role="group" aria-label="Очистка ответа" className="rounded-lg border border-gray-300 p-3">
          <p>Очистить введённый ответ и подготовить новую проверку?</p>
          <div className="mt-2 flex flex-wrap gap-2"><button type="button" className={buttonClass} onClick={resetAnswer}>Очистить и продолжить</button><button type="button" className={buttonClass} onClick={() => setConfirmReset(false)}>Оставить ответ</button></div>
        </div>}
        {lock && <p className="text-sm text-gray-500">Параметры зафиксированы, чтобы сохранённый ответ относился к исходному запросу. Для смены параметров нажмите «Новая проверка».</p>}
        {message && <p role="status" className="text-sm text-gray-600">{message}</p>}
      </section>
      <section className="space-y-3" aria-labelledby="geo-answer-title">
        <h3 id="geo-answer-title" className="text-lg font-semibold">2. Вставить реальный ответ</h3>
        <label className="block">Полный ответ AI<textarea required minLength={10} maxLength={20000} rows={6} className={inputClass} placeholder="Вставьте весь ответ вместе со ссылками на источники. Без данных клиентов и секретов." value={response} onChange={event => { if (!response && event.target.value && !observedAt) setObservedAt(localGeoDateTime()); setResponse(event.target.value); }} /></label>
        <label className="block max-w-xl">Откуда проводилась проверка *<select required className={inputClass} value={country} onChange={event => setCountry(event.target.value)}><option value="">Выберите страну подключения / VPN</option><option value="CY">Кипр (CY)</option><option value="EE">Эстония (EE)</option><option value="RU">Россия (RU)</option><option value="US">США (US)</option><option value="GB">Великобритания (GB)</option><option value="DE">Германия (DE)</option><option value="KZ">Казахстан (KZ)</option><option value="BR">Бразилия (BR)</option><option value="IN">Индия (IN)</option><option value="VN">Вьетнам (VN)</option><option value="ID">Индонезия (ID)</option><option value="other">Другая страна…</option></select></label>
        {country === "other" && <label className="block max-w-xs">Код страны ISO<input required pattern="[A-Za-z]{2}" maxLength={2} className={inputClass} value={otherCountry} onChange={event => setOtherCountry(event.target.value)} placeholder="Например, FR" /></label>}
        <p className="text-sm text-gray-500">Это страна подключения при проверке, не рынок из запроса. Она не определяется автоматически.</p>
        <p role="status" className="text-sm text-gray-600">HTTPS-ссылок найдено: {extracted.urls.length}. Они будут сохранены вместе с ответом. Отсутствие ссылки не заменяется упоминанием сайта.</p>
        {!!extracted.urls.length && <details><summary className="cursor-pointer text-sm">Посмотреть найденные ссылки</summary><ul className="mt-2 space-y-1 text-sm">{extracted.urls.map(url => <li key={url} className="break-all">{url}</li>)}</ul></details>}
        {!!extracted.rejected.length && <p role="alert" className="text-sm text-error-600">Найдены непубличные ссылки или ссылки с токенами. Удалите их из ответа перед сохранением.</p>}
      </section>
      <details key={answerVersion} className="rounded-lg border border-gray-200 p-4">
        <summary className="cursor-pointer font-medium">Дополнительно: время, модель, доказательство и источники</summary>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label>Когда получен ответ<input type="datetime-local" required className={inputClass} value={observedAt} onChange={event => setObservedAt(event.target.value)} /><span className="mt-1 block text-sm text-gray-500">По умолчанию — время вставки. Если ответ получен раньше, исправьте дату.</span></label>
          <label>Модель, если показана в AI<input name="model" maxLength={100} className={inputClass} placeholder="Можно оставить пустым — неизвестна" /></label>
          <label className="sm:col-span-2">Публичная ссылка на ответ (необязательно)<input name="evidence_url" type="url" pattern="https://.*" className={inputClass} placeholder="Только публичная ссылка, без токенов доступа" /></label>
          <label className="sm:col-span-2">Дополнительные источники из ответа<textarea className={inputClass} rows={3} value={manualCitations} onChange={event => setManualCitations(event.target.value)} placeholder="Если ссылки не скопировались: по одной HTTPS-ссылке на строку. Только источники, которые действительно указал AI." /></label>
        </div>
      </details>
      {error && <p role="alert" className="rounded-lg border border-error-300 p-3 text-error-600">{error}</p>}
      <button disabled={busy} className="rounded-lg bg-brand-500 px-5 py-3 font-medium text-white disabled:opacity-50">{busy ? "Сохраняю…" : "Сохранить реальную проверку"}</button>
    </fieldset>
  </form>;
}
