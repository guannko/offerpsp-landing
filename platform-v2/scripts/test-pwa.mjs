import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const manifest = JSON.parse(await readFile(join(root, "public", "manifest.webmanifest"), "utf8"));
const html = await readFile(join(root, "index.html"), "utf8");

assert.equal(manifest.name, "OfferPSP Captain's Bridge");
assert.equal(manifest.start_url, "/");
assert.equal(manifest.scope, "/");
assert.equal(manifest.display, "standalone");
assert.equal(manifest.prefer_related_applications, false);
assert.match(html, /rel="manifest" href="\/manifest\.webmanifest"/);
assert.match(html, /rel="apple-touch-icon"/);

function pngDimensions(buffer) {
  assert.equal(buffer.toString("ascii", 1, 4), "PNG");
  return [buffer.readUInt32BE(16), buffer.readUInt32BE(20)];
}

const expectedIcons = new Map([
  ["favicon.png", [48, 48]],
  ["icons/apple-touch-icon.png", [180, 180]],
  ["icons/pwa-192.png", [192, 192]],
  ["icons/pwa-512.png", [512, 512]],
  ["icons/pwa-maskable-512.png", [512, 512]],
]);

for (const [relativePath, expected] of expectedIcons) {
  const file = await readFile(join(root, "public", relativePath));
  assert.deepEqual(pngDimensions(file), expected, `${relativePath} must have the declared dimensions`);
}

const requiredSizes = new Set(manifest.icons.map((icon) => icon.sizes));
assert(requiredSizes.has("192x192"));
assert(requiredSizes.has("512x512"));
assert(manifest.icons.some((icon) => icon.purpose === "maskable"));

console.log("OfferPSP PWA manifest and icon assets are valid.");
