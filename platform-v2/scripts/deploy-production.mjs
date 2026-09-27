import { execFileSync, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const platformRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = path.resolve(platformRoot, "..");

function gitValue(args) {
  return execFileSync("git", args, { cwd: repositoryRoot, encoding: "utf8" }).trim();
}

const commit = gitValue(["rev-parse", "HEAD"]);
const branch = gitValue(["rev-parse", "--abbrev-ref", "HEAD"]);
if (!/^[0-9a-f]{40}$/i.test(commit)) throw new Error("Unable to resolve the Git commit for deployment");

const args = [
  "deploy",
  "--prod",
  "--yes",
  "--build-env",
  `OFFERPSP_BUILD_COMMIT_SHA=${commit}`,
  "--build-env",
  `OFFERPSP_BUILD_REF=${branch}`,
  ...process.argv.slice(2),
];

process.stdout.write(`Deploying OfferPSP commit ${commit.slice(0, 12)} from ${branch}\n`);
const result = spawnSync("vercel", args, {
  cwd: platformRoot,
  stdio: "inherit",
  env: process.env,
});

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
