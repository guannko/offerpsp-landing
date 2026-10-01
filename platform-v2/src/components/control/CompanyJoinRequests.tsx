import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import { ErrorBanner, Panel } from "./Ui";

type JoinRequest = {
  id: string; lead_id: string | null; company: string; name: string; email: string;
  telegram: string | null; status: string; can_decide: boolean;
};

export default function CompanyJoinRequests({ leadId, onChanged }: { leadId: string; onChanged?: () => Promise<void> }) {
  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  const load = useCallback(async () => {
    const current = generation.current;
    const result = await supabase.rpc("get_offerpsp_company_join_requests");
    if (current !== generation.current) return;
    if (result.error) { setError(result.error.message); return; }
    setError(null);
    setRequests(((result.data || []) as JoinRequest[]).filter((request) =>
      request.lead_id === leadId && ["awaiting_verification", "pending_owner", "pending_staff"].includes(request.status)));
  }, [leadId]);
  useEffect(() => {
    generation.current += 1;
    setRequests([]);
    void load();
    return () => { generation.current += 1; };
  }, [load]);
  async function decide(request: JoinRequest, approve: boolean) {
    if (busy) return;
    const current = generation.current;
    setBusy(true); setError(null);
    try {
      const result = await supabase.rpc("decide_offerpsp_company_join_request", {
        p_request_id: request.id, p_approve: approve, p_role: "viewer",
      });
      if (current !== generation.current) return;
      if (result.error) { setError(result.error.message); return; }
      await load();
      await onChanged?.();
    } finally { if (current === generation.current) setBusy(false); }
  }
  if (!requests.length && !error) return null;
  return <Panel>
    <div className="mb-4 flex items-center justify-between gap-3">
      <h3 className="font-semibold">Запросы сотрудников на доступ</h3>
      <button type="button" disabled={busy} onClick={() => void load()} className="text-sm text-brand-500">Обновить</button>
    </div>
    {error && <ErrorBanner message={error} />}
    {requests.map((request) => <article key={request.id} className="space-y-2 border-t border-gray-200 py-4 dark:border-gray-800">
      <p className="font-medium">{request.name} · {request.email}</p>
      <p className="text-sm text-gray-500">{request.telegram || "Telegram не указан"} · {request.status === "awaiting_verification"
        ? "Ждём подтверждения почты; доступ закрыт" : request.status === "pending_owner" ? "Ждём решения владельца" : "Нужно решение команды OfferPSP"}</p>
      {request.can_decide && <div className="flex gap-4">
        <button type="button" disabled={busy} onClick={() => void decide(request, true)} className="text-sm text-brand-500">Одобрить просмотр</button>
        <button type="button" disabled={busy} onClick={() => void decide(request, false)} className="text-sm text-error-500">Отказать</button>
      </div>}
    </article>)}
  </Panel>;
}
