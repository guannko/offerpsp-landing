import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const [privateRootArg] = process.argv.slice(2);
if (!privateRootArg) throw new Error('Usage: node build-sale-pack.mjs <private-recovery-root>');

const repoRoot = process.cwd();
const privateRoot = path.resolve(privateRootArg);
const stage = path.join(privateRoot, 'sale-ready');
const sourceRoot = path.join(stage, 'source');
const n8nRoot = path.join(stage, 'n8n', 'active');

fs.rmSync(stage, { recursive: true, force: true });
fs.mkdirSync(sourceRoot, { recursive: true, mode: 0o700 });
fs.mkdirSync(n8nRoot, { recursive: true, mode: 0o700 });

const allowedRoots = [
  'admin/', 'docs/OFFERPSP-INGESTION-STANDARD.md', 'docs/OFFERPSP-OFFER-MODEL.md',
  'docs/OFFERPSP-PLATFORM-ARCHITECTURE.md', 'docs/OFFERPSP-PRE-COMPLIANCE.md', 'platform-v2/',
  'portal/', 'scripts/', 'supabase/',
];
const allowedFiles = new Set([
  '.gitignore', '.vercelignore', 'favicon.svg', 'index.html', 'llms.txt', 'og-offerpsp.png',
  'package-lock.json', 'package.json', 'privacy.html', 'robots.txt', 'sitemap.xml', 'terms.html',
  'vercel.json',
]);
const excluded = [
  '/.env.local', '/node_modules/', '/dist/', '/.vercel/', '/recovery/', '/TASKS.md', '/AGENTS.md',
  '/CLAUDE.md', '/psp_database.csv',
];

const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: repoRoot })
  .toString('utf8').split('\0').filter(Boolean);

function includeFile(file) {
  if (allowedFiles.has(file)) return true;
  if (!allowedRoots.some((root) => file === root || file.startsWith(root))) return false;
  const normalized = `/${file}`;
  return !excluded.some((part) => normalized.includes(part));
}

function sanitizeText(input) {
  return input
    .replaceAll('xcizofpejsomjiflesbx', 'YOUR_SUPABASE_PROJECT_REF')
    .replaceAll('ops-7q4m2x9k8v3n.vercel.app', 'YOUR_OPS_DOMAIN')
    .replaceAll('annoris--n8n-make--xjvz9xynmzwk.code.run', 'YOUR_N8N_HOST')
    .replaceAll('bizdev@offerpsp.com', 'ops@your-domain.example')
    .replaceAll('guannko@gmail.com', 'owner@example.com')
    .replaceAll('yandoodle2@gmail.com', 'client@example.com')
    .replaceAll('@HighRiskWorld', '@YOUR_OWNER_HANDLE')
    .replaceAll('@Brain_Index', '@YOUR_PUBLIC_BOT')
    .replaceAll('Boris Kononenko', 'Product Owner')
    .replaceAll('Borys Kononenko', 'Product Owner')
    .replace(/\/Users\/borisboris\/diskD[^\s"']*/g, '<WORKSPACE>')
    .replace(/https:\/\/offerpsp\.com/g, 'https://YOUR_PUBLIC_DOMAIN')
    .replace(/(?<![A-Za-z0-9._%+-])[A-Za-z0-9._%+-]+@(?!your-domain\.example)[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, 'contact@example.com')
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, 'REPLACE_WITH_PLATFORM_KEY');
}

for (const file of tracked.filter(includeFile)) {
  const source = path.join(repoRoot, file);
  if (!fs.statSync(source).isFile()) continue;
  const target = path.join(sourceRoot, file);
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const data = fs.readFileSync(source);
  const isText = !data.subarray(0, 8192).includes(0);
  fs.writeFileSync(target, isText ? sanitizeText(data.toString('utf8')) : data, { mode: 0o600 });
}

function sanitizeWorkflow(workflow) {
  const clean = structuredClone(workflow.activeVersion || workflow);
  const secretKeys = /^(password|secret|api_?key|access_?token|bot_?token|webhook_?secret|ingest_?token|authorization)$/i;
  const chatKeys = /^(chat_?id|allowed_?user_?ids|owner_?user_?id)$/i;

  function walk(value, key = '') {
    if (Array.isArray(value)) return value.map((item) => walk(item));
    if (value && typeof value === 'object') {
      const output = {};
      for (const [childKey, childValue] of Object.entries(value)) {
        if (childKey === 'credentials') {
          output.credentials = Object.fromEntries(Object.keys(childValue).map((type) => [
            type, { name: `CONFIGURE_${type.toUpperCase()}` },
          ]));
        } else if (childKey === 'webhookId') {
          continue;
        } else if (secretKeys.test(childKey)) {
          output[childKey] = `CONFIGURE_${childKey.toUpperCase()}`;
        } else if (chatKeys.test(childKey)) {
          output[childKey] = 'CONFIGURE_TELEGRAM_ID';
        } else {
          output[childKey] = walk(childValue, childKey);
        }
      }
      return output;
    }
    if (typeof value === 'string') return sanitizeText(value);
    return value;
  }

  const sanitized = walk(clean);
  return {
    name: sanitized.name,
    nodes: sanitized.nodes || [],
    connections: sanitized.connections || {},
    settings: sanitized.settings || {},
    staticData: null,
    pinData: {},
    active: false,
    tags: [],
  };
}

const activeDir = path.join(privateRoot, 'n8n', 'active');
for (const file of fs.readdirSync(activeDir).filter((file) => file.endsWith('.json')).sort()) {
  const workflow = JSON.parse(fs.readFileSync(path.join(activeDir, file), 'utf8'));
  fs.writeFileSync(path.join(n8nRoot, file), `${JSON.stringify(sanitizeWorkflow(workflow), null, 2)}\n`, { mode: 0o600 });
}

const privateManifest = JSON.parse(fs.readFileSync(path.join(privateRoot, 'n8n', 'manifest.json'), 'utf8'));
const distributionManifest = {
  generated_at: new Date().toISOString(),
  product: 'OfferPSP + AIBot',
  source_commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot }).toString().trim(),
  active_workflows: privateManifest.active.map(({ id, ...item }) => ({ ...item, original_id_removed: Boolean(id) })),
  retired_workflows: privateManifest.retired.map(({ id, ...item }) => ({ ...item, original_id_removed: Boolean(id) })),
  production_data_included: false,
  credentials_included: false,
  workflows_default_active: false,
};
fs.writeFileSync(path.join(stage, 'manifest.json'), `${JSON.stringify(distributionManifest, null, 2)}\n`, { mode: 0o600 });

const docsSource = path.resolve(repoRoot, 'recovery/sale-pack/docs');
fs.cpSync(docsSource, path.join(stage, 'docs'), { recursive: true });
fs.copyFileSync(path.resolve(repoRoot, 'recovery/sale-pack/README.md'), path.join(stage, 'README.md'));

console.log(`Sale-ready stage created at ${path.relative(repoRoot, stage)}.`);
