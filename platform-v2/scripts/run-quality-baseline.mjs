// Local-only regression evidence. This is not an ASVS/WCAG certification scanner.
import { spawn } from "node:child_process";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const app = path.join(root, "platform-v2");
const startedAt = new Date().toISOString();
const environment = { node_version: process.version, platform: process.platform, arch: process.arch };
const outputDir = path.join(root, "tmp", "quality-baseline", startedAt.replace(/[:.]/g, "-"));
await mkdir(outputDir, { recursive: true });
const suites = [
  ["public-portal-contracts", root, "npm", ["run", "validate"]],
  ["migration-replay", root, process.execPath, ["scripts/validate-offerpsp-migrations.mjs", app]],
  ["lint", app, "npm", ["run", "lint"]],
  ...["operations-presentation", "calendar-events", "course-organizer", "work-documents", "work-originals", "operational-consistency", "offer-parser", "provider-source", "mailbox-poller", "sent-mail-archive", "document-processing", "intake-autopilot", "intake-auto-reply", "intake-display", "intake-concurrency", "company-screening", "screening-concurrency", "research-screening", "mcp", "pdf-extractor", "bridges", "modules", "pwa"].map((name) => [name, app, "npm", ["run", `test:${name}`]]),
  ["build", app, "npm", ["run", "build"]],
];
const pkg = JSON.parse(await readFile(path.join(app, "package.json"), "utf8"));
for (const [id, cwd, command, args] of suites) {
  if (cwd === app && command === "npm" && !pkg.scripts[args[1]]) throw new Error(`Unknown suite ${id}`);
}
const results = [];
// Two independent processes keep latency down without overloading local Postgres fixtures.
let cursor = 0;
async function worker() {
  while (cursor < suites.length) {
    const [id, cwd, command, args] = suites[cursor++];
    const start = Date.now();
    let text = "", timedOut = false;
    const child = spawn(command, args, { cwd, env: { ...process.env, FORCE_COLOR: "0" }, stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.on("data", (chunk) => { text = (text + chunk).slice(-8_000_000); });
    child.stderr.on("data", (chunk) => { text = (text + chunk).slice(-8_000_000); });
    const timer = setTimeout(() => { timedOut = true; child.kill("SIGTERM"); }, 180_000);
    const outcome = await new Promise((resolve) => {
      child.on("error", (error) => resolve({ code: null, error: error.message }));
      child.on("close", (code, signal) => resolve({ code, signal }));
    });
    clearTimeout(timer);
    const log = `${id}.log`;
    await writeFile(path.join(outputDir, log), text);
    const status = outcome.code === 0 ? "PASS" : timedOut || /ENOENT|Cannot find module|Docker daemon|socket is absent|permission denied while trying to connect to the docker API/.test(text + (outcome.error || "")) ? "BLOCKED" : "FAIL";
    const result = { id, status, ...outcome, timed_out: timedOut, duration_ms: Date.now() - start, command: [command, ...args], log };
    results.push(result);
    console.log(JSON.stringify(result));
    await writeFile(path.join(outputDir, "report.json"), JSON.stringify({ started_at: startedAt, environment, results, scope: "local regressions only; no full compliance claim" }, null, 2));
  }
}
await Promise.all([worker(), worker()]);
const counts = Object.fromEntries(["PASS", "FAIL", "BLOCKED"].map((status) => [status, results.filter((r) => r.status === status).length]));
console.log(JSON.stringify({ output_dir: outputDir, counts, finished_at: new Date().toISOString() }));
process.exitCode = counts.FAIL || counts.BLOCKED ? 1 : 0;
