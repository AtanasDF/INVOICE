// Bent paper (gen-bent.py): found, locked and taken quickly; the green outline
// steady; the capture the whole page (every red mark near the edges kept, little
// table pulled in, the page's shape). BASE=http://localhost:3100 node test-bent.mjs [filter]
import { launch, openScanner, sleep, hint } from "./camera3.mjs";
import { writeFileSync } from "node:fs";
const results = [];
const rows = [];
const check = (name, ok, detail) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", name, detail ?? ""); };
// A curled page's sides aren't straight, so no four-corner crop can keep all of it
// without some table: shown, not counted (see the report).
const info = (name, ok, detail) => console.log(ok ? "INFO ok " : "INFO no ", name, detail ?? "");
const only = process.argv[2];
const CLIPS = [
  { clip: "bent-dogear.mjpeg", aspect: 537 / 380, gone: [2] },
  { clip: "bent-dogear-jitter.mjpeg", aspect: 537 / 380, gone: [2] },
  { clip: "bent-dogear-flex.mjpeg", aspect: 480 / 340, gone: [2] },
  { clip: "bent-flare.mjpeg", curved: true, aspect: 537 / 380, gone: [] },
  { clip: "bent-flare-jitter.mjpeg", curved: true, aspect: 537 / 380, gone: [] },
  { clip: "bent-thirds.mjpeg", aspect: 537 / 380, gone: [] },
  { clip: "bent-thirds-jitter.mjpeg", aspect: 537 / 380, gone: [] },
  { clip: "bent-receipt.mjpeg", curved: true, aspect: 470 / 150, gone: [] },
  { clip: "bent-receipt-jitter.mjpeg", curved: true, aspect: 470 / 150, gone: [] },
];
const MARKS = [[0.04, 0.04], [0.5, 0.04], [0.96, 0.04], [0.96, 0.5], [0.96, 0.96], [0.5, 0.96], [0.04, 0.96], [0.04, 0.5]];

// Every overlay frame: the filled outline (if any) and its green fill.
const hook = () => {
  window.__frames = [];
  const P = CanvasRenderingContext2D.prototype;
  const { clearRect, moveTo, lineTo, fill } = P;
  P.clearRect = function (...a) { if (this.canvas.isConnected) window.__frames.push({ t: performance.now(), pts: null, a: 0 }); this.__path = []; return clearRect.apply(this, a); };
  P.moveTo = function (x, y) { this.__path = [{ x, y }]; return moveTo.call(this, x, y); };
  P.lineTo = function (x, y) { (this.__path ??= []).push({ x, y }); return lineTo.call(this, x, y); };
  P.fill = function (...a) {
    const m = /rgba\(74, 222, 128, ([\d.]+)\)/.exec(this.fillStyle);
    const f = window.__frames[window.__frames.length - 1];
    if (m && f && this.__path?.length === 4) { f.pts = this.__path.map((p) => ({ ...p })); f.a = Number(m[1]); }
    return fill.apply(this, a);
  };
};

function outlineStats(frames) {
  const found = frames.filter((f) => f.pts);
  if (!found.length) return { foundMs: null, lockMs: null, foundFrac: 0, sd: null, jumps: null };
  const t0 = frames[0].t;
  const foundMs = Math.round(found[0].t - t0);
  const lock = frames.find((f) => f.a > 0.25);
  const settle = found[0].t + 1000;
  const after = frames.filter((f) => f.t >= settle);
  const steady = after.filter((f) => f.pts);
  let sd = 0, jumps = 0;
  if (steady.length > 5) {
    for (let i = 0; i < 4; i++) {
      const xs = steady.map((f) => f.pts[i].x), ys = steady.map((f) => f.pts[i].y);
      const mean = (v) => v.reduce((s, x) => s + x, 0) / v.length;
      const mx = mean(xs), my = mean(ys);
      sd = Math.max(sd, Math.sqrt(mean(xs.map((x, k) => (x - mx) ** 2 + (ys[k] - my) ** 2))));
    }
    for (let k = 1; k < steady.length; k++) if (steady[k].pts.some((p, i) => Math.hypot(p.x - steady[k - 1].pts[i].x, p.y - steady[k - 1].pts[i].y) > 4)) jumps++;
  }
  return { foundMs, lockMs: lock ? Math.round(lock.t - t0) : null, foundFrac: after.length ? steady.length / after.length : 0, sd: steady.length > 5 ? +sd.toFixed(2) : null, jumps, frames: after.length };
}

const analyse = (page, dataUrl, marks) => page.evaluate(async (u, marks) => {
  const img = new Image(); img.src = u; await img.decode();
  const c = document.createElement("canvas"); c.width = img.naturalWidth; c.height = img.naturalHeight;
  const ctx = c.getContext("2d"); ctx.drawImage(img, 0, 0);
  const W = c.width, H = c.height, d = ctx.getImageData(0, 0, W, H).data;
  let table = 0;
  const sum = marks.map(() => ({ n: 0, x: 0, y: 0 }));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4, r = d[i], g = d[i + 1], b = d[i + 2];
    if (r - b > 12 && r < 150 && g < 120) table++;
    if (r > 140 && g < 100 && b < 100) {
      let best = 0, bd = Infinity;
      marks.forEach(([fx, fy], k) => { const dd = (x / W - fx) ** 2 + (y / H - fy) ** 2; if (dd < bd) { bd = dd; best = k; } });
      const s = sum[best]; s.n++; s.x += x / W; s.y += y / H;
    }
  }
  const counts = sum.map((s) => s.n);
  const typical = [...counts].sort((a, b) => a - b)[Math.floor(counts.length / 2)] || 1;
  const err = sum.map((s, k) => (s.n ? Math.hypot(s.x / s.n - marks[k][0], s.y / s.n - marks[k][1]) : null));
  return { w: W, h: H, table: table / (W * H), counts, typical, err };
}, dataUrl, marks);

for (const spec of CLIPS) {
  if (only && !spec.clip.includes(only)) continue;
  const row = { clip: spec.clip.replace(".mjpeg", "") };
  // Watch the outline with auto-capture and auto-zoom off: detection alone.
  {
    const { browser, page } = await launch(spec.clip);
    try {
      await page.evaluateOnNewDocument(hook);
      await openScanner(page, { auto: "off", zoomOn: "off" });
      await page.evaluate(() => { window.__frames = []; });
      const hints = [];
      const t0 = Date.now();
      while (Date.now() - t0 < 6000) { hints.push(await hint(page)); await sleep(200); }
      const frames = await page.evaluate(() => window.__frames);
      Object.assign(row, outlineStats(frames));
      row.hints = [...new Set(hints)].join(" | ");
    } catch (e) { console.log("ERROR", spec.clip, e.message); } finally { await browser.close(); }
  }
  // Auto-capture on (the default set-up) and measure what it took.
  {
    const { browser, page, posted } = await launch(spec.clip);
    try {
      await openScanner(page, { auto: "on" });
      const t0 = Date.now();
      while (Date.now() - t0 < 12000 && !posted.length) await sleep(200);
      row.captureMs = posted.length ? Date.now() - t0 : null;
      if (posted[0] && process.env.SAVE) writeFileSync(`cap-${process.env.SAVE}-${row.clip}.jpg`, Buffer.from(posted[0][0].split(",")[1], "base64"));
      if (posted[0]) {
        const m = await analyse(page, posted[0][0], MARKS);
        const kept = m.counts.map((n, k) => spec.gone.includes(k) || n >= 0.4 * m.typical);
        const errs = m.err.filter((e, k) => e !== null && !spec.gone.includes(k));
        row.size = `${m.w}x${m.h}`;
        row.aspect = +(Math.max(m.w, m.h) / Math.min(m.w, m.h)).toFixed(3);
        row.aspectErr = +Math.abs(row.aspect / spec.aspect - 1).toFixed(3);
        row.table = +(m.table * 100).toFixed(2);
        row.marksKept = kept.filter(Boolean).length;
        row.markErr = +(Math.max(...errs) * 100).toFixed(2);
        row.counts = m.counts.join(",");
      }
    } catch (e) { console.log("ERROR", spec.clip, e.message); } finally { await browser.close(); }
  }
  rows.push(row);
  console.log(JSON.stringify(row));
  const n = row.clip;
  check(`${n}: found within 1.5s`, row.foundMs !== null && row.foundMs < 1500, `${row.foundMs}ms`);
  check(`${n}: outline held (found on >= 95% of frames)`, row.foundFrac >= 0.95, `${(row.foundFrac * 100).toFixed(1)}%`);
  check(`${n}: outline doesn't jump (<= 5 frames with a corner moving > 4px)`, row.jumps !== null && row.jumps <= 5, `sd ${row.sd} jumps ${row.jumps}/${row.frames}`);
  if (!/jitter|flex/.test(n)) check(`${n}: outline still on a still page (corner sd <= 1.5px)`, row.sd !== null && row.sd <= 1.5, `sd ${row.sd}`);
  check(`${n}: locks within 2s`, row.lockMs !== null && row.lockMs < 2000, `${row.lockMs}ms`);
  check(`${n}: auto-captured within 5s`, row.captureMs !== null && row.captureMs < 5000, `${row.captureMs}ms`);
  const shape = spec.curved ? info : check;
  shape(`${n}: capture keeps the whole page (every mark)`, row.marksKept === 8, `${row.marksKept}/8 (${row.counts})`);
  shape(`${n}: little table pulled in (< 3%)`, row.table < 3, `${row.table}%`);
  shape(`${n}: page's shape (aspect within 6%)`, row.aspectErr <= 0.06, `${row.aspect} vs ${spec.aspect.toFixed(3)}`);
}
console.table(rows.map(({ hints, counts, ...r }) => r));
console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
