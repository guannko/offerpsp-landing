import { useEffect, useState } from "react";
import type { ChangeEvent } from "react";
import { extractWorkFile } from "../../lib/workDocumentFileExtractor";
import { downloadWorkOriginal, listWorkOriginals, readWorkOriginal, saveWorkOriginal } from "../../lib/workOriginalRepository";
import type { OriginalContent, WorkOriginal } from "../../lib/workDocumentFiles";

type Props={documentId:string;revision:number;editable:boolean;historical:boolean;onBusy:(busy:boolean)=>void;onAppend:(label:string,text:string)=>void};
const message=(error:unknown)=>error instanceof Error?error.message:"Операция с оригиналом не подтверждена.";
export default function WorkOriginalFiles({documentId,revision,editable,historical,onBusy,onAppend}:Props) {
  const [files,setFiles]=useState<WorkOriginal[]>([]);
  const [loading,setLoading]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [notice,setNotice]=useState<string|null>(null);
  const [view,setView]=useState<{original:OriginalContent;url:string}|null>(null);
  useEffect(()=>{if(view) return ()=>URL.revokeObjectURL(view.url);},[view]);
  useEffect(()=>{
    let active=true;setFiles([]);setError(null);setNotice(null);setView(null);
    if(revision<1) return;
    setLoading(true);
    listWorkOriginals(documentId,revision).then(result=>{if(active)setFiles(result);}).catch(cause=>{if(active)setError(message(cause));}).finally(()=>{if(active)setLoading(false);});
    return ()=>{active=false;};
  },[documentId,revision]);
  async function refresh(){setLoading(true);setError(null);try{setFiles(await listWorkOriginals(documentId,revision));}catch(cause){setError(message(cause));}finally{setLoading(false);}}
  async function upload(event:ChangeEvent<HTMLInputElement>){
    const file=event.target.files?.[0];event.target.value="";
    if(!file || !editable || revision<1 || busy)return;
    setBusy(true);onBusy(true);setError(null);setNotice("Разбираю оригинал локально…");
    try{
      const extracted=await extractWorkFile(file);
      setNotice("Сохраняю оригинал в приватное хранилище…");
      const saved=await saveWorkOriginal(documentId,revision,file,extracted);
      setFiles(current=>[...current.filter(item=>item.id!==saved.id),saved]);
      setNotice(extracted.text?"Оригинал сохранён. «В рабочий лист» добавит текст отдельно; правки нужно сохранить вручную.":"Оригинал сохранён, но текст не извлечён. Для сканов нужен OCR; здесь доступен просмотр PDF.");
    }catch(cause){setError(message(cause));setNotice(null);}
    finally{setBusy(false);onBusy(false);}
  }
  async function show(original:WorkOriginal){
    setBusy(true);onBusy(true);setError(null);
    try{const content=await readWorkOriginal(original.id);const blob=await downloadWorkOriginal(content);setView({original:content,url:URL.createObjectURL(blob)});}
    catch(cause){setError(message(cause));}finally{setBusy(false);onBusy(false);}
  }
  async function append(original:WorkOriginal){
    if(!editable || busy)return;
    setBusy(true);onBusy(true);setError(null);
    try{const content=await readWorkOriginal(original.id);onAppend(content.filename,content.extracted_text);setNotice("Текст добавлен в рабочий лист. Оригинал не изменён; сохрани правки документа.");}
    catch(cause){setError(message(cause));}finally{setBusy(false);onBusy(false);}
  }
  return <section className="workdoc-originals" aria-label="Оригинальные DOCX и PDF">
    <h4>Оригиналы DOCX / PDF</h4>
    <p>Оригиналы приватные и не заменяются правками. Извлечение текста не сохраняет точную вёрстку, подписи, комментарии или изменения Word. Проверь текст по оригиналу.</p>
    {revision<1?<p>Сначала сохрани рабочий лист, затем подключи оригинал.</p>:<>
      {!historical&&<label className="workdoc-import">Подключить DOCX / PDF<input type="file" accept=".docx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" aria-label="Подключить оригинал DOCX или PDF" disabled={!editable||busy} onChange={event=>void upload(event)}/></label>}
      <small>До 15 МБ, 20 оригиналов на лист. PDF до 100 страниц. OCR сканов здесь не включён. Подключение сохраняет файл сразу, правки листа — кнопкой «Сохранить».</small>
      <button disabled={busy||loading} onClick={()=>void refresh()}>Обновить оригиналы</button>
      {loading&&<p role="status">Загружаю список оригиналов…</p>}
      {files.map(file=><div className="workdoc-original" key={file.id}><strong>{file.filename}</strong><small>{file.format.toUpperCase()} · {(file.size_bytes/1024).toFixed(1)} КБ · {file.status==="ready"?"Оригинал сохранён":"Загрузка не подтверждена"} · приложен к v{file.attached_revision}</small>
        {file.status==="ready"?<div className="course-tools"><button disabled={busy} onClick={()=>void show(file)}>Просмотр / скачать</button><button disabled={!editable||busy} onClick={()=>void append(file)}>В рабочий лист</button></div>:<p>Повторно выбери тот же файл, чтобы завершить загрузку без дубля.</p>}
      </div>)}
      {!loading&&!files.length&&!error&&<p>Оригиналов ещё нет.</p>}
    </>}
    {error&&<p role="alert" className="course-alert">{error}</p>}{notice&&<p role="status" className="course-notice">{notice}</p>}
    {view&&<div className="workdoc-original-view"><h4>{view.original.filename}</h4><a href={view.url} download={view.original.filename}>Скачать неизменённый оригинал</a><button onClick={()=>setView(null)}>Закрыть просмотр</button>
      {view.original.format==="pdf"&&<a href={view.url} target="_blank" rel="noopener noreferrer">Открыть PDF в отдельной вкладке</a>}
      {view.original.format==="pdf"?<iframe title={`Оригинал PDF: ${view.original.filename}`} src={view.url}/>:<p>Исходный DOCX скачивается для просмотра в Word. Ниже — только извлечённый текст, без точной вёрстки.</p>}
      <details><summary>Извлечённый текст оригинала</summary><pre>{view.original.extracted_text||"Текст не извлечён — вероятно, скан."}</pre></details><small>SHA-256 проверен при чтении: {view.original.sha256}</small>
    </div>}
  </section>;
}
