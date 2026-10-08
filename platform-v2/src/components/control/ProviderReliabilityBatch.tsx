import { useState } from "react";
import { supabase } from "../../lib/supabase";
import { reliabilityDecisions, reliabilityDisclaimer } from "../../lib/providerReliability";
import type { ProviderReliability } from "../../lib/providerReliability";

type BatchItem = { name: string; website: string; entity_type: ProviderReliability["entity_type"]; entity_id: string | null; payload: Omit<ProviderReliability, "entity_type" | "entity_id" | "score" | "methodology" | "updated_at"> };
type Preview = { status: string; confirmation_token: string; expires_at: string; preview: Array<BatchItem & { create_research: boolean; score: number }> };
export default function ProviderReliabilityBatch({ onSaved }: { onSaved: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<BatchItem[] | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [executed, setExecuted] = useState(false);
  async function read(file?: File) {
    setPreview(null); setItems(null); setExecuted(false); setMessage("");
    if (!file) return;
    try {
      if (file.size > 500_000) throw new Error("Файл слишком большой: до 500 КБ.");
      const parsed = JSON.parse(await file.text());
      const next = Array.isArray(parsed) ? parsed : parsed.items;
      if (!Array.isArray(next) || !next.length || next.length > 50) throw new Error("Нужен JSON с 1–50 оценками PSP.");
      setItems(next);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Не удалось прочитать JSON."); }
  }
  async function prepare() {
    setBusy(true); setMessage(""); setPreview(null); setExecuted(false);
    try {
      const result = await supabase.rpc("prepare_offerpsp_provider_reliability_batch", { p_items: items });
      if (result.error) throw new Error(result.error.message);
      if (result.data?.status !== "pending" || !result.data?.confirmation_token) throw new Error("Сервер не подготовил preview.");
      setPreview(result.data);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Preview недоступен."); }
    finally { setBusy(false); }
  }
  async function confirm() {
    if (!preview) return;
    setBusy(true); setMessage("");
    try {
      const result = await supabase.rpc("confirm_offerpsp_provider_reliability_batch", { p_confirmation_token: preview.confirmation_token });
      if (result.error) throw new Error(result.error.message);
      if (!["executed", "already_executed"].includes(result.data?.status)) throw new Error("Preview истёк или недоступен. Подготовьте новый.");
      // Mark the server receipt before a refresh: a failed refresh must not suggest re-execution.
      setExecuted(true); setItems(null);
      await onSaved();
      setMessage("Сервер подтвердил сохранение оценок. История переписки не изменена.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Не удалось подтвердить пакет."); }
    finally { setBusy(false); }
  }
  return <section className="mb-5 rounded-xl border border-gray-200 p-4">
    <button className="text-sm font-semibold underline" onClick={() => setOpen(!open)}>{open ? "Свернуть пакет оценок" : "Загрузить пакет аудита PSP"}</button>
    {open && <div className="mt-3 space-y-3 text-sm"><p>{reliabilityDisclaimer}</p><p>JSON → серверный preview → подтверждение. Создание отсутствующих карточек будет явно показано. Контакты, офферы и matching не изменяются.</p><label className="block">Пакет оценок (JSON)<input className="mt-2 block" type="file" accept="application/json,.json" disabled={busy} onChange={(e) => void read(e.target.files?.[0])}/></label>
      <button className="rounded-lg border px-3 py-2 disabled:opacity-40" disabled={busy || !items || executed} onClick={() => void prepare()}>{busy ? "Обрабатываю…" : "Подготовить preview"}</button>
      {preview && <div className="space-y-3"><p>Preview действует до {new Date(preview.expires_at).toLocaleString("ru-RU")}. Изменившиеся карточки не будут перезаписаны.</p>{preview.preview.map((item) => <details key={`${item.entity_type}:${item.entity_id || item.website}`} className="rounded-lg border p-3"><summary>{item.name} · {item.score}% · {item.payload.category === "review_later" ? "Разобрать потом" : "Рабочий реестр"} · {item.create_research ? "создать карточку исследования" : "изменить только оценку"}</summary><p className="mt-2">{item.website} · {reliabilityDecisions[item.payload.decision]}</p><p>{item.payload.scope}</p><p>{item.payload.reason}</p><p>Следующий шаг: {item.payload.next_step}</p><p>Критерии: {JSON.stringify(item.payload.points)}</p>{item.payload.sources.map((url) => <a className="block break-all underline" key={url} href={url} target="_blank" rel="noreferrer">{url}</a>)}</details>)}<button className="rounded-lg bg-brand-500 px-4 py-2 text-white disabled:opacity-40" disabled={busy || executed} onClick={() => void confirm()}>{executed ? "Пакет выполнен" : "Подтвердить именно этот пакет"}</button></div>}
      {message && <p role="status">{message}</p>}
    </div>}
  </section>;
}
