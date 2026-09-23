// Two libraries are served as files rather than bundled: OpenCV (13MB, and
// its module.exports is a Promise that Turbopack's interop rejects) and
// pdf.js's worker, which has to be a file of its own at a known address.
// Both are copied into public/vendor, which is gitignored and cached hard.
import { copyFileSync, mkdirSync, statSync, readdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
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

// iCloud Desktop sync drops "name 2.ext" copies into .next, and a duplicate
// of Next's generated type files makes `tsc` fail with conflicting
// declarations -- which has broken the build four times in one day. Clearing
// them before every build is a one-line fix for a problem that otherwise costs
// a rebuild cycle each time. The real fix is moving the project off the synced
// Desktop; until then, this.
function clearICloudDuplicates(dir) {
  let gone = 0;
  const walk = (d) => {
    let entries;
    try { entries = readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = join(d, e.name);
      if (e.isDirectory()) walk(full);
      else if (/ \d+\.[^.]+$/.test(e.name)) { try { rmSync(full); gone += 1; } catch {} }
    }
  };
  walk(dir);
  if (gone) console.log(`copy-vendor: removed ${gone} iCloud duplicate file(s) from ${dir}`);
}
clearICloudDuplicates(new URL("../.next", import.meta.url).pathname);
