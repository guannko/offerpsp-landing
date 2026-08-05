import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { hasSupabaseConfig, supabase } from "../lib/supabase";
import type {
  ControlBridgeData,
  AgentAssignment,
  AgentMarginPolicy,
  Lead,
  Organization,
  Provider,
  RouteCoverage,
  StaffMember,
  CaptainsBridgeSnapshot,
  MailCenterSnapshot,
} from "../types/offerpsp";

type ControlBridgeContextValue = ControlBridgeData & {
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const emptyData: ControlBridgeData = {
  user: null,
  staff: null,
  leads: [],
  providers: [],
  routes: [],
  organizations: [],
  assignments: [],
  agentMarginPolicies: [],
  commissionSummary: {},
  captainsBridge: { casino_leads: [], psp_providers: [], email_drafts: [], telegram_log: [], bot_tasks: [], offerpsp_tasks: [] },
  mailCenter: { metrics: { threads: 0, unread: 0, awaiting_reply: 0, follow_up: 0 }, threads: [], messages: [] },
  loading: true,
  refreshing: false,
  ready: false,
  accessDenied: false,
  error: null,
  lastUpdatedAt: null,
};

const ControlBridgeContext = createContext<ControlBridgeContextValue | null>(null);
const asArray = <T,>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

export function ControlBridgeProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ControlBridgeData>(emptyData);

  const load = useCallback(async (userOverride?: User | null) => {
    if (!hasSupabaseConfig) {
      setState((current) => ({
        ...current,
        loading: false,
        ready: false,
        error: "Supabase environment variables are missing.",
      }));
      return;
    }

    setState((current) => ({ ...current, refreshing: current.ready, error: null }));
    const userResult = userOverride
      ? { data: { user: userOverride }, error: null }
      : await supabase.auth.getUser();
    const user = userResult.data.user;

    if (userResult.error || !user) {
      setState({ ...emptyData, loading: false, user: null });
      return;
    }

    if (user.app_metadata?.provider !== "google") {
      await supabase.auth.signOut();
      setState({
        ...emptyData,
        loading: false,
        accessDenied: true,
        error: "Этот способ входа не имеет доступа к Control Bridge.",
      });
      return;
    }

    const staffResult = await supabase
      .from("offerpsp_staff_members")
      .select("*")
      .eq("user_id", user.id)
      .eq("active", true)
      .maybeSingle();

    if (staffResult.error || !staffResult.data) {
      setState({
        ...emptyData,
        user,
        loading: false,
        accessDenied: true,
        error: staffResult.error?.message || "Этот Google-аккаунт не имеет доступа к Control Bridge.",
      });
      return;
    }

    const [leadsResult, managementResult, supplyResult, coverageResult, captainsResult, mailResult] = await Promise.all([
      supabase.from("offerpsp_leads").select("*").order("submitted_at", { ascending: false }),
      supabase.rpc("get_offerpsp_management_registry"),
      supabase.rpc("list_offerpsp_supply"),
      supabase.rpc("get_offerpsp_supply_coverage"),
      supabase.rpc("get_offerpsp_captains_bridge"),
      supabase.rpc("get_offerpsp_mail_center", { p_limit: 250 }),
    ]);

    const firstError = [leadsResult.error, managementResult.error, supplyResult.error, coverageResult.error, captainsResult.error, mailResult.error].find(Boolean);
    const management = (managementResult.data || {}) as Record<string, unknown>;
    const supply = (supplyResult.data || {}) as Record<string, unknown>;
    const coverage = (coverageResult.data || {}) as Record<string, unknown>;

    setState({
      user,
      staff: staffResult.data as StaffMember,
      leads: asArray<Lead>(leadsResult.data),
      providers: asArray<Provider>(management.providers || supply.providers),
      routes: asArray<RouteCoverage>(coverage.routes),
      organizations: asArray<Organization>(management.organizations),
      assignments: asArray<AgentAssignment>(management.assignments),
      agentMarginPolicies: asArray<AgentMarginPolicy>(management.agent_margin_policies),
      commissionSummary: (management.commission_summary || {}) as Record<string, number>,
      captainsBridge: (captainsResult.data || emptyData.captainsBridge) as CaptainsBridgeSnapshot,
      mailCenter: (mailResult.data || emptyData.mailCenter) as MailCenterSnapshot,
      loading: false,
      refreshing: false,
      ready: true,
      accessDenied: false,
      error: firstError?.message || null,
      lastUpdatedAt: new Date(),
    });
  }, []);

  useEffect(() => {
    void load();
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      void load(session?.user || null);
    });
    return () => data.subscription.unsubscribe();
  }, [load]);

  const refresh = useCallback(async () => load(state.user), [load, state.user]);
  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setState({ ...emptyData, loading: false });
  }, []);

  const value = useMemo(() => ({ ...state, refresh, signOut }), [state, refresh, signOut]);
  return <ControlBridgeContext.Provider value={value}>{children}</ControlBridgeContext.Provider>;
}

export function useControlBridge() {
  const context = useContext(ControlBridgeContext);
  if (!context) throw new Error("useControlBridge must be used inside ControlBridgeProvider");
  return context;
}
