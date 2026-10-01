// Development-only visual fixture; no live data, credentials or external writes.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { ThemeProvider } from "../../src/context/ThemeContext";
import ActualWorkDocumentDesk from "../../src/components/control/WorkDocumentDesk";
import { platformModules } from "../../src/config/modules";
import type { DocumentRead, DocumentRepository } from "../../src/lib/workDocuments";
import "../../src/index.css";
import "../../src/layout/BridgePaper.css";
import "../../src/components/control/CourseOrganizer.css";
const records = new Map<string,DocumentRead>();
const repository:DocumentRepository = {
  async list() {return {documents:Array.from(records.values()).map(doc=>({id:doc.id,revision:doc.revision,title:doc.body.title,kind:doc.body.kind,links:doc.body.links,updated_at:doc.updated_at!})),total:records.size};},
  async get(id) {const doc=records.get(id);if(!doc)throw new Error("Local fixture missing document");return structuredClone(doc);},
  async save(draft) {const doc={...structuredClone(draft),revision:draft.revision+1,current_revision:draft.revision+1,history:[],updated_at:new Date().toISOString()};records.set(doc.id,doc);return doc;},
};
function WorkDocumentDesk(props:Parameters<typeof ActualWorkDocumentDesk>[0]) { return <div className="course-organizer"><ActualWorkDocumentDesk {...props}/></div>; }
export default function Fixture(){
  const [page,setPage]=useState("registry");
  return <div><div className="bridge-paper min-h-screen"><div><aside className="fixed left-0 top-0 h-screen w-[248px] border-r border-gray-200 bg-white p-4"><h2 className="mb-5 text-lg">OfferPSP / локальная проверка</h2><nav>{platformModules.filter(module=>module.enabled).map(module=><div className="menu-item menu-item-inactive" key={module.id}>{module.label}</div>)}</nav></aside></div><div className="ml-[248px]"><header className="sticky top-0 flex items-center justify-between border-b border-gray-200 bg-white p-4"><span className="text-gray-700">Синтетический макет, не production</span><div className="flex gap-2"><button className="rounded-lg border border-gray-200 p-2 text-gray-700" onClick={()=>setPage(page==="registry"?"documents":"registry")}>Реестр / документы</button></div></header><main className="bridge-content p-6">{page==="documents"?<WorkDocumentDesk repository={repository} leads={[]} providers={[]} directions={[]} onClose={()=>setPage("registry")}/>:<><h1 className="mb-5 text-3xl text-gray-900 dark:text-white">Реестр PSP</h1><div className="mb-4 flex gap-3"><input className="rounded-lg border border-gray-200 bg-white p-3 text-gray-700 dark:bg-gray-900 dark:text-white" placeholder="Найти PSP…"/><button className="rounded-lg bg-brand-600 px-4 text-white">Добавить PSP</button><button className="rounded-lg border border-gray-200 bg-white px-4 text-gray-700 dark:bg-gray-900 dark:text-white">Фильтры</button></div><section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-[#1c283b]"><h2 className="mb-4 text-2xl text-gray-900 dark:text-white">Рабочие провайдеры</h2><table className="w-full text-left text-gray-700 dark:text-gray-300"><thead className="border-b border-gray-200"><tr><th className="p-3">Компания</th><th>Условия</th><th>Следующий шаг</th></tr></thead><tbody>{["Пример A","Пример B","Пример C"].map((name,index)=><tr className="border-b border-gray-200 dark:border-gray-800" key={name}><td className="p-3 font-medium text-gray-900 dark:text-white">{name}</td><td><span className={index?"text-warning-600":"text-success-600"}>{index?"Требуют проверки":"Подтверждены"}</span></td><td><button className="rounded-lg bg-brand-50 px-3 py-2 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">Открыть карточку</button></td></tr>)}</tbody></table></section><section className="mt-5 rounded-xl border border-gray-200 bg-white p-5 dark:bg-[#1c283b]"><h2 className="text-2xl text-gray-900 dark:text-white">Контекст / следующее действие</h2><p className="mt-2 text-gray-500 dark:text-gray-400">Панели, таблицы, заголовки и кнопки используют общий слой оформления. Семантические статусы сохранены.</p><p className="mt-3 text-error-600">Пример ошибки — остаётся заметным.</p></section></>}</main></div></div></div>;
}
createRoot(document.getElementById("root")!).render(<ThemeProvider><BrowserRouter><Fixture/></BrowserRouter></ThemeProvider>);
