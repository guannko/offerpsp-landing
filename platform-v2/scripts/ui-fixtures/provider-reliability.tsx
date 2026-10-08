// DEV-only synthetic fixture. Replaces the client before rendering; no real requests/writes.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { HelmetProvider } from "react-helmet-async";
import { supabase } from "../../src/lib/supabase";
import { ControlBridgeProvider } from "../../src/context/ControlBridgeContext";
import { ProvidersPage } from "../../src/pages/Platform";
import ProviderReliabilityPanel from "../../src/components/control/ProviderReliabilityPanel";
import type { ProviderReliability } from "../../src/lib/providerReliability";
import "../../src/index.css";

if (!import.meta.env.DEV) throw new Error("Not a production entry point");
let failure = false;
let rows: ProviderReliability[] = [{ entity_type: "research_psp", entity_id: "901", category: "review_later", decision: "conditional", score: 35, points: { legal: 15, funds: null, operations: 10, reputation: 5, transparency: 5 }, confidence: "low", scope: "Пример PSP-партнёрства", reason: "Пример: условия защиты денег ещё не подтверждены.", next_step: "Пример: получить договор и сведения о расчётах.", sources: ["https://example.com/evidence"], methodology: "evidence_trust_v1", updated_at: "2026-10-09T00:00:00Z" }];
const research = [ { id: 901, name: "Пример: отложенный PSP", website: "https://deferred.example", provider_status: "research", contact_status: "replied", record_state: "active" }, { id: 902, name: "Пример: новый PSP", website: "https://candidate.example", provider_status: "research", contact_status: "not_contacted", record_state: "active" } ];
const client = supabase as unknown as { rpc: (name: string, args?: Record<string, unknown>) => Promise<unknown>; from: () => unknown };
client.rpc = async (name, args) => {
  if (name === "get_offerpsp_provider_reliability") return failure ? { data: null, error: { message: "Синтетический отказ чтения" } } : { data: structuredClone(rows), error: null };
  if (name === "save_offerpsp_provider_reliability") {
    const before = rows.find((row) => row.entity_type === args!.p_entity_type && row.entity_id === args!.p_entity_id);
    if ((before?.updated_at || null) !== args!.p_expected_updated_at) return { error: { message: "Assessment changed. Reload before saving." } };
    const data = { ...(args!.p_payload as ProviderReliability), entity_type: args!.p_entity_type, entity_id: args!.p_entity_id, methodology: "evidence_trust_v1", updated_at: new Date().toISOString() } as ProviderReliability;
    data.score = Object.values(data.points).reduce<number>((sum, value) => sum + (value || 0), 0);
    rows = [...rows.filter((row) => row !== before), data]; return { data, error: null };
  }
  return { data: name === "get_offerpsp_captains_bridge" ? { psp_providers: research, casino_leads: [], email_drafts: [], telegram_log: [], bot_tasks: [], offerpsp_tasks: [] } : name === "get_offerpsp_management_registry" || name === "list_offerpsp_supply" ? { providers: [] } : [], error: null };
};
client.from = () => {
  const builder = { select: () => builder, eq: () => builder, order: async () => ({ data: [], error: null }), maybeSingle: async () => ({ data: { active: true }, error: null }) };
  return builder;
};
supabase.auth.getUser = async () => ({ data: { user: { id: "fixture", app_metadata: { provider: "google" } } }, error: null }) as never;
supabase.auth.onAuthStateChange = () => ({ data: { subscription: { unsubscribe() {} } } }) as never;
export function Fixture() {
  const [mode, setMode] = useState(false);
  return <div className="mx-auto max-w-7xl space-y-6 p-6"><p className="rounded-lg border border-gray-300 p-3 text-sm">Локальный тест. Все компании, источники и оценки — синтетические. Production не меняется.</p><button className="rounded-lg border px-3 py-2" onClick={() => { failure = !failure; setMode(!mode); }}>Переключить ошибку загрузки</button><ControlBridgeProvider key={String(mode)}><ProvidersPage/><ProviderReliabilityPanel key={String(mode)} entityType="research_psp" entityId="901"/></ControlBridgeProvider></div>;
}
const root = createRoot(document.getElementById("root")!);
root.render(<HelmetProvider><MemoryRouter initialEntries={["/psps"]}><Fixture/></MemoryRouter></HelmetProvider>);
import.meta.hot?.dispose(() => root.unmount());
