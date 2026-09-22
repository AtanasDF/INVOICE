// Two libraries are served as files rather than bundled: OpenCV (13MB, and
// its module.exports is a Promise that Turbopack's interop rejects) and
// pdf.js's worker, which has to be a file of its own at a known address.
// Both are copied into public/vendor, which is gitignored and cached hard.
import { copyFileSync, mkdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const pdfjsVersion = require("pdfjs-dist/package.json").version;

const files = [
  ["node_modules/@techstark/opencv-js/dist/opencv.js", "public/vendor/opencv-5.0.0.js"],
  ["node_modules/pdfjs-dist/build/pdf.worker.min.mjs", `public/vendor/pdf.worker-${pdfjsVersion}.mjs`],
];

const size = (path) => {
  try {
    return statSync(path).size;
  } catch {
    return -1;
  }
};

for (const [from, to] of files) {
  const src = resolve(root, from);
  const dest = resolve(root, to);
  if (size(src) !== size(dest)) {
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(src, dest);
  }
}
