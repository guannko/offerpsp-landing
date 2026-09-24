export type QuickStatusOption = {
  value: string;
  label: string;
};

export function QuickStatusSelect({
  value,
  options,
  busy = false,
  onChange,
}: {
  value?: string | null;
  options: QuickStatusOption[];
  busy?: boolean;
  onChange: (value: string) => void | Promise<void>;
}) {
  return (
    <label className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-theme-xs dark:border-gray-700 dark:bg-gray-900">
      <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-400">Статус</span>
      <select
        aria-label="Изменить рабочий статус"
        className="max-w-[230px] bg-transparent text-sm font-semibold text-gray-800 outline-none disabled:cursor-wait disabled:opacity-60 dark:text-white"
        disabled={busy}
        value={value || options[0]?.value || ""}
        onChange={(event) => void onChange(event.target.value)}
      >
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      {busy && <span className="h-3 w-3 animate-spin rounded-full border-2 border-brand-200 border-t-brand-500" aria-label="Сохраняется"/>}
    </label>
  );
}
