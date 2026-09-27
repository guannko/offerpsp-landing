import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router";
import { HorizontaLDots } from "../icons";
import { platformModules } from "../config/modules";
import { useSidebar } from "../context/SidebarContext";
import { useControlBridge } from "../context/ControlBridgeContext";

const groupLabels = {
  operations: "Операции",
  growth: "Рост и связь",
  control: "Контроль",
} as const;

export default function AppSidebar() {
  const { isExpanded, isMobileOpen, toggleMobileSidebar } = useSidebar();
  const location = useLocation();
  const { moduleEntitlements, loading, refreshing, ready, error, lastUpdatedAt } = useControlBridge();
  const [buildManifest, setBuildManifest] = useState<{ commit?: string; built_at?: string; deployment_id?: string } | null>(null);
  const showLabels = isExpanded || isMobileOpen;
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/build-manifest.json", { cache: "no-store", signal: controller.signal })
      .then((response) => response.ok ? response.json() : null)
      .then((manifest) => setBuildManifest(manifest && typeof manifest === "object" ? manifest : null))
      .catch(() => undefined);
    return () => controller.abort();
  }, []);
  const bridgeState = loading
    ? { label: "Проверяем рабочие данные", detail: "Статус ещё не подтверждён.", dot: "bg-gray-400" }
    : ready && !error
      ? { label: "Рабочие данные доступны", detail: lastUpdatedAt ? `Проверено ${lastUpdatedAt.toLocaleString("ru-RU")}.` : "Доступ подтверждён текущей сессией.", dot: "bg-success-500" }
      : ready
        ? { label: "Данные доступны частично", detail: error || "Один из запросов завершился ошибкой.", dot: "bg-warning-500" }
        : { label: "Рабочие данные недоступны", detail: error || "Подключение не подтверждено.", dot: "bg-error-500" };
  const buildLabel = buildManifest?.commit
    ? `Сборка ${buildManifest.commit.slice(0, 8)}${buildManifest.built_at ? ` · ${new Date(buildManifest.built_at).toLocaleString("ru-RU")}` : ""}`
    : "Версия сборки не подтверждена";

  return (
    <aside
      className={`fixed left-0 top-0 z-50 mt-14 flex h-[calc(100vh-3.5rem)] flex-col border-r border-gray-200 bg-white px-2.5 text-gray-900 transition-[width,transform] duration-200 dark:border-[#34435a] dark:bg-[#1c283b] lg:mt-0 lg:h-screen ${showLabels ? "w-[248px]" : "w-[68px]"} ${isMobileOpen ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0`}
    >
      <div className={`flex h-16 items-center ${showLabels ? "justify-start px-2" : "justify-center"}`}>
        <Link to="/" className="flex min-w-0 items-center gap-2.5" aria-label="OfferPSP Control Bridge">
          {showLabels ? (
            <img src="/brand/offerpsp-logo-horizontal-transparent.png" alt="OfferPSP" className="h-8 w-auto max-w-[176px] object-contain" />
          ) : (
            <img src="/brand/offerpsp-logo-square-dark.png" alt="OfferPSP" className="h-9 w-9 rounded-lg object-cover" />
          )}
        </Link>
      </div>
      <div className="flex flex-1 flex-col overflow-y-auto pb-16 no-scrollbar">
        <nav className="space-y-4">
          {(Object.keys(groupLabels) as Array<keyof typeof groupLabels>).map((group) => {
            const items = platformModules.filter((item) => item.group === group && item.enabled && (
              !item.requiresEntitlement || moduleEntitlements.some((entitlement) => entitlement.module_key === item.requiresEntitlement && entitlement.enabled)
            ));
            return <div key={group}>
              <h2 className={`mb-1.5 flex h-5 items-center text-[9px] font-semibold uppercase tracking-[0.16em] text-gray-400 ${showLabels ? "justify-start px-2.5" : "justify-center"}`}>{showLabels ? groupLabels[group] : <HorizontaLDots className="size-4"/>}</h2>
              <ul className="space-y-0.5">{items.map((item) => {
                const active = item.path === "/" ? location.pathname === "/" : location.pathname.startsWith(item.path);
                return <li key={item.id}><Link to={item.path} onClick={() => { if (isMobileOpen) toggleMobileSidebar(); }} title={!showLabels ? item.label : undefined} className={`menu-item group ${active ? "menu-item-active" : "menu-item-inactive"} ${showLabels ? "justify-start" : "justify-center"}`}><span className={`menu-item-icon-size ${active ? "menu-item-icon-active" : "menu-item-icon-inactive"}`}>{item.icon}</span>{showLabels && <><span className="menu-item-text">{item.label}</span>{item.badge && <span className="ml-auto rounded-full bg-brand-50 px-2 py-0.5 text-[9px] font-bold text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">{item.badge}</span>}</>}</Link></li>;
              })}</ul>
            </div>;
          })}
        </nav>
        <div className={`mt-auto mb-3 flex items-center rounded-lg border border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-white/[0.03] ${showLabels ? "gap-2 px-2.5 py-2" : "justify-center p-2"}`} title={`${bridgeState.label}. ${bridgeState.detail} ${buildLabel}`}><span className={`h-2 w-2 shrink-0 rounded-full ${bridgeState.dot}`}/>{showLabels && <div className="min-w-0"><strong className="block truncate text-[11px] text-gray-700 dark:text-gray-300">{bridgeState.label}{refreshing ? " · обновление" : ""}</strong><span className="block truncate text-[9px] text-gray-400">{buildLabel}</span></div>}</div>
      </div>
    </aside>
  );
}
