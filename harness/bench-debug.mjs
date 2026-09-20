// Why fitCorners did what it did on one bench frame: the largest page contour,
// its simplified quad, each pass's side fits and the chosen corners.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const WEB = "/Users/nasko/Desktop/INVOICE/.claude/worktrees/bent-paper/web";
const ts = require(WEB + "/node_modules/typescript");
const tsx = readFileSync(WEB + "/src/components/DocumentCapture.tsx", "utf8");
const body = tsx.slice(tsx.indexOf("type Point ="), tsx.indexOf("function BackButton("));
const js = ts.transpileModule(body.replace(/^export /gm, ""), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
let cv = await require(WEB + "/node_modules/@techstark/opencv-js/dist/opencv.js");
if (!cv.Mat) await new Promise((r) => { cv.onRuntimeInitialized = r; });
const lib = new Function("cv", js + "; return { createMats, deleteMats, orderPoints, dist, quadOf, fitCorners, fitSide, outlinePoints, meet, polygonArea, centre };")(cv);
const file = process.argv[2];
const buf = readFileSync(file);
const hdr = buf.subarray(0, 20).toString().split(/\s+/);
const w = +hdr[1], h = +hdr[2];
const m = lib.createMats(cv, w, h);
m.gray.create(h, w, cv.CV_8U);
m.gray.data.set(buf.subarray(buf.length - w * h));
cv.GaussianBlur(m.gray, m.blurred, new cv.Size(5, 5), 0);
cv.Canny(m.blurred, m.edges, 50, 150);
cv.dilate(m.edges, m.edges, m.kernel);
cv.findContours(m.edges, m.contours, m.hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);
const f = (p) => p ? `${p.x.toFixed(1)},${p.y.toFixed(1)}` : "null";
const found = [];
for (let i = 0; i < m.contours.size(); i++) {
  const c = m.contours.get(i);
  const approx = lib.quadOf(cv, c);
  if (approx && lib.polygonArea(approx) > w * h * 0.012) found.push({ i, area: lib.polygonArea(approx), approx });
}
found.sort((a, b) => b.area - a.area);
for (const cand of found.slice(0, +(process.argv[3] ?? 1))) {
  const c = m.contours.get(cand.i);
  const q = lib.orderPoints(cand.approx);
  console.log("contour", cand.i, "rows", c.rows, "approx", q.map(f).join(" "));
  const pts = lib.outlinePoints(c);
  let corners = q;
  for (const [k, mn, trim] of [[0.06, 4, 0.15], [0.03, 3, 0.075]]) {
    const lines = corners.map((a, i) => { const b = corners[(i + 1) % 4]; const L = lib.dist(a, b); const l = lib.fitSide(cv, pts, a, b, Math.max(mn, k * L), trim); return l; });
    console.log(" pass", k, lines.map((l) => (l ? `p ${f(l.p)} d ${l.d.x.toFixed(3)},${l.d.y.toFixed(3)}` : "FAIL")).join(" | "));
    corners = lines.map((l, i) => (l && lines[(i + 3) % 4] ? lib.meet(lines[(i + 3) % 4], l) : null) ?? corners[i]);
    console.log("  corners", corners.map(f).join(" "));
  }
  console.log(" fitCorners", lib.fitCorners(cv, c, cand.approx, w, h).map(f).join(" "));
}
