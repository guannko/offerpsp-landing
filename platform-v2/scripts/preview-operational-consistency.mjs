// Opt-in local visual harness. No production authentication, network or writes.
import { createServer } from "vite";

const merchantId = "10000000-0000-4000-8000-000000000001";
const now = new Date().toISOString();
const fixture = {
  leads: [{ lead_id: merchantId, company: "Railon · local fixture", name: "Fixture contact", work_email: "contact@example.test", company_url: null, status: "needs_clarification", record_state: "active", assigned_to: "staff-fixture", geos: "Latam", target_geos: [], methods: "Cards — to clarify", requested_methods: [], monthly_volume: "Not sure yet", submitted_at: now }],
  providers: [], organizations: [], assignments: [], agentMarginPolicies: [], ingestionJobs: [],
  routes: [
    { route_id: "20000000-0000-4000-8000-000000000001", status: "published", provider_id: "30000000-0000-4000-8000-000000000001", provider_name: "Working PSP", client_title: "Working route", geos: ["BR"], currencies: ["BRL"], methods: ["PIX"], flow: "payin" },
    { route_id: "20000000-0000-4000-8000-000000000002", status: "published", provider_id: "6e531900-901c-4d5d-8887-0679db9b335d", provider_name: "PaySiski", client_title: "QA ONLY · WinPiski", geos: ["GB"], currencies: ["EUR"], methods: ["CARDS"], flow: "payin" },
  ],
  moduleEntitlements: [{ module_key: "pre_compliance", enabled: true }],
  complianceCases: [{ lead_id: merchantId, case_status: "manual_review" }],
  captainsBridge: { casino_leads: [], psp_providers: [], email_drafts: [], telegram_log: [], bot_tasks: [], offerpsp_tasks: [{ id: "review-fixture", lead_id: merchantId, title: "Review dossier · local fixture", status: "pending", automation_ref: "intake_review_v1", due_at: new Date(Date.now() + 86400000).toISOString() }] },
  mailCenter: { metrics: {}, templates: [], attachments: [], messages: [], threads: [
    { id: "read-mail", subject: "PressPay · read but not answered", participant_email: "assaf@presspay.example", status: "open", counterparty_type: "general", unread_count: 0, last_message_at: now },
    { id: "archive-mail", subject: "ARCHIVED MUST NOT APPEAR", participant_email: "archive@example.test", status: "archived", counterparty_type: "general", unread_count: 9, follow_up_at: "2026-08-20", last_message_at: now },
  ] },
  loading: false, refreshing: false, ready: true, error: null, commissionSummary: {},
};
const bridgeModule = `const fixture=${JSON.stringify(fixture)};
fixture.refresh=async()=>{};fixture.signOut=async()=>{};
export function useControlBridge(){return fixture;}
export function ControlBridgeProvider({children}){return children;}`;
const mockModule = `
const data={
  list_offerpsp_route_matches:[],
  get_offerpsp_entity_workspace:{contacts:[],documents:[],activities:[],tasks:[],conversations:[],emails:[]},
  get_offerpsp_staff_request_workspace:{dossier:{},shortlist_items:[],provider_reviews:[],introductions:[]},
  get_offerpsp_deal_history:[],
  get_offerpsp_pre_compliance_case:{case:{id:'case-fixture',lead_id:'${merchantId}',case_status:'manual_review',risk_level:'unknown',completeness_score:36,missing_information:['Website','Currencies','Volume'],red_flags:[],summary:'Local fixture — needs a human decision'},signals:{},checks:[],decisions:[]},
  get_offerpsp_company_workspace:{organization:null,profile_completion:0,documents:[]},
};
export const hasSupabaseConfig=true;
export const supabase={
  auth:{getSession:async()=>({data:{session:null}})},
  rpc:async(name)=>{if(name==='ensure_offerpsp_company_workspace')return {data:null,error:{message:'Company creation deliberately disabled in this read-only fixture'}};if(!/^(get_|list_)/.test(name))throw new Error('Writes disabled in visual fixture');return {data:data[name]||{},error:null};},
  from:()=>{const query={select:()=>query,eq:()=>query,neq:()=>query,order:()=>query,limit:()=>query,maybeSingle:()=>Promise.resolve({data:null,error:null}),then:(resolve,reject)=>Promise.resolve({data:[],error:null}).then(resolve,reject)};return query;}
};`;
const entry = `import React from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter,Routes,Route} from 'react-router';
import {AppWrapper} from '/src/components/common/PageMeta.tsx';
import Today from '/src/pages/TodayWorkspace.tsx';
import Merchant from '/src/pages/MerchantWorkspace.tsx';
import '/src/index.css';
globalThis.fetch=async()=>Response.json({success:true,checked_at:new Date().toISOString(),checks:{}});
const view=new URL(location.href).searchParams.get('view')||'today';
const path=view==='today'?'/':'/merchants/${merchantId}?tab='+view;
createRoot(document.getElementById('root')).render(React.createElement(AppWrapper,null,React.createElement(MemoryRouter,{initialEntries:[path]},React.createElement(Routes,null,React.createElement(Route,{path:'/',element:React.createElement(Today)}),React.createElement(Route,{path:'/merchants/:leadId',element:React.createElement(Merchant)})))));`;
const server = await createServer({
  server: { host: "127.0.0.1", port: 4187, strictPort: true },
  plugins: [{
    name: "local-readonly-operational-fixture", enforce: "pre",
    resolveId(id) { if (id === "/__operational-fixture-entry.mjs") return "\0operational-fixture-entry"; },
    load(id) { if (id === "\0operational-fixture-entry") return entry; },
    transform(_source, id) {
      if (id.endsWith("/src/context/ControlBridgeContext.tsx")) return bridgeModule;
      if (id.endsWith("/src/lib/supabase.ts")) return mockModule;
    },
    configureServer(vite) {
      vite.middlewares.use((request, response, next) => {
        const pathname = new URL(request.url, "http://localhost").pathname;
        if (pathname !== "/__operational-fixture") { next(); return; }
        void vite.transformIndexHtml(request.url, '<html><head><meta charset="utf-8"><title>LOCAL READ-ONLY QA</title></head><body><div style="background:#ffedd5;padding:12px;font:14px system-ui">LOCAL FIXTURE · No production API or outbound actions</div><main id="root" style="padding:24px"></main><script type="module" src="/__operational-fixture-entry.mjs"></script></body></html>')
          .then((html) => { response.setHeader("Content-Type", "text/html"); response.end(html); });
      });
    },
  }],
});
await server.listen();
console.log("Local read-only visual fixture: http://127.0.0.1:4187/__operational-fixture?view=today (or company/profile/matching/compliance)");
