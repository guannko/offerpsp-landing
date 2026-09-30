import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { Panel } from "./Ui";

type AliasRow = {
  id: string;
  alias: string;
  alias_type: "legal_name" | "trading_name" | "brand";
  source: "canonical" | "historical" | "staff";
  is_primary: boolean;
};

const sourceLabels: Record<AliasRow["source"], string> = {
  canonical: "основное",
  historical: "историческое",
  staff: "дополнительное",
};

const splitAliases = (value: string) => [...new Set(
  value.split(/[\n,;]+/).map((item) => item.trim()).filter(Boolean),
)];

export default function EntityAliasEditor({
  entityType,
  entityId,
}: {
  entityType: "organization" | "provider";
  entityId: string;
}) {
  const [aliases, setAliases] = useState<AliasRow[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await supabase.rpc("get_offerpsp_entity_aliases", {
      p_entity_type: entityType,
      p_entity_id: entityId,
    });
    if (result.error) {
      setError(result.error.message);
    } else {
      const next = Array.isArray(result.data) ? result.data as AliasRow[] : [];
      setAliases(next);
      setDraft(next.filter((item) => item.source === "staff").map((item) => item.alias).join(", "));
    }
    setLoading(false);
  }, [entityId, entityType]);

  useEffect(() => { void load(); }, [load]);

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    const result = await supabase.rpc("save_offerpsp_entity_aliases", {
      p_entity_type: entityType,
      p_entity_id: entityId,
      p_aliases: splitAliases(draft),
    });
    if (result.error) {
      setError(result.error.message);
    } else {
      const next = Array.isArray(result.data) ? result.data as AliasRow[] : [];
      setAliases(next);
      setDraft(next.filter((item) => item.source === "staff").map((item) => item.alias).join(", "));
      setSaved(true);
    }
    setSaving(false);
  }

  return <Panel>
    <p className="text-xs font-semibold uppercase tracking-[.18em] text-brand-500">Alias registry</p>
    <h2 className="mt-2 text-lg font-semibold text-gray-900 dark:text-white">Названия и бренды</h2>
    <p className="mt-1 text-sm leading-6 text-gray-500">Юридическое и основное название синхронизируются автоматически. Дополнительные бренды помогают связать повторную заявку с правильной карточкой.</p>
    {loading
      ? <p className="mt-4 text-sm text-gray-400">Загружаю aliases…</p>
      : <>
          <div className="mt-4 flex flex-wrap gap-2">
            {aliases.filter((item) => item.source !== "staff").map((item) => <span key={item.id} className="rounded-full border border-gray-200 px-2.5 py-1 text-xs text-gray-600 dark:border-gray-700 dark:text-gray-300">{item.alias} · {sourceLabels[item.source]}</span>)}
            {!aliases.some((item) => item.source !== "staff") && <span className="text-xs text-gray-400">Canonical aliases появятся после сохранения профиля.</span>}
          </div>
          <label className="mt-5 block text-xs font-semibold text-gray-500">Дополнительные бренды и торговые названия
            <textarea className="mt-1.5 min-h-24 w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-900 outline-none focus:border-brand-400 dark:border-gray-700 dark:bg-gray-900 dark:text-white" value={draft} onChange={(event) => { setDraft(event.target.value); setSaved(false); }} placeholder="Например: Acme Pay, Acme Processing"/>
          </label>
          <p className="mt-2 text-xs text-gray-400">Разделяйте запятыми или новой строкой. Максимум 25 aliases.</p>
          {error && <p className="mt-3 text-sm text-error-600 dark:text-error-300">{error}</p>}
          {saved && <p className="mt-3 text-sm text-success-600 dark:text-success-300">Aliases сохранены.</p>}
          <button disabled={saving} onClick={() => void save()} className="mt-4 rounded-lg border border-brand-300 px-4 py-2.5 text-sm font-semibold text-brand-600 disabled:opacity-40">{saving ? "Сохраняю…" : "Сохранить aliases"}</button>
        </>}
  </Panel>;
}
