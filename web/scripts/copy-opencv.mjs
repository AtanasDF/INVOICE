import { copyFileSync, mkdirSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const src = resolve(root, "node_modules/@techstark/opencv-js/dist/opencv.js");
const dest = resolve(root, "public/vendor/opencv-5.0.0.js");

function size(path) {
  try {
    return statSync(path).size;
  } catch {
    return -1;
  }
}

if (size(src) !== size(dest)) {
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(src, dest);
}
