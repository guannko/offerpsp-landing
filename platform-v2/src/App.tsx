import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { ScrollToTop } from "./components/common/ScrollToTop";
import AnalyticsBridge from "./components/analytics/AnalyticsBridge";
import { ControlBridgeProvider } from "./context/ControlBridgeContext";
import StaffGate from "./features/auth/StaffGate";
import AppLayout from "./layout/AppLayout";
import NotFound from "./pages/OtherPage/NotFound";
import ControlSignIn from "./pages/AuthPages/ControlSignIn";
const MerchantWorkspace = lazy(() => import("./pages/MerchantWorkspace"));
const ProviderWorkspace = lazy(() => import("./pages/ProviderWorkspace"));
const AgentWorkspace = lazy(() => import("./pages/AgentWorkspace"));
const CompliancePage = lazy(() => import("./pages/CompliancePage"));
const SeoGeoPage = lazy(() => import("./pages/SeoGeoPage"));
const platformPage = <T extends keyof typeof import("./pages/Platform")>(name: T) =>
  lazy(() => import("./pages/Platform").then((module) => ({ default: module[name] })));
const captainPage = <T extends keyof typeof import("./pages/CaptainPages")>(name: T) =>
  lazy(() => import("./pages/CaptainPages").then((module) => ({ default: module[name] })));
const AgentsPage = platformPage("AgentsPage");
const AnalyticsPage = platformPage("AnalyticsPage");
const CommandCenter = platformPage("CommandCenter");
const DealDeskPage = platformPage("DealDeskPage");
const InboxPage = platformPage("InboxPage");
const MerchantsPage = platformPage("MerchantsPage");
const OffersPage = platformPage("OffersPage");
const PipelinePage = platformPage("PipelinePage");
const ProvidersPage = platformPage("ProvidersPage");
const CasinosWorkspace = captainPage("CasinosWorkspace");
const CommunicationsWorkspace = captainPage("CommunicationsWorkspace");
const IntegrationsWorkspace = captainPage("IntegrationsWorkspace");
const TasksWorkspace = captainPage("TasksWorkspace");

function RouteFallback() {
  return <div className="p-8 text-sm text-gray-500 dark:text-gray-400">Загружаю рабочий раздел…</div>;
}

export default function App() {
  const basename = import.meta.env.BASE_URL === "/" ? undefined : import.meta.env.BASE_URL.replace(/\/$/, "");
  return <BrowserRouter basename={basename}><ControlBridgeProvider><ScrollToTop/><AnalyticsBridge/><Suspense fallback={<RouteFallback/>}><Routes>
    <Route path="/signin" element={<ControlSignIn/>}/>
    <Route element={<StaffGate><AppLayout/></StaffGate>}>
      <Route index element={<CommandCenter/>}/>
      <Route path="/inbox" element={<InboxPage/>}/>
      <Route path="/pipeline" element={<PipelinePage/>}/>
      <Route path="/merchants" element={<MerchantsPage/>}/>
      <Route path="/merchants/:leadId" element={<MerchantWorkspace/>}/>
      <Route path="/casinos" element={<CasinosWorkspace/>}/>
      <Route path="/psps" element={<ProvidersPage/>}/>
      <Route path="/psps/:providerId" element={<ProviderWorkspace/>}/>
      <Route path="/offers" element={<OffersPage/>}/>
      <Route path="/compliance" element={<CompliancePage/>}/>
      <Route path="/matching" element={<Navigate to="/merchants" replace/>}/>
      <Route path="/deals" element={<DealDeskPage/>}/>
      <Route path="/intelligence" element={<Navigate to="/casinos" replace/>}/>
      <Route path="/communications" element={<CommunicationsWorkspace/>}/>
      <Route path="/operations" element={<TasksWorkspace/>}/>
      <Route path="/agents" element={<AgentsPage/>}/>
      <Route path="/agents/:agentId" element={<AgentWorkspace/>}/>
      <Route path="/analytics" element={<AnalyticsPage/>}/>
      <Route path="/seo-geo" element={<SeoGeoPage/>}/>
      <Route path="/integrations" element={<IntegrationsWorkspace/>}/>
    </Route>
    <Route path="*" element={<NotFound/>}/>
  </Routes></Suspense></ControlBridgeProvider></BrowserRouter>;
}
