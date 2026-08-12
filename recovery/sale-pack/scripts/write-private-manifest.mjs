import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const [rootArg] = process.argv.slice(2);
if (!rootArg) throw new Error('Usage: node write-private-manifest.mjs <private-recovery-root>');
const root = path.resolve(rootArg);
const repoRoot = process.cwd();
const n8n = JSON.parse(fs.readFileSync(path.join(root, 'n8n/manifest.json'), 'utf8'));
const tables = JSON.parse(fs.readFileSync(path.join(root, 'supabase/data/table-data.json'), 'utf8'));
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'supabase/schema/catalog.json'), 'utf8'));
const storage = JSON.parse(fs.readFileSync(path.join(root, 'supabase/storage/manifest.json'), 'utf8'));
const columns = JSON.parse(fs.readFileSync(path.join(root, 'supabase/schema/columns.json'), 'utf8'));

function filesUnder(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(target) : [target];
  });
}

const credentialUsage = new Map();
for (const file of filesUnder(path.join(root, 'n8n/active')).filter((item) => item.endsWith('.json'))) {
  const workflow = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const node of workflow.nodes || []) {
    for (const [type, credential] of Object.entries(node.credentials || {})) {
      const key = `${type}\u0000${credential.name || credential.id || 'unnamed'}`;
      const current = credentialUsage.get(key) || {
        type,
        name: credential.name || null,
        workflows: [],
      };
      if (!current.workflows.includes(workflow.name)) current.workflows.push(workflow.name);
      credentialUsage.set(key, current);
    }
  }
}

const credentialInventory = [...credentialUsage.values()]
  .map((item) => ({ ...item, workflows: item.workflows.sort() }))
  .sort((left, right) => `${left.type}:${left.name}`.localeCompare(`${right.type}:${right.name}`));
fs.writeFileSync(
  path.join(root, 'n8n/credential-inventory.json'),
  `${JSON.stringify({ values_included: false, credentials: credentialInventory }, null, 2)}\n`,
  { mode: 0o600 },
);

const manifest = {
  title: 'OfferPSP + AIBot exact private recovery snapshot',
  captured_at: new Date().toISOString(),
  timezone: 'Asia/Nicosia',
  source: {
    branch: execFileSync('git', ['branch', '--show-current'], { cwd: repoRoot }).toString().trim(),
    commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot }).toString().trim(),
    tracked_files: Number(execFileSync('git', ['ls-files'], { cwd: repoRoot }).toString().trim().split('\n').filter(Boolean).length),
    dirty_patch_present: fs.statSync(path.join(root, 'source/uncommitted-working-tree.patch')).size > 0,
    git_bundle: 'source/offerpsp-landing.bundle',
    source_archive: 'source/offerpsp-source-head.tar.gz',
  },
  n8n: {
    active_workflows: n8n.active.length,
    retired_workflows: n8n.retired.length,
    active_graphs_are_exact_published_versions: true,
    credential_inventory: 'n8n/credential-inventory.json',
    credential_values_captured: false,
  },
  supabase: {
    project_ref: 'xcizofpejsomjiflesbx',
    local_migrations: fs.readdirSync(path.join(root, 'supabase/schema/local-migrations')).filter((name) => name.endsWith('.sql')).length,
    table_definitions: columns.length,
    data_tables: tables.length,
    data_rows: tables.reduce((sum, table) => sum + table.rows.length, 0),
    functions: catalog.functions.length,
    triggers: catalog.triggers.length,
    policies: catalog.policies.length,
    views: catalog.views.length,
    edge_functions: ['offerpsp-invite-member', 'offerpsp-ingest-email'],
    storage_buckets: catalog.storage_buckets.length,
    storage_objects: storage.length,
    storage_downloaded: storage.filter((item) => item.status === 'downloaded').length,
    storage_blocked: storage.filter((item) => item.status !== 'downloaded').map((item) => `${item.bucket}/${item.name}`),
  },
  vercel: {
    projects: ['OfferPSP public/portal', "Captain's Bridge"],
    captured: ['project metadata', 'deployment history', 'deployment protection', 'local project links'],
    secret_values_captured: false,
  },
  distribution: {
    sanitized_pack: 'sale-ready/',
    production_data_included: false,
    credential_values_included: false,
    active_workflows_default_active: false,
  },
  verification: {
    sale_pack_clean_install: 'VERIFIED',
    sale_pack_validate: 'VERIFIED',
    captain_bridge_typescript_build: 'VERIFIED',
    all_local_migrations_replayed_in_clean_pglite: 'VERIFIED',
    exact_git_bundle: 'VERIFIED',
    complete_isolated_restore_rehearsal: 'NOT_RUN',
  },
  known_limits: [
    'Supabase Auth passwords and OAuth provider secrets are intentionally not exportable; users must re-authenticate.',
    'Two private source objects could not be downloaded by ordinary staff/client sessions; their metadata is captured and they require service-role or platform backup recovery.',
    'Vercel secret values and n8n credential values remain in their native secret stores and are represented only by a placement inventory.',
    'A complete restore into isolated Supabase, n8n and Vercel projects has not been performed; the pack is recovery-ready but not yet disaster-rehearsal-certified.',
  ],
};

fs.writeFileSync(path.join(root, 'MANIFEST.json'), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
console.log(JSON.stringify({ status: 'written', manifest: path.join(root, 'MANIFEST.json') }));
