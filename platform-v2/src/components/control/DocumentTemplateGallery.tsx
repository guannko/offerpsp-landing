import { documentTemplates } from "../../lib/documentTemplates";
import type { DocumentTemplateId } from "../../lib/documentTemplates";

export default function DocumentTemplateGallery({ busy, onCreate }: { busy: boolean; onCreate: (id: DocumentTemplateId) => void }) {
  return <section className="workdoc-template-page" aria-label="Шаблоны нового документа">
    <header><span className="course-eyebrow">Captain’s Bridge / Документы</span><h1>Новый документ</h1><p>Начни с чистого листа или выбери заготовку. Это только отправная точка: любой лист можно превратить в нужный тебе документ.</p></header>
    <div className="workdoc-gallery-grid">{documentTemplates.map((template) => <button key={template.id} className={`workdoc-template-card${template.id === "blank" ? " is-blank" : ""}`} aria-label={`Создать: ${template.title}`} disabled={busy} onClick={() => onCreate(template.id)}>
      <div className="workdoc-miniature" aria-hidden="true">{template.id === "blank" ? <span className="workdoc-mini-blank">+</span> : <><span className="workdoc-mini-title">{template.title}</span>{template.blocks.slice(0, 4).map((block, index) => <div key={index}>
        {block.type === "heading" ? <span className="workdoc-mini-heading">{block.text}</span> : block.type === "table" ? <div className="workdoc-mini-table">{Array.from({ length: 9 }, (_, cell) => <span key={cell}/>)}</div> : block.type === "checklist" ? <div className="workdoc-mini-checks">□ <span/>□ <span/></div> : <div className="workdoc-mini-lines"><span/><span/><span/></div>}
      </div>)}</>}</div>
      <strong>{template.title}</strong><span className="workdoc-template-description">{template.description}</span><small>{template.id === "blank" ? "Начать с нуля →" : "Использовать заготовку →"}</small>
    </button>)}</div>
    <p className="workdoc-template-tip">Текст, таблицы, разделы и списки добавляются в одном редакторе. Заготовку можно вставить и позже, не стирая уже написанное.</p>
  </section>;
}
