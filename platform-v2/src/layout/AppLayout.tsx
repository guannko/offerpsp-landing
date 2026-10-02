import { SidebarProvider, useSidebar } from "../context/SidebarContext";
import { Outlet, useLocation } from "react-router";
import AppHeader from "./AppHeader";
import Backdrop from "./Backdrop";
import AppSidebar from "./AppSidebar";
import AIBotAssistant from "../components/control/AIBotAssistant";
import { usesPaperBridgeTheme } from "../lib/bridgeTheme";
import "./BridgePaper.css";

const LayoutContent: React.FC = () => {
  const { isExpanded, isMobileOpen } = useSidebar();
  const { pathname } = useLocation();

  return (
    <div className={`min-h-screen bg-gray-50 transition-colors dark:bg-[#172235] xl:flex ${usesPaperBridgeTheme(pathname) ? "bridge-paper" : ""} ${pathname === "/" ? "course-shell" : ""}`}>
      <a href="#bridge-content" className="sr-only fixed left-3 top-3 z-[120] rounded-lg bg-white px-4 py-3 text-gray-900 focus:not-sr-only">Перейти к рабочему пространству</a>
      <div>
        <AppSidebar />
        <Backdrop />
      </div>
      <div
        className={`min-w-0 flex-1 transition-[margin] duration-200 ease-in-out ${
          isExpanded ? "lg:ml-[248px]" : "lg:ml-[68px]"
        } ${isMobileOpen ? "ml-0" : ""}`}
      >
        <AppHeader />
        <div id="bridge-content" role={pathname === "/" ? undefined : "main"} tabIndex={-1} className="bridge-content mx-auto max-w-[1800px] px-3 py-4 sm:px-5 lg:px-6">
          <Outlet />
        </div>
        <AIBotAssistant />
      </div>
    </div>
  );
};

const AppLayout: React.FC = () => {
  return (
    <SidebarProvider>
      <LayoutContent />
    </SidebarProvider>
  );
};

export default AppLayout;
