export function VisibilityToggleButton({
  hidden,
  busy = false,
  onToggle,
}: {
  hidden: boolean;
  busy?: boolean;
  onToggle: () => void | Promise<void>;
}) {
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => void onToggle()}
      className={`rounded-lg border px-4 py-2.5 text-sm font-semibold transition disabled:cursor-wait disabled:opacity-50 ${
        hidden
          ? "border-success-300 text-success-700 hover:bg-success-50 dark:border-success-500/40 dark:text-success-300 dark:hover:bg-success-500/10"
          : "border-gray-300 text-gray-600 hover:border-error-300 hover:bg-error-50 hover:text-error-600 dark:border-gray-700 dark:text-gray-300 dark:hover:border-error-500/40 dark:hover:bg-error-500/10 dark:hover:text-error-300"
      }`}
    >
      {busy ? "Сохраняю…" : hidden ? "Вернуть в работу" : "Скрыть"}
    </button>
  );
}
