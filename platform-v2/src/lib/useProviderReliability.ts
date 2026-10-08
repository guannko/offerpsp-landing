import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";
import type { ProviderReliability } from "./providerReliability";

export function useProviderReliability() {
  const [rows, setRows] = useState<ProviderReliability[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await supabase.rpc("get_offerpsp_provider_reliability");
      if (result.error) throw new Error(result.error.message);
      if (!Array.isArray(result.data)) throw new Error("Некорректный ответ реестра оценок.");
      setError(null); setRows(result.data);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Не удалось загрузить оценки."); setRows([]);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  return { rows, loading, error, refresh };
}
