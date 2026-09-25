// Runs DocumentCapture's own detection helpers (cut from the TSX and
// transpiled) on the bench PGMs: which page is found and how far its corners
// are from the flat page's true corners.
//   node bench-corners.mjs [tsx path] [filter]
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { REPO } from "./repo.mjs";
const require = createRequire(import.meta.url);
const WEB = `${REPO}/.claude/worktrees/bent-paper/web`;
const ts = require(WEB + "/node_modules/typescript");
const tsx = readFileSync(process.argv[2] || WEB + "/src/components/DocumentCapture.tsx", "utf8");
const only = process.argv[3];
const body = tsx.slice(tsx.indexOf("type Point ="), tsx.indexOf("function BackButton("));
const js = ts.transpileModule(body.replace(/^export /gm, ""), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
let cv = await require(WEB + "/node_modules/@techstark/opencv-js/dist/opencv.js");
if (!cv.Mat) await new Promise((r) => { cv.onRuntimeInitialized = r; });
const names = ["pageCandidates", "findPage", "createMats", "deleteMats", "orderPoints", "alignTo", "dist", "quadOf", "fitCorners", "fitSide", "outlinePoints", "meet", "polygonArea"];
const lib = new Function("cv", js + `; return { ${names.filter((n) => js.includes(`function ${n}(`)).join(", ")} };`)(cv);
if (!lib.findPage) lib.findPage = (cv, m) => lib.pageCandidates(cv, m, true)[0] ?? null;

function readPgm(file) {
  const buf = readFileSync(file);
  let pos = 0; const tok = [];
  while (tok.length < 4) { while (/\s/.test(String.fromCharCode(buf[pos]))) pos++; let s = ""; while (!/\s/.test(String.fromCharCode(buf[pos]))) s += String.fromCharCode(buf[pos++]); tok.push(s); }
  pos++;
  return { w: +tok[1], h: +tok[2], data: buf.subarray(pos, pos + +tok[1] * +tok[2]) };
}
const cases = JSON.parse(readFileSync(new URL("./bench/" + (process.env.CASES ?? "cases.json"), import.meta.url)));
const fmt = (q) => q.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
const rows = [];
for (const c of cases) {
  if (only && !c.name.includes(only)) continue;
  const img = readPgm(new URL("./" + c.file, import.meta.url).pathname);
  const m = lib.createMats(cv, img.w, img.h);
  m.gray.create(img.h, img.w, cv.CV_8U);
  m.gray.data.set(img.data);
  const t0 = performance.now();
  const page = lib.findPage(cv, m);
  const ms = performance.now() - t0;
  let err = null;
  if (page && c.truth) {
    const truth = c.truth.map(([x, y]) => ({ x, y }));
    const { q } = lib.alignTo(lib.orderPoints(page.pts), lib.orderPoints(truth));
    err = Math.max(...q.map((p, i) => lib.dist(p, lib.orderPoints(truth)[i])));
  }
  rows.push({ name: c.name, found: !!page, area: page ? +(page.area / (img.w * img.h) * 100).toFixed(1) : 0, err: err === null ? "" : +err.toFixed(1), ms: +ms.toFixed(1), quad: page ? fmt(lib.orderPoints(page.pts)) : "" });
  lib.deleteMats(m);
}
if (process.env.JSON) console.log(JSON.stringify(rows)); else console.table(rows);
