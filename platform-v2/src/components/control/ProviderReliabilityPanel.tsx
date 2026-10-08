import { useState } from "react";
import { supabase } from "../../lib/supabase";
import { blankReliabilityPoints, reliabilityCriteria, reliabilityCoverage, reliabilityDecisions, reliabilityDisclaimer, reliabilityScore, resolveProviderReliability, type ProviderReliability, type ReliabilityPoints } from "../../lib/providerReliability";

import { useProviderReliability } from "../../lib/useProviderReliability";

export function ReliabilityBadge({ assessment }: { assessment?: ProviderReliability }) {
  return <p className="mt-3 text-sm font-semibold text-gray-700" title={reliabilityDisclaimer}>{assessment ? `Надёжность: ${assessment.score}% · ${assessment.category === "review_later" ? "Разобрать потом" : reliabilityDecisions[assessment.decision]}` : "Надёжность: не оценена"}</p>;
}

export default function ProviderReliabilityPanel({ entityType, entityId, researchId, onSaved }: { entityType: ProviderReliability["entity_type"]; entityId: string; researchId?: number | null; onSaved?: () => Promise<void> }) {
  const state = useProviderReliability();
  const direct = state.rows.find((row) => row.entity_type === entityType && row.entity_id === entityId);
  const current = entityType === "provider" ? resolveProviderReliability(state.rows, entityId, researchId) : direct;
  const [editing, setEditing] = useState(false);
  const [points, setPoints] = useState<ReliabilityPoints>(blankReliabilityPoints);
  const [category, setCategory] = useState<ProviderReliability["category"]>("working");
  const [decision, setDecision] = useState<ProviderReliability["decision"]>("pending");
  const [confidence, setConfidence] = useState<ProviderReliability["confidence"]>("low");
  const [scope, setScope] = useState("");
  const [reason, setReason] = useState("");
  const [nextStep, setNextStep] = useState("");
  const [sources, setSources] = useState("");
  const [expectedUpdatedAt, setExpectedUpdatedAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const begin = () => {
    setPoints(current?.points || { ...blankReliabilityPoints }); setCategory(current?.category || "working");
    setDecision(current?.decision || "pending"); setConfidence(current?.confidence || "low");
    setScope(current?.scope || ""); setReason(current?.reason || ""); setNextStep(current?.next_step || "");
    setSources(current?.sources.join("\n") || ""); setExpectedUpdatedAt(direct?.updated_at || null);
    setMessage(null); setEditing(true);
  };
  async function save() {
    setMessage(null);
    try {
      reliabilityScore(points);
      if (reliabilityCoverage(points) === 0) throw new Error("Оцените хотя бы один критерий. Отсутствие проверки — не 0% надёжности.");
      const urls = sources.split(/\r?\n/).map((url) => url.trim()).filter(Boolean);
      if (!scope.trim() || !reason.trim() || !nextStep.trim() || !urls.length) throw new Error("Укажите направление, основание, следующий шаг и хотя бы один источник.");
      if (urls.some((url) => { try { const parsed = new URL(url); return parsed.protocol !== "https:" || Boolean(parsed.username || parsed.password); } catch { return true; } })) throw new Error("Источники: публичные HTTPS-ссылки без credentials.");
      setBusy(true);
      const result = await supabase.rpc("save_offerpsp_provider_reliability", { p_entity_type: entityType, p_entity_id: entityId, p_expected_updated_at: expectedUpdatedAt, p_payload: { category, decision, confidence, points, scope, reason, next_step: nextStep, sources: urls } });
      if (result.error) throw new Error(result.error.message);
      await state.refresh(); if (onSaved) await onSaved(); setEditing(false);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Не удалось сохранить оценку."); }
    finally { setBusy(false); }
  }
  const field = "w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2 text-sm text-gray-800";
  return <section className="rounded-xl border border-gray-200 p-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-lg font-semibold text-gray-900">Надёжность PSP</h3>{!editing && <button disabled={state.loading || Boolean(state.error)} onClick={begin} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">{current ? "Изменить оценку" : "Оценить"}</button>}</div>
    <p className="mt-2 text-sm text-gray-500">{reliabilityDisclaimer}</p>
    {state.loading ? <p className="mt-3 text-sm">Загружаю оценку…</p> : state.error ? <div role="alert" className="mt-3 text-sm text-error-600">Оценки не загружены: {state.error} <button className="underline" onClick={() => void state.refresh()}>Повторить</button></div> : !editing ? <>
      <ReliabilityBadge assessment={current}/>
      {current && <div className="mt-3 space-y-2 text-sm text-gray-600">{!direct && <p>Оценка связанного исследования. Изменение сохранит отдельную оценку партнёра.</p>}<p>{reliabilityDecisions[current.decision]} · {current.scope}</p><p>{current.reason}</p><p>Следующий шаг: {current.next_step}</p><p>Оценены критерии с весом {reliabilityCoverage(current.points)} из 100; это не полнота аудита. Уверенность: {({ low: "низкая", medium: "средняя", high: "высокая" })[current.confidence]} · {new Date(current.updated_at).toLocaleDateString("ru-RU")}</p><details><summary className="cursor-pointer">Критерии и источники</summary><ul className="mt-2 space-y-1">{reliabilityCriteria.map((item) => <li key={item.key}>{item.label}: {current.points[item.key] ?? "не проверено"}{current.points[item.key] === null ? "" : ` / ${item.maximum}`}</li>)}</ul>{current.sources.map((url) => <a key={url} className="mt-1 block break-all text-brand-500 underline" href={url} target="_blank" rel="noreferrer">{url}</a>)}</details></div>}
    </> : <div className="mt-4 space-y-3">
      <label className="block text-sm">Категория<select className={field} value={category} onChange={(e) => setCategory(e.target.value as typeof category)}><option value="working">Рабочий реестр</option><option value="review_later">Разобрать потом</option></select></label>
      <label className="block text-sm">Результат проверки<select className={field} value={decision} onChange={(e) => setDecision(e.target.value as typeof decision)}>{Object.entries(reliabilityDecisions).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="block text-sm">Направление / границы проверки<input className={field} value={scope} onChange={(e) => setScope(e.target.value)}/></label>
      <div className="grid gap-3 sm:grid-cols-2">{reliabilityCriteria.map((criterion) => <label key={criterion.key} className="block text-sm">{criterion.label} · до {criterion.maximum}<input type="number" min={0} max={criterion.maximum} step={1} placeholder="Не проверено" className={field} value={points[criterion.key] ?? ""} onChange={(e) => setPoints((value) => ({ ...value, [criterion.key]: e.target.value === "" ? null : Number(e.target.value) }))}/></label>)}</div>
      <label className="block text-sm">Уверенность в оценке<select className={field} value={confidence} onChange={(e) => setConfidence(e.target.value as typeof confidence)}><option value="low">Низкая</option><option value="medium">Средняя</option><option value="high">Высокая</option></select></label>
      <label className="block text-sm">Основание и ограничения<textarea className={field} value={reason} onChange={(e) => setReason(e.target.value)}/></label>
      <label className="block text-sm">Что нужно для повторного рассмотрения<textarea className={field} value={nextStep} onChange={(e) => setNextStep(e.target.value)}/></label>
      <label className="block text-sm">Источники · одна HTTPS-ссылка на строку<textarea className={field} value={sources} onChange={(e) => setSources(e.target.value)}/></label>
      {message && <p role="alert" className="text-sm text-error-600">{message}</p>}
      <div className="flex gap-2"><button disabled={busy} onClick={() => void save()} className="rounded-lg bg-brand-500 px-4 py-2 text-sm text-white">{busy ? "Сохраняю…" : "Сохранить оценку"}</button><button disabled={busy} onClick={() => setEditing(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm">Отмена</button></div>
    </div>}
  </section>;
}
