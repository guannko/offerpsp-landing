import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { useLocation } from "react-router";
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
  OfferIngestionJob,
  FreshnessReminder,
  ModuleEntitlement,
  ComplianceCaseSummary,
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
  ingestionJobs: [],
  freshnessReminders: [],
  moduleEntitlements: [],
  complianceCases: [],
  commissionSummary: {},
  captainsBridge: { casino_leads: [], psp_providers: [], email_drafts: [], telegram_log: [], bot_tasks: [], offerpsp_tasks: [] },
  mailCenter: { metrics: { threads: 0, unread: 0, awaiting_reply: 0, follow_up: 0, attachments_to_review: 0 }, threads: [], messages: [], attachments: [] },
  loading: true,
  refreshing: false,
  ready: false,
  accessDenied: false,
  error: null,
  lastUpdatedAt: null,
};

const ControlBridgeContext = createContext<ControlBridgeContextValue | null>(null);
const asArray = <T,>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

type CoreSnapshot = Pick<
  ControlBridgeData,
  | "leads"
  | "providers"
  | "routes"
  | "organizations"
  | "assignments"
  | "agentMarginPolicies"
  | "moduleEntitlements"
  | "complianceCases"
  | "commissionSummary"
> & {
  cachedAt: number;
  error: string | null;
};

const CORE_CACHE_TTL_MS = 30_000;
const CORE_CACHE_MAX_USERS = 3;
const coreCache = new Map<string, CoreSnapshot>();

function readCoreCache(userId: string) {
  const cached = coreCache.get(userId);
  if (!cached || Date.now() - cached.cachedAt > CORE_CACHE_TTL_MS) {
    coreCache.delete(userId);
    return null;
  }
  coreCache.delete(userId);
  coreCache.set(userId, cached);
  return cached;
}

function writeCoreCache(userId: string, snapshot: CoreSnapshot) {
  coreCache.delete(userId);
  coreCache.set(userId, snapshot);
  while (coreCache.size > CORE_CACHE_MAX_USERS) {
    const oldest = coreCache.keys().next().value;
    if (!oldest) break;
    coreCache.delete(oldest);
  }
}

export function ControlBridgeProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ControlBridgeData>(emptyData);
  const backgroundRefreshActive = useRef(false);
  const { pathname } = useLocation();

  const load = useCallback(async (userOverride?: User | null, force = false) => {
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
      coreCache.delete(user.id);
      setState({
        ...emptyData,
        user,
        loading: false,
        accessDenied: true,
        error: staffResult.error?.message || "Этот Google-аккаунт не имеет доступа к Control Bridge.",
      });
      return;
    }

    const needsCaptains = ["/casinos", "/psps", "/intelligence", "/communications", "/operations", "/integrations"].some((path) => pathname.startsWith(path));
    const needsMail = pathname.startsWith("/communications");
    const needsSupplyOperations = pathname === "/";
    const skipped = Promise.resolve({ data: null, error: null });
    const cachedCore = force ? null : readCoreCache(user.id);
    const coreRequest = cachedCore
      ? Promise.resolve(cachedCore)
      : Promise.all([
          supabase.from("offerpsp_leads").select("*").order("submitted_at", { ascending: false }),
          supabase.rpc("get_offerpsp_management_registry"),
          supabase.rpc("list_offerpsp_supply"),
          supabase.rpc("get_offerpsp_supply_coverage"),
          supabase.rpc("get_offerpsp_module_entitlements"),
          supabase.rpc("get_offerpsp_pre_compliance_registry"),
        ]).then(([leadsResult, managementResult, supplyResult, coverageResult, entitlementsResult, complianceResult]) => {
          const management = (managementResult.data || {}) as Record<string, unknown>;
          const supply = (supplyResult.data || {}) as Record<string, unknown>;
          const coverage = (coverageResult.data || {}) as Record<string, unknown>;
          const firstError = [leadsResult.error, managementResult.error, supplyResult.error, coverageResult.error, entitlementsResult.error, complianceResult.error].find(Boolean);
          const supplyProviders = asArray<Provider>(supply.providers);
          const supplyProviderById = new Map(supplyProviders.map((provider) => [provider.id, provider]));
          const snapshot: CoreSnapshot = {
            leads: asArray<Lead>(leadsResult.data),
            providers: asArray<Provider>(management.providers || supply.providers).map((provider) => ({
              ...provider,
              legacy_psp_id: supplyProviderById.get(provider.id)?.legacy_psp_id ?? provider.legacy_psp_id ?? null,
            })),
            routes: asArray<RouteCoverage>(coverage.routes),
            organizations: asArray<Organization>(management.organizations),
            assignments: asArray<AgentAssignment>(management.assignments),
            agentMarginPolicies: asArray<AgentMarginPolicy>(management.agent_margin_policies),
            moduleEntitlements: asArray<ModuleEntitlement>(entitlementsResult.data),
            complianceCases: asArray<ComplianceCaseSummary>(complianceResult.data),
            commissionSummary: (management.commission_summary || {}) as Record<string, number>,
            cachedAt: Date.now(),
            error: firstError?.message || null,
          };
          writeCoreCache(user.id, snapshot);
          return snapshot;
        });
    const [core, captainsResult, mailResult, ingestionResult, freshnessResult] = await Promise.all([
      coreRequest,
      needsCaptains ? supabase.rpc("get_offerpsp_captains_bridge") : skipped,
      needsMail ? supabase.rpc("get_offerpsp_mail_center", { p_limit: 250 }) : skipped,
      needsSupplyOperations ? supabase.rpc("list_offerpsp_ingestion_jobs", { p_limit: 100 }) : skipped,
      needsSupplyOperations ? supabase.rpc("list_offerpsp_freshness_reminders") : skipped,
    ]);

    const scopedError = [captainsResult.error, mailResult.error, ingestionResult.error, freshnessResult.error].find(Boolean);

    setState((current) => ({
      user,
      staff: staffResult.data as StaffMember,
      leads: core.leads,
      providers: core.providers,
      routes: core.routes,
      organizations: core.organizations,
      assignments: core.assignments,
      agentMarginPolicies: core.agentMarginPolicies,
      ingestionJobs: needsSupplyOperations ? asArray<OfferIngestionJob>(ingestionResult.data) : current.ingestionJobs,
      freshnessReminders: needsSupplyOperations ? asArray<FreshnessReminder>(freshnessResult.data) : current.freshnessReminders,
      moduleEntitlements: core.moduleEntitlements,
      complianceCases: core.complianceCases,
      commissionSummary: core.commissionSummary,
      captainsBridge: needsCaptains ? (captainsResult.data || emptyData.captainsBridge) as CaptainsBridgeSnapshot : current.captainsBridge,
      mailCenter: needsMail ? (mailResult.data || emptyData.mailCenter) as MailCenterSnapshot : current.mailCenter,
      loading: false,
      refreshing: false,
      ready: true,
      accessDenied: false,
      error: core.error || scopedError?.message || null,
      lastUpdatedAt: new Date(),
    }));
  }, [pathname]);

  useEffect(() => {
    void load();
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      void load(session?.user || null);
    });
    return () => data.subscription.unsubscribe();
  }, [load]);

  const refresh = useCallback(async () => load(state.user, true), [load, state.user]);

  useEffect(() => {
    if (!state.ready || !state.user) return;
    const user = state.user;

    const refreshInBackground = async () => {
      if (backgroundRefreshActive.current) return;
      backgroundRefreshActive.current = true;
      try {
        await load(user, true);
      } finally {
        backgroundRefreshActive.current = false;
      }
    };
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void refreshInBackground();
    };
    const channel = supabase
      .channel(`control-bridge-leads-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "offerpsp_leads" }, () => {
        coreCache.delete(user.id);
        void refreshInBackground();
      })
      .subscribe();
    const timer = window.setInterval(() => void refreshInBackground(), 30_000);
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      void supabase.removeChannel(channel);
    };
  }, [load, state.ready, state.user]);
  const signOut = useCallback(async () => {
    if (state.user) coreCache.delete(state.user.id);
    await supabase.auth.signOut();
    setState({ ...emptyData, loading: false });
  }, [state.user]);

  const value = useMemo(() => ({ ...state, refresh, signOut }), [state, refresh, signOut]);
  return <ControlBridgeContext.Provider value={value}>{children}</ControlBridgeContext.Provider>;
}

export function useControlBridge() {
  const context = useContext(ControlBridgeContext);
  if (!context) throw new Error("useControlBridge must be used inside ControlBridgeProvider");
  return context;
}
