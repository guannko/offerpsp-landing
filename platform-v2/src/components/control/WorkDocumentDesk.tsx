import { useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { Link, useNavigate } from "react-router";
import { blockLabels, copyWorkDocument, createDocumentBlock, documentFromBackup, documentKindLabels, documentPlainText, moveDocumentBlock, safeDocumentUrl, validateWorkDocument } from "../../lib/workDocuments";
import type { BlockType, DocumentBlock, DocumentRead, DocumentRepository, DocumentSummary, DocumentVersion, WorkDocument, WorkDocumentBody } from "../../lib/workDocuments";
import { appendDocumentTemplate, createDocumentFromTemplate, documentTemplates } from "../../lib/documentTemplates";
import type { DocumentTemplateId } from "../../lib/documentTemplates";
import DocumentTemplateGallery from "./DocumentTemplateGallery";
import WorkOriginalFiles from "./WorkOriginalFiles";
import { appendOriginalText } from "../../lib/workDocumentFiles";
import type { CourseDirection } from "../../lib/coursePlan";
import type { Lead, Provider } from "../../types/offerpsp";
import "./WorkDocumentDesk.css";

type Props = { repository: DocumentRepository; leads: Lead[]; providers: Provider[]; directions: CourseDirection[]; onClose: () => void };
const date = (value: string | null) => value ? new Date(value).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "ещё не сохранён";
const errorMessage = (cause: unknown) => cause instanceof Error ? cause.message : "Операция не подтверждена. Документ остался в редакторе.";
function GrowingText({ value, onChange, label, heading = false, disabled = false, maxLength = 50000 }: { value: string; onChange: (text: string) => void; label: string; heading?: boolean; disabled?: boolean; maxLength?: number }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { const area = ref.current; if (area) { area.style.height = "0px"; area.style.height = `${Math.max(heading ? 42 : 72, area.scrollHeight)}px`; } }, [value, heading]);
  return <textarea ref={ref} className={heading ? "workdoc-heading-input" : "workdoc-text-input"} aria-label={label} placeholder={heading ? "Название раздела…" : "Начни писать…"} value={value} maxLength={maxLength} disabled={disabled} onChange={(event) => onChange(event.target.value)}/>;
}
function BlockPreview({ block }: { block: DocumentBlock }) {
  if (block.type === "heading") return <h2>{block.text}</h2>;
  if (block.type === "table") return <div className="workdoc-table-scroll"><table><tbody>{block.rows?.map((row, index) => <tr key={index}>{row.map((cell, column) => index === 0 ? <th key={column}>{cell}</th> : <td key={column}>{cell}</td>)}</tr>)}</tbody></table></div>;
  if (block.type === "list" || block.type === "checklist") return <ul className={block.type === "checklist" ? "workdoc-preview-checks" : ""}>{block.items?.map((item, index) => <li key={index}>{block.type === "checklist" ? `${item.checked ? "☑" : "☐"} ` : ""}{item.text}</li>)}</ul>;
  if (block.type === "link") return safeDocumentUrl(block.url || "") ? <a href={block.url} target="_blank" rel="noopener noreferrer">{block.label || block.url}</a> : <p>Ссылка не задана или недопустима.</p>;
  return <p className={block.type === "callout" ? "workdoc-callout" : ""}>{block.text}</p>;
}

export default function WorkDocumentDesk({ repository, leads, providers, directions, onClose }: Props) {
  const navigate = useNavigate();
  const [draft, setDraft] = useState<WorkDocument | null>(null);
  const [baseline, setBaseline] = useState("");
  const [sealedSource, setSealedSource] = useState(false);
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [history, setHistory] = useState<DocumentVersion[]>([]);
  const [historical, setHistorical] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [screen, setScreen] = useState<"templates" | "library" | "editor">("templates");
  const [insertTemplate, setInsertTemplate] = useState<DocumentTemplateId>("note");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [undo, setUndo] = useState<WorkDocumentBody[]>([]);
  const [redo, setRedo] = useState<WorkDocumentBody[]>([]);
  const [pending, setPending] = useState<{ message: string; proceed: () => void } | null>(null);
  const [exportCopy, setExportCopy] = useState<{ content: string; url: string; filename: string; format: "txt" | "json" } | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const proceedRef = useRef<HTMLButtonElement>(null);
  const dirty = Boolean(draft && !historical && (draft.revision === 0 || JSON.stringify(draft.body) !== baseline));
  const editable = Boolean(draft && !historical && !busy);
  function guardAction(action: () => void) {
    if (busy) { setNotice("Дождись завершения операции с документом."); return; }
    if (dirty) setPending({ message: "В документе есть несохранённые изменения. Покинуть его без сохранения? Можно остаться и сначала сохранить или выгрузить TXT/JSON.", proceed: action });
    else action();
  }
  function confirmChange(message: string, action: () => void) { setPending({ message, proceed: action }); }
  useEffect(() => { if (pending) cancelRef.current?.focus(); }, [pending]);
  useEffect(() => () => { if (exportCopy) URL.revokeObjectURL(exportCopy.url); }, [exportCopy]);

  useEffect(() => {
    let active = true;
    setReady(false); setLoading(true);
    repository.list(0).then((result) => {
      if (active) { setDocuments(result.documents); setTotal(result.total); setReady(true); }
    }).catch((cause) => { if (active) setError(`Хранилище документов не загружено; сохранение отключено. ${errorMessage(cause)}`); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [repository]);
  useEffect(() => {
    if (!dirty && !busy) return;
    const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    const navigation = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      const anchor = event.target.closest("a");
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download") || anchor.origin !== window.location.origin || event.ctrlKey || event.metaKey || event.shiftKey || event.button !== 0) return;
      event.preventDefault(); event.stopPropagation();
      if (busy) { setNotice("Дождись завершения операции с документом."); return; }
      const path = `${anchor.pathname}${anchor.search}${anchor.hash}`;
      setPending({ message: "Есть несохранённый документ. Перейти без сохранения?", proceed: () => navigate(path) });
    };
    window.addEventListener("beforeunload", unload); document.addEventListener("click", navigation, true);
    return () => { window.removeEventListener("beforeunload", unload); document.removeEventListener("click", navigation, true); };
  }, [dirty, busy, navigate]);

  function update(body: WorkDocumentBody) { if (editable && draft) { setUndo((stack) => [...stack, draft.body].slice(-20)); setRedo([]); setDraft({ ...draft, body }); setNotice(null); setExportCopy(null); } }
  function undoEdit() { if (!draft || !editable || !undo.length) return; setRedo((stack) => [...stack, draft.body]); setDraft({ ...draft, body: undo[undo.length - 1] }); setUndo(undo.slice(0, -1)); setNotice(null); setExportCopy(null); }
  function redoEdit() { if (!draft || !editable || !redo.length) return; setUndo((stack) => [...stack, draft.body]); setDraft({ ...draft, body: redo[redo.length - 1] }); setRedo(redo.slice(0, -1)); setNotice(null); setExportCopy(null); }
  function changeBlock(block: DocumentBlock) { if (draft) update({ ...draft.body, blocks: draft.body.blocks.map((item) => item.id === block.id ? block : item) }); }
  function create(template: DocumentTemplateId, originals = false) {
    if (busy) return;
    guardAction(() => {
      setDraft(createDocumentFromTemplate(template)); setBaseline(""); setSealedSource(false); setHistory([]); setHistorical(false); setPreview(false); setScreen("editor"); setError(null); setNotice(null);
      setUndo([]); setRedo([]); setExportCopy(null);
      setContextOpen(originals);
    });
  }
  function acceptDocument(document: DocumentRead) {
    setDraft(document); setBaseline(JSON.stringify(document.body)); setSealedSource(Boolean(document.body.source)); setHistory(document.history);
    setHistorical(document.revision !== document.current_revision); setPreview(document.revision !== document.current_revision); setScreen("editor"); setNotice(null);
    setUndo([]); setRedo([]);
    setExportCopy(null);
  }
  function open(id: string, revision?: number) {
    if (busy) return;
    guardAction(() => { void loadDocument(id, revision); });
  }
  async function loadDocument(id: string, revision?: number) {
    setBusy(true); setError(null);
    try { acceptDocument(await repository.get(id, revision)); }
    catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  }
  async function refreshLibrary(nextOffset = offset) {
    if (busy) return;
    setBusy(true); setError(null);
    try { const result = await repository.list(nextOffset); setDocuments(result.documents); setTotal(result.total); setOffset(nextOffset); setReady(true); }
    catch (cause) { setError(`Не удалось обновить список документов. ${errorMessage(cause)}`); }
    finally { setBusy(false); }
  }
  async function save() {
    if (!draft || !ready || busy || historical) return;
    const invalid = validateWorkDocument(draft.body);
    if (invalid) { setError(invalid); return; }
    setBusy(true); setError(null); setNotice(null);
    try {
      const saved = await repository.save(draft);
      if (saved.id !== draft.id || saved.revision !== draft.revision + 1 || validateWorkDocument(saved.body)) throw new Error("Ответ сохранения некорректен. Не закрывай редактор: сохранение требует проверки.");
      setDraft(saved); setBaseline(JSON.stringify(saved.body)); setSealedSource(Boolean(saved.body.source));
      setUndo([]); setRedo([]);
      setHistory([{ revision: saved.revision, created_at: saved.updated_at || new Date().toISOString() }, ...history].slice(0, 100));
      setNotice(`Сохранено в рубке · версия ${saved.revision}.`);
      try { const result = await repository.list(0); setDocuments(result.documents); setTotal(result.total); setOffset(0); }
      catch (cause) { setError(`Документ сохранён, но список не обновился: ${errorMessage(cause)}`); }
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  }
  function copy() {
    if (!draft || busy) return;
    setDraft(copyWorkDocument(draft)); setBaseline(""); setSealedSource(Boolean(draft.body.source)); setHistory([]); setHistorical(false); setPreview(false); setNotice("Рабочая копия открыта. Копируется текст, но не прикреплённые DOCX/PDF: оригиналы остаются в исходном документе. Копию нужно сохранить."); setError(null);
    setUndo([]); setRedo([]);
    setExportCopy(null);
  }
  function add(type: BlockType) { if (draft && draft.body.blocks.length < 100) update({ ...draft.body, blocks: [...draft.body.blocks, createDocumentBlock(type)] }); }
  function insertBlueprint() {
    if (!draft || !editable) return;
    try { update(appendDocumentTemplate(draft.body, insertTemplate)); setError(null); setNotice("Заготовка добавлена в конец листа. Твой текст, связи и исходник сохранены; все новые разделы можно менять."); }
    catch (cause) { setError(errorMessage(cause)); }
  }
  function appendFileText(label: string, text: string) {
    if (!draft || historical) throw new Error("Открой рабочую версию документа.");
    // The upload panel holds the busy lock while calling back. Build the edit
    // atomically rather than routing through the disabled editor controls.
    const body = appendOriginalText(draft.body, label, text, !sealedSource);
    setUndo((stack) => [...stack, draft.body].slice(-20)); setRedo([]);
    setDraft({ ...draft, body }); setExportCopy(null); setError(null);
    setNotice("Текст оригинала добавлен в рабочие блоки. Сохрани изменения; оригинальный файл не изменён.");
  }
  function download(format: "txt" | "json") {
    if (!draft) return;
    const body = format === "txt" ? documentPlainText(draft.body) : JSON.stringify({ format: "offerpsp-work-document", body: draft.body });
    const url = URL.createObjectURL(new Blob([body], { type: format === "txt" ? "text/plain;charset=utf-8" : "application/json" }));
    const filename = `${Array.from(draft.body.title.replace(/[<>:"/\\|?*]/g, "_")).filter((char) => char.charCodeAt(0) >= 32).join("").slice(0, 100) || "document"}.${format}`;
    setExportCopy({ content: body, url, filename, format }); setNotice(null);
  }
  async function importText(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file || !draft || !editable || sealedSource || draft.body.blocks.length >= 100) return;
    if (!file.name.toLowerCase().endsWith(".txt") || file.size > 800000) { setError("Можно загрузить только TXT до 800 КБ; текст исходника — до 200 000 символов."); return; }
    setBusy(true); setError(null);
    try {
      const text = await file.text();
      if (text.length > 200000) throw new Error("Текст исходника превышает 200 000 символов.");
      const chunks = text.match(/[\s\S]{1,50000}/g) || [""];
      if (draft.body.blocks.length + chunks.length > 100) throw new Error("В документе недостаточно места для блоков исходника.");
      setUndo((stack) => [...stack, draft.body].slice(-20)); setRedo([]);
      setExportCopy(null);
      setDraft({ ...draft, body: { ...draft.body, source: { label: file.name.slice(0, 200), text, url: "" }, blocks: [...draft.body.blocks, ...chunks.map((chunk) => ({ ...createDocumentBlock("text"), text: chunk }))] } });
      setNotice("TXT добавлен как исходник и рабочий текст. После сохранения снимок исходника станет неизменяемым; блоки можно править.");
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  }
  const selectedLead = leads.find((item) => item.lead_id === draft?.body.links.lead_id);
  async function importBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file || busy) return;
    guardAction(() => { void loadBackup(file); });
  }
  async function loadBackup(file: File) {
    if (!file.name.toLowerCase().endsWith(".json") || file.size > 1200000) { setError("Выбери JSON-копию OfferPSP до 1,2 МБ."); return; }
    setBusy(true); setError(null);
    try {
      const document = documentFromBackup(await file.text());
      setDraft(document); setBaseline(""); setSealedSource(Boolean(document.body.source)); setHistory([]); setHistorical(false); setPreview(false); setScreen("editor"); setUndo([]); setRedo([]);
      setExportCopy(null);
      setNotice("JSON восстановлен как новая рабочая копия. Сохранённые документы не перезаписаны; проверь связи и сохрани копию.");
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  }
  function appendSourceText() {
    if (!draft?.body.source?.text || !editable) return;
    const chunks = draft.body.source.text.match(/[\s\S]{1,50000}/g) || [];
    if (draft.body.blocks.length + chunks.length > 100) { setError("Недостаточно места для блоков исходника."); return; }
    update({ ...draft.body, blocks: [...draft.body.blocks, ...chunks.map((text) => ({ ...createDocumentBlock("text"), text }))] });
    setNotice("Текст исходника добавлен в конец рабочего документа. Снимок исходника не изменён.");
  }
  const selectedProvider = providers.find((item) => item.id === draft?.body.links.provider_id);

  return <div className="workdoc-desk"><div inert={Boolean(pending)}>
    <div className="course-toolbar workdoc-topbar"><div className="course-tools"><button disabled={busy} onClick={() => guardAction(onClose)}>← Мой курс</button><button disabled={busy} aria-pressed={screen === "templates"} onClick={() => setScreen("templates")}>Новый документ</button><button disabled={busy} aria-pressed={screen === "library"} onClick={() => setScreen("library")}>Мои документы</button>{draft && screen !== "editor" && <button disabled={busy} onClick={() => setScreen("editor")}>Продолжить документ</button>}</div><div className="course-tools"><span className="course-muted">Только staff · ничего не отправляется автоматически</span>{draft && screen === "editor" && <button disabled={busy} aria-expanded={contextOpen} onClick={() => setContextOpen(!contextOpen)}>Контекст / DOCX / PDF {contextOpen ? "−" : "+"}</button>}</div></div>
    {error && <p role="alert" className="course-alert">{error}</p>}
    {notice && <p role="status" className="course-notice">{notice}</p>}
    {screen === "templates" && <><DocumentTemplateGallery busy={busy} onCreate={create}/><div className="course-tools"><button disabled={busy} onClick={() => create("blank", true)}>Начать работу с DOCX / PDF</button><small className="course-muted">Создай и сохрани лист, затем подключи оригинал в контексте справа.</small></div></>}
    {draft && screen !== "editor" && dirty && <p className="course-caption">У тебя открыт несохранённый лист. Он остаётся в редакторе: нажми «Продолжить документ» или сохрани его перед созданием другого.</p>}
    {exportCopy && screen === "editor" && <section className="workdoc-export" aria-label="Выгрузка документа"><div className="course-section-heading"><h3>Копия для выгрузки</h3><button onClick={() => setExportCopy(null)}>Закрыть выгрузку</button></div><p>Это рабочий текст, включая внутренние условия и снимок текста в JSON. Прикреплённые DOCX/PDF не входят в выгрузку: скачай их отдельно в контексте. Это не автоматически обезличенная клиентская версия.</p><a className="course-primary" href={exportCopy.url} download={exportCopy.filename}>Скачать {exportCopy.filename}</a><textarea aria-label={exportCopy.format === "json" ? "Текст JSON-копии" : "Текст TXT-копии"} readOnly value={exportCopy.content} onFocus={(event) => event.target.select()}/></section>}
    {screen === "library" && <section className="workdoc-library" aria-label="Библиотека документов">
      <div className="course-section-heading"><div><span className="course-eyebrow">Рабочее пространство</span><h2>Мои документы</h2></div><button disabled={busy || loading} onClick={() => void refreshLibrary()}>Обновить список</button></div>
      <label className="workdoc-backup-import">Восстановить свою JSON-копию<input type="file" accept=".json,application/json" aria-label="Восстановить JSON-копию" disabled={busy} onChange={(event) => void importBackup(event)}/></label>
      {loading ? <p className="course-empty">Загружаю документы…</p> : documents.length ? <div className="workdoc-library-list">{documents.map((document) => <button key={document.id} disabled={busy} onClick={() => void open(document.id)}><strong>{document.title}</strong><span>{documentKindLabels[document.kind]} · v{document.revision} · {date(document.updated_at)}</span></button>)}</div> : <p className="course-empty">{ready ? "Сохранённых документов пока нет. Начни с чистого листа или шаблона." : "Хранилище недоступно. Можно собрать черновик и выгрузить его; сохранение пока отключено."}</p>}
      {total > 50 && <div className="course-tools"><button disabled={busy || offset === 0} onClick={() => void refreshLibrary(Math.max(0, offset - 50))}>Предыдущие</button><span className="course-muted">{offset + 1}–{Math.min(offset + 50, total)} из {total}</span><button disabled={busy || offset + 50 >= total} onClick={() => void refreshLibrary(offset + 50)}>Следующие</button></div>}
    </section>}
    {draft && screen === "editor" ? <>
      <div className="workdoc-ribbon" aria-label="Конструктор документа"><div className="course-tools"><button className="course-primary" disabled={!ready || busy || historical || !dirty} onClick={() => void save()}>{busy ? "Подожди…" : "Сохранить"}</button><button aria-label="Отменить правку документа" disabled={!editable || !undo.length} onClick={undoEdit}>↶</button><button aria-label="Повторить правку документа" disabled={!editable || !redo.length} onClick={redoEdit}>↷</button><button disabled={busy || historical} onClick={() => setPreview(!preview)}>{preview ? "Редактировать" : "Просмотр"}</button><button disabled={busy} onClick={copy}>Рабочая копия</button><button onClick={() => download("txt")}>TXT</button><button onClick={() => download("json")}>JSON</button></div><span role="status" className="course-muted">{historical ? `История · v${draft.revision} · только просмотр` : dirty ? "Есть несохранённые изменения" : `Сохранено · v${draft.revision} · ${date(draft.updated_at)}`}</span>
        {!preview && !historical && <><div className="workdoc-block-palette">{(Object.keys(blockLabels) as BlockType[]).map((type) => <button key={type} disabled={!editable || draft.body.blocks.length >= 100} onClick={() => add(type)}>+ {blockLabels[type]}</button>)}</div><div className="workdoc-insert-template"><label>Вставить заготовку<select aria-label="Заготовка для вставки" value={insertTemplate} disabled={!editable} onChange={(event) => setInsertTemplate(event.target.value as DocumentTemplateId)}>{documentTemplates.filter((template) => template.id !== "blank").map((template) => <option key={template.id} value={template.id}>{template.title}</option>)}</select></label><button disabled={!editable} onClick={insertBlueprint}>Добавить в лист</button><small>Добавит разделы, не заменяя написанное.</small></div></>}
      </div>
      <div className={`workdoc-workspace${contextOpen ? " with-context" : ""}`}>
        <article className="workdoc-sheet" aria-label={preview || historical ? "Просмотр документа" : "Редактор документа"}>
          <span className="course-eyebrow">{historical ? "Историческая версия" : "Универсальный рабочий лист"}</span>
          {preview || historical ? <h1>{draft.body.title}</h1> : <input className="workdoc-title" aria-label="Название документа" value={draft.body.title} maxLength={200} disabled={!editable} onChange={(event) => update({ ...draft.body, title: event.target.value })}/>}
          {draft.body.kind === "contract" && <p className="workdoc-contract-note">Рабочий проект, не подписанный договор. Пустые разделы — не согласованные условия; содержание и юридические формулировки требуют проверки.</p>}
          {draft.body.blocks.map((block, index) => <section key={block.id} className={`workdoc-block workdoc-block-${block.type}`}>
            {!preview && !historical && <div className="workdoc-block-bar"><span>{index + 1} · {blockLabels[block.type]}</span><div className="course-tools"><button aria-label={`Поднять блок ${index + 1}`} disabled={!editable || index === 0} onClick={() => update({ ...draft.body, blocks: moveDocumentBlock(draft.body.blocks, block.id, -1) })}>↑</button><button aria-label={`Опустить блок ${index + 1}`} disabled={!editable || index === draft.body.blocks.length - 1} onClick={() => update({ ...draft.body, blocks: moveDocumentBlock(draft.body.blocks, block.id, 1) })}>↓</button><button aria-label={`Дублировать блок ${index + 1}`} disabled={!editable || draft.body.blocks.length >= 100} onClick={() => update({ ...draft.body, blocks: [...draft.body.blocks.slice(0, index + 1), { ...structuredClone(block), id: crypto.randomUUID() }, ...draft.body.blocks.slice(index + 1)] })}>Копия</button><button aria-label={`Удалить блок ${index + 1}`} disabled={!editable} onClick={() => confirmChange("Убрать этот блок из рабочей версии? Сохранённые версии останутся в истории.", () => update({ ...draft.body, blocks: draft.body.blocks.filter((item) => item.id !== block.id) }))}>×</button></div></div>}
            {preview || historical ? <BlockPreview block={block}/> : <>
              {["text", "heading", "callout"].includes(block.type) && <GrowingText value={block.text || ""} label={`Блок ${index + 1}: ${blockLabels[block.type]}`} heading={block.type === "heading"} disabled={!editable} onChange={(text) => changeBlock({ ...block, text })}/>}
              {(block.type === "list" || block.type === "checklist") && <div className="workdoc-items">{block.items?.map((item, itemIndex) => <div className="workdoc-item" key={itemIndex}>{block.type === "checklist" ? <input type="checkbox" aria-label={`Готовность пункта ${itemIndex + 1} блока ${index + 1}`} disabled={!editable} checked={item.checked} onChange={(event) => changeBlock({ ...block, items: block.items?.map((entry, position) => position === itemIndex ? { ...entry, checked: event.target.checked } : entry) })}/> : <span>•</span>}<GrowingText value={item.text} maxLength={2000} label={`Пункт ${itemIndex + 1} блока ${index + 1}`} disabled={!editable} onChange={(text) => changeBlock({ ...block, items: block.items?.map((entry, position) => position === itemIndex ? { ...entry, text } : entry) })}/><button aria-label={`Убрать пункт ${itemIndex + 1} блока ${index + 1}`} disabled={!editable} onClick={() => changeBlock({ ...block, items: block.items?.filter((_, position) => position !== itemIndex) })}>×</button></div>)}<button disabled={!editable || (block.items?.length || 0) >= 100} onClick={() => changeBlock({ ...block, items: [...(block.items || []), { text: "", checked: false }] })}>+ Пункт</button><small className="course-muted">Пункты не создают операционные задачи и не запускают бота.</small></div>}
              {block.type === "table" && <><div className="workdoc-table-scroll"><table><tbody>{block.rows?.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, column) => <td key={column}><textarea aria-label={`Таблица ${index + 1}, строка ${rowIndex + 1}, столбец ${column + 1}`} value={cell} maxLength={2000} disabled={!editable} onChange={(event) => changeBlock({ ...block, rows: block.rows?.map((entry, position) => position === rowIndex ? entry.map((value, cellIndex) => cellIndex === column ? event.target.value : value) : entry) })}/></td>)}</tr>)}</tbody></table></div><div className="course-tools workdoc-table-tools"><button disabled={!editable || (block.rows?.length || 0) >= 50} onClick={() => changeBlock({ ...block, rows: [...(block.rows || []), Array(block.rows?.[0]?.length || 1).fill("") as string[]] })}>+ Строка</button><button disabled={!editable || (block.rows?.[0]?.length || 0) >= 8} onClick={() => changeBlock({ ...block, rows: block.rows?.map((row) => [...row, ""]) })}>+ Столбец</button><button disabled={!editable || (block.rows?.length || 0) <= 1} onClick={() => confirmChange("Убрать последнюю строку?", () => changeBlock({ ...block, rows: block.rows?.slice(0, -1) }))}>− Последняя строка</button><button disabled={!editable || (block.rows?.[0]?.length || 0) <= 1} onClick={() => confirmChange("Убрать последний столбец?", () => changeBlock({ ...block, rows: block.rows?.map((row) => row.slice(0, -1)) }))}>− Последний столбец</button></div></>}
              {block.type === "link" && <div className="workdoc-link-fields"><input aria-label={`Название материала блока ${index + 1}`} placeholder="Название материала / вложения" value={block.label || ""} maxLength={200} disabled={!editable} onChange={(event) => changeBlock({ ...block, label: event.target.value })}/><input aria-label={`Ссылка материала блока ${index + 1}`} placeholder="https://…" value={block.url || ""} maxLength={2000} disabled={!editable} onChange={(event) => changeBlock({ ...block, url: event.target.value })}/><small className="course-muted">Это ссылка, не загрузка файла. Проверь доступ к внешнему хранилищу.</small></div>}
            </>}
          </section>)}
          {!draft.body.blocks.length && <p className="course-empty">Лист пустой. Добавь первый блок в верхней панели.</p>}
        </article>
        {contextOpen && <aside className="workdoc-context" aria-label="Контекст документа">
          <h3>Контекст документа</h3><section><h4>Связи</h4>
            <label>Клиент<select aria-label="Клиент документа" disabled={!editable} value={draft.body.links.lead_id || ""} onChange={(event) => update({ ...draft.body, links: { ...draft.body.links, lead_id: event.target.value || null } })}><option value="">Без привязки</option>{draft.body.links.lead_id && !selectedLead && <option value={draft.body.links.lead_id}>Связанный клиент вне выборки</option>}{leads.map((lead) => <option value={lead.lead_id} key={lead.lead_id}>{lead.company || lead.name || lead.work_email}</option>)}</select></label>
            <label>PSP<select aria-label="PSP документа" disabled={!editable} value={draft.body.links.provider_id || ""} onChange={(event) => update({ ...draft.body, links: { ...draft.body.links, provider_id: event.target.value || null } })}><option value="">Без привязки</option>{draft.body.links.provider_id && !selectedProvider && <option value={draft.body.links.provider_id}>Связанный PSP вне выборки</option>}{providers.map((provider) => <option value={provider.id} key={provider.id}>{provider.brand_name}</option>)}</select></label>
            <label>Направление<select aria-label="Направление документа" disabled={!editable} value={draft.body.links.direction_id || ""} onChange={(event) => update({ ...draft.body, links: { ...draft.body.links, direction_id: event.target.value || null } })}><option value="">Без привязки</option>{draft.body.links.direction_id && !directions.some((direction) => direction.id === draft.body.links.direction_id) && <option value={draft.body.links.direction_id}>Направление вне текущего плана</option>}{directions.map((direction) => <option value={direction.id} key={direction.id}>{direction.title}</option>)}</select></label>
            {!directions.length && <p>Сначала сохрани курс, чтобы привязать документ к направлению.</p>}
            {selectedLead && <Link to={`/merchants/${selectedLead.lead_id}?tab=documents`}>Открыть карточку клиента →</Link>}{selectedProvider && <Link to={`/psps/${selectedProvider.id}`}>Открыть карточку PSP →</Link>}
            <p>Это связи рабочего документа; клиенту он не виден и в его реестр файлов автоматически не публикуется.</p>
          </section>
          <WorkOriginalFiles key={draft.id} documentId={draft.id} revision={draft.revision} editable={editable} historical={historical} onBusy={setBusy} onAppend={appendFileText}/>
          <section><h4>Снимок текста</h4>{draft.body.source ? <>
            <p>{sealedSource ? "Снимок зафиксирован. Правь рабочие блоки; исходник и история останутся прежними." : "Снимок станет неизменяемым после сохранения."}</p>
            <label>Название<input aria-label="Название исходника" disabled={!editable || sealedSource} value={draft.body.source.label} maxLength={200} onChange={(event) => update({ ...draft.body, source: { ...draft.body.source!, label: event.target.value } })}/></label>
            <label>Ссылка<input aria-label="Ссылка исходника" disabled={!editable || sealedSource} value={draft.body.source.url} maxLength={2000} onChange={(event) => update({ ...draft.body, source: { ...draft.body.source!, url: event.target.value } })}/></label>
            <details><summary>Текст исходника</summary><textarea aria-label="Текст исходника" disabled={!editable || sealedSource} value={draft.body.source.text} maxLength={200000} onChange={(event) => update({ ...draft.body, source: { ...draft.body.source!, text: event.target.value } })}/></details>
            {safeDocumentUrl(draft.body.source.url) && <a href={draft.body.source.url} target="_blank" rel="noopener noreferrer">Открыть внешний исходник →</a>}
            <button disabled={!editable || !draft.body.source.text || draft.body.blocks.length >= 100} onClick={appendSourceText}>Добавить текст в рабочие блоки</button>
            {!sealedSource && <button disabled={!editable} onClick={() => update({ ...draft.body, source: null })}>Убрать несохранённый исходник</button>}
          </> : <><p>Добавь ссылку и/или вставь текст. Это снимок текста, не хранение оригинального Word/PDF-файла.</p><button disabled={!editable} onClick={() => update({ ...draft.body, source: { label: "Исходный материал", text: "", url: "" } })}>Прикрепить исходник</button></>}
            {!sealedSource && <label className="workdoc-import">Добавить TXT как исходник и рабочий текст<input type="file" accept=".txt,text/plain" aria-label="Загрузить исходник TXT" disabled={!editable || draft.body.blocks.length >= 100} onChange={(event) => void importText(event)}/></label>}
          </section>
          <section><h4>История версий</h4>{history.length ? history.map((version) => <button className="workdoc-version" key={version.revision} disabled={busy} onClick={() => void open(draft.id, version.revision)}><strong>v{version.revision}</strong><span>{date(version.created_at)}</span></button>) : <p>История появится после первого сохранения.</p>}{historical && <button disabled={busy} onClick={() => void open(draft.id)}>Открыть актуальную версию</button>}<p>Показаны последние 100 версий. История только для просмотра; для изменений открой рабочую копию.</p></section>
        </aside>}
      </div>
    </> : screen === "editor" && <p className="course-empty">Нажми «Новый документ» и выбери чистый лист или заготовку.</p>}
    <footer className="course-footer"><span>Конструктор · до 100 блоков · ручное сохранение</span><span>DOCX/PDF: приватные оригиналы и отдельный рабочий текст. Нет точного Word round-trip, подписи или автоматической отправки.</span></footer>
    </div>{pending && <div className="workdoc-confirm-backdrop"><div role="alertdialog" aria-modal="true" aria-labelledby="workdoc-confirm-title" aria-describedby="workdoc-confirm-message" className="workdoc-confirm" onKeyDown={(event) => {
      if (event.key === "Escape") { event.preventDefault(); setPending(null); }
      if (event.key === "Tab") { event.preventDefault(); (document.activeElement === cancelRef.current ? proceedRef.current : cancelRef.current)?.focus(); }
    }}><h2 id="workdoc-confirm-title">Сначала сохраним работу?</h2><p id="workdoc-confirm-message">{pending.message}</p><div className="course-tools"><button ref={cancelRef} onClick={() => setPending(null)}>Остаться</button><button ref={proceedRef} onClick={() => { const action = pending.proceed; setPending(null); action(); }}>Продолжить</button></div></div></div>}
  </div>;
}
