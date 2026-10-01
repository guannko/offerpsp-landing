// Local synthetic visual regression; no credentials, RPCs, or external writes.
import { createRoot } from "react-dom/client";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import listPlugin from "@fullcalendar/list";
import "../../src/index.css";
import "../../src/layout/BridgePaper.css";

createRoot(document.getElementById("root")!).render(<main className="bridge-paper p-6">
  <h1>Синтетическая проверка календаря — не production</h1>
  <div className="offerpsp-calendar">
    <FullCalendar plugins={[dayGridPlugin,listPlugin]} initialView="dayGridMonth"
      initialDate="2026-10-02" height="auto" firstDay={1}
      headerToolbar={{left:"prev,next",center:"title",right:"dayGridMonth,listMonth"}}
      events={[
        {id:"timed",title:"Timed task must be readable",start:"2026-10-01T19:18:00",color:"#465fff"},
        {id:"all-day",title:"All-day task must be readable",start:"2026-10-02",allDay:true,color:"#465fff"},
      ]}/>
  </div>
</main>);
