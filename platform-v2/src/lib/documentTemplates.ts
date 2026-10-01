import { createDocumentBlock, newWorkDocument } from "./workDocuments.ts";
import type { DocumentBlock, WorkDocument, WorkDocumentBody } from "./workDocuments";

export type DocumentTemplateId = "blank" | "note" | "psp-proposal" | "contract" | "meeting" | "comparison";
type Blueprint = { type: "heading" | "text" | "callout"; text: string } | { type: "table"; rows: string[][] } | { type: "checklist"; items: string[] };
export type DocumentTemplate = { id: DocumentTemplateId; title: string; description: string; blocks: Blueprint[] };
// Templates supply editable structure only, never live rates, identities or legal approval.
export const documentTemplates: DocumentTemplate[] = [
  { id: "blank", title: "Чистый лист", description: "Без заданной формы. Преврати его в любой нужный документ.", blocks: [{ type: "text", text: "" }] },
  { id: "note", title: "Заметка", description: "Мысли, решения и то, к чему нужно вернуться.", blocks: [
    { type: "heading", text: "Главное" }, { type: "text", text: "" }, { type: "heading", text: "Следующий шаг" }, { type: "checklist", items: [""] },
  ] },
  { id: "psp-proposal", title: "Рабочий лист — предложение PSP", description: "Профиль клиента, решение, условия и открытые вопросы.", blocks: [
    { type: "heading", text: "Задача и профиль клиента" }, { type: "text", text: "" },
    { type: "heading", text: "Предлагаемое решение" }, { type: "table", rows: [["Параметр", "Условия / подтверждённый источник"], ["ГЕО и валюты", ""], ["Метод / PayIn / PayOut", ""], ["Вертикаль и ограничения", ""], ["Объём и средний чек", ""], ["Тариф, лимиты и выплаты", ""]] },
    { type: "heading", text: "Вопросы для согласования" }, { type: "checklist", items: [""] },
  ] },
  { id: "contract", title: "Работа с договором", description: "Свободный каркас для исходного текста и твоих правок.", blocks: [
    { type: "callout", text: "Рабочий проект, не подписанный договор. Пустые разделы не означают согласованные условия; юридические формулировки нужно проверить." },
    ...["Стороны и предмет", "Условия и расчёты", "Ответственность и спорные вопросы", "Срок и реквизиты"].flatMap((title): Blueprint[] => [{ type: "heading", text: title }, { type: "text", text: "" }]),
  ] },
  { id: "meeting", title: "Итоги переписки / встречи", description: "Что обсудили, о чём договорились и кто делает следующий шаг.", blocks: [
    { type: "heading", text: "Контекст и участники" }, { type: "text", text: "" },
    { type: "heading", text: "Подтверждённые договорённости" }, { type: "text", text: "" },
    { type: "heading", text: "Следующие шаги" }, { type: "table", rows: [["Действие", "Ответственный", "Срок"], ["", "", ""]] },
    { type: "heading", text: "Открытые вопросы" }, { type: "checklist", items: [""] },
  ] },
  { id: "comparison", title: "Сравнение решений", description: "Таблица для сопоставления вариантов по твоим критериям.", blocks: [
    { type: "heading", text: "Что сравниваем и для кого" }, { type: "text", text: "" },
    { type: "table", rows: [["Критерий", "Вариант A", "Вариант B"], ["ГЕО и методы", "", ""], ["Условия и ограничения", "", ""], ["Выплаты и риски", "", ""]] },
    { type: "heading", text: "Вывод и следующий шаг" }, { type: "text", text: "" },
  ] },
];
function templateBlocks(template: DocumentTemplate): DocumentBlock[] {
  return template.blocks.map((blueprint) => {
    if (blueprint.type === "table") return { ...createDocumentBlock("table"), rows: structuredClone(blueprint.rows) };
    if (blueprint.type === "checklist") return { ...createDocumentBlock("checklist"), items: blueprint.items.map((text) => ({ text, checked: false })) };
    return { ...createDocumentBlock(blueprint.type), text: blueprint.text };
  });
}
export function createDocumentFromTemplate(id: DocumentTemplateId): WorkDocument {
  const template = documentTemplates.find((item) => item.id === id);
  if (!template) throw new Error("Заготовка не найдена.");
  const document = newWorkDocument("document");
  // All new documents share one unrestricted model. The template is not a persistent type.
  document.body.title = id === "blank" ? "Без названия" : template.title;
  document.body.blocks = templateBlocks(template);
  return document;
}
export function appendDocumentTemplate(body: WorkDocumentBody, id: DocumentTemplateId): WorkDocumentBody {
  const template = documentTemplates.find((item) => item.id === id);
  if (!template || id === "blank") throw new Error("Выбери заготовку для вставки.");
  const blocks = templateBlocks(template);
  if (body.blocks.length + blocks.length > 100) throw new Error("Заготовка не помещается: в документе допускается до 100 блоков.");
  return { ...body, title: ["Без названия", "Новый документ"].includes(body.title) ? template.title : body.title, blocks: [...body.blocks, ...blocks] };
}
