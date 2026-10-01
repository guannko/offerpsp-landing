import { useMemo, useState } from "react";
import { Link } from "react-router";
import type { ComplianceCaseSummary, EmailThread, Lead, Provider, WorkTask } from "../../types/offerpsp";
import { directionWork, leadStage, moveDirection, orderPlanTasks, validateCoursePlan } from "../../lib/coursePlan";
import type { CourseDirection, CoursePlan, CourseSnapshot } from "../../lib/coursePlan";
import { statusLabels } from "./Ui";
import type { DocumentRepository } from "../../lib/workDocuments";
import WorkDocumentDesk from "./WorkDocumentDesk";
import "./CourseOrganizer.css";

export type CourseOrganizerProps = {
  snapshot: CourseSnapshot;
  leads: Lead[];
  tasks: WorkTask[];
  threads: EmailThread[];
  compliance: ComplianceCaseSummary[];
  errors: string[];
  writable: boolean;
  refreshing: boolean;
  updatedAt?: Date | null;
  onRefresh: () => Promise<void>;
  onSave: (plan: CoursePlan, revision: number) => Promise<CourseSnapshot>;
  documentRepository?: DocumentRepository;
  providers?: Provider[];
};
const taskName = (task: WorkTask) => task.title || "Без названия";
const leadName = (lead: Lead) => lead.company || lead.name || lead.work_email || "Без названия";
const taskStatus = (task: WorkTask) => statusLabels[task.status || ""] || task.status || "Статус не указан";
const prettyDate = (value?: string | null) => value && Number.isFinite(Date.parse(value))
  ? new Date(value).toLocaleDateString("ru-RU", { day: "numeric", month: "short" }) : "Без срока";
const stageLabels = ["Профиль", "Подбор", "Предложение", "Согласование", "Запуск"];
const countLabel = (count: number, forms: [string, string, string]) => `${count} ${count % 100 >= 11 && count % 100 <= 14 ? forms[2] : count % 10 === 1 ? forms[0] : count % 10 >= 2 && count % 10 <= 4 ? forms[1] : forms[2]}`;
const workCount = (leads: number, tasks: number) => `${countLabel(leads, ["кейс", "кейса", "кейсов"])} · ${countLabel(tasks, ["задача", "задачи", "задач"])}`;

export default function CourseOrganizer(props: CourseOrganizerProps) {
  const [localSnapshot, setLocalSnapshot] = useState<CourseSnapshot | null>(null);
  const snapshot = localSnapshot && localSnapshot.revision > props.snapshot.revision ? localSnapshot : props.snapshot;
  const plan = snapshot.plan;
  const [selectedId, setSelectedId] = useState(plan.directions[0]?.id || "");
  const selected = plan.directions.find((item) => item.id === selectedId) || plan.directions[0];
  const [contextOpen, setContextOpen] = useState(false);
  const [overviewOpen, setOverviewOpen] = useState(false);
  const [courseDraft, setCourseDraft] = useState<string | null>(null);
  const [directionDraft, setDirectionDraft] = useState<CourseDirection | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [documentsOpen, setDocumentsOpen] = useState(false);
  const work = useMemo(() => selected ? directionWork(selected, props.leads, props.tasks, props.threads) : null,
    [selected, props.leads, props.tasks, props.threads]);
  const orderedTasks = useMemo(() => orderPlanTasks(plan, props.leads, props.tasks, props.threads), [plan, props.leads, props.tasks, props.threads]);
  const unlinkedLeads = props.leads.filter((lead) => !plan.directions.some((direction) => direction.lead_ids.includes(lead.lead_id)));
  const unlinkedTasks = props.tasks.filter((task) => !["done", "cancelled"].includes(task.status || "") && !plan.directions.some((direction) => direction.task_ids.includes(String(task.id)) || Boolean(task.lead_id && direction.lead_ids.includes(task.lead_id))));
  const blockedCases = props.compliance.filter((item) => selected?.lead_ids.includes(item.lead_id)
    && ["manual_review", "needs_info", "hold", "pending", "screening"].includes(item.case_status));
  const decisions = blockedCases.filter((item) => ["manual_review", "hold"].includes(item.case_status));
  const writable = props.writable && !busy && !props.refreshing;

  async function save(next: CoursePlan, message = "Курс сохранён в рубке.") {
    const invalid = validateCoursePlan(next);
    if (invalid) { setError(invalid); return false; }
    if (!writable) return false;
    setBusy(true); setError(null); setNotice(null);
    try {
      const saved = await props.onSave(next, snapshot.revision);
      setLocalSnapshot(saved); setNotice(message);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось сохранить план. Изменение не подтверждено.");
      return false;
    } finally { setBusy(false); }
  }
  function editDirection(direction?: CourseDirection) {
    setAdding(!direction);
    setDirectionDraft(direction ? structuredClone(direction) : { id: crypto.randomUUID(), title: "", outcome: "", paused: false, lead_ids: [], task_ids: [] });
    setError(null);
  }
  async function saveDirection() {
    if (!directionDraft) return;
    const next = { ...plan, directions: adding ? [...plan.directions, directionDraft] : plan.directions.map((item) => item.id === directionDraft.id ? directionDraft : item) };
    if (await save(next, "Направление и его связи сохранены.")) { setSelectedId(directionDraft.id); setDirectionDraft(null); }
  }
  function toggleLink(key: "lead_ids" | "task_ids", id: string) {
    if (!directionDraft) return;
    const values = directionDraft[key];
    setDirectionDraft({ ...directionDraft, [key]: values.includes(id) ? values.filter((value) => value !== id) : [...values, id] });
  }
  async function refresh() {
    if ((courseDraft !== null || directionDraft) && !window.confirm("Перечитать рабочие данные? Несохранённый редактор останется открытым.")) return;
    setNotice(null); setError(null);
    try { await props.onRefresh(); setLocalSnapshot(null); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось обновить данные."); }
  }

  if (documentsOpen && props.documentRepository) return <div className="course-organizer"><WorkDocumentDesk repository={props.documentRepository} leads={props.leads} providers={props.providers || []} directions={snapshot.revision > 0 ? plan.directions : []} onClose={() => setDocumentsOpen(false)}/></div>;
  return <div className="course-organizer">
    <div className="course-toolbar" aria-label="Инструменты органайзера">
      <div className="course-tools"><button aria-expanded={overviewOpen} aria-controls="course-overview" onClick={() => setOverviewOpen(!overviewOpen)}>Где идёт работа</button>{props.documentRepository && <button onClick={() => setDocumentsOpen(true)}>Новый документ</button>}<Link to="/communications">Почта</Link><Link to="/inbox">Входящие</Link><Link to="/operations">Задачи</Link></div>
      <div className="course-tools"><button disabled={busy || props.refreshing} onClick={() => void refresh()}>{props.refreshing ? "Обновляю…" : "Обновить"}</button><button aria-expanded={contextOpen} aria-controls="course-context" onClick={() => setContextOpen(!contextOpen)}>Контекст {contextOpen ? "−" : "+"}</button></div>
    </div>
    <header className="course-heading"><div><span className="course-eyebrow">Captain’s Bridge / Органайзер</span><h1>Мой курс</h1></div><span className="course-muted">{new Date().toLocaleDateString("ru-RU", { day: "numeric", month: "long", weekday: "long" })}</span></header>
    {props.errors.map((message, i) => <p role="alert" className="course-alert" key={`${message}-${i}`}>{message}</p>)}
    {error && <p role="alert" className="course-alert">{error}</p>}
    {notice && <p role="status" className="course-notice">{notice}</p>}
    <section className="course-note" aria-label="Рабочий курс">
      {courseDraft !== null ? <form onSubmit={(event) => { event.preventDefault(); void save({ ...plan, course: courseDraft }).then((ok) => { if (ok) setCourseDraft(null); }); }}><label htmlFor="course-note">Что сейчас важнее всего</label><textarea id="course-note" maxLength={2000} value={courseDraft} onChange={(event) => setCourseDraft(event.target.value)} required/><div className="course-tools"><button className="course-primary" disabled={!writable}>Сохранить курс</button><button type="button" disabled={busy} onClick={() => setCourseDraft(null)}>Отмена</button></div></form>
        : <><div><span className="course-eyebrow">Что сейчас важнее всего</span><p>{plan.course}</p></div><button disabled={!writable} onClick={() => setCourseDraft(plan.course)}>Изменить курс</button></>}
    </section>
    {!snapshot.updated_at && props.writable && <p className="course-caption">Это стартовый план, ещё не сохранённый. <button className="course-text-button" disabled={!writable} onClick={() => void save(plan)}>Сохранить мой курс</button></p>}
    {overviewOpen && <section id="course-overview" className="course-overview"><h2>Вся работа — одним взглядом</h2><div className="course-overview-grid">{plan.directions.map((direction, i) => {
      const linked = directionWork(direction, props.leads, props.tasks, props.threads);
      return <button key={direction.id} onClick={() => { setSelectedId(direction.id); setOverviewOpen(false); }}><strong>{i + 1}. {direction.title}</strong><span>{direction.paused ? "Убрано из активного плана" : workCount(linked.leads.length, linked.openTasks.length)}</span><small>{direction.outcome}</small></button>;
    })}<div className="course-overview-unlinked"><strong>Пока без направления</strong><span>{workCount(unlinkedLeads.length, unlinkedTasks.length)}</span><Link to="/inbox">Разобрать входящие →</Link><Link to="/operations">Проверить задачи →</Link></div></div><p className="course-caption">В рабочем плане {orderedTasks.length} связанных задач. Приоритет задаёт их порядок здесь, не меняя очереди автоматизаций.</p>{!!orderedTasks.length && <ul className="course-work-list" aria-label="План по приоритету направлений">{orderedTasks.slice(0, 4).map((task) => <li key={task.id}><Link to={`/operations?task=${encodeURIComponent(task.id)}`}><strong>{taskName(task)}</strong><span>{task.assignee_name || "Ответственный не указан"} · {prettyDate(task.due_at)}</span></Link></li>)}</ul>}</section>}
    <section aria-label="Мои направления"><div className="course-section-heading"><h2>Мои направления</h2><button disabled={!writable || plan.directions.length >= 12} onClick={() => editDirection()}>+ Направление</button></div>
      <div className="course-directions">{plan.directions.map((direction, i) => {
        const linked = directionWork(direction, props.leads, props.tasks, props.threads);
        return <button key={direction.id} aria-pressed={selected?.id === direction.id} className={`course-direction ${selected?.id === direction.id ? "is-selected" : ""} ${direction.paused ? "is-paused" : ""}`} onClick={() => setSelectedId(direction.id)}><span className="course-eyebrow">{direction.paused ? "Пауза плана" : i === 0 ? "Первый приоритет" : `Приоритет ${i + 1}`}</span><strong>{direction.title}</strong><span className="course-outcome">{direction.outcome}</span><small>{linked.leads.length || linked.tasks.length ? workCount(linked.leads.length, linked.openTasks.length) : direction.lead_ids.length || direction.task_ids.length ? "Связанные записи вне рабочей выборки" : "Свяжи с рабочими кейсами"}</small></button>;
      })}</div>
      {!plan.directions.length && <p className="course-empty">Добавь направление и опиши результат, к которому хочешь прийти.</p>}
    </section>
    {directionDraft && <section className="course-editor" aria-label="Редактор направления"><form onSubmit={(event) => { event.preventDefault(); void saveDirection(); }}><div className="course-section-heading"><h2>{adding ? "Новое направление" : "Курс этого направления"}</h2><button type="button" disabled={busy} onClick={() => setDirectionDraft(null)}>Закрыть</button></div><div className="course-form-grid"><label>Название<input maxLength={120} value={directionDraft.title} onChange={(event) => setDirectionDraft({ ...directionDraft, title: event.target.value })} required/></label><label>Готово, когда…<textarea maxLength={2000} value={directionDraft.outcome} onChange={(event) => setDirectionDraft({ ...directionDraft, outcome: event.target.value })} required/></label></div>
        <div className="course-form-grid"><fieldset><legend>Клиенты / кейсы</legend><p className="course-caption">Связь показывает этапы, переписку и задачи клиента; не объединяет карточки.</p><div className="course-link-list">{props.leads.map((lead) => <label key={lead.lead_id}><input type="checkbox" checked={directionDraft.lead_ids.includes(lead.lead_id)} onChange={() => toggleLink("lead_ids", lead.lead_id)}/><span>{leadName(lead)}<small>{statusLabels[lead.status || ""] || lead.status}</small></span></label>)}{!props.leads.length && <p className="course-empty">Рабочих кейсов нет или они не загружены.</p>}</div></fieldset><fieldset><legend>Дополнительные задачи</legend><p className="course-caption">Задачи выбранных клиентов подтянутся автоматически. Здесь — остальные.</p><div className="course-link-list">{props.tasks.map((task) => <label key={task.id}><input type="checkbox" checked={directionDraft.task_ids.includes(String(task.id))} onChange={() => toggleLink("task_ids", String(task.id))}/><span>{taskName(task)}<small>{taskStatus(task)}</small></span></label>)}{!props.tasks.length && <p className="course-empty">Задачи не найдены или не загружены.</p>}</div></fieldset></div>
        {(["lead_ids", "task_ids"] as const).map((key) => directionDraft[key].filter((id) => key === "lead_ids" ? !props.leads.some((lead) => lead.lead_id === id) : !props.tasks.some((task) => String(task.id) === id)).map((id) => <div key={`${key}-${id}`} className="course-missing-link"><span>{key === "lead_ids" ? "Кейс" : "Задача"} вне рабочей выборки · {id}</span><button type="button" disabled={!writable} onClick={() => toggleLink(key, id)}>Убрать связь из плана</button></div>))}
        <button className="course-primary" disabled={!writable}>Сохранить направление</button>
      </form></section>}
    {selected && work && <div className={`course-workspace ${contextOpen ? "with-context" : ""}`}><main className="course-focus" aria-label="Текущий фокус"><section className="course-focus-heading"><div><span className="course-eyebrow">Текущий фокус</span><h2>{selected.title}</h2><p>{selected.outcome}</p></div><div className="course-tools"><label className="course-priority">Приоритет<select aria-label="Приоритет направления" value={plan.directions.findIndex((item) => item.id === selected.id)} disabled={!writable} onChange={(event) => void save(moveDirection(plan, selected.id, Number(event.target.value)), "Приоритет рабочего плана обновлён.")}>{plan.directions.map((_, i) => <option key={i} value={i}>{i === 0 ? "Первый" : `№ ${i + 1}`}</option>)}</select></label><button disabled={!writable} onClick={() => void save({ ...plan, directions: plan.directions.map((item) => item.id === selected.id ? { ...item, paused: !item.paused } : item) }, selected.paused ? "Направление возвращено в активный план." : "Направление убрано из активного плана; задачи и автоматизации не отменены.")}>{selected.paused ? "Вернуть в план" : "Пауза плана"}</button><button disabled={!writable} onClick={() => editDirection(selected)}>Настроить</button></div></section>
      {selected.paused && <p className="course-notice">Направление на паузе в твоём плане. Клиентские задачи, почта и автоматические проверки продолжают работать.</p>}
      <section className="course-business-path" aria-label="Этапы клиентских кейсов">
        {work.leads.length ? work.leads.slice(0, 4).map((lead) => <div key={lead.lead_id} className="course-case-path"><div><Link to={`/merchants/${lead.lead_id}`}>{leadName(lead)}</Link><span>{statusLabels[lead.status || ""] || lead.status || "Статус не указан"}</span></div><ol>{stageLabels.map((label, i) => <li key={label} className={leadStage(lead) === i ? "is-current" : ""}>{label}</li>)}</ol></div>) : <div><ol>{stageLabels.map((label) => <li key={label}>{label}</li>)}</ol><p className="course-caption">{selected.lead_ids.length ? "Связанные кейсы не найдены в загруженной выборке. Проверь связи через «Настроить»." : "Пока нет связанных кейсов. Добавь клиента через «Настроить»."} Эта схема — ориентир, не выполненные этапы.</p></div>}
        {selected.lead_ids.length > work.leads.length && <p className="course-caption">Часть связанных кейсов вне рабочей выборки. Проверь связи в настройках; их этапы здесь не оценены.</p>}
        {work.leads.length > 4 && <button className="course-text-button" onClick={() => setContextOpen(true)}>Ещё {work.leads.length - 4} кейсов — в контексте</button>}
      </section>
      <div className="course-plan-grid"><section><div className="course-section-heading"><h3>Рабочий план</h3><Link to="/operations">Все задачи →</Link></div><p className="course-caption">Задачи и ответственные из рабочей очереди.</p>{work.openTasks.length ? <ul className="course-work-list">{work.openTasks.slice(0, 5).map((task) => <li key={task.id}><Link to={`/operations?task=${encodeURIComponent(task.id)}`}><strong>{taskName(task)}</strong><span>{taskStatus(task)} · {task.assignee_name || "Ответственный не указан"}</span><small>{prettyDate(task.due_at)}</small></Link></li>)}</ul> : <p className="course-empty">{selected.lead_ids.length || selected.task_ids.length ? "В загруженной выборке нет открытых задач этого направления. Проверь связи или создай следующий шаг в разделе задач." : "Шаги ещё не связаны. Выбери существующие задачи в настройках направления."}</p>}{work.openTasks.length > 5 && <p className="course-caption">Ещё {work.openTasks.length - 5} — в контексте.</p>}</section><section><h3>Что мешает двигаться</h3>{blockedCases.length ? <ul className="course-work-list">{blockedCases.slice(0, 3).map((item) => <li key={item.lead_id}><Link to={`/merchants/${item.lead_id}?tab=compliance`}><strong>{leadName(props.leads.find((lead) => lead.lead_id === item.lead_id) || { lead_id: item.lead_id })}</strong><span>{statusLabels[item.case_status] || item.case_status}; {item.case_status === "screening" ? "проверка ещё выполняется" : "проверь досье и решение команды"}</span></Link></li>)}</ul> : <p className="course-empty">{props.errors.length || selected.lead_ids.length > work.leads.length ? "Данных недостаточно, чтобы оценить препятствия. Проверь загрузку и связи." : "По загруженным проверкам препятствий не найдено. Это не подтверждение готовности коммерческих условий."}</p>}
        {!!work.threads.filter((thread) => thread.status === "awaiting_reply" || thread.status === "follow_up").length && <p className="course-caption">Есть переписка с ожиданием ответа или follow-up. Открой контекст, чтобы проверить сроки.</p>}
      </section></div>
      <details className="course-boundaries"><summary>Что делает система, что решаю я</summary><p>Система показывает сохранённые задачи, этапы, проверки и переписку. Этот план пока не запускает новую автономную работу. Приоритет и пауза меняют план органайзера, а не n8n.</p><p>Отправка писем, допуск клиента, тариф, раскрытие PSP и публикация остаются в защищённых действиях соответствующего раздела.</p></details>
      <section className="course-decisions"><div className="course-section-heading"><h2>На моё решение</h2><span className="course-muted">{decisions.length ? `${decisions.length} по связанным кейсам` : "Нет подтверждённого запроса"}</span></div>{decisions.length ? decisions.slice(0, 3).map((item) => <div className="course-decision" key={item.lead_id}><div><strong>{leadName(props.leads.find((lead) => lead.lead_id === item.lead_id) || { lead_id: item.lead_id })}</strong><p>Автопроверка не заменяет допуск. Посмотри факты и неизвестные данные, затем прими решение в карточке.</p></div><Link className="course-primary" to={`/merchants/${item.lead_id}?tab=compliance`}>Открыть проверку →</Link></div>) : <p className="course-empty">Здесь появятся реальные запросы на ручную проверку связанных клиентов. Коммерческие решения из переписки автоматически не угадываются.</p>}</section>
      <section className="course-results"><div className="course-section-heading"><h2>Что получили</h2><span className="course-muted">По рабочим записям</span></div>{work.results.length || work.launched.length ? <ul className="course-work-list">{work.launched.map((lead) => <li key={lead.lead_id}><Link to={`/merchants/${lead.lead_id}`}><strong>{leadName(lead)}</strong><span>В карточке указан запуск. Это не подтверждение оборота или выплаты комиссии.</span></Link></li>)}{work.results.slice(0, 4).map((task) => <li key={task.id}><Link to={`/operations?task=${encodeURIComponent(task.id)}`}><strong>{taskName(task)}</strong><span>Задача закрыта · {prettyDate(task.completed_at)}</span></Link></li>)}</ul> : <p className="course-empty">Пока нет закрытых задач или запущенных кейсов, связанных с направлением. Ожидаемый результат выше — цель, не выполненная работа.</p>}</section>
    </main>
    {contextOpen && <aside id="course-context" className="course-context" aria-label="Контекст направления"><div className="course-section-heading"><div><span className="course-eyebrow">Контекст</span><h3>{selected.title}</h3></div><button aria-label="Свернуть контекст" onClick={() => setContextOpen(false)}>×</button></div>
      <section><h4>Условия и документы</h4><p>Актуальные ставки, ограничения и исходники — в карточках PSP и офферов. USA рассчитывается индивидуально; закупка не становится публичным тарифом.</p><div className="course-context-links"><Link to="/psps">Партнёры и условия →</Link><Link to="/offers">Каталог маршрутов →</Link></div></section>
      <section><h4>Клиенты и досье</h4>{work.leads.map((lead) => <Link key={lead.lead_id} className="course-context-item" to={`/merchants/${lead.lead_id}`}><strong>{leadName(lead)}</strong><span>{statusLabels[lead.status || ""] || lead.status}</span></Link>)}{!work.leads.length && <p>Клиенты ещё не привязаны.</p>}</section>
      <section><h4>История и переписка</h4>{work.threads.slice(0, 8).map((thread) => <Link key={thread.id} className="course-context-item" to={`/communications?thread=${encodeURIComponent(thread.id)}`}><strong>{thread.subject}</strong><span>{statusLabels[thread.status] || thread.status} · {prettyDate(thread.last_message_at)}</span></Link>)}{!work.threads.length && <p>Связанные цепочки не найдены в загруженной выборке.</p>}<Link to="/communications">Открыть радиорубку →</Link></section>
      <section><h4>Действия и ответственные</h4>{work.openTasks.map((task) => <Link key={task.id} className="course-context-item" to={`/operations?task=${encodeURIComponent(task.id)}`}><strong>{taskName(task)}</strong><span>{task.assignee_name || "Не назначен"} · {prettyDate(task.due_at)}</span></Link>)}<Link to="/system-actions">Журнал системы →</Link></section>
    </aside>}
    </div>}
    <footer className="course-footer"><span>{snapshot.updated_at ? `План сохранён · версия ${snapshot.revision}` : "Стартовый план"}</span><span>{props.updatedAt ? `Рабочие данные: ${props.updatedAt.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}` : "Время загрузки не подтверждено"} · выборка до 500 задач / 250 цепочек</span></footer>
  </div>;
}
