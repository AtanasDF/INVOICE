// A kitchen wall is not a document.
//
// Atanas, on his iPhone, 2026-09-26: "once I point it down, he scans the
// tiles in my kitchen and he takes the picture of that... it should be
// documents, not just tiles. You shouldn't be able to scan tiles just
// because it has an edge." He is right, and the reason was plain once
// looked at: a four-corner shape bigger than MIN_CONTOUR_AREA was taken for
// a page on its size alone. Nothing else was asked of it. A tile passes
// every test the small-shape path applies -- large, rectangular, lighter
// than the grout round it, nothing printed nearby.
//
// What a document has and a wall hasn't is printing on it, so that is what
// is measured now (inkInside, MIN_INK). This suite holds both halves: a wall
// is never photographed, and the documents that were being found are still
// found. The second half is the one that matters -- a detector that refuses
// everything would pass the first.
//
// The margin is measured, not guessed. Through the app's own readout, on the
// clips: a wall reads 0 per 1000, an A4 invoice 111, a receipt at arm's
// length 102, a receipt on a patterned floor 253. The five far-receipt clips
// dip as low as 6, which is why a SMALL shape is still judged on looking
// like paper alone and not on its ink.
// PROVED FALSIFIABLE, and it was not at the first attempt. The first clip
// drifted for all fourteen seconds and used 190px tiles: it captured nothing,
// so every check passed -- and went on passing with MIN_INK set to 0, which
// is a suite that proves nothing at all. The clip now holds still after six
// seconds and puts one 320px tile whole inside the visible strip, and with
// MIN_INK at 0 the wall IS photographed (1 capture) while at 0.015 it is not
// (0 captures, no quad found at all). Same lesson as the mutation testing:
// a green suite is not evidence until it has been seen to go red.
import fs from "fs";
import { launch, openScanner, sleep } from "./camera3.mjs";
import { REPO } from "./repo.mjs";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };
const HERE = new URL(".", import.meta.url).pathname;

// Watches one clip for `waitMs`: whether anything was captured, and the ink
// and coverage the detector reported while it looked.
async function watch(clip, waitMs) {
  if (!fs.existsSync(HERE + clip)) return { missing: true };
  const { browser, page, posted } = await launch(clip);
  try {
    await openScanner(page, { auto: "on" });
    // The invisible strip beside Back turns the readout on.
    await page.evaluate(() => document.querySelector("div.pointer-events-auto.flex-1")?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    const inks = [], covs = [];
    const t0 = Date.now();
    while (Date.now() - t0 < waitMs) {
      const line = await page.evaluate(() => [...document.querySelectorAll("div.font-mono")].map((e) => e.textContent).find((s) => s?.includes("ink:")) ?? null).catch(() => null);
      if (line) {
        const ink = Number(/ink:(\d+)/.exec(line)?.[1]);
        const cov = Number(/cov:(\d+)%/.exec(line)?.[1]);
        if (Number.isFinite(ink)) inks.push(ink);
        if (Number.isFinite(cov)) covs.push(cov);
      }
      if (posted.length) break;
      await sleep(200);
    }
    return { posted: posted.length, maxInk: inks.length ? Math.max(...inks) : null, maxCov: covs.length ? Math.max(...covs) : null, samples: inks.length };
  } catch (e) {
    return { error: e.message };
  } finally {
    await browser.close();
  }
}

try {
  // ---- The wall ------------------------------------------------------------
  const wall = await watch("tiles.mjpeg", 12000);
  if (wall.missing) {
    check("tiles.mjpeg is there (python3 gen-tiles.py)", false, "missing");
  } else if (wall.error) {
    check("the wall clip runs", false, wall.error);
  } else {
    // Twelve seconds of a tiled wall held still, auto-capture on. Before the
    // ink test this fired.
    check("twelve seconds over a tiled wall takes no photograph", wall.posted === 0, JSON.stringify(wall));
    // Nothing printed on a wall, and the readout should say so. If this ever
    // creeps up towards MIN_INK the threshold is no longer doing any work.
    check("a wall reads as having nothing printed on it", wall.maxInk !== null && wall.maxInk <= 2, JSON.stringify(wall));
    // The first version of the fix skipped the ink test whenever requirePaper
    // was set, so auto-zoom zoomed in on a tile until it was large, turned
    // requirePaper on, and let it straight through. The coverage staying
    // small is what proves that door is shut.
    check("...and auto-zoom never grows a tile into a page", wall.maxCov !== null && wall.maxCov < 20, JSON.stringify(wall));
  }

  // ---- The documents, which must still be found ----------------------------
  for (const [clip, label] of [["large.mjpeg", "an A4 invoice held close"], ["far-receipt.mjpeg", "a receipt at arm's length"], ["pattern.mjpeg", "a receipt on a patterned floor"]]) {
    const r = await watch(clip, 14000);
    if (r.missing) { check(`${clip} is there`, false, "missing"); continue; }
    if (r.error) { check(`${label} runs`, false, r.error); continue; }
    check(`${label} is still photographed`, r.posted > 0, JSON.stringify(r));
    // Well clear of the threshold, not scraping past it.
    check(`...and reads as printed on, clear of the threshold`, r.maxInk !== null && r.maxInk >= 60, JSON.stringify(r));
  }

  // ---- The threshold itself ------------------------------------------------
  // Pinned between the two measurements, so raising it far enough to lose
  // documents, or dropping it far enough to let walls through, fails here
  // rather than on a phone in a kitchen.
  const src = fs.readFileSync(`${REPO}/web/src/components/DocumentCapture.tsx`, "utf8");
  const minInk = Number(/const MIN_INK = ([\d.]+);/.exec(src)?.[1]);
  check("MIN_INK is above what a blank wall measures", minInk > 0.003, String(minInk));
  check("...and well below what the thinnest document measures", minInk < 0.06, String(minInk));
  // The small-shape path must NOT be gated on ink: the far clips measure as
  // low as 6 per 1000 and this is how that stays true.
  check("a small shape is judged on looking like paper, not on its ink", /if \(!small && ink < MIN_INK\) continue;/.test(src), "the large-shape-only gate is gone");
} catch (e) { console.log("ERROR", e.message); results.push(false); }
console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
