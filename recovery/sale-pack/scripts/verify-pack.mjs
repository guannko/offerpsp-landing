import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const [rootArg] = process.argv.slice(2);
if (!rootArg) throw new Error('Usage: node verify-pack.mjs <private-recovery-root>');
const root = path.resolve(rootArg);
const saleRoot = path.join(root, 'sale-ready');

function filesUnder(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(target) : [target];
  });
}

const allPrivateFiles = filesUnder(root).filter((file) => !file.includes(`${path.sep}checksums${path.sep}`));
const checksumLines = allPrivateFiles.sort().map((file) => {
  const digest = createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  return `${digest}  ${path.relative(root, file)}`;
});
fs.mkdirSync(path.join(root, 'checksums'), { recursive: true, mode: 0o700 });
fs.writeFileSync(path.join(root, 'checksums', 'SHA256SUMS'), `${checksumLines.join('\n')}\n`, { mode: 0o600 });

const forbidden = [
  /xcizofpejsomjiflesbx/i,
  /ops-7q4m2x9k8v3n\.vercel\.app/i,
  /annoris--n8n-make/i,
  /guannko@gmail\.com/i,
  /yandoodle2@gmail\.com/i,
  /@HighRiskWorld/i,
  /\/Users\/borisboris\/diskD/i,
  /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
];
const violations = [];
for (const file of filesUnder(saleRoot)) {
  const data = fs.readFileSync(file);
  if (data.subarray(0, 8192).includes(0)) continue;
  const text = data.toString('utf8');
  for (const pattern of forbidden) {
    if (pattern.test(text)) violations.push({ file: path.relative(saleRoot, file), pattern: String(pattern) });
  }
}

const exactActive = filesUnder(path.join(root, 'n8n/active')).filter((file) => file.endsWith('.json'));
const saleActive = filesUnder(path.join(saleRoot, 'n8n/active')).filter((file) => file.endsWith('.json'));
const report = {
  verified_at: new Date().toISOString(),
  private_file_count: allPrivateFiles.length,
  exact_active_workflows: exactActive.length,
  sanitized_active_workflows: saleActive.length,
  sale_secret_scan_violations: violations,
  status: violations.length || exactActive.length !== saleActive.length ? 'FAILED' : 'VERIFIED',
};
fs.writeFileSync(path.join(root, 'checksums', 'verification-report.json'), `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
console.log(JSON.stringify(report, null, 2));
if (report.status !== 'VERIFIED') process.exitCode = 1;
