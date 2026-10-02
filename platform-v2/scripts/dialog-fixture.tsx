import {useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {useDialogFocus} from '../src/hooks/useDialogFocus';
import {MemoryRouter} from 'react-router';
import OperationsCalendar from '../src/components/control/OperationsCalendar';
import type {CalendarPage} from '../src/lib/calendarEvents';

// Development-only fixture: injected calendar reader; no backend writes or RPC.
const readFixtureCalendar=async():Promise<CalendarPage>=>({events:[],has_more:false,next_offset:0,generated_at:new Date().toISOString()});
export function Nested({close}:{close:()=>void}) {
  const ref=useRef<HTMLDivElement>(null);useDialogFocus(true,ref,close);
  return <div ref={ref} role="dialog" aria-modal="true" aria-label="Вложенный диалог" tabIndex={-1}><button onClick={close}>Закрыть вложенный</button></div>;
}
export function Fixture(){
  const [open,setOpen]=useState(false),[nested,setNested]=useState(false);
  const ref=useRef<HTMLDivElement>(null);useDialogFocus(open,ref,()=>setOpen(false));
  return <><h1>Изолированный тест фокуса</h1><button onClick={()=>setOpen(true)}>Открыть проверку</button><a href="#outside">Внешняя ссылка</a>{open&&<div ref={ref} role="dialog" aria-modal="true" aria-label="Проверка фокуса" tabIndex={-1}><input aria-label="Поиск записей"/><button onClick={()=>setNested(true)}>Вложенный</button><button onClick={()=>setOpen(false)}>Закрыть проверку</button>{nested&&<Nested close={()=>setNested(false)}/>}</div>}</>;
}
createRoot(document.getElementById('root')!).render(<MemoryRouter><Fixture/><OperationsCalendar tasks={[]} onEditTask={()=>{}} onNewTask={()=>{}} readPage={readFixtureCalendar}/></MemoryRouter>);
