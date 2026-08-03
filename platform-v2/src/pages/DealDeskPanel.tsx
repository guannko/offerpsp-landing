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

export type DealWorkspace = {
  dossier?: Record<string, unknown>;
  shortlist_items?: DealShortlistItem[];
  reviews?: ProviderReview[];
  introductions?: Introduction[];
};

type Draft = {
  channel: string;
  externalReference: string;
  notes: string;
  requestedInformation: string;
  telegramTitle: string;
  telegramUrl: string;
  zoomUrl: string;
  zoomAt: string;
  resultNotes: string;
};

const emptyDraft = (): Draft => ({
  channel: "telegram",
  externalReference: "",
  notes: "",
  requestedInformation: "",
  telegramTitle: "",
  telegramUrl: "",
  zoomUrl: "",
  zoomAt: "",
  resultNotes: "",
});

const fieldClass = "w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-800 outline-none focus:border-brand-400 dark:border-gray-700 dark:bg-gray-900 dark:text-white";

export default function DealDeskPanel({ workspace, reload }: { workspace: DealWorkspace | null; reload: () => Promise<void> }) {
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const items = (workspace?.shortlist_items || []).filter((item) => item.introduction_requested_at);

  const draftFor = (id: string) => drafts[id] || emptyDraft();
  const patchDraft = (id: string, patch: Partial<Draft>) => setDrafts((current) => ({ ...current, [id]: { ...draftFor(id), ...patch } }));

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

  if (!items.length) return <Panel><EmptyState title="Запросов на знакомство нет" description="Когда клиент выберет оффер и запросит знакомство, здесь появится управляемая цепочка PSP review → Telegram → Zoom → запуск."/></Panel>;

  return <div className="space-y-5">
    <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
      <Summary label="Запрошено" value={items.length}/>
      <Summary label="На PSP review" value={(workspace?.reviews || []).filter((review) => ["pending", "reviewing", "needs_info"].includes(review.status)).length}/>
      <Summary label="Знакомства" value={(workspace?.introductions || []).filter((item) => ["telegram_created", "zoom_scheduled"].includes(item.status)).length}/>
      <Summary label="Результат" value={(workspace?.introductions || []).filter((item) => ["won", "lost"].includes(item.status)).length}/>
    </div>

    {message && <div className={`rounded-xl border px-4 py-3 text-sm ${message.tone === "error" ? "border-error-200 bg-error-50 text-error-700 dark:border-error-500/20 dark:bg-error-500/10 dark:text-error-300" : "border-success-200 bg-success-50 text-success-700 dark:border-success-500/20 dark:bg-success-500/10 dark:text-success-300"}`}>{message.text}</div>}

    {items.map((item) => {
      const reviews = (workspace?.reviews || []).filter((review) => review.shortlist_item_id === item.item_id);
      const review = reviews.sort((a, b) => Number(b.review_round || 0) - Number(a.review_round || 0))[0];
      const introduction = review ? (workspace?.introductions || []).find((candidate) => candidate.review_id === review.review_id) : undefined;
      const draft = draftFor(item.item_id);
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
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">3. Создать общий Telegram‑чат</h3>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"><input className={fieldClass} value={draft.telegramTitle} onChange={(event) => patchDraft(item.item_id, { telegramTitle: event.target.value })} placeholder="Название группы"/><input className={fieldClass} value={draft.telegramUrl} onChange={(event) => patchDraft(item.item_id, { telegramUrl: event.target.value })} placeholder="https://t.me/…"/><button disabled={Boolean(busy) || !draft.telegramUrl.trim()} onClick={() => void execute(actionKey, async () => { const result = await supabase.rpc("record_offerpsp_telegram_introduction", { p_review_id: review.review_id, p_group_title: draft.telegramTitle || null, p_group_url: draft.telegramUrl }); return { error: result.error }; }, "Telegram-знакомство зафиксировано.")} className="rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40">Зафиксировать чат</button></div>
        </section> : null}

        {introduction && ["telegram_created", "zoom_scheduled", "won", "lost"].includes(introduction.status) ? <section className="mt-5 rounded-xl bg-gray-50 p-4 dark:bg-white/[0.03]">
          <div className="flex flex-wrap items-center gap-4 text-sm"><strong className="text-gray-900 dark:text-white">Telegram:</strong>{introduction.telegram_group_url ? <a href={introduction.telegram_group_url} target="_blank" rel="noreferrer" className="font-medium text-brand-500">Открыть общий чат ↗</a> : <span className="text-gray-500">ссылка не указана</span>}{introduction.zoom_url && <><strong className="text-gray-900 dark:text-white">Zoom:</strong><a href={introduction.zoom_url} target="_blank" rel="noreferrer" className="font-medium text-brand-500">Открыть созвон ↗</a></>}</div>
        </section> : null}

        {introduction?.status === "telegram_created" ? <section className="mt-5">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">4. Назначить Zoom</h3>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_240px_auto]"><input className={fieldClass} value={draft.zoomUrl} onChange={(event) => patchDraft(item.item_id, { zoomUrl: event.target.value })} placeholder="https://zoom.us/…"/><input type="datetime-local" className={fieldClass} value={draft.zoomAt} onChange={(event) => patchDraft(item.item_id, { zoomAt: event.target.value })}/><button disabled={Boolean(busy) || !draft.zoomUrl.trim() || !draft.zoomAt} onClick={() => void execute(actionKey, async () => { const result = await supabase.rpc("record_offerpsp_zoom", { p_introduction_id: introduction.introduction_id, p_zoom_url: draft.zoomUrl, p_scheduled_at: new Date(draft.zoomAt).toISOString() }); return { error: result.error }; }, "Zoom назначен и зафиксирован.")} className="rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40">Назначить Zoom</button></div>
        </section> : null}

        {introduction && ["telegram_created", "zoom_scheduled"].includes(introduction.status) ? <section className="mt-5 border-t border-gray-100 pt-5 dark:border-gray-800">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">5. Результат знакомства</h3>
          <textarea className={`${fieldClass} mt-3`} value={draft.resultNotes} onChange={(event) => patchDraft(item.item_id, { resultNotes: event.target.value })} placeholder="Что согласовано, причина выигрыша или отказа"/>
          <div className="mt-3 flex gap-2"><button disabled={Boolean(busy)} onClick={() => void execute(`${actionKey}:won`, async () => { const result = await supabase.rpc("close_offerpsp_introduction", { p_introduction_id: introduction.introduction_id, p_result: "won", p_notes: draft.resultNotes || null }); return { error: result.error }; }, "Сделка отмечена как запущенная.")} className="rounded-lg bg-success-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">Won — запущено</button><button disabled={Boolean(busy)} onClick={() => void execute(`${actionKey}:lost`, async () => { const result = await supabase.rpc("close_offerpsp_introduction", { p_introduction_id: introduction.introduction_id, p_result: "lost", p_notes: draft.resultNotes || null }); return { error: result.error }; }, "Сделка закрыта как lost.")} className="rounded-lg border border-error-200 px-4 py-2.5 text-sm font-semibold text-error-600 disabled:opacity-40">Lost</button></div>
        </section> : null}

        {introduction && ["won", "lost"].includes(introduction.status) ? <div className="mt-5 rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-600 dark:border-gray-800 dark:text-gray-300">Финальный результат: <strong>{introduction.status.toUpperCase()}</strong>{introduction.result_notes ? ` · ${introduction.result_notes}` : ""}</div> : null}
      </Panel>;
    })}
  </div>;
}

function Summary({ label, value }: { label: string; value: number }) {
  return <Panel><span className="text-xs text-gray-400">{label}</span><strong className="mt-2 block text-2xl text-gray-900 dark:text-white">{value}</strong></Panel>;
}
