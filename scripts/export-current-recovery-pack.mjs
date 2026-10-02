import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir, mkdtemp, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Authorized inbound export only. Password/key never enter argv or printed logs.
// Connection fields verified in the current project's Connect sheet, not guessed.
process.umask(0o077);
const projectRef = 'iceopurxqzqmwtcmwfzl';
const image = 'public.ecr.aws/supabase/postgres:17.6.1.167';
const privateRoot = '/Users/borisboris/diskD/N8N/AIBot/offerpsp-landing/.private/recovery-packs';
const credentialFile = '/Users/borisboris/diskD/N8N/AIBot/offerpsp-landing/.private/recovery-credentials-20261002/credentials.json';
const certificateFile = path.join(path.dirname(credentialFile), 'prod-ca-2021.crt');
assert.ok((await readFile(certificateFile, 'utf8')).includes('BEGIN CERTIFICATE'));
const credentials = JSON.parse(await readFile(credentialFile, 'utf8'));
assert.equal(credentials.project_ref, projectRef);
assert.equal((await stat(credentialFile)).mode & 0o077, 0);
assert.ok(credentials.database_password && credentials.storage_api_key);
await mkdir(privateRoot, { recursive: true, mode: 0o700 });
const pack = await mkdtemp(path.join(privateRoot, 'current-20261002-'));
const env = { ...process.env, PGPASSWORD: credentials.database_password,
  PGHOST: 'aws-1-eu-west-1.pooler.supabase.com', PGPORT: '5432',
  PGUSER: `postgres.${projectRef}`, PGDATABASE: 'postgres', PGSSLMODE: 'verify-full',
  PGSSLROOTCERT: '/tmp/supabase-root.crt', PGCONNECT_TIMEOUT: '20',
  PGOPTIONS: '-c default_transaction_read_only=on -c statement_timeout=180000',
  PGAPPNAME: 'offerpsp-authorized-recovery-export' };
const dockerBase = ['run', '--rm', '--pull', 'never', '--read-only', '--tmpfs', '/tmp',
  '--mount', `type=bind,source=${certificateFile},target=/tmp/supabase-root.crt,readonly`,
  ...['PGPASSWORD', 'PGHOST', 'PGPORT', 'PGUSER', 'PGDATABASE', 'PGSSLMODE',
    'PGSSLROOTCERT', 'PGCONNECT_TIMEOUT', 'PGOPTIONS', 'PGAPPNAME'].flatMap((v) => ['--env', v])];
const report = { project_ref: projectRef, image, started_at: new Date().toISOString(),
  scope: 'Current logical database export plus separately inventoried Storage; not an atomic cross-service snapshot',
  tls: 'verify-full', production_mutations: false, status: 'IN_PROGRESS', steps: [] };
async function receipt() { await writeFile(path.join(pack, 'export-report.json'), JSON.stringify(report, null, 2), { mode: 0o600 }); }
async function run(program, args, options = {}) {
  const child = spawn(program, args, { env: options.env || env, stdio: ['pipe', 'pipe', 'pipe'] });
  const stdout = [], stderr = [];
  child.stdout.on('data', (b) => stdout.push(b));
  child.stderr.on('data', (b) => stderr.push(b));
  child.stdin.on('error', () => {});
  child.stdin.end(options.input || '');
  const timer = setTimeout(() => child.kill('SIGTERM'), 240000);
  const code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('close', resolve); });
  clearTimeout(timer);
  const err = Buffer.concat(stderr);
  if (err.length) await writeFile(path.join(pack, `${options.name || program}-stderr.txt`), err, { mode: 0o600 });
  if (code !== 0) throw new Error(`${options.name || program} failed (exit ${code}); diagnostic saved privately`);
  return Buffer.concat(stdout);
}
async function file(name, bytes) {
  await writeFile(path.join(pack, name), bytes, { mode: 0o600, flag: 'wx' });
  return { file: name, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
}
try {
  await receipt();
  const connection = await run('docker', [...dockerBase, '--entrypoint', 'psql', image, '-XAt', '-c', '\\conninfo'], { name: 'tls-connection' });
  assert.match(connection.toString(), /SSL connection/);
  report.steps.push(await file('tls-connection.txt', connection));
  const inventoryQuery = `SELECT jsonb_build_object('server_version', current_setting('server_version'),
    'database', current_database(), 'database_bytes', pg_database_size(current_database()),
    'tls_active', (SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()),
    'extensions', (SELECT jsonb_agg(jsonb_build_object('name',extname,'version',extversion) ORDER BY extname) FROM pg_extension),
    'schemas', (SELECT jsonb_agg(nspname ORDER BY nspname) FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname <> 'information_schema'),
    'tables', (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind IN ('r','p') AND n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema'));
  `;
  const inventory = await run('docker', [...dockerBase, '-i', '--entrypoint', 'psql', image, '-XqAt', '-v', 'ON_ERROR_STOP=1'], { input: inventoryQuery, name: 'inventory' });
  report.inventory = JSON.parse(inventory.toString());
  assert.equal(report.inventory.database, 'postgres');
  // pg_stat_ssl observes the pooler-to-database leg, not this verified TLS client connection.
  report.client_tls_verified = true;
  report.steps.push(await file('database-inventory.json', inventory));
  console.log(JSON.stringify({ stage: 'connection', pass: true, version: report.inventory.server_version, database_bytes: report.inventory.database_bytes, tables: report.inventory.tables, tls: true, pack }));
  await receipt();
  report.steps.push(await file('roles.sql', await run('docker', [...dockerBase, '--entrypoint', 'pg_dumpall', image, '--roles-only', '--no-role-passwords'], { name: 'roles' })));
  await receipt();
  report.steps.push(await file('database.dump', await run('docker', [...dockerBase, '--entrypoint', 'pg_dump', image,
    '--format=custom', '--no-password', '--lock-wait-timeout=20s'], { name: 'database' })));
  await receipt();
  console.log(JSON.stringify({ stage: 'database-dump', pass: true, bytes: report.steps.at(-1).bytes }));
  const storageScript = path.join(path.dirname(fileURLToPath(import.meta.url)), 'backup-current-storage.mjs');
  const storageOutput = await run(process.execPath, [storageScript, path.join(pack, 'storage-export')], {
    env: { ...process.env, VITE_SUPABASE_URL: `https://${projectRef}.supabase.co`, SUPABASE_SERVICE_ROLE_KEY: credentials.storage_api_key }, name: 'storage' });
  report.steps.push(await file('storage-export-receipt.jsonl', storageOutput));
  const storage = JSON.parse(await readFile(path.join(pack, 'storage-export/manifest.json'), 'utf8'));
  report.storage = { objects: storage.objects.length, total_bytes: storage.total_bytes, buckets: storage.buckets.length, completed_at: storage.completed_at };
  report.completed_at = new Date().toISOString();
  report.status = 'EXPORTED; restoration not yet verified';
  await receipt();
  console.log(JSON.stringify({ stage: 'export', status: report.status, pack, storage: report.storage }));
} catch (error) {
  report.status = 'FAILED'; report.failure = error.message; await receipt();
  console.error(JSON.stringify({ pack, status: report.status, error: error.message }));
  process.exitCode = 1;
}
