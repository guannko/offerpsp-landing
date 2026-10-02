import assert from 'node:assert/strict';
import { mkdir, lstat, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Run manually by Boris. Accept exactly two scoped existing credentials through
// hidden TTY input. No shell history, command-line secret, network call or log.
const projectRef = 'iceopurxqzqmwtcmwfzl';
const directory = '/Users/borisboris/diskD/N8N/AIBot/offerpsp-landing/.private/recovery-credentials-20261002';
const target = path.join(directory, 'credentials.json');
process.umask(0o077);
assert.ok(process.stdin.isTTY, 'Use a local interactive terminal, not a pipe');
try { await lstat(target); throw new Error('Credential file already exists; refusing overwrite'); }
catch (error) { if (error.code !== 'ENOENT') throw error; }

async function hiddenInput(prompt) {
  process.stdout.write(prompt);
  return new Promise((resolve, reject) => {
    let value = '';
    const previousRaw = process.stdin.isRaw;
    process.stdin.setRawMode(true);
    process.stdin.resume();
    const cleanup = () => {
      process.stdin.off('data', receive);
      process.stdin.setRawMode(Boolean(previousRaw));
      process.stdin.pause();
      process.stdout.write('\n');
    };
    const receive = (chunk) => {
      for (const char of chunk.toString('utf8')) {
        if (char === '\u0003') { cleanup(); reject(new Error('Cancelled; no credentials written')); return; }
        if (char === '\r' || char === '\n') { cleanup(); resolve(value); return; }
        if (char === '\u007f' || char === '\b') value = value.slice(0, -1);
        else if (char >= ' ') value += char;
      }
    };
    process.stdin.on('data', receive);
  });
}

console.log('OfferPSP current-project recovery credentials. Input is hidden. Ctrl-C cancels.');
const databasePassword = await hiddenInput('Current Postgres password (after your dashboard reset): ');
assert.ok(databasePassword.length >= 12, 'A strong password of at least 12 characters is required');
const storageApiKey = (await hiddenInput('Existing service_role or secret API key from this same project: ')).trim();
if (storageApiKey.startsWith('sb_secret_')) assert.ok(storageApiKey.length > 30);
else {
  const claims = JSON.parse(Buffer.from(storageApiKey.split('.')[1], 'base64url').toString('utf8'));
  assert.equal(claims.ref, projectRef, 'Use the current OfferPSP project key, not the old shared project');
  assert.equal(claims.role, 'service_role', 'Publishable keys cannot make a complete Storage backup');
}
await mkdir(directory, { recursive: true, mode: 0o700 });
const info = await lstat(directory);
assert.ok(info.isDirectory() && !info.isSymbolicLink(), 'Credential directory must be a real local directory');
assert.equal(info.mode & 0o077, 0, 'Credential directory must be private');
await writeFile(target, JSON.stringify({ project_ref: projectRef, database_password: databasePassword,
  storage_api_key: storageApiKey, saved_at: new Date().toISOString() }), { flag: 'wx', mode: 0o600 });
console.log(`Saved only these two credentials in the private local file: ${target}`);
