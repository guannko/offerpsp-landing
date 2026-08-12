import fs from 'node:fs';
import path from 'node:path';

const [rootArg] = process.argv.slice(2);
if (!rootArg) throw new Error('Usage: node export-storage-private.mjs <private-recovery-root>');
const root = path.resolve(rootArg);
const secretsPath = '/Users/borisboris/diskD/.bix/BIX_SECRETS.local.md';
const projectRef = 'xcizofpejsomjiflesbx';
const credentialsPath = path.resolve('.private/e2e-production-credentials.json');

function findProjectToken(text, requiredRole) {
  const tokens = text.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g) || [];
  for (const token of tokens) {
    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
      if (payload.role === requiredRole && (!payload.ref || payload.ref === projectRef)) return token;
    } catch {}
  }
  throw new Error(`Matching Supabase ${requiredRole} token was not found in the local secret store.`);
}

const secretText = fs.readFileSync(secretsPath, 'utf8');
let serviceRole = null;
try {
  serviceRole = findProjectToken(secretText, 'service_role');
} catch {}
const anonKey = findProjectToken(secretText, 'anon');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'supabase/schema/catalog.json'), 'utf8'));
const outputRoot = path.join(root, 'supabase/storage/objects');
const manifest = [];

async function signIn(email, password) {
  const response = await fetch(`https://${projectRef}.supabase.co/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) return null;
  const payload = await response.json();
  return payload.access_token || null;
}

const tokens = serviceRole ? [{ label: 'service_role', token: serviceRole, apiKey: serviceRole }] : [];
if (!serviceRole && fs.existsSync(credentialsPath)) {
  const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
  for (const role of ['staff', 'client']) {
    const token = await signIn(credentials[`${role}_email`], credentials[`${role}_password`]);
    if (token) tokens.push({ label: role, token, apiKey: anonKey });
  }
}
if (!tokens.length) throw new Error('No authorized Supabase session is available for private Storage export.');

for (const item of catalog.storage_objects || []) {
  const target = path.join(outputRoot, item.bucket_id, item.name);
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const objectPath = item.name.split('/').map(encodeURIComponent).join('/');
  const url = `https://${projectRef}.supabase.co/storage/v1/object/authenticated/${encodeURIComponent(item.bucket_id)}/${objectPath}`;
  let response = null;
  let downloadedBy = null;
  const attempts = [];
  for (const session of tokens) {
    response = await fetch(url, { headers: { apikey: session.apiKey, Authorization: `Bearer ${session.token}` } });
    attempts.push({ role: session.label, status: response.status });
    if (response.ok) {
      downloadedBy = session.label;
      break;
    }
  }
  if (!response?.ok) {
    manifest.push({ bucket: item.bucket_id, name: item.name, status: 'blocked', attempts });
    continue;
  }
  fs.writeFileSync(target, Buffer.from(await response.arrayBuffer()), { mode: 0o600 });
  manifest.push({
    bucket: item.bucket_id,
    name: item.name,
    size: fs.statSync(target).size,
    target: path.relative(root, target),
    downloaded_by: downloadedBy,
    status: 'downloaded',
  });
}

fs.writeFileSync(path.join(root, 'supabase/storage/manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
const downloaded = manifest.filter((item) => item.status === 'downloaded').length;
console.log(`Downloaded ${downloaded}/${manifest.length} Storage objects.`);
if (downloaded !== manifest.length) process.exitCode = 2;
