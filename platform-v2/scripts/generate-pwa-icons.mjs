import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createCanvas } from "@napi-rs/canvas";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const iconsDirectory = join(root, "public", "icons");

await mkdir(iconsDirectory, { recursive: true });

function roundedSquare(context, x, y, width, radius) {
  context.beginPath();
  context.roundRect(x, y, width, width, radius);
  context.closePath();
}

function renderIcon(size, { maskable = false } = {}) {
  const canvas = createCanvas(size, size);
  const context = canvas.getContext("2d");
  const inset = maskable ? 0 : Math.round(size * 0.035);
  const boxSize = size - inset * 2;
  const radius = maskable ? 0 : Math.round(size * 0.22);

  const background = context.createLinearGradient(inset, inset, size - inset, size - inset);
  background.addColorStop(0, "#ff4778");
  background.addColorStop(0.52, "#ee46bc");
  background.addColorStop(1, "#7a5af8");
  roundedSquare(context, inset, inset, boxSize, radius);
  context.fillStyle = background;
  context.fill();

  const glow = context.createRadialGradient(
    size * 0.25,
    size * 0.18,
    0,
    size * 0.25,
    size * 0.18,
    size * 0.75,
  );
  glow.addColorStop(0, "rgba(255,255,255,0.24)");
  glow.addColorStop(1, "rgba(255,255,255,0)");
  roundedSquare(context, inset, inset, boxSize, radius);
  context.fillStyle = glow;
  context.fill();

  context.fillStyle = "#ffffff";
  context.font = `900 ${Math.round(size * 0.34)}px Arial`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText("OP", size / 2, size * 0.52);

  return canvas.toBuffer("image/png");
}

const outputs = [
  [join(root, "public", "favicon.png"), 48, false],
  [join(iconsDirectory, "apple-touch-icon.png"), 180, false],
  [join(iconsDirectory, "pwa-192.png"), 192, false],
  [join(iconsDirectory, "pwa-512.png"), 512, false],
  [join(iconsDirectory, "pwa-maskable-512.png"), 512, true],
];

for (const [file, size, maskable] of outputs) {
  await writeFile(file, renderIcon(size, { maskable }));
}

console.log(`Generated ${outputs.length} OfferPSP application icons.`);
