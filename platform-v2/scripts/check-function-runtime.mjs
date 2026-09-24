// Run in a Linux container with ONLY the built output mounted, without source node_modules.
// Example: node check-function-runtime.mjs /release/functions/api
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

assert.equal(process.platform, 'linux', 'Verify Linux deployment artifacts in Linux, not on the build host');
const root = resolve(process.argv[2] || '.vercel/output/functions/api');
const functions = (await readdir(root)).filter(name => name.endsWith('.func')).sort();
assert.ok(functions.length, 'No built functions found');
for (const name of functions) {
  const directory = join(root, name);
  const config = JSON.parse(await readFile(join(directory, '.vc-config.json'), 'utf8'));
  if (config.architecture) assert.equal(config.architecture, process.arch, `${name}: architecture mismatch`);
  assert.equal(config.runtime, `nodejs${process.versions.node.split('.')[0]}.x`, `${name}: Node runtime mismatch`);
  const handler = pathToFileURL(join(directory, config.handler)).href;
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(handler)})`], {
    cwd: directory, encoding: 'utf8', timeout: 30000,
    env: { PATH: process.env.PATH, HOME: '/tmp', NODE_ENV: 'production' },
  });
  if (child.status !== 0) throw new Error(`${name}: bundled handler cannot start\n${child.stderr}`);
  console.log(`PASS ${name}: ${config.runtime}/${process.arch} isolated bundle import`);
}
console.log(`Verified ${functions.length} Linux function bundles without credentials or network requests`);
