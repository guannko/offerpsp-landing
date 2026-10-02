// Preserve current public assets outside the explicitly selected portal release.
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, '.vercel/output/static');
const release = process.argv[2] || 'company-members';
if (!['company-members', 'portal-quality'].includes(release)) throw Error('Unknown portal release scope');
const snapshot = resolve(root, `.private/releases/${release === 'portal-quality' ? '20261002-portal-quality' : '20261001-company-members'}/public-baseline`);
const changed = new Set(['/portal/index.html', '/portal/app.js', '/portal/styles.css',
  release === 'portal-quality' ? '/portal/auth-status.js' : '/portal/company-members.js']);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function files(dir) {
  const result = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) result.push(...await files(path)); else result.push(path);
  }
  return result;
}
const paths = (await files(output)).map(path => path.slice(output.length));
for (const path of changed) if (!paths.includes(path)) throw Error(`Missing release asset ${path}`);
const manifest = [];
for (let i = 0; i < paths.length; i += 6) {
  await Promise.all(paths.slice(i, i + 6).map(async path => {
    const local = await readFile(output + path);
    if (changed.has(path)) { manifest.push({ path, changed: true, release_sha256: hash(local) }); return; }
    const response = await fetch('https://offerpsp.com' + path, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw Error(`Cannot preserve live asset ${path}: HTTP ${response.status}`);
    const live = Buffer.from(await response.arrayBuffer());
    await mkdir(dirname(snapshot + path), { recursive: true });
    await writeFile(snapshot + path, live);
    if (hash(local) !== hash(live)) await writeFile(output + path, live);
    manifest.push({ path, changed: false, live_sha256: hash(live), restored: hash(local) !== hash(live) });
  }));
}
manifest.sort((a, b) => a.path.localeCompare(b.path));
await mkdir(snapshot, { recursive: true });
await writeFile(snapshot + '/manifest.json', JSON.stringify({ files: manifest }, null, 2));
console.log(JSON.stringify({ files: manifest.length, changed: [...changed],
  preserved: manifest.filter(item => !item.changed).length, restored: manifest.filter(item => item.restored).map(item => item.path) }, null, 2));
