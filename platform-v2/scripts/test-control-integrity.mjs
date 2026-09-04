import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (relativePath) => readFile(path.join(root, relativePath), "utf8");

const [captain, merchant, integrations, platform, modules, ui, context, seoGeo] = await Promise.all([
  read("platform-v2/src/pages/CaptainPages.tsx"),
  read("platform-v2/src/pages/MerchantWorkspace.tsx"),
  read("platform-v2/src/pages/IntegrationsWorkspace.tsx"),
  read("platform-v2/src/pages/Platform.tsx"),
  read("platform-v2/src/config/modules.tsx"),
  read("platform-v2/src/components/control/Ui.tsx"),
  read("platform-v2/src/context/ControlBridgeContext.tsx"),
  read("platform-v2/src/pages/SeoGeoPage.tsx"),
]);

assert.match(captain, /Вернуть в непрочитанные/);
assert.match(captain, /p_mark_read: markRead/);
assert.match(captain, /p_mark_read: null/);
assert.match(captain, /Письмо доставлено[^\n]+статус в почтовом центре не записан/);
assert.match(merchant, /email доставлен[^\n]+статус в почтовом центре не записан/);
assert.match(captain, /update_offerpsp_email_draft/);
assert.match(captain, /Редактируется существующая запись — новый черновик создан не будет/);
assert.match(captain, /activeDraft\?"Отправить этот черновик":"Отправить письмо"/);
assert.match(captain, /Черновики/);
assert.match(captain, /setSearchParams\(\{draft:String\(draft\.id\)\}\)/);
assert.match(captain, /Последнее: исходящее/);
assert.match(captain, /Последнее: входящее/);
assert.match(captain, /Исходящее письмо →/);
assert.match(captain, /← Входящее письмо/);
assert.match(captain, /Написать follow-up/);
assert.match(captain, /Рабочая привязка:/);
assert.match(captain, /title="Радиорубка"/);
assert.match(captain, /Папки/);
assert.match(captain, /Входящие/);
assert.match(captain, /Отправленные/);
assert.match(captain, /С вложениями/);
assert.match(captain, /Непрочитанные/);
assert.match(captain, /mailScope === "unread"/);
assert.match(captain, /Быстрые фильтры почты/);
assert.match(captain, /aria-pressed=\{active\}/);
assert.match(captain, /openMailScope\(item\.scope\)/);
assert.match(captain, /setQuery\(""\)/);
assert.match(captain, /setThreadId\(""\)/);
assert.match(captain, /Поиск по теме, email, заметке или тексту/);
assert.match(captain, /Просрочено/);
assert.match(captain, /С флагом/);
assert.match(captain, /Органайзер цепочки/);
assert.match(captain, /update_offerpsp_email_thread_organizer/);
assert.match(captain, /AI-резюме/);
assert.match(captain, /Рабочий шаблон/);
assert.match(captain, /mailCenter\.templates/);
assert.match(captain, /changeThreadState\("trashed"\)/);
assert.match(captain, /changeThreadState\("restore"\)/);
assert.match(captain, /Переписка находится в корзине/);
assert.match(captain, /Окончательное удаление:/);
assert.match(captain, /Новое письмо от собеседника восстановит цепочку автоматически/);
assert.match(modules, /label: "Радиорубка", shortLabel: "Почта"/);

assert.match(integrations, /Проверка заняла больше 12 секунд/);
assert.match(integrations, /finally\s*\{/);
assert.match(integrations, /controller\.abort\(\)/);

assert.match(modules, /label: "Обзор воронки"/);
assert.match(platform, /title="Обзор воронки"/);
assert.match(platform, /Статус меняется только в карточке/);
assert.doesNotMatch(platform, />Новая поисковая миссия<\/button>/);

assert.match(ui, /role="status"/);
assert.match(ui, /Загружаем рабочие данные/);

assert.match(context, /CORE_CACHE_TTL_MS = 5 \* 60_000/);
assert.match(context, /CORE_BACKGROUND_REFRESH_MS = 5 \* 60_000/);
assert.match(context, /void refreshLeads\(user\)/);
assert.doesNotMatch(context, /load\(user, true\)[\s\S]{0,600}setInterval/);
assert.match(seoGeo, /SEO_ANALYTICS_REFRESH_MS = 5 \* 60_000/);
assert.match(seoGeo, /ACTIVE_AUDIT_POLL_MS = 15_000/);
assert.match(platform, /hasProcessingJobs \? 15_000 : 120_000/);

if (process.env.VERCEL !== "1") {
  const migration = await read("supabase/migrations/20260815090000_offerpsp_email_mark_unread.sql");
  assert.match(migration, /elsif p_mark_read is false then/);
  assert.match(migration, /set is_read = false/);
  assert.match(migration, /order by coalesce\(received_at, created_at\) desc/);
  assert.match(migration, /and is_read is false/);
  const draftMigration = await read("supabase/migrations/20260901154500_offerpsp_existing_email_draft_send.sql");
  assert.match(draftMigration, /create or replace function public\.update_offerpsp_email_draft/);
  assert.match(draftMigration, /coalesce\(v_draft\.status, 'draft'\) not in \('draft', 'failed'\)/);
  assert.match(draftMigration, /thread_id = excluded\.thread_id/);
  assert.match(draftMigration, /grant execute on function public\.update_offerpsp_email_draft/);
  const organizerMigration = await read("supabase/migrations/20260901164843_offerpsp_mail_organizer.sql");
  assert.match(organizerMigration, /add column if not exists priority text not null default 'normal'/);
  assert.match(organizerMigration, /create table if not exists public\.offerpsp_email_templates/);
  assert.match(organizerMigration, /create or replace function public\.update_offerpsp_email_thread_organizer/);
  assert.match(organizerMigration, /'overdue_follow_up'/);
  assert.match(organizerMigration, /'templates'/);
  assert.match(organizerMigration, /now\(\) \+ interval '3 days'/);
  const trashMigration = await read("supabase/migrations/20260901185355_offerpsp_email_trash_retention.sql");
  assert.match(trashMigration, /'open', 'awaiting_reply', 'follow_up', 'closed', 'archived', 'trashed'/);
  assert.match(trashMigration, /create or replace function private\.purge_offerpsp_email_trash/);
  assert.match(trashMigration, /interval '15 days'/);
  assert.match(trashMigration, /offerpsp-purge-email-trash/);
  assert.match(trashMigration, /perform cron\.schedule/);
  assert.match(trashMigration, /trashed_from_status/);
}

console.log("Control integrity regression tests passed");
