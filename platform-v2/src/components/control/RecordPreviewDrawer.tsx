import { useRef } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { StatusPill } from "./Ui";
import { useDialogFocus } from "../../hooks/useDialogFocus";

export type PreviewField = { label: string; value: ReactNode };

export default function RecordPreviewDrawer({ open, onClose, eyebrow, title, subtitle, status, fields, path, actionLabel = "Открыть полную карточку" }: {
  open: boolean;
  onClose: () => void;
  eyebrow: string;
  title: string;
  subtitle?: string | null;
  status?: string | null;
  fields: PreviewField[];
  path: string;
  actionLabel?: string;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  useDialogFocus(open, dialogRef, onClose);

  if (!open) return null;
  return <div className="fixed inset-0 z-[90] bg-gray-950/30" onMouseDown={(event)=>{if(event.target===event.currentTarget)onClose();}}><aside ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={`Быстрый просмотр: ${title}`} className="absolute bottom-0 right-0 top-0 flex w-full max-w-lg flex-col border-l border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900"><div className="flex items-start justify-between gap-4 border-b border-gray-100 p-5 dark:border-gray-800"><div className="min-w-0"><span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand-500">{eyebrow}</span><h2 className="mt-2 truncate text-2xl font-semibold text-gray-900 dark:text-white">{title}</h2>{subtitle&&<p className="mt-1 truncate text-sm text-gray-500">{subtitle}</p>}</div><button type="button" onClick={onClose} aria-label="Закрыть быстрый просмотр" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-200 text-xl text-gray-400 hover:border-brand-300 hover:text-brand-500 dark:border-gray-700">×</button></div><div className="flex-1 overflow-y-auto p-5">{status&&<div className="mb-5"><StatusPill status={status}/></div>}<dl className="divide-y divide-gray-100 rounded-xl border border-gray-200 dark:divide-gray-800 dark:border-gray-800">{fields.map((field)=><div key={field.label} className="grid grid-cols-[130px_minmax(0,1fr)] gap-4 px-4 py-3"><dt className="text-xs font-medium text-gray-400">{field.label}</dt><dd className="min-w-0 break-words text-sm font-medium text-gray-700 dark:text-gray-200">{field.value || "—"}</dd></div>)}</dl></div><div className="border-t border-gray-100 p-5 dark:border-gray-800"><Link to={path} className="block rounded-xl bg-brand-500 px-4 py-3 text-center text-sm font-semibold text-white hover:bg-brand-600">{actionLabel} →</Link><p className="mt-2 text-center text-[10px] text-gray-400">Esc закрывает окно · данные не изменяются</p></div></aside></div>;
}
