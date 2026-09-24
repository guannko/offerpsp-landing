import { useState } from "react";
import { EmptyState, Panel, StatusPill } from "../components/control/Ui";
import { supabase } from "../lib/supabase";

export type DealShortlistItem = {
  shortlist_id: string;
  shortlist_status?: string;
  shortlist_version?: number;
  item_id: string;
  option_code?: string;
  rank?: number;
  client_response?: string;
  introduction_requested_at?: string | null;
  provider_id?: string;
  provider_code?: string;
  provider_name?: string;
  route_id?: string;
  route_code?: string;
  route_title?: string;
};

export type ProviderReview = {
  review_id: string;
  shortlist_item_id: string;
  review_round?: number;
  status: string;
  channel?: string | null;
  external_reference?: string | null;
  requested_information?: string | null;
  internal_notes?: string | null;
  submitted_at?: string | null;
  decided_at?: string | null;
  provider_code?: string;
  provider_name?: string;
  route_code?: string;
  route_title?: string;
};

export type Introduction = {
  introduction_id: string;
  review_id: string;
  status: string;
  telegram_group_title?: string | null;
  telegram_group_url?: string | null;
  telegram_created_at?: string | null;
  zoom_url?: string | null;
  zoom_scheduled_at?: string | null;
  result_notes?: string | null;
  closed_at?: string | null;
  provider_code?: string;
  provider_name?: string;
  route_code?: string;
  route_title?: string;
};

export type DealOutcome = {
  id: string;
  introduction_id: string;
  result: "won" | "lost";
  reason_code: string;
  integration_status: string;
  live_at?: string | null;
  expected_monthly_volume?: number | null;
  actual_monthly_volume?: number | null;
  volume_currency?: string | null;
  quality_score?: number | null;
  follow_up_at?: string | null;
  notes?: string | null;
  updated_at?: string | null;
  provider_code?: string;
  provider_name?: string;
  route_code?: string;
  route_title?: string;
};

export type DealHistoryEntry = {
  id: string;
  activity_type: string;
  title: string;
  body?: string | null;
  created_at: string;
};

type IntroductionPack = {
  language: "ru" | "en";
  telegram: { group_title: string; message: string };
  zoom: { meeting_title: string; agenda: string };
  checklist: string[];
};

export type DealWorkspace = {
  dossier?: Record<string, unknown>;
  shortlist_items?: DealShortlistItem[];
  reviews?: ProviderReview[];
  introductions?: Introduction[];
  outcomes?: DealOutcome[];
  history?: DealHistoryEntry[];
  metrics?: Record<string, number | null>;
};

type Draft = {
  channel: string;
  externalReference: string;
  notes: string;
  requestedInformation: string;
  telegramTitle: string;
  telegramUrl: string;
  preparationLanguage: "ru" | "en";
  zoomUrl: string;
  zoomAt: string;
  result: "won" | "lost";
  reasonCode: string;
  integrationStatus: string;
  liveAt: string;
  actualMonthlyVolume: string;
  volumeCurrency: string;
  qualityScore: string;
  followUpAt: string;
  resultNotes: string;
};

const emptyDraft = (): Draft => ({
  channel: "telegram",
  externalReference: "",
  notes: "",
  requestedInformation: "",
  telegramTitle: "",
  telegramUrl: "",
  preparationLanguage: "ru",
  zoomUrl: "",
  zoomAt: "",
  result: "won",
  reasonCode: "launched",
  integrationStatus: "technical_setup",
  liveAt: "",
  actualMonthlyVolume: "",
  volumeCurrency: "EUR",
  qualityScore: "",
  followUpAt: "",
  resultNotes: "",
});

const dateTimeLocal = (value?: string | null) => value ? new Date(value).toISOString().slice(0, 16) : "";

const draftFromOutcome = (outcome?: DealOutcome): Draft => outcome ? {
  ...emptyDraft(),
  result: outcome.result,
  reasonCode: outcome.reason_code,
  integrationStatus: outcome.integration_status,
  liveAt: dateTimeLocal(outcome.live_at),
  actualMonthlyVolume: outcome.actual_monthly_volume?.toString() || "",
  volumeCurrency: outcome.volume_currency || "EUR",
  qualityScore: outcome.quality_score?.toString() || "",
  followUpAt: dateTimeLocal(outcome.follow_up_at),
  resultNotes: outcome.notes || "",
} : emptyDraft();

const fieldClass = "w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-800 outline-none focus:border-brand-400 dark:border-gray-700 dark:bg-gray-900 dark:text-white";

export default function DealDeskPanel({ workspace, reload }: { workspace: DealWorkspace | null; reload: () => Promise<void> }) {
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [packs, setPacks] = useState<Record<string, IntroductionPack>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const items = (workspace?.shortlist_items || []).filter((item) => item.introduction_requested_at);

  const draftFor = (id: string, outcome?: DealOutcome) => drafts[id] || draftFromOutcome(outcome);
  const patchDraft = (id: string, patch: Partial<Draft>, base?: Draft) => setDrafts((current) => ({ ...current, [id]: { ...(current[id] || base || emptyDraft()), ...patch } }));

  async function execute(name: string, action: () => Promise<{ error: { message: string } | null }>, success: string) {
    setBusy(name);
    setMessage(null);
    const result = await action();
    if (result.error) {
      setMessage({ tone: "error", text: result.error.message });
      setBusy(null);
      return;
    }
    await reload();
    setMessage({ tone: "success", text: success });
    setBusy(null);
  }

  async function prepareIntroduction(itemId: string, reviewId: string, language: "ru" | "en", base: Draft) {
    setBusy(`${itemId}:prepare`);
    setMessage(null);
    const result = await supabase.rpc("prepare_offerpsp_introduction", { p_review_id: reviewId, p_language: language });
    if (result.error) {
      setMessage({ tone: "error", text: result.error.message });
      setBusy(null);
      return;
    }
    const pack = result.data as IntroductionPack;
    setPacks((current) => ({ ...current, [itemId]: pack }));
    patchDraft(itemId, { telegramTitle: pack.telegram.group_title }, base);
    setMessage({ tone: "success", text: "Пакет знакомства подготовлен. Создайте группу, добавьте участников и вставьте готовый текст." });
    setBusy(null);
  }

  async function copyText(value: string, success: string) {
    try {
      await navigator.clipboard.writeText(value);
      setMessage({ tone: "success", text: success });
    } catch {
      setMessage({ tone: "error", text: "Не удалось скопировать автоматически. Выделите текст вручную." });
    }
  }

  if (!items.length) return <Panel><EmptyState title="Запросов на знакомство нет" description="Когда клиент выберет оффер и запросит знакомство, здесь появится управляемая цепочка PSP review → Telegram → Zoom → запуск."/></Panel>;

  return <div className="space-y-5">
    <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
      <Summary label="Запрошено" value={items.length}/>
      <Summary label="На PSP review" value={(workspace?.reviews || []).filter((review) => ["pending", "reviewing", "needs_info"].includes(review.status)).length}/>
      <Summary label="Знакомства" value={(workspace?.introductions || []).filter((item) => ["telegram_created", "zoom_scheduled"].includes(item.status)).length}/>
      <Summary label="Результат" value={(workspace?.introductions || []).filter((item) => ["won", "lost"].includes(item.status)).length}/>
    </div>

    {workspace?.metrics && <Panel>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <Metric label="До PSP review" value={workspace.metrics.hours_to_psp_review} unit="ч"/>
        <Metric label="Решение PSP" value={workspace.metrics.hours_to_psp_decision} unit="ч"/>
        <Metric label="До Telegram" value={workspace.metrics.hours_to_telegram} unit="ч"/>
        <Metric label="До Zoom" value={workspace.metrics.hours_to_zoom} unit="ч"/>
        <Metric label="До результата" value={workspace.metrics.days_to_result} unit="дн"/>
      </div>
    </Panel>}

    {message && <div className={`rounded-xl border px-4 py-3 text-sm ${message.tone === "error" ? "border-error-200 bg-error-50 text-error-700 dark:border-error-500/20 dark:bg-error-500/10 dark:text-error-300" : "border-success-200 bg-success-50 text-success-700 dark:border-success-500/20 dark:bg-success-500/10 dark:text-success-300"}`}>{message.text}</div>}

    {items.map((item) => {
      const reviews = (workspace?.reviews || []).filter((review) => review.shortlist_item_id === item.item_id);
      const review = reviews.sort((a, b) => Number(b.review_round || 0) - Number(a.review_round || 0))[0];
      const introduction = review ? (workspace?.introductions || []).find((candidate) => candidate.review_id === review.review_id) : undefined;
      const outcome = introduction ? (workspace?.outcomes || []).find((candidate) => candidate.introduction_id === introduction.introduction_id) : undefined;
      const draft = draftFor(item.item_id, outcome);
      const pack = packs[item.item_id];
      const actionKey = `${item.item_id}:${review?.status || "new"}:${introduction?.status || "none"}`;

      return <Panel key={item.item_id}>
        <div className="flex flex-col gap-4 border-b border-gray-100 pb-5 sm:flex-row sm:items-start sm:justify-between dark:border-gray-800">
          <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-500">{item.provider_code || "PSP"} · {item.route_code || item.option_code}</p><h2 className="mt-2 text-xl font-semibold text-gray-900 dark:text-white">{item.provider_name || "PSP"} — {item.route_title || "Маршрут"}</h2><p className="mt-1 text-sm text-gray-500">Shortlist v{item.shortlist_version || "—"} · клиент запросил знакомство</p></div>
          <StatusPill status={introduction?.status || review?.status || "requested"}/>
        </div>

        {!review || ["declined"].includes(review.status) ? <section className="mt-5">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">1. Передать досье PSP</h3>
          <p className="mt-1 text-sm text-gray-500">Система проверит обязательные данные мерча до отправки.</p>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-[180px_minmax(0,1fr)_auto]">
            <select className={fieldClass} value={draft.channel} onChange={(event) => patchDraft(item.item_id, { channel: event.target.value })}><option value="telegram">Telegram</option><option value="email">Email</option><option value="other">Другое</option></select>
            <input className={fieldClass} value={draft.externalReference} onChange={(event) => patchDraft(item.item_id, { externalReference: event.target.value })} placeholder="Ссылка на чат / письмо / внешний ID"/>
            <button disabled={Boolean(busy)} onClick={() => void execute(actionKey, async () => { const result = await supabase.rpc("submit_offerpsp_dossier_for_review", { p_shortlist_item_id: item.item_id, p_channel: draft.channel, p_external_reference: draft.externalReference || null }); return { error: result.error }; }, "Досье передано PSP на рассмотрение.")} className="rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40">{busy === actionKey ? "Отправляю…" : review ? "Новый раунд review" : "Отправить PSP"}</button>
          </div>
        </section> : null}

        {review && ["pending", "reviewing", "needs_info"].includes(review.status) ? <section className="mt-5">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">2. Решение PSP</h3>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2"><textarea className={fieldClass} value={draft.notes} onChange={(event) => patchDraft(item.item_id, { notes: event.target.value })} placeholder="Внутренний комментарий PSP"/><textarea className={fieldClass} value={draft.requestedInformation} onChange={(event) => patchDraft(item.item_id, { requestedInformation: event.target.value })} placeholder="Каких данных не хватает"/></div>
          <div className="mt-3 flex flex-wrap gap-2">
            {[{ decision: "accepted", label: "PSP принял", className: "bg-success-600 text-white" }, { decision: "needs_info", label: "Нужны данные", className: "bg-warning-500 text-white" }, { decision: "declined", label: "PSP отказал", className: "border border-error-200 text-error-600" }].map((action) => <button key={action.decision} disabled={Boolean(busy) || (action.decision === "needs_info" && !draft.requestedInformation.trim())} onClick={() => void execute(`${actionKey}:${action.decision}`, async () => { const result = await supabase.rpc("record_offerpsp_provider_review", { p_review_id: review.review_id, p_decision: action.decision, p_notes: draft.notes || null, p_requested_information: action.decision === "needs_info" ? draft.requestedInformation : null }); return { error: result.error }; }, `Решение PSP сохранено: ${action.label}.`)} className={`rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-40 ${action.className}`}>{action.label}</button>)}
          </div>
        </section> : null}

        {review?.status === "accepted" && !introduction ? <section className="mt-5">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">3. Подготовить и создать общий Telegram‑чат</h3>
          <div className="mt-4 flex flex-wrap items-center gap-2"><select className={`${fieldClass} w-36`} value={draft.preparationLanguage} onChange={(event) => patchDraft(item.item_id, { preparationLanguage: event.target.value as "ru" | "en" }, draft)}><option value="ru">Русский</option><option value="en">English</option></select><button disabled={Boolean(busy)} onClick={() => void prepareIntroduction(item.item_id, review.review_id, draft.preparationLanguage, draft)} className="rounded-lg border border-brand-200 px-4 py-2.5 text-sm font-semibold text-brand-600 disabled:opacity-40 dark:border-brand-500/30 dark:text-brand-300">{busy === `${item.item_id}:prepare` ? "Готовлю…" : pack ? "Обновить пакет" : "Подготовить знакомство"}</button></div>
          {pack && <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800"><div className="flex items-center justify-between"><strong className="text-sm text-gray-900 dark:text-white">Telegram</strong><button onClick={() => void copyText(`${pack.telegram.group_title}\n\n${pack.telegram.message}`, "Название и текст Telegram скопированы.")} className="text-xs font-semibold text-brand-500">Скопировать всё</button></div><p className="mt-3 text-sm font-semibold text-gray-800 dark:text-gray-100">{pack.telegram.group_title}</p><pre className="mt-3 whitespace-pre-wrap font-sans text-sm leading-6 text-gray-600 dark:text-gray-300">{pack.telegram.message}</pre></div>
            <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800"><div className="flex items-center justify-between"><strong className="text-sm text-gray-900 dark:text-white">Zoom</strong><button onClick={() => void copyText(`${pack.zoom.meeting_title}\n\n${pack.zoom.agenda}`, "Название и повестка Zoom скопированы.")} className="text-xs font-semibold text-brand-500">Скопировать всё</button></div><p className="mt-3 text-sm font-semibold text-gray-800 dark:text-gray-100">{pack.zoom.meeting_title}</p><pre className="mt-3 whitespace-pre-wrap font-sans text-sm leading-6 text-gray-600 dark:text-gray-300">{pack.zoom.agenda}</pre><ul className="mt-4 space-y-1 text-xs text-gray-500">{pack.checklist.map((step) => <li key={step}>✓ {step}</li>)}</ul></div>
          </div>}
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"><input className={fieldClass} value={draft.telegramTitle} onChange={(event) => patchDraft(item.item_id, { telegramTitle: event.target.value }, draft)} placeholder="Название группы"/><input className={fieldClass} value={draft.telegramUrl} onChange={(event) => patchDraft(item.item_id, { telegramUrl: event.target.value }, draft)} placeholder="https://t.me/…"/><button disabled={Boolean(busy) || !draft.telegramUrl.trim()} onClick={() => void execute(actionKey, async () => { const result = await supabase.rpc("record_offerpsp_telegram_introduction", { p_review_id: review.review_id, p_group_title: draft.telegramTitle || null, p_group_url: draft.telegramUrl }); return { error: result.error }; }, "Telegram-знакомство зафиксировано.")} className="rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40">Зафиксировать чат</button></div>
        </section> : null}

        {introduction && ["telegram_created", "zoom_scheduled", "won", "lost"].includes(introduction.status) ? <section className="mt-5 rounded-xl bg-gray-50 p-4 dark:bg-white/[0.03]">
          <div className="flex flex-wrap items-center gap-4 text-sm"><strong className="text-gray-900 dark:text-white">Telegram:</strong>{introduction.telegram_group_url ? <a href={introduction.telegram_group_url} target="_blank" rel="noreferrer" className="font-medium text-brand-500">Открыть общий чат ↗</a> : <span className="text-gray-500">ссылка не указана</span>}{introduction.zoom_url && <><strong className="text-gray-900 dark:text-white">Zoom:</strong><a href={introduction.zoom_url} target="_blank" rel="noreferrer" className="font-medium text-brand-500">Открыть созвон ↗</a></>}</div>
        </section> : null}

        {introduction?.status === "telegram_created" ? <section className="mt-5">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">4. Назначить Zoom</h3>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_240px_auto]"><input className={fieldClass} value={draft.zoomUrl} onChange={(event) => patchDraft(item.item_id, { zoomUrl: event.target.value })} placeholder="https://zoom.us/…"/><input type="datetime-local" className={fieldClass} value={draft.zoomAt} onChange={(event) => patchDraft(item.item_id, { zoomAt: event.target.value })}/><button disabled={Boolean(busy) || !draft.zoomUrl.trim() || !draft.zoomAt} onClick={() => void execute(actionKey, async () => { const result = await supabase.rpc("record_offerpsp_zoom", { p_introduction_id: introduction.introduction_id, p_zoom_url: draft.zoomUrl, p_scheduled_at: new Date(draft.zoomAt).toISOString() }); return { error: result.error }; }, "Zoom назначен и зафиксирован.")} className="rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40">Назначить Zoom</button></div>
        </section> : null}

        {introduction && ["telegram_created", "zoom_scheduled", "won", "lost"].includes(introduction.status) ? <section className="mt-5 border-t border-gray-100 pt-5 dark:border-gray-800">
          <div className="flex items-start justify-between gap-3"><div><h3 className="text-sm font-semibold text-gray-900 dark:text-white">5. Результат и качество запуска</h3><p className="mt-1 text-sm text-gray-500">Фиксируем не только won/lost, но и настоящую причину, стадию интеграции и качество сделки.</p></div>{outcome && <StatusPill status={outcome.result}/>}</div>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
            <select className={fieldClass} value={draft.result} onChange={(event) => { const result = event.target.value as "won" | "lost"; patchDraft(item.item_id, { result, reasonCode: result === "won" ? "launched" : "other", integrationStatus: result === "won" ? "technical_setup" : "not_started" }, draft); }}><option value="won">Won — сотрудничество начато</option><option value="lost">Lost — запуск не состоялся</option></select>
            <select className={fieldClass} value={draft.reasonCode} onChange={(event) => patchDraft(item.item_id, { reasonCode: event.target.value }, draft)}>{draft.result === "won" ? <option value="launched">Запущена обработка</option> : <><option value="commercial_terms">Не сошлись по условиям</option><option value="compliance">Compliance / лицензия</option><option value="technical">Техническая причина</option><option value="no_response">Нет ответа</option><option value="timing">Не сейчас</option><option value="competitor">Выбран конкурент</option><option value="merchant_cancelled">Мерч отказался</option><option value="provider_capacity">PSP не готов принять</option><option value="other">Другая причина</option></>}</select>
            <select className={fieldClass} value={draft.integrationStatus} onChange={(event) => patchDraft(item.item_id, { integrationStatus: event.target.value }, draft)}><option value="not_started" disabled={draft.result === "won"}>Не начато</option><option value="technical_setup">Техническая интеграция</option><option value="testing">Тестирование</option><option value="live">Live</option><option value="stopped">Остановлено</option></select>
            <input type="datetime-local" className={fieldClass} value={draft.liveAt} onChange={(event) => patchDraft(item.item_id, { liveAt: event.target.value }, draft)} aria-label="Дата запуска" title="Дата запуска"/>
            <div className="grid grid-cols-[minmax(0,1fr)_90px] gap-2"><input type="number" min="0" className={fieldClass} value={draft.actualMonthlyVolume} onChange={(event) => patchDraft(item.item_id, { actualMonthlyVolume: event.target.value }, draft)} placeholder="Факт. оборот / мес."/><input className={fieldClass} value={draft.volumeCurrency} onChange={(event) => patchDraft(item.item_id, { volumeCurrency: event.target.value.toUpperCase() }, draft)} placeholder="EUR" maxLength={8}/></div>
            <select className={fieldClass} value={draft.qualityScore} onChange={(event) => patchDraft(item.item_id, { qualityScore: event.target.value }, draft)}><option value="">Качество не оценено</option><option value="5">5 — отличный запуск</option><option value="4">4 — хороший</option><option value="3">3 — средний</option><option value="2">2 — слабый</option><option value="1">1 — проблемный</option></select>
            <input type="datetime-local" className={fieldClass} value={draft.followUpAt} onChange={(event) => patchDraft(item.item_id, { followUpAt: event.target.value }, draft)} aria-label="Дата следующего контроля" title="Следующий контроль"/>
            <textarea className={`${fieldClass} md:col-span-2`} value={draft.resultNotes} onChange={(event) => patchDraft(item.item_id, { resultNotes: event.target.value }, draft)} placeholder="Что согласовано, причины результата, риски и следующий шаг"/>
          </div>
          <button disabled={Boolean(busy) || (draft.result === "won" && draft.integrationStatus === "not_started")} onClick={() => void execute(`${actionKey}:outcome`, async () => { const result = await supabase.rpc("record_offerpsp_deal_outcome", { p_introduction_id: introduction.introduction_id, p_payload: { result: draft.result, reason_code: draft.reasonCode, integration_status: draft.integrationStatus, live_at: draft.liveAt ? new Date(draft.liveAt).toISOString() : null, actual_monthly_volume: draft.actualMonthlyVolume || null, volume_currency: draft.actualMonthlyVolume ? draft.volumeCurrency : null, quality_score: draft.qualityScore || null, follow_up_at: draft.followUpAt ? new Date(draft.followUpAt).toISOString() : null, notes: draft.resultNotes || null } }); return { error: result.error }; }, outcome ? "Результат сделки обновлён." : "Результат сделки сохранён.")} className="mt-3 rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40">{busy === `${actionKey}:outcome` ? "Сохраняю…" : outcome ? "Обновить результат" : "Зафиксировать результат"}</button>
        </section> : null}
      </Panel>;
    })}

    {Boolean(workspace?.history?.length) && <Panel>
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Хронология сделки</h2>
      <div className="mt-4 divide-y divide-gray-100 dark:divide-gray-800">{workspace!.history!.slice(0, 20).map((entry) => <div key={entry.id} className="grid gap-1 py-3 sm:grid-cols-[170px_minmax(0,1fr)]"><time className="text-xs text-gray-400">{new Date(entry.created_at).toLocaleString("ru-RU")}</time><div><p className="text-sm font-medium text-gray-800 dark:text-gray-100">{entry.title}</p>{entry.body && <p className="mt-1 text-sm text-gray-500">{entry.body}</p>}</div></div>)}</div>
    </Panel>}
  </div>;
}

function Summary({ label, value }: { label: string; value: number }) {
  return <Panel><span className="text-xs text-gray-400">{label}</span><strong className="mt-2 block text-2xl text-gray-900 dark:text-white">{value}</strong></Panel>;
}

function Metric({ label, value, unit }: { label: string; value?: number | null; unit: string }) {
  return <div><span className="text-xs text-gray-400">{label}</span><strong className="mt-1 block text-lg text-gray-900 dark:text-white">{value == null ? "—" : `${value} ${unit}`}</strong></div>;
}
