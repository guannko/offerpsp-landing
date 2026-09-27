import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const platformRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = path.resolve(platformRoot, "..");

function gitCommit() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: repositoryRoot, encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

const explicitCommit = String(process.env.OFFERPSP_BUILD_COMMIT_SHA || "").trim();
const commit = explicitCommit || process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || gitCommit();
const manifest = {
  schema_version: 1,
  commit: commit || null,
  built_at: new Date().toISOString(),
  deployment_id: process.env.VERCEL_DEPLOYMENT_ID || null,
  deployment_url: process.env.VERCEL_URL || null,
  source: explicitCommit
    ? "explicit-build-env"
    : process.env.VERCEL_GIT_COMMIT_SHA
      ? "vercel-git"
      : process.env.GITHUB_SHA
        ? "github-actions"
        : commit
          ? "local-git"
          : "unknown",
};

await mkdir(path.join(platformRoot, "public"), { recursive: true });
await writeFile(path.join(platformRoot, "public", "build-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
process.stdout.write(`Build manifest: ${manifest.source} ${commit ? commit.slice(0, 12) : "no-commit"}\n`);
