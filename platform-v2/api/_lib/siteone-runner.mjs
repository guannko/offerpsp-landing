import { execFile } from "node:child_process";
import { mkdir, readFile, unlink } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function resolveBinaryPath(runtimeArch) {
  const binaryName = runtimeArch === "arm64"
    ? "siteone-crawler-arm64"
    : runtimeArch === "x64"
      ? "siteone-crawler-x64"
      : null;

  if (!binaryName) throw new Error(`SiteOne crawler does not support runtime architecture: ${runtimeArch}`);
  return fileURLToPath(new URL(`../../vendor/siteone-crawler/${binaryName}`, import.meta.url));
}

export async function runSiteOneAudit({
  targetUrl = "https://offerpsp.com/",
  executor = execFileAsync,
  directoryMaker = mkdir,
  fileReader = readFile,
  fileRemover = unlink,
  runtimeArch = process.arch,
} = {}) {
  const binaryPath = resolveBinaryPath(runtimeArch);
  const runId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const reportPath = `/tmp/offerpsp-siteone-${runId}.json`;
  const args = [
    `--url=${targetUrl}`,
    "--workers=4",
    "--max-reqs-per-sec=5",
    "--http-cache-dir=off",
    "--result-storage-dir=/tmp",
    `--output-json-file=${reportPath}`,
    "--output-html-report=",
    "--output-text-file=",
  ];

  try {
    // SiteOne validates its default relative AI cache path even while AI is disabled.
    // Keeping all --ai-* flags absent is what leaves AI strictly opt-in.
    await directoryMaker("/tmp/tmp/ai-cache", { recursive: true });
    await executor(binaryPath, args, { cwd: "/tmp", timeout: 45_000, maxBuffer: 2 * 1024 * 1024 });
    return JSON.parse(await fileReader(reportPath, "utf8"));
  } catch (error) {
    const detail = String(error?.stderr || error?.message || error).replace(/\x1b\[[0-9;]*m/g, "").slice(-1500);
    throw new Error(`SiteOne crawl failed: ${detail}`);
  } finally {
    await fileRemover(reportPath).catch(() => undefined);
  }
}
