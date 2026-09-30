import { createRequire } from "node:module";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { createCanvas, loadImage } = require("../../platform-v2/node_modules/@napi-rs/canvas");

const svgUrl = new URL("offerpsp-x-cover.svg", import.meta.url);
const pngPath = fileURLToPath(new URL("offerpsp-x-cover.png", import.meta.url));
const svg = await readFile(svgUrl);
const image = await loadImage(svg);
const canvas = createCanvas(1500, 500);
canvas.getContext("2d").drawImage(image, 0, 0, 1500, 500);
await writeFile(pngPath, canvas.toBuffer("image/png"));

console.log(`Rendered ${pngPath}`);
