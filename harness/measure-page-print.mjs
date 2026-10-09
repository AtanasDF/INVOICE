// Choosing the page-fingerprint's grid by measurement, not by taste.
//
// A tool, not a suite: it prints readings and is run by hand when the numbers
// behind src/lib/pagePrint.ts need revisiting. test-page-print.mjs is the suite
// that holds whatever this settles.
//
// THE QUESTION. Two populations have to separate: the same document read
// through an outline that is a few pixels wrong, and a different document in
// the same place. The first attempt at this (notes/batch-rearm.md) failed
// because they overlapped -- a receipt on a patterned floor read exactly what a
// swap read. Lighting turned out to be easy (normalising by contrast takes
// shade and glare down to 0.02..0.10). The outline wobble is the whole job.
//
// WHAT THIS FOUND, and it was not what I expected: the grid size barely
// matters, and the SAMPLING DENSITY inside each cell matters enormously. With
// 4 sub-samples per axis over a ~38px cell, the samples sit ~9px apart and a
// 7px line of print can fall between them entirely -- so a "cell mean" is
// really 16 pinpricks, which is the same mistake as the lattice it replaced,
// one level down. Dense enough to be a genuine area mean and the same page
// stops caring where its corners are thought to be.
//
// Run: node measure-page-print.mjs
const W = 480;
const H = 640;
const PAGE = [
  { x: 110, y: 130 },
  { x: 370, y: 130 },
  { x: 370, y: 510 },
  { x: 110, y: 510 },
];
const INSET = 0.1;
const MIN_SPREAD = 2.5;

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
function blank(g = 128) {
  const px = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < px.length; i += 4) { px[i] = px[i + 1] = px[i + 2] = g; px[i + 3] = 255; }
  return px;
}
function box(px, x0, y0, x1, y1, g) {
  for (let y = Math.max(0, y0 | 0); y < Math.min(H, y1 | 0); y++)
    for (let x = Math.max(0, x0 | 0); x < Math.min(W, x1 | 0); x++) { const i = (y * W + x) * 4; px[i] = px[i + 1] = px[i + 2] = g; }
}

// Two shapes of document, because the sparse one is the harder case and the
// dense one is the likelier: a till receipt is closely printed, an invoice has
// air in it.
function sparseDoc(seed, { background = 60, paper = 235, ink = 40 } = {}) {
  const r = rng(seed);
  const px = blank(background);
  box(px, PAGE[0].x, PAGE[0].y, PAGE[2].x, PAGE[2].y, paper);
  const rows = 14 + Math.floor(r() * 6);
  for (let k = 0; k < rows; k++) {
    const y = PAGE[0].y + 18 + k * ((PAGE[2].y - PAGE[0].y - 30) / rows);
    const left = PAGE[0].x + 12 + r() * 40;
    box(px, left, y, left + 60 + r() * 170, y + 6 + r() * 4, ink + r() * 60);
  }
  return px;
}
function denseDoc(seed, { background = 60, paper = 235, ink = 40 } = {}) {
  const r = rng(seed);
  const px = blank(background);
  box(px, PAGE[0].x, PAGE[0].y, PAGE[2].x, PAGE[2].y, paper);
  for (let k = 0; k < 44; k++) {
    const y = PAGE[0].y + 12 + k * ((PAGE[2].y - PAGE[0].y - 20) / 44);
    let x = PAGE[0].x + 10 + r() * 12;
    while (x < PAGE[2].x - 14) {
      const word = 8 + r() * 26;
      if (r() > 0.18) box(px, x, y, x + word, y + 4 + r() * 2, ink + r() * 70);
      x += word + 4 + r() * 8;
    }
  }
  return px;
}
function withPattern(make, seed) {
  const px = make(seed);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (x > PAGE[0].x && x < PAGE[2].x && y > PAGE[0].y && y < PAGE[2].y) continue;
    const i = (y * W + x) * 4;
    const t = ((x >> 4) + (y >> 4)) % 2 ? 30 : 190;
    px[i] = px[i + 1] = px[i + 2] = t;
  }
  return px;
}
function wobble(seed, pixels) {
  const r = rng(seed);
  return PAGE.map((p) => ({ x: p.x + (r() * 2 - 1) * pixels, y: p.y + (r() * 2 - 1) * pixels }));
}

function greyAt(px, x, y) {
  const fx = Math.min(W - 1, Math.max(0, x));
  const fy = Math.min(H - 1, Math.max(0, y));
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  const x1 = Math.min(W - 1, x0 + 1), y1 = Math.min(H - 1, y0 + 1);
  const tx = fx - x0, ty = fy - y0;
  const at = (a, b) => { const i = (b * W + a) * 4; return 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]; };
  return (at(x0, y0) * (1 - tx) + at(x1, y0) * tx) * (1 - ty) + (at(x0, y1) * (1 - tx) + at(x1, y1) * tx) * ty;
}
function onPage(q, u, v) {
  const tx = q[0].x + (q[1].x - q[0].x) * u, ty = q[0].y + (q[1].y - q[0].y) * u;
  const bx = q[3].x + (q[2].x - q[3].x) * u, by = q[3].y + (q[2].y - q[3].y) * u;
  return { x: tx + (bx - tx) * v, y: ty + (by - ty) * v };
}
function print(px, q, N, SUB) {
  const cells = new Float32Array(N * N);
  const span = 1 - 2 * INSET, cell = span / N, step = cell / SUB;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    let sum = 0;
    for (let b = 0; b < SUB; b++) for (let a = 0; a < SUB; a++) {
      const p = onPage(q, INSET + i * cell + (a + 0.5) * step, INSET + j * cell + (b + 0.5) * step);
      sum += greyAt(px, p.x, p.y);
    }
    cells[j * N + i] = sum / (SUB * SUB);
  }
  let mean = 0; for (const c of cells) mean += c; mean /= cells.length;
  let v = 0; for (const c of cells) v += (c - mean) * (c - mean);
  const spread = Math.sqrt(v / cells.length);
  if (!Number.isFinite(spread) || spread < MIN_SPREAD) return null;
  for (let i = 0; i < cells.length; i++) cells[i] = (cells[i] - mean) / spread;
  return cells;
}
const diffOf = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s / a.length; };

const SEEDS = 30;
const WOBBLE_PX = Number(process.env.WOBBLE ?? 4);

function measure(N, SUB) {
  const same = [], different = [];
  for (const make of [sparseDoc, denseDoc]) {
    for (let s = 1; s <= SEEDS; s++) {
      for (const frame of [make(s), withPattern(make, s)]) {
        const taken = print(frame, PAGE, N, SUB);
        if (!taken) continue;
        for (let w = 1; w <= 3; w++) {
          const p = print(frame, wobble(s * 31 + w, WOBBLE_PX), N, SUB);
          if (p) same.push(diffOf(taken, p));
        }
        for (const opts of [{ paper: 170, ink: 25 }, { paper: 255, ink: 120 }]) {
          const p = print(make(s, opts), PAGE, N, SUB);
          if (p) same.push(diffOf(taken, p));
        }
      }
      const taken = print(make(s), PAGE, N, SUB);
      const other = print(make(s + 500), PAGE, N, SUB);
      if (taken && other) different.push(diffOf(taken, other));
    }
  }
  const worstSame = Math.max(...same);
  const closestDifferent = Math.min(...different);
  return { worstSame, closestDifferent, margin: closestDifferent - worstSame, samples: N * N * SUB * SUB };
}

console.log("  N  SUB   samples/tick   worst same   closest diff   margin");
const rows = [];
for (const N of (process.env.GRID ? [Number(process.env.GRID)] : [4, 6, 8, 10])) {
  for (const SUB of (process.env.SUB ? [Number(process.env.SUB)] : [4, 8, 12, 16, 24])) {
    const t0 = Date.now();
    const r = measure(N, SUB);
    rows.push({ N, SUB, ...r, ms: Date.now() - t0 });
    console.log(
      `${String(N).padStart(3)} ${String(SUB).padStart(4)} ${String(r.samples).padStart(14)} ${r.worstSame.toFixed(3).padStart(12)} ${r.closestDifferent.toFixed(3).padStart(14)} ${r.margin.toFixed(3).padStart(8)}${r.margin > 0.2 ? "  <= usable" : ""}`
    );
  }
}
const best = rows.filter((r) => r.margin > 0).sort((a, b) => b.margin - a.margin)[0];
console.log();
console.log(best ? `best margin: N=${best.N} SUB=${best.SUB} margin ${best.margin.toFixed(3)} (${best.samples} samples a tick)` : "NOTHING SEPARATES THE TWO POPULATIONS");
const cheapest = rows.filter((r) => r.margin > 0.25).sort((a, b) => a.samples - b.samples)[0];
if (cheapest) console.log(`cheapest with a 0.25 margin: N=${cheapest.N} SUB=${cheapest.SUB} margin ${cheapest.margin.toFixed(3)} (${cheapest.samples} samples a tick)`);
