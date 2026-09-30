#!/usr/bin/env node

import { readdir, stat } from "node:fs/promises";
import path from "node:path";

const functionsRoot = path.resolve(".vercel/output/functions");
const MAX_TOTAL_BYTES = 120 * 1024 * 1024;
const MAX_FUNCTION_BYTES = 80 * 1024 * 1024;

async function directorySize(directory) {
  let total = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) total += await directorySize(entryPath);
    else if (entry.isFile()) total += (await stat(entryPath)).size;
  }
  return total;
}

async function findFunctionDirectories(directory) {
  const found = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (!entry.isDirectory()) continue;
    if (entry.name.endsWith(".func")) found.push(entryPath);
    else found.push(...await findFunctionDirectories(entryPath));
  }
  return found;
}

const formatMiB = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MiB`;

let functionDirectories;
try {
  functionDirectories = await findFunctionDirectories(functionsRoot);
} catch (error) {
  if (error?.code === "ENOENT") {
    throw new Error("Missing .vercel/output/functions. Run `vercel build --prod` first.");
  }
  throw error;
}

const functions = [];
for (const directory of functionDirectories) {
  functions.push({
    name: path.relative(functionsRoot, directory).replace(/\.func$/, ""),
    bytes: await directorySize(directory),
  });
}
functions.sort((left, right) => right.bytes - left.bytes);
const totalBytes = functions.reduce((sum, item) => sum + item.bytes, 0);

for (const item of functions) console.log(`${item.name}: ${formatMiB(item.bytes)}`);
console.log(`Total: ${formatMiB(totalBytes)} across ${functions.length} functions`);

const oversized = functions.filter((item) => item.bytes > MAX_FUNCTION_BYTES);
if (totalBytes > MAX_TOTAL_BYTES || oversized.length) {
  const details = [
    totalBytes > MAX_TOTAL_BYTES ? `total exceeds ${formatMiB(MAX_TOTAL_BYTES)}` : null,
    oversized.length ? `oversized functions: ${oversized.map((item) => item.name).join(", ")}` : null,
  ].filter(Boolean).join("; ");
  throw new Error(`Vercel function storage budget failed: ${details}`);
}

console.log("Function storage budget passed");
