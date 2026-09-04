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
  const { isExpanded, isMobileOpen, isHovered, setIsHovered, toggleMobileSidebar } = useSidebar();
  const location = useLocation();
  const { moduleEntitlements } = useControlBridge();
  const showLabels = isExpanded || isHovered || isMobileOpen;

  return (
    <aside
      className={`fixed left-0 top-0 z-50 mt-16 flex h-screen flex-col border-r border-gray-200 bg-white px-4 text-gray-900 transition-all duration-300 dark:border-[#34435a] dark:bg-[#1c283b] lg:mt-0 ${showLabels ? "w-[290px]" : "w-[90px]"} ${isMobileOpen ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0`}
      onMouseEnter={() => !isExpanded && setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className={`flex items-center py-7 ${showLabels ? "justify-start" : "justify-center"}`}>
        <Link to="/" className="flex items-center gap-3" aria-label="OfferPSP Control Bridge">
          {showLabels ? (
            <span>
              <img src="/brand/offerpsp-logo-horizontal-transparent.png" alt="OfferPSP" className="h-10 w-auto max-w-[190px] object-contain" />
              <small className="mt-1 block text-[9px] font-semibold uppercase tracking-[0.24em] text-gray-400">Control Bridge</small>
            </span>
          ) : (
            <img src="/brand/offerpsp-logo-square-dark.png" alt="OfferPSP" className="h-11 w-11 rounded-xl object-cover shadow-theme-sm" />
          )}
        </Link>
      </div>
      <div className="flex flex-1 flex-col overflow-y-auto pb-24 no-scrollbar">
        <nav className="space-y-6">
          {(Object.keys(groupLabels) as Array<keyof typeof groupLabels>).map((group) => {
            const items = platformModules.filter((item) => item.group === group && item.enabled && (
              !item.requiresEntitlement || moduleEntitlements.some((entitlement) => entitlement.module_key === item.requiresEntitlement && entitlement.enabled)
            ));
            return <div key={group}>
              <h2 className={`mb-3 flex text-[10px] font-semibold uppercase leading-5 tracking-[0.18em] text-gray-400 ${showLabels ? "justify-start px-3" : "justify-center"}`}>{showLabels ? groupLabels[group] : <HorizontaLDots className="size-5"/>}</h2>
              <ul className="space-y-1">{items.map((item) => {
                const active = item.path === "/" ? location.pathname === "/" : location.pathname.startsWith(item.path);
                return <li key={item.id}><Link to={item.path} onClick={() => { if (isMobileOpen) toggleMobileSidebar(); }} title={!showLabels ? item.label : undefined} className={`menu-item group ${active ? "menu-item-active" : "menu-item-inactive"} ${showLabels ? "justify-start" : "justify-center"}`}><span className={`menu-item-icon-size ${active ? "menu-item-icon-active" : "menu-item-icon-inactive"}`}>{item.icon}</span>{showLabels && <><span className="menu-item-text">{item.label}</span>{item.badge && <span className="ml-auto rounded-full bg-brand-50 px-2 py-0.5 text-[9px] font-bold text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">{item.badge}</span>}</>}</Link></li>;
              })}</ul>
            </div>;
          })}
        </nav>
        {showLabels && <div className="mt-auto rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/[0.03]"><div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-success-500"/><strong className="text-xs text-gray-700 dark:text-gray-300">Production работает</strong></div><p className="mt-2 text-[11px] leading-4 text-gray-400">Control Bridge подключён к рабочим данным. Legacy-панель сохранена для аварийного отката.</p></div>}
      </div>
    </aside>
  );
}
