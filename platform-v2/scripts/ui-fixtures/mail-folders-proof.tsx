import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { HelmetProvider } from "react-helmet-async";
import { CommunicationsWorkspace } from "../../src/pages/CaptainPages";
import "../../src/index.css";
import "../../src/layout/BridgePaper.css";

createRoot(document.getElementById("root")!).render(<HelmetProvider><MemoryRouter initialEntries={["/communications"]}>
  <main className="bridge-paper p-6"><p className="mb-4 text-sm">QA: только синтетическая почта в памяти. Нет сети, отправки и production-данных.</p><CommunicationsWorkspace/></main>
</MemoryRouter></HelmetProvider>);
