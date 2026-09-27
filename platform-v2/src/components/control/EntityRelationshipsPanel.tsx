import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { EmptyState, Panel, StatusPill } from "./Ui";

type EntityType = "organization" | "provider";
type EntitySummary = {
  entity_type: EntityType;
  id: string;
  internal_code?: string | null;
  organization_type?: "merchant" | "agent" | null;
  name: string;
  legal_name?: string | null;
  website?: string | null;
  registration_number?: string | null;
  status?: string | null;
  merged_into_id?: string | null;
  merged_at?: string | null;
};
type Relationship = {
  id: string;
  relationship_type: string;
  canonical_relationship_type: string;
  status: "proposed" | "verified" | "disputed";
  evidence_note?: string | null;
  evidence_url?: string | null;
  updated_at: string;
  other_entity: EntitySummary;
};
type DuplicateCandidate = EntitySummary & { signals: string[]; score: number };
type Workspace = {
  entity: EntitySummary;
  requested_entity?: EntitySummary;
  canonical_entity?: EntitySummary;
  relationships: Relationship[];
  duplicate_candidates: DuplicateCandidate[];
  selectable_targets: EntitySummary[];
  merged_sources: EntitySummary[];
  active_merges: ActiveMerge[];
};
type ActiveMerge = {
  id: string;
  source_entity_id: string;
  target_entity_id: string;
  reason: string;
  status: "executed";
  executed_at: string;
  observation_until: string;
  rollback_available: boolean;
};
type MergeReference = { schema: string; table: string; column: string; source_rows: number; policy?: string };
type MergeConflict = { field: string; source_value: unknown; target_value: unknown };
type MergePreview = {
  mode: "reversible_logical_merge";
  source: EntitySummary;
  target: EntitySummary;
  field_conflicts: MergeConflict[];
  dependent_references: MergeReference[];
  source_alias_count: number;
  source_relationship_count: number;
  exact_duplicate: boolean;
  merge_available: boolean;
  blocking_reason?: string | null;
  observation_hours: number;
  data_policy: string;
};
type PreparedMerge = {
  merge_id: string;
  confirmation_token: string;
  token_expires_at: string;
  preview: MergePreview;
};

const relationshipLabels: Record<string, string> = {
  parent_of: "Головная компания для",
  subsidiary_of: "Дочерняя компания для",
  trading_brand_of: "Торговый бренд компании",
  owns_brand: "Владеет брендом",
  same_group: "Входит в одну группу",
  operated_by: "Управляется компанией",
  operates: "Управляет компанией",
  processing_partner: "Платёжный партнёр",
};
const signalLabels: Record<string, string> = {
  registration_number: "регистрационный номер",
  domain: "домен",
  legal_name: "юридическое имя",
  name: "основное имя",
  alias: "alias",
};
const fieldLabels: Record<string, string> = {
  name: "Название",
  legal_name: "Юридическое имя",
  website: "Сайт",
  registration_number: "Регистрационный номер",
  status: "Статус",
};
const fieldClass = "h-11 w-full rounded-xl border border-gray-200 bg-white px-3.5 text-sm text-gray-900 outline-none focus:border-brand-400 dark:border-gray-700 dark:bg-gray-900 dark:text-white";
const areaClass = "min-h-24 w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-900 outline-none focus:border-brand-400 dark:border-gray-700 dark:bg-gray-900 dark:text-white";

function entityLabel(entity: EntitySummary) {
  return `${entity.name}${entity.legal_name && entity.legal_name !== entity.name ? ` · ${entity.legal_name}` : ""}`;
}

function formatValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  return typeof value === "string" ? value : JSON.stringify(value);
}

export default function EntityRelationshipsPanel({
  entityType,
  entityId,
}: {
  entityType: EntityType;
  entityId: string;
}) {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [targetKey, setTargetKey] = useState("");
  const [relationshipType, setRelationshipType] = useState("same_group");
  const [status, setStatus] = useState<Relationship["status"]>("verified");
  const [evidenceNote, setEvidenceNote] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [targetSearch, setTargetSearch] = useState("");
  const [preview, setPreview] = useState<MergePreview | null>(null);
  const [mergeReason, setMergeReason] = useState("");
  const [preparedMerge, setPreparedMerge] = useState<PreparedMerge | null>(null);
  const [mergeConfirmation, setMergeConfirmation] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const result = await supabase.rpc("get_offerpsp_entity_relationship_workspace", {
      p_entity_type: entityType,
      p_entity_id: entityId,
    });
    if (result.error) setMessage({ tone: "error", text: result.error.message });
    else setWorkspace(result.data as Workspace);
    setLoading(false);
  }, [entityId, entityType]);

  useEffect(() => { void load(); }, [load]);

  const filteredTargets = useMemo(() => {
    const needle = targetSearch.trim().toLowerCase();
    const targets = workspace?.selectable_targets || [];
    if (!needle) return targets;
    return targets.filter((item) => [item.name, item.legal_name, item.website, item.internal_code]
      .some((value) => value?.toLowerCase().includes(needle)));
  }, [targetSearch, workspace?.selectable_targets]);

  async function saveRelationship() {
    const [targetType, targetId] = targetKey.split(":") as [EntityType, string];
    if (!targetId) return;
    if (status === "verified" && evidenceNote.trim().length < 10) {
      setMessage({ tone: "error", text: "Для подтверждённой связи добавьте основание минимум из 10 символов." });
      return;
    }
    setBusy("save"); setMessage(null);
    const result = await supabase.rpc("save_offerpsp_entity_relationship", {
      p_source_entity_type: entityType,
      p_source_entity_id: entityId,
      p_target_entity_type: targetType,
      p_target_entity_id: targetId,
      p_relationship_type: relationshipType,
      p_status: status,
      p_evidence_note: evidenceNote.trim() || null,
      p_evidence_url: evidenceUrl.trim() || null,
    });
    if (result.error) setMessage({ tone: "error", text: result.error.message });
    else {
      setTargetKey(""); setEvidenceNote(""); setEvidenceUrl("");
      setMessage({ tone: "success", text: "Связь сохранена в истории сущности." });
      await load();
    }
    setBusy(null);
  }

  async function endRelationship(item: Relationship) {
    const reason = window.prompt(`Почему связь «${relationshipLabels[item.relationship_type] || item.relationship_type}» больше не действует?`);
    if (!reason) return;
    if (reason.trim().length < 5) {
      setMessage({ tone: "error", text: "Укажите причину минимум из 5 символов." });
      return;
    }
    setBusy(item.id); setMessage(null);
    const result = await supabase.rpc("end_offerpsp_entity_relationship", {
      p_relationship_id: item.id,
      p_reason: reason.trim(),
    });
    if (result.error) setMessage({ tone: "error", text: result.error.message });
    else {
      setMessage({ tone: "success", text: "Связь завершена. История сохранена." });
      await load();
    }
    setBusy(null);
  }

  async function previewMerge(candidate: DuplicateCandidate) {
    setBusy(`preview:${candidate.id}`); setMessage(null); setPreview(null);
    setPreparedMerge(null); setMergeReason(""); setMergeConfirmation("");
    const result = await supabase.rpc("preview_offerpsp_entity_merge", {
      p_entity_type: entityType,
      p_source_entity_id: candidate.id,
      p_target_entity_id: entityId,
    });
    if (result.error) setMessage({ tone: "error", text: result.error.message });
    else setPreview(result.data as MergePreview);
    setBusy(null);
  }

  async function prepareMerge() {
    if (!preview?.merge_available) return;
    if (mergeReason.trim().length < 10) {
      setMessage({ tone: "error", text: "Укажите причину объединения минимум из 10 символов." });
      return;
    }
    setBusy("prepare-merge"); setMessage(null);
    const result = await supabase.rpc("prepare_offerpsp_entity_merge", {
      p_entity_type: entityType,
      p_source_entity_id: preview.source.id,
      p_target_entity_id: preview.target.id,
      p_reason: mergeReason.trim(),
    });
    if (result.error) setMessage({ tone: "error", text: result.error.message });
    else setPreparedMerge(result.data as PreparedMerge);
    setBusy(null);
  }

  async function executeMerge() {
    if (!preparedMerge || mergeConfirmation.trim() !== "ОБЪЕДИНИТЬ") return;
    setBusy("execute-merge"); setMessage(null);
    const result = await supabase.rpc("execute_offerpsp_entity_merge", {
      p_merge_id: preparedMerge.merge_id,
      p_confirmation_token: preparedMerge.confirmation_token,
    });
    if (result.error) setMessage({ tone: "error", text: result.error.message });
    else {
      setMessage({ tone: "success", text: "Карточки логически объединены. История сохранена; откат доступен 72 часа." });
      setPreview(null); setPreparedMerge(null); setMergeReason(""); setMergeConfirmation("");
      await load();
    }
    setBusy(null);
  }

  async function rollbackMerge(item: ActiveMerge) {
    const reason = window.prompt("Почему нужно отменить объединение? Укажите не менее 10 символов.");
    if (!reason) return;
    if (reason.trim().length < 10) {
      setMessage({ tone: "error", text: "Укажите причину отката минимум из 10 символов." });
      return;
    }
    setBusy(`rollback:${item.id}`); setMessage(null);
    const result = await supabase.rpc("rollback_offerpsp_entity_merge", {
      p_merge_id: item.id,
      p_reason: reason.trim(),
    });
    if (result.error) setMessage({ tone: "error", text: result.error.message });
    else {
      setMessage({ tone: "success", text: "Объединение отменено, исходная карточка восстановлена." });
      await load();
    }
    setBusy(null);
  }

  return <Panel>
    <p className="text-xs font-semibold uppercase tracking-[.18em] text-brand-500">Entity graph</p>
    <h2 className="mt-2 text-xl font-semibold text-gray-900 dark:text-white">Связи и возможные дубли</h2>
    <p className="mt-1 text-sm leading-6 text-gray-500">Связи сохраняются только с явным статусом и основанием. Кандидаты в дубли строятся по точным признакам; система ничего не объединяет автоматически.</p>

    {message && <div className={`mt-4 rounded-xl border px-4 py-3 text-sm ${message.tone === "error" ? "border-error-200 bg-error-50 text-error-700 dark:border-error-500/20 dark:bg-error-500/10 dark:text-error-300" : "border-success-200 bg-success-50 text-success-700 dark:border-success-500/20 dark:bg-success-500/10 dark:text-success-300"}`}>{message.text}</div>}
    {loading ? <p className="mt-5 text-sm text-gray-400">Загружаю связи…</p> : workspace && <>
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Текущие связи</h3>
          <div className="mt-3 space-y-3">
            {workspace.relationships.map((item) => <article key={item.id} className="rounded-xl border border-gray-200 p-4 dark:border-gray-700">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><p className="text-sm font-semibold text-gray-900 dark:text-white">{relationshipLabels[item.relationship_type] || item.relationship_type}</p><p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{entityLabel(item.other_entity)}</p><p className="mt-1 text-xs text-gray-400">{item.other_entity.entity_type === "provider" ? "PSP" : "Компания"} · {item.other_entity.internal_code || "без кода"}</p></div>
                <StatusPill status={item.status}/>
              </div>
              {item.evidence_note && <p className="mt-3 text-sm leading-6 text-gray-500">{item.evidence_note}</p>}
              <div className="mt-3 flex flex-wrap items-center gap-3">
                {item.evidence_url && <a className="text-xs font-semibold text-brand-600 hover:underline" href={item.evidence_url} target="_blank" rel="noreferrer">Открыть источник</a>}
                <button disabled={Boolean(busy)} onClick={() => void endRelationship(item)} className="text-xs font-semibold text-error-600 disabled:opacity-40">Завершить связь</button>
              </div>
            </article>)}
            {!workspace.relationships.length && <EmptyState title="Связей пока нет" description="Добавьте подтверждённую корпоративную или операционную связь."/>}
          </div>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Добавить связь</h3>
          <div className="mt-3 space-y-3 rounded-xl border border-gray-200 p-4 dark:border-gray-700">
            <input className={fieldClass} value={targetSearch} onChange={(event) => setTargetSearch(event.target.value)} placeholder="Найти компанию, бренд или PSP"/>
            <select className={fieldClass} value={targetKey} onChange={(event) => setTargetKey(event.target.value)}>
              <option value="">Выберите связанную сущность</option>
              {filteredTargets.map((item) => <option key={`${item.entity_type}:${item.id}`} value={`${item.entity_type}:${item.id}`}>{item.entity_type === "provider" ? "PSP" : "Компания"} · {entityLabel(item)}</option>)}
            </select>
            <select className={fieldClass} value={relationshipType} onChange={(event) => setRelationshipType(event.target.value)}>
              {Object.entries(relationshipLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <select className={fieldClass} value={status} onChange={(event) => setStatus(event.target.value as Relationship["status"])}>
              <option value="verified">Подтверждена</option><option value="proposed">Предположение</option><option value="disputed">Спорная</option>
            </select>
            <textarea className={areaClass} value={evidenceNote} onChange={(event) => setEvidenceNote(event.target.value)} placeholder="Основание: договор, письмо, реестр, официальный сайт…"/>
            <input className={fieldClass} value={evidenceUrl} onChange={(event) => setEvidenceUrl(event.target.value)} placeholder="Ссылка на источник (необязательно)"/>
            <button disabled={Boolean(busy) || !targetKey} onClick={() => void saveRelationship()} className="rounded-lg bg-brand-500 px-5 py-3 text-sm font-semibold text-white disabled:opacity-40">{busy === "save" ? "Сохраняю…" : "Сохранить связь"}</button>
          </div>
        </div>
      </div>

      {((workspace.merged_sources || []).length > 0 || (workspace.active_merges || []).length > 0) && <div className="mt-8 border-t border-gray-200 pt-6 dark:border-gray-700">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Объединённые карточки</h3>
        <p className="mt-1 text-xs text-gray-400">Исходные записи и вся их коммерческая история сохранены. Рубка показывает их через основную карточку.</p>
        <div className="mt-4 space-y-3">
          {(workspace.merged_sources || []).map((item) => {
            const merge = (workspace.active_merges || []).find((entry) => entry.source_entity_id === item.id);
            return <article key={item.id} className="flex flex-col gap-3 rounded-xl border border-gray-200 p-4 dark:border-gray-700 sm:flex-row sm:items-center sm:justify-between">
              <div><strong className="text-sm text-gray-900 dark:text-white">{entityLabel(item)}</strong><p className="mt-1 text-xs text-gray-500">Историческая карточка · {item.internal_code || "без кода"}{merge?.executed_at ? ` · объединена ${new Date(merge.executed_at).toLocaleString("ru-RU")}` : ""}</p>{merge?.reason && <p className="mt-2 text-xs text-gray-400">{merge.reason}</p>}</div>
              {merge?.rollback_available ? <button disabled={Boolean(busy)} onClick={() => void rollbackMerge(merge)} className="rounded-lg border border-warning-300 px-4 py-2.5 text-xs font-semibold text-warning-700 disabled:opacity-40 dark:text-warning-300">{busy === `rollback:${merge.id}` ? "Восстанавливаю…" : "Отменить объединение"}</button> : <span className="text-xs font-semibold text-gray-400">Окно отката закрыто</span>}
            </article>;
          })}
        </div>
      </div>}

      <div className="mt-8 border-t border-gray-200 pt-6 dark:border-gray-700">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Точные кандидаты в дубли</h3>
        <p className="mt-1 text-xs text-gray-400">Совпадение части названия не считается сигналом. Merchant Bridge Advisory и Merchantpayd останутся разными карточками без точного доказательства.</p>
        <div className="mt-4 space-y-3">
          {workspace.duplicate_candidates.map((item) => <article key={item.id} className="flex flex-col gap-3 rounded-xl border border-warning-200 bg-warning-50/60 p-4 dark:border-warning-500/20 dark:bg-warning-500/5 sm:flex-row sm:items-center sm:justify-between">
            <div><div className="flex flex-wrap items-center gap-2"><strong className="text-sm text-gray-900 dark:text-white">{entityLabel(item)}</strong><span className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-warning-700 dark:bg-gray-900 dark:text-warning-300">{item.score}/100</span></div><p className="mt-1 text-xs text-gray-500">Совпало: {item.signals.map((signal) => signalLabels[signal] || signal).join(", ")}</p></div>
            <button disabled={Boolean(busy)} onClick={() => void previewMerge(item)} className="rounded-lg border border-warning-300 px-4 py-2.5 text-xs font-semibold text-warning-700 disabled:opacity-40 dark:text-warning-300">{busy === `preview:${item.id}` ? "Считаю…" : "Показать последствия"}</button>
          </article>)}
          {!workspace.duplicate_candidates.length && <EmptyState title="Точных дублей не найдено" description="Карточка не совпадает с другими по домену, регистрационному номеру или точному имени."/>}
        </div>
      </div>

      {preview && <div className="mt-6 rounded-2xl border border-brand-200 bg-brand-50/50 p-5 dark:border-brand-500/20 dark:bg-brand-500/5">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[.16em] text-brand-600">Merge preview · без изменений</p><h3 className="mt-2 text-lg font-semibold text-gray-900 dark:text-white">{preview.source.name} → {preview.target.name}</h3></div><button onClick={() => { setPreview(null); setPreparedMerge(null); }} className="text-sm font-semibold text-gray-500">Закрыть</button></div>
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <div><h4 className="text-sm font-semibold text-gray-900 dark:text-white">Конфликты полей</h4><div className="mt-2 space-y-2">{preview.field_conflicts.map((item) => <div key={item.field} className="rounded-lg bg-white p-3 text-xs dark:bg-gray-900"><strong>{fieldLabels[item.field] || item.field}</strong><p className="mt-1 text-gray-500">Источник: {formatValue(item.source_value)}</p><p className="text-gray-500">Основная карточка: {formatValue(item.target_value)}</p></div>)}{!preview.field_conflicts.length && <p className="text-sm text-gray-500">Конфликтов заполненных полей нет.</p>}</div></div>
          <div><h4 className="text-sm font-semibold text-gray-900 dark:text-white">Зависимые записи</h4><div className="mt-2 space-y-2">{preview.dependent_references.map((item) => <div key={`${item.schema}.${item.table}.${item.column}`} className="flex items-center justify-between gap-3 rounded-lg bg-white p-3 text-xs dark:bg-gray-900"><span>{item.schema}.{item.table}<small className="ml-2 text-gray-400">{item.policy === "immutable_history" ? "история неизменна" : "через alias"}</small></span><strong>{item.source_rows}</strong></div>)}{!preview.dependent_references.length && <p className="text-sm text-gray-500">Зависимых записей не найдено.</p>}</div><p className="mt-3 text-xs text-gray-500">Aliases: {preview.source_alias_count} · Активные связи: {preview.source_relationship_count}</p></div>
        </div>
        <p className="mt-5 rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">История не переносится и не удаляется: исходная карточка останется скрытым alias основной, а её рабочие данные продолжат учитываться. Автоматический откат доступен {preview.observation_hours} часа.</p>
        {!preview.merge_available ? <p className="mt-3 rounded-lg border border-warning-200 bg-warning-50 px-4 py-3 text-sm text-warning-700 dark:border-warning-500/20 dark:bg-warning-500/10 dark:text-warning-300">Объединение заблокировано: {preview.blocking_reason || "нет достаточного точного подтверждения"}.</p> : !preparedMerge ? <div className="mt-4 space-y-3">
          <textarea className={areaClass} value={mergeReason} onChange={(event) => setMergeReason(event.target.value)} placeholder="Причина объединения и проверенное доказательство…"/>
          <button disabled={Boolean(busy) || mergeReason.trim().length < 10} onClick={() => void prepareMerge()} className="rounded-lg bg-brand-500 px-5 py-3 text-sm font-semibold text-white disabled:opacity-40">{busy === "prepare-merge" ? "Фиксирую preview…" : "Подготовить объединение"}</button>
        </div> : <div className="mt-4 rounded-xl border border-error-200 bg-white p-4 dark:border-error-500/20 dark:bg-gray-900">
          <strong className="text-sm text-error-700 dark:text-error-300">Финальное подтверждение</strong>
          <p className="mt-2 text-xs leading-5 text-gray-500">Preview зафиксирован до {new Date(preparedMerge.token_expires_at).toLocaleString("ru-RU")}. Для выполнения введите <strong>ОБЪЕДИНИТЬ</strong>. Данные не удаляются.</p>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row"><input className={fieldClass} value={mergeConfirmation} onChange={(event) => setMergeConfirmation(event.target.value)} placeholder="ОБЪЕДИНИТЬ"/><button disabled={Boolean(busy) || mergeConfirmation.trim() !== "ОБЪЕДИНИТЬ"} onClick={() => void executeMerge()} className="shrink-0 rounded-lg bg-error-600 px-5 py-3 text-sm font-semibold text-white disabled:opacity-40">{busy === "execute-merge" ? "Объединяю…" : "Подтвердить"}</button></div>
        </div>}
      </div>}
    </>}
  </Panel>;
}
