import type { ReactNode } from "react";

export const statusLabels: Record<string, string> = {
  new: "Новая",
  qualifying: "Квалификация",
  needs_clarification: "Нужны данные",
  matching: "Подбор",
  matched: "Подобрано",
  shortlist_ready: "Shortlist готов",
  shared: "Отправлено клиенту",
  option_selected: "Выбрано решение",
  dossier_ready: "Досье готово",
  provider_reviewing: "На рассмотрении PSP",
  provider_needs_info: "PSP просит данные",
  provider_accepted: "PSP принял",
  provider_declined: "PSP отказал",
  telegram_created: "Telegram создан",
  zoom_scheduled: "Zoom назначен",
  negotiating: "Переговоры",
  won: "Запущено",
  lost: "Потеряно",
  active: "Активен",
  onboarding: "Онбординг",
  paused: "Пауза",
  archived: "Архив",
  draft: "Черновик",
  review: "Проверка",
  published: "Опубликован",
  queued: "В очереди",
  processing: "Разбирается",
  imported: "Импортирован",
  duplicate: "Дубль",
  failed: "Ошибка разбора",
  dismissed: "Убран",
  pending: "Ожидает проверки",
  screening: "Автопроверка",
  manual_review: "Ручная проверка",
  needs_info: "Нужны данные",
  cleared: "Допущен",
  hold: "На паузе",
  rejected: "Отклонён",
  spam: "Спам",
};

export function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-brand-500">{eyebrow}</p>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white sm:text-3xl">{title}</h1>
        <p className="mt-2 max-w-3xl text-sm text-gray-500 dark:text-gray-400">{description}</p>
      </div>
      {action}
    </div>
  );
}

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900 ${className}`}>{children}</section>;
}

export function Metric({ label, value, hint, tone = "default" }: { label: string; value: string | number; hint: string; tone?: "default" | "warning" | "success" | "danger" }) {
  const tones = {
    default: "bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300",
    warning: "bg-warning-50 text-warning-700 dark:bg-warning-500/10 dark:text-warning-300",
    success: "bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-300",
    danger: "bg-error-50 text-error-700 dark:bg-error-500/10 dark:text-error-300",
  };
  return (
    <Panel>
      <div className={`mb-4 inline-flex rounded-lg px-2.5 py-1 text-xs font-semibold ${tones[tone]}`}>{label}</div>
      <div className="text-3xl font-semibold text-gray-900 dark:text-white">{value}</div>
      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{hint}</p>
    </Panel>
  );
}

export function StatusPill({ status }: { status?: string | null }) {
  const normalized = status || "unknown";
  const tone = normalized === "won" || normalized === "published" || normalized === "active" || normalized === "cleared"
    ? "bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-300"
    : normalized === "lost" || normalized === "provider_declined" || normalized === "rejected" || normalized === "spam"
      ? "bg-error-50 text-error-700 dark:bg-error-500/10 dark:text-error-300"
      : normalized.includes("needs") || normalized === "manual_review" || normalized === "draft" || normalized === "queued"
        ? "bg-warning-50 text-warning-700 dark:bg-warning-500/10 dark:text-warning-300"
        : "bg-gray-100 text-gray-700 dark:bg-white/5 dark:text-gray-300";
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${tone}`}>{statusLabels[normalized] || normalized}</span>;
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-xl border border-dashed border-gray-300 px-6 py-12 text-center dark:border-gray-700">
      <h3 className="font-semibold text-gray-800 dark:text-white/90">{title}</h3>
      <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{description}</p>
    </div>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  return <div className="mb-6 rounded-xl border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700 dark:border-error-500/20 dark:bg-error-500/10 dark:text-error-300">{message}</div>;
}

export function SkeletonPage() {
  return <div className="animate-pulse space-y-5"><div className="h-9 w-80 rounded bg-gray-200 dark:bg-gray-800"/><div className="grid grid-cols-1 gap-4 md:grid-cols-4">{[1,2,3,4].map((item)=><div key={item} className="h-36 rounded-2xl bg-gray-200 dark:bg-gray-800"/>)}</div><div className="h-96 rounded-2xl bg-gray-200 dark:bg-gray-800"/></div>;
}
