// Can the camera tell one document from another when both lie in the same spot?
//
// This is the question notes/batch-rearm.md left open, and the reason the first
// attempt was reverted: a receipt on a PATTERNED FLOOR read 16 and a genuine
// swap also read 16, so no threshold separated them. The stated cause was that
// a wobbling outline "lands the 64 samples on different parts of the same
// page" -- point samples on a lattice.
//
// So the case that matters here is not "two different documents look
// different". It is: THE SAME DOCUMENT, read through an outline that is a few
// pixels wrong, must still look like itself -- in shade, in glare, on a busy
// background. Everything below is built around that, and the pass/fail is a
// MARGIN between the two populations rather than a single reading.
//
// Synthetic frames rather than the camera clips on purpose: a clip gives one
// number per run and takes a browser to get it, and what is needed to choose a
// threshold is hundreds of readings with the wobble controlled. The clips are
// the end-to-end check (test-batch-stuck.mjs).
import {
  PRINT_DIFFERENT,
  PRINT_INSET,
  PRINT_MIN_SPREAD,
  PRINT_N,
  PRINT_NEAR_PX,
  PRINT_STILL_PX,
  PRINT_SETTLED,
  PRINT_STILL_TICKS,
  barelyMoved,
  looksDifferent,
  nearEnough,
  pagePrint,
  printDiff,
} from "./gen/lib/pagePrint.js";

const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

const W = 480;
const H = 640;
// The page sits in the middle, as it does in every clip.
const PAGE = [
  { x: 110, y: 130 },
  { x: 370, y: 130 },
  { x: 370, y: 510 },
  { x: 110, y: 510 },
];

// A deterministic pseudo-random, so a reading can be reproduced and argued
// about. (Math.random would make a failure unrepeatable.)
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function blank(grey = 128) {
  const px = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < px.length; i += 4) {
    px[i] = px[i + 1] = px[i + 2] = grey;
    px[i + 3] = 255;
  }
  return px;
}

function box(px, x0, y0, x1, y1, grey) {
  for (let y = Math.max(0, y0 | 0); y < Math.min(H, y1 | 0); y++) {
    for (let x = Math.max(0, x0 | 0); x < Math.min(W, x1 | 0); x++) {
      const i = (y * W + x) * 4;
      px[i] = px[i + 1] = px[i + 2] = grey;
    }
  }
}

// A document: white paper in the page rectangle with rows of dark bars for
// print. `seed` decides the layout, so two seeds are two different documents.
function document(seed, { background = 60, paper = 235, ink = 40 } = {}) {
  const r = rng(seed);
  const px = blank(background);
  box(px, PAGE[0].x, PAGE[0].y, PAGE[2].x, PAGE[2].y, paper);
  const rows = 14 + Math.floor(r() * 6);
  for (let k = 0; k < rows; k++) {
    const y = PAGE[0].y + 18 + k * ((PAGE[2].y - PAGE[0].y - 30) / rows);
    const left = PAGE[0].x + 12 + r() * 40;
    const width = 60 + r() * 170;
    box(px, left, y, left + width, y + 6 + r() * 4, ink + r() * 60);
  }
  return px;
}

// The same frame with a busy pattern OUTSIDE the page -- the case that killed
// the first attempt, because the pattern is what makes the outline wobble.
function onPattern(seed) {
  const px = document(seed);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const inside = x > PAGE[0].x && x < PAGE[2].x && y > PAGE[0].y && y < PAGE[2].y;
      if (inside) continue;
      const i = (y * W + x) * 4;
      const tile = ((x >> 4) + (y >> 4)) % 2 ? 30 : 190;
      px[i] = px[i + 1] = px[i + 2] = tile;
    }
  }
  return px;
}

// An outline that is wrong by up to `px` pixels per corner: what a busy
// background actually does to the detector.
function wobble(seed, pixels) {
  const r = rng(seed);
  return PAGE.map((p) => ({ x: p.x + (r() * 2 - 1) * pixels, y: p.y + (r() * 2 - 1) * pixels }));
}

const print = (px, quad = PAGE) => pagePrint(px, W, H, quad);

// ---------------------------------------------------------------------------
// It reads something at all
// ---------------------------------------------------------------------------
const docA = document(1);
const a = print(docA);
check("a document gives a reading", a instanceof Float32Array && a.length === PRINT_N * PRINT_N, String(a?.length));
check("the same frame reads identically", printDiff(print(docA), print(docA)) === 0);
check("blank paper gives no reading at all", print(blank(235)) === null);
check("a dark frame gives no reading", print(blank(6)) === null);
check("a page off the edge of the frame still reads", print(docA, [{ x: -20, y: -20 }, { x: 370, y: 130 }, { x: 370, y: 510 }, { x: 110, y: 510 }]) !== null);
check("the inset leaves the page's border out", PRINT_INSET > 0 && PRINT_INSET < 0.3, String(PRINT_INSET));
check("a blank page is not evidence of anything", PRINT_MIN_SPREAD > 0, String(PRINT_MIN_SPREAD));

// ---------------------------------------------------------------------------
// THE SAME document must look like itself -- the half that was got wrong
// ---------------------------------------------------------------------------
// Each population is gathered over many seeds so a threshold is chosen against
// a spread, not one lucky number.
const same = [];
const sameOnPattern = [];
const different = [];

for (let seed = 1; seed <= 40; seed++) {
  const doc = document(seed);
  const taken = print(doc);
  if (!taken) continue;

  // the same page, outline wrong by as much as the gate allows
  for (let w = 1; w <= 3; w++) {
    const p = print(doc, wobble(seed * 10 + w, PRINT_STILL_PX));
    if (p) same.push(printDiff(taken, p));
  }
  // the same page in shade, and in glare
  for (const opts of [{ paper: 170, ink: 25 }, { paper: 255, ink: 120 }]) {
    const p = print(document(seed, opts));
    if (p) same.push(printDiff(taken, p));
  }
  // the same page on a patterned floor, outline wobbling with it
  const pat = onPattern(seed);
  const patTaken = print(pat);
  for (let w = 1; w <= 3; w++) {
    const p = print(pat, wobble(seed * 20 + w, PRINT_STILL_PX));
    if (patTaken && p) sameOnPattern.push(printDiff(patTaken, p));
  }

  // a DIFFERENT document, in the same place, same size
  const other = print(document(seed + 500));
  if (other) different.push(printDiff(taken, other));
}

const stats = (xs) => ({
  n: xs.length,
  min: Math.min(...xs),
  max: Math.max(...xs),
  mean: xs.reduce((s, x) => s + x, 0) / xs.length,
});
const S = stats(same);
const P = stats(sameOnPattern);
const D = stats(different);
console.log(`    same page:        n=${S.n} ${S.min.toFixed(2)}..${S.max.toFixed(2)} mean ${S.mean.toFixed(2)}`);
console.log(`    same on pattern:  n=${P.n} ${P.min.toFixed(2)}..${P.max.toFixed(2)} mean ${P.mean.toFixed(2)}`);
console.log(`    different doc:    n=${D.n} ${D.min.toFixed(2)}..${D.max.toFixed(2)} mean ${D.mean.toFixed(2)}`);

check("every population was actually sampled", S.n > 100 && P.n > 50 && D.n > 20, `${S.n}/${P.n}/${D.n}`);

// The first attempt died here: the pattern case read the same as a swap. This
// is the check that says whether that has genuinely been fixed.
check("the same page never reads as different -- not wobbling, shaded or glared", S.max < PRINT_DIFFERENT, `worst same-page reading ${S.max.toFixed(3)} vs threshold ${PRINT_DIFFERENT}`);
check("...nor on a patterned floor, which is what broke the first attempt", P.max < PRINT_DIFFERENT, `worst pattern reading ${P.max.toFixed(3)} vs threshold ${PRINT_DIFFERENT}`);
check("a different document always reads as different", D.min > PRINT_DIFFERENT, `closest different-document reading ${D.min.toFixed(3)} vs threshold ${PRINT_DIFFERENT}`);

// A threshold with no daylight either side of it is a coin toss waiting to
// happen on a real phone. This is the number that justifies shipping it.
const ceiling = Math.max(S.max, P.max);
const margin = D.min - ceiling;
console.log(`    margin: worst same ${ceiling.toFixed(3)} -> closest different ${D.min.toFixed(3)} = ${margin.toFixed(3)}`);
check("there is real daylight between the two", margin > 0.2, `margin ${margin.toFixed(3)}`);
check("the threshold sits inside that gap, not on its edge", PRINT_DIFFERENT > ceiling + 0.05 && PRINT_DIFFERENT < D.min - 0.05, `${ceiling.toFixed(3)} < ${PRINT_DIFFERENT} < ${D.min.toFixed(3)}`);

// ---------------------------------------------------------------------------
// The caller's gate
// ---------------------------------------------------------------------------
const takenA = print(document(7));
const other = print(document(507));
check("a steady outline gets an opinion", looksDifferent(takenA, other, other, PRINT_STILL_TICKS)?.different === true);
check("a different document is called different", looksDifferent(takenA, other, other, 99)?.different === true);
check("the same document is not", looksDifferent(takenA, print(document(7, { paper: 180 })), print(document(7, { paper: 180 })), 99)?.different === false);
// A wobbling outline is the case that cannot be judged, so it must get NO
// opinion rather than a guess -- the camera then keeps the geometric answer it
// already had, which is exactly today's behaviour.
check("a moving outline gets no opinion at all", looksDifferent(takenA, other, other, PRINT_STILL_TICKS - 1) === null);
check("no opinion without a page to compare against", looksDifferent(null, other, other, 99) === null);
check("no opinion on a blank page", looksDifferent(takenA, null, other, 99) === null);
check("stillness is required for more than one tick", PRINT_STILL_TICKS >= 2, String(PRINT_STILL_TICKS));

// ---------------------------------------------------------------------------
// The gates, which are what make the margin above real
// ---------------------------------------------------------------------------
// The camera's own MOVE_TOLERANCE is 2% of a 480px frame -- 9.6px a tick -- and
// the sweep showed the margin is 0.156 at 8px and 0.003 at 12px. So the
// fingerprint cannot borrow that tolerance, and this is the check that says so.
check("the fingerprint's stillness budget is far tighter than the camera's", PRINT_STILL_PX <= 4, `${PRINT_STILL_PX}px vs MOVE_TOLERANCE's 9.6px`);
check("a page that has barely moved is judged", barelyMoved(PAGE, PAGE.map((p) => ({ x: p.x + 1, y: p.y + 1 }))) === true);
check("a page that has moved more than the budget is not", barelyMoved(PAGE, PAGE.map((p) => ({ x: p.x + PRINT_STILL_PX + 2, y: p.y }))) === false);
check("nothing to compare against is not stillness", barelyMoved(null, PAGE) === false);
check("a page where it was photographed is near enough", nearEnough(PAGE, PAGE.map((p) => ({ x: p.x + 2, y: p.y - 1 }))) === true);
check("a page that has drifted away is not", nearEnough(PAGE, PAGE.map((p) => ({ x: p.x + PRINT_NEAR_PX + 3, y: p.y }))) === false);
check("one corner alone is enough to disqualify it", nearEnough(PAGE, [PAGE[0], PAGE[1], PAGE[2], { x: PAGE[3].x + 40, y: PAGE[3].y }]) === false);
check("the near gate is tight enough for the margin to hold", PRINT_NEAR_PX <= 8, `${PRINT_NEAR_PX}px`);

// ---------------------------------------------------------------------------
// The settled rule -- the discriminator the outline cannot give
// ---------------------------------------------------------------------------
// A hand crossing the page, a shadow sweeping over it, a page being flexed:
// all change what the page LOOKS like while its corners sit still, so the
// stillness gate above cannot see them. A document put down and left alone
// reads the same tick to tick; anything in motion does not. Without this,
// swap-inplace.mjpeg reached a stack of THREE on a two-document clip.
const docC = print(document(11));
const docD = print(document(511));
check("a different document that has settled is acted on", looksDifferent(docC, docD, docD, 99)?.different === true);
check("a difference still MOVING is not acted on, however large", looksDifferent(docC, docD, docC, 99)?.different === false, JSON.stringify(looksDifferent(docC, docD, docC, 99)));
check("...and it is reported as unsettled rather than as the same page", looksDifferent(docC, docD, docC, 99)?.settled === false);
check("a first reading with nothing before it is never acted on", looksDifferent(docC, docD, null, 99)?.different === false);
check("the settled window is tighter than the difference threshold", PRINT_SETTLED < PRINT_DIFFERENT, `${PRINT_SETTLED} vs ${PRINT_DIFFERENT}`);

console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
