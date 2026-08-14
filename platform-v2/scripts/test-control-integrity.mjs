import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (relativePath) => readFile(path.join(root, relativePath), "utf8");

const [captain, merchant, integrations, platform, modules, ui] = await Promise.all([
  read("platform-v2/src/pages/CaptainPages.tsx"),
  read("platform-v2/src/pages/MerchantWorkspace.tsx"),
  read("platform-v2/src/pages/IntegrationsWorkspace.tsx"),
  read("platform-v2/src/pages/Platform.tsx"),
  read("platform-v2/src/config/modules.tsx"),
  read("platform-v2/src/components/control/Ui.tsx"),
]);

assert.match(captain, /Пометить непрочитанным/);
assert.match(captain, /p_mark_read: markRead/);
assert.match(captain, /p_mark_read: null/);
assert.match(captain, /Письмо доставлено[^\n]+статус в почтовом центре не записан/);
assert.match(merchant, /email доставлен[^\n]+статус в почтовом центре не записан/);

assert.match(integrations, /Проверка заняла больше 12 секунд/);
assert.match(integrations, /finally\s*\{/);
assert.match(integrations, /controller\.abort\(\)/);

assert.match(modules, /label: "Обзор воронки"/);
assert.match(platform, /title="Обзор воронки"/);
assert.match(platform, /Статус меняется только в карточке/);
assert.doesNotMatch(platform, />Новая поисковая миссия<\/button>/);

assert.match(ui, /role="status"/);
assert.match(ui, /Загружаем рабочие данные/);

if (process.env.VERCEL !== "1") {
  const migration = await read("supabase/migrations/20260815090000_offerpsp_email_mark_unread.sql");
  assert.match(migration, /elsif p_mark_read is false then/);
  assert.match(migration, /set is_read = false/);
  assert.match(migration, /order by coalesce\(received_at, created_at\) desc/);
  assert.match(migration, /and is_read is false/);
}

console.log("Control integrity regression tests passed");
