import { BrowserRouter, Route, Routes } from "react-router";
import { ScrollToTop } from "./components/common/ScrollToTop";
import { ControlBridgeProvider } from "./context/ControlBridgeContext";
import StaffGate from "./features/auth/StaffGate";
import AppLayout from "./layout/AppLayout";
import NotFound from "./pages/OtherPage/NotFound";
import ControlSignIn from "./pages/AuthPages/ControlSignIn";
import MerchantWorkspace from "./pages/MerchantWorkspace";
import ProviderWorkspace from "./pages/ProviderWorkspace";
import AgentWorkspace from "./pages/AgentWorkspace";
import {
  AgentsPage,
  AnalyticsPage,
  CommandCenter,
  DealDeskPage,
  InboxPage,
  MerchantsPage,
  ModulePage,
  OffersPage,
  PipelinePage,
  ProvidersPage,
} from "./pages/Platform";
import { CommunicationsWorkspace, IntelligenceWorkspace, IntegrationsWorkspace, TasksWorkspace } from "./pages/CaptainPages";
import CompliancePage from "./pages/CompliancePage";

export default function App() {
  const basename = import.meta.env.BASE_URL === "/" ? undefined : import.meta.env.BASE_URL.replace(/\/$/, "");
  return <ControlBridgeProvider><BrowserRouter basename={basename}><ScrollToTop/><Routes>
    <Route path="/signin" element={<ControlSignIn/>}/>
    <Route element={<StaffGate><AppLayout/></StaffGate>}>
      <Route index element={<CommandCenter/>}/>
      <Route path="/inbox" element={<InboxPage/>}/>
      <Route path="/pipeline" element={<PipelinePage/>}/>
      <Route path="/merchants" element={<MerchantsPage/>}/>
      <Route path="/merchants/:leadId" element={<MerchantWorkspace/>}/>
      <Route path="/psps" element={<ProvidersPage/>}/>
      <Route path="/psps/:providerId" element={<ProviderWorkspace/>}/>
      <Route path="/offers" element={<OffersPage/>}/>
      <Route path="/compliance" element={<CompliancePage/>}/>
      <Route path="/matching" element={<ModulePage module="matching"/>}/>
      <Route path="/deals" element={<DealDeskPage/>}/>
      <Route path="/intelligence" element={<IntelligenceWorkspace/>}/>
      <Route path="/communications" element={<CommunicationsWorkspace/>}/>
      <Route path="/operations" element={<TasksWorkspace/>}/>
      <Route path="/agents" element={<AgentsPage/>}/>
      <Route path="/agents/:agentId" element={<AgentWorkspace/>}/>
      <Route path="/analytics" element={<AnalyticsPage/>}/>
      <Route path="/integrations" element={<IntegrationsWorkspace/>}/>
    </Route>
    <Route path="*" element={<NotFound/>}/>
  </Routes></BrowserRouter></ControlBridgeProvider>;
}
