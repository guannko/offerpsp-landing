import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PassThrough, Writable } from 'node:stream';
import { captureCredentials, hiddenInput, projectRef, validateStorageKey } from './capture-recovery-credentials.mjs';

// Synthetic values only. No network and no production credential path writes.
const fakeKey = (ref = projectRef, role = 'service_role') =>
  `test.${Buffer.from(JSON.stringify({ ref, role })).toString('base64url')}.synthetic`;

test('existing short password survives empty retry and exact-value preservation', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'offerpsp-credential-fixture-'));
  const inputs = ['', ' short ', fakeKey('old-project'), fakeKey(projectRef, 'anon'), fakeKey()];
  const logs = [];
  try {
    const target = await captureCredentials({ directory, read: async () => inputs.shift(), log: (v) => logs.push(v) });
    const saved = JSON.parse(await readFile(target, 'utf8'));
    assert.equal(saved.database_password, ' short ');
    assert.equal(saved.storage_api_key, fakeKey());
    assert.equal(saved.project_ref, projectRef);
    assert.equal((await stat(target)).mode & 0o777, 0o600);
    assert.equal((await stat(directory)).mode & 0o777, 0o700);
    assert.ok(logs.some((v) => v.includes('пустой ввод')));
    assert.ok(!logs.join('\n').includes(' short '));
    assert.ok(!logs.join('\n').includes(fakeKey()));
    await assert.rejects(captureCredentials({ directory, read: () => { throw new Error('Must not read'); }, log: () => {} }), /refusing overwrite/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('key validation rejects wrong project, public key and malformed input without echo', () => {
  validateStorageKey(fakeKey());
  validateStorageKey(`sb_secret_${'x'.repeat(40)}`);
  assert.throws(() => validateStorageKey(fakeKey('wrong-project')), /другому проекту/);
  assert.throws(() => validateStorageKey(fakeKey(projectRef, 'anon')), /публичный ключ/);
  assert.throws(() => validateStorageKey('synthetic-private-input'), (error) => !error.message.includes('synthetic-private-input'));
});

function fakeTerminal() {
  const input = new PassThrough();
  input.isTTY = true;
  input.isRaw = false;
  input.setRawMode = (value) => { input.isRaw = value; };
  return input;
}

test('hidden terminal input handles split UTF-8, paste wrappers and editing without echo', async () => {
  const input = fakeTerminal();
  let visible = '';
  const output = new Writable({ write(chunk, _encoding, done) { visible += chunk.toString(); done(); } });
  const result = hiddenInput('Prompt: ', input, output);
  input.write('\u001b[200~');
  const payload = Buffer.from('synthé');
  for (const byte of payload) input.write(Buffer.from([byte]));
  input.write('\u001b[201~');
  input.write('x');
  input.write('\u007f');
  input.write('\r');
  assert.equal(await result, 'synthé');
  assert.equal(visible, 'Prompt: \n');
  assert.equal(input.isRaw, false);
  input.destroy();
});

test('Ctrl-C restores terminal and cancels without revealing or saving input', async () => {
  const input = fakeTerminal();
  let visible = '';
  const output = new Writable({ write(chunk, _encoding, done) { visible += chunk.toString(); done(); } });
  const result = hiddenInput('Prompt: ', input, output);
  input.write('synthetic-secret\u0003');
  await assert.rejects(result, /Cancelled; no credentials written/);
  assert.equal(visible, 'Prompt: \n');
  assert.equal(input.isRaw, false);
  input.destroy();
});
