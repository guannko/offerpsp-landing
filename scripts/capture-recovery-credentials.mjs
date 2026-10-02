import assert from 'node:assert/strict';
import { mkdir, lstat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { fileURLToPath } from 'node:url';

// Run manually by Boris. Accept exactly two scoped existing credentials through
// hidden TTY input. No shell history, command-line secret, network call or log.
export const projectRef = 'iceopurxqzqmwtcmwfzl';
const privateDirectory = '/Users/borisboris/diskD/N8N/AIBot/offerpsp-landing/.private/recovery-credentials-20261002';

export async function hiddenInput(prompt, input = process.stdin, output = process.stdout) {
  assert.ok(input.isTTY, 'Use a local interactive terminal, not a pipe');
  output.write(prompt);
  return new Promise((resolve, reject) => {
    // Let Node handle terminal editing, UTF-8 chunks and paste sequences. All
    // readline output is discarded so neither characters nor ANSI echoes leak.
    const silent = new Writable({ write(_chunk, _encoding, done) { done(); } });
    const reader = createInterface({ input, output: silent, terminal: true, historySize: 0 });
    let settled = false;
    reader.on('SIGINT', () => reader.close());
    reader.on('close', () => {
      input.pause();
      output.write('\n');
      if (!settled) reject(new Error('Cancelled; no credentials written'));
    });
    reader.question('').then((value) => {
      settled = true;
      reader.close();
      resolve(value);
    }, (error) => { reader.close(); reject(error); });
  });
}

export function validateStorageKey(value) {
  if (value.startsWith('sb_secret_') && value.length > 30) return;
  let claims;
  try {
    if (value.split('.').length !== 3) throw new Error();
    claims = JSON.parse(Buffer.from(value.split('.')[1], 'base64url').toString('utf8'));
  } catch {
    throw new Error('Нужен существующий service_role или secret API key, не anon/publishable key.');
  }
  if (claims.ref !== projectRef) throw new Error('Ключ относится к другому проекту. Нужен текущий OfferPSP.');
  if (claims.role !== 'service_role') throw new Error('Нужен service_role: публичный ключ не подходит для полной копии Storage.');
}

export async function captureCredentials({ directory = privateDirectory, read = hiddenInput,
  log = (message) => console.log(message) } = {}) {
  process.umask(0o077);
  const target = path.join(directory, 'credentials.json');
  try { await lstat(target); throw new Error('Credential file already exists; refusing overwrite'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  log('OfferPSP: скрытый ввод. Символов и звёздочек не будет. Вставьте значение и нажмите Enter. Ctrl-C — отмена.');
  let databasePassword;
  do {
    databasePassword = await read('Текущий пароль Postgres: ');
    if (!databasePassword.trim()) log('Получен пустой ввод. Введите или вставьте пароль ещё раз.');
  } while (!databasePassword.trim());
  // This is an existing credential, not password creation. Preserve its exact
  // value without imposing a new local length policy or trimming significant spaces.
  let storageApiKey;
  for (;;) {
    storageApiKey = (await read('Существующий service_role / secret API key этого проекта: ')).trim();
    try { validateStorageKey(storageApiKey); break; }
    catch (error) { log(`${error.message} Попробуйте ещё раз.`); }
  }
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const info = await lstat(directory);
  assert.ok(info.isDirectory() && !info.isSymbolicLink(), 'Credential directory must be a real local directory');
  assert.equal(info.mode & 0o077, 0, 'Credential directory must be private');
  await writeFile(target, JSON.stringify({ project_ref: projectRef, database_password: databasePassword,
    storage_api_key: storageApiKey, saved_at: new Date().toISOString() }), { flag: 'wx', mode: 0o600 });
  log(`Saved only these two credentials in the private local file: ${target}`);
  return target;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await captureCredentials(); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
