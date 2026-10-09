// Telling one document from another when both lie in the same place.
//
// THE PROBLEM. After a capture in batch mode, auto-capture re-arms only when
// the page it took counts as GONE, and that test is purely geometric: lost for
// a couple of ticks, its centre moved, or it shrank. Slide the next document
// into the same spot at the same size and none of those fire, so the second
// document is never taken. Atanas, from his iPhone, twice: "each second picture
// fails"; "the scanner doesn't pile up photos from when scanning so doesn't
// allow you to scan more than one file."
//
// WHAT WAS TRIED AND REJECTED (notes/batch-rearm.md). A 64-sample grey
// fingerprint, POINT samples on an 8x8 lattice in page coordinates, zero-meaned.
// On a receipt lying on a PATTERNED FLOOR it read 16 -- exactly what a genuine
// swap read -- so no threshold separated them and it was reverted rather than
// shipped half-on. The stated cause: "an outline that wobbles, which is what a
// busy background does to it, lands the 64 samples on different parts of the
// same page."
//
// WHY THIS IS NOT THAT. Three changes, each aimed at that cause:
//
//  1. CELL MEANS, NOT POINT SAMPLES. Every cell is the average of a grid of
//     sub-samples covering the whole cell, so the fingerprint is a downsampled
//     picture of the page rather than 64 pinpricks of it. Shift the sampling
//     by a few pixels and a point sample can move from paper onto print and
//     swing wildly; a cell mean barely changes. This is the whole of what
//     "compare after the warp" buys you, and it is the part the lattice missed.
//  2. THE EDGES ARE LEFT OUT. Corner error is largest at the corners, and the
//     outer border of a page is mostly blank paper carrying no information
//     anyway. Only the middle is compared.
//  3. CONTRAST IS DIVIDED OUT, not just the brightness. The old one zero-meaned,
//     which survives a light going on; dividing by the spread also survives a
//     page moving into shade, which is what a hand over a phone does.
//
// A blank reading returns null rather than a fingerprint of nothing: two blank
// pages are not evidence of anything, and calling them "different" is how a
// receipt gets photographed twice. A DUPLICATED receipt in an accounting record
// is worse than a missed one -- that judgement is this file's reason for
// existing and nothing here may trade against it.

export type Point = { x: number; y: number };
export type Quad = [Point, Point, Point, Point];

// 10x10 cells, each the mean of 16x16 sub-samples. BOTH NUMBERS WERE MEASURED
// (harness/measure-page-print.mjs, a sweep of 4..10 cells against 4..24
// sub-samples), and the sweep said something I had got wrong: the grid size
// barely matters and THE SAMPLING DENSITY MATTERS ENORMOUSLY. At 4 sub-samples
// the two populations overlap at every grid size -- a cell ~48px across
// sampled 4 times is 16 pinpricks ~12px apart, so a 7px line of print can fall
// between them entirely, which is the lattice's mistake one level down. At 16
// it is a real area mean and the same page stops caring where its corners are
// thought to be.
export const PRINT_N = 10;
export const PRINT_SUB = 16;
// The outer tenth of the page on each side is not compared.
export const PRINT_INSET = 0.1;
// Below this spread the page carries no usable detail -- blank paper, or a
// frame so dark nothing shows. No fingerprint, so no comparison.
export const PRINT_MIN_SPREAD = 2.5;

// Mean absolute difference, in units of the pages' own contrast, above which
// two readings are a different document. MEASURED, and the margin either side
// of it is the reason this is shippable where the first attempt was not. With
// the gates below, over 30 synthetic documents in two shapes, plain and on a
// patterned floor, in shade and in glare:
//
//     the same page, worst reading       0.386
//     a different document, closest      0.732
//
// 0.55 sits in that gap with 0.16 below it and 0.18 above. The old attempt had
// no gap at all: the pattern case read 16 and a swap read 16.
export const PRINT_DIFFERENT = 0.55;
// Consecutive ticks that must agree before the camera acts on it.
//
// Four was not enough and the clips said so: on swap-inplace the stack reached
// THREE on a two-document clip, which is a receipt photographed twice -- the
// one outcome this whole file exists to avoid. Ticks are fast, so four of them
// is a fraction of a second and a transient clears it.
export const PRINT_AGREE_TICKS = 8;

// AND the reading has to have SETTLED. This is the discriminator that the
// outline-stillness gate cannot provide, because the thing that moves is not
// the outline: a hand crossing the page, a shadow sweeping over it, a page
// being flexed -- all change what the page LOOKS like while its corners sit
// still. A document that has been put down and left alone reads the same from
// tick to tick; anything in motion does not.
//
// So a tick only counts as "a different document" when this tick's reading is
// close to the last tick's AS WELL AS far from the photographed one. Moving
// differences are ignored, however large.
export const PRINT_SETTLED = 0.3;

// THE GATES, and they are the whole reason this is honest.
//
// The margin above holds only while the outline is nearly right. The sweep
// measured what happens when it is not, and it is brutal: at 4px of corner
// error the margin is 0.287, at 8px it is 0.156, and at 12px it is 0.003 --
// gone. The camera's own MOVE_TOLERANCE allows 9.6px a tick, so "still enough
// for auto-capture" is NOWHERE NEAR still enough for this.
//
// So the fingerprint keeps its own far tighter conditions, and WHEN THEY ARE
// NOT MET IT SAYS NOTHING AT ALL -- the camera then keeps whatever the
// geometric test decided, which is exactly today's behaviour. Declining to
// answer is the correct answer here: a wrong "different" photographs the same
// receipt twice, into an accounting record, and that is worse than missing one.
//
// Corner movement between ticks, in work-frame pixels (the frame is 480 wide,
// so this is 0.6% of it, against MOVE_TOLERANCE's 2%).
export const PRINT_STILL_PX = 3;
export const PRINT_STILL_TICKS = 3;
// How far the page may sit from where it was photographed and still be judged
// by its fingerprint. Beyond this the two readings are of different parts of
// their pages and the comparison means nothing -- and a page that has moved
// that far is the geometric test's business anyway.
//
// This is the limit of what is fixed here, stated plainly: a swap where the new
// document's outline lands more than 6px from the old one's still falls to
// geometry. What it does cover is the case in the clip and the one he
// described -- the next document in the same place, phone held steady.
export const PRINT_NEAR_PX = 6;

// Grey of the work frame at a point, bilinear between the four pixels around
// it. Points outside the frame are clamped to the edge rather than skipped, so
// a page whose corner sits a pixel off-frame still reads.
function greyAt(pixels: Uint8ClampedArray, w: number, h: number, x: number, y: number): number {
  const fx = Math.min(w - 1, Math.max(0, x));
  const fy = Math.min(h - 1, Math.max(0, y));
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(w - 1, x0 + 1);
  const y1 = Math.min(h - 1, y0 + 1);
  const tx = fx - x0;
  const ty = fy - y0;
  const at = (px: number, py: number) => {
    const i = (py * w + px) * 4;
    // Rec. 601 luma, the same weighting cv.COLOR_RGBA2GRAY uses, so a
    // fingerprint and the detector are reading the same picture.
    return 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
  };
  const top = at(x0, y0) * (1 - tx) + at(x1, y0) * tx;
  const bottom = at(x0, y1) * (1 - tx) + at(x1, y1) * tx;
  return top * (1 - ty) + bottom * ty;
}

// Where (u, v) in the page's own square lands in the frame. Bilinear across
// the quad: as a corner moves, the sample points move WITH it, which is what
// puts the reading in page coordinates rather than the frame's.
function onPage(q: Quad, u: number, v: number): Point {
  const topX = q[0].x + (q[1].x - q[0].x) * u;
  const topY = q[0].y + (q[1].y - q[0].y) * u;
  const botX = q[3].x + (q[2].x - q[3].x) * u;
  const botY = q[3].y + (q[2].y - q[3].y) * u;
  return { x: topX + (botX - topX) * v, y: topY + (botY - topY) * v };
}

/**
 * A normalised 8x8 reading of the middle of a page, or null when the page
 * carries too little detail to be worth comparing. Corners are TL, TR, BR, BL.
 */
export function pagePrint(pixels: Uint8ClampedArray, w: number, h: number, q: Quad): Float32Array | null {
  if (w < 2 || h < 2) return null;
  const cells = new Float32Array(PRINT_N * PRINT_N);
  const span = 1 - 2 * PRINT_INSET;
  const cell = span / PRINT_N;
  const step = cell / PRINT_SUB;
  for (let j = 0; j < PRINT_N; j++) {
    for (let i = 0; i < PRINT_N; i++) {
      let sum = 0;
      for (let b = 0; b < PRINT_SUB; b++) {
        for (let a = 0; a < PRINT_SUB; a++) {
          // The centre of each sub-cell, so no sample sits on a cell boundary
          // where it would be shared with the neighbour.
          const u = PRINT_INSET + i * cell + (a + 0.5) * step;
          const v = PRINT_INSET + j * cell + (b + 0.5) * step;
          const p = onPage(q, u, v);
          sum += greyAt(pixels, w, h, p.x, p.y);
        }
      }
      cells[j * PRINT_N + i] = sum / (PRINT_SUB * PRINT_SUB);
    }
  }
  let mean = 0;
  for (const c of cells) mean += c;
  mean /= cells.length;
  let variance = 0;
  for (const c of cells) variance += (c - mean) * (c - mean);
  const spread = Math.sqrt(variance / cells.length);
  // Blank paper, or a frame too dark to read. Two of these are not evidence
  // that the document changed.
  if (!Number.isFinite(spread) || spread < PRINT_MIN_SPREAD) return null;
  for (let i = 0; i < cells.length; i++) cells[i] = (cells[i] - mean) / spread;
  return cells;
}

/** How unalike two readings are: 0 is identical, and PRINT_DIFFERENT is the line. */
export function printDiff(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return Infinity;
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
  return sum / a.length;
}

/**
 * Whether the page in front of the camera is a DIFFERENT document from the one
 * just photographed -- the question the geometric test cannot answer when both
 * lie in the same place.
 *
 * `stillTicks` is how long the outline has been steady. Below PRINT_STILL_TICKS
 * this returns null, meaning "no opinion": the caller keeps whatever the
 * geometric test decided. Null is also the answer when either page is blank.
 */
export function looksDifferent(
  taken: Float32Array | null,
  now: Float32Array | null,
  previous: Float32Array | null,
  stillTicks: number
): { different: boolean; diff: number; settled: boolean } | null {
  if (!taken || !now || stillTicks < PRINT_STILL_TICKS) return null;
  const diff = printDiff(taken, now);
  // Without a previous reading there is nothing to say it has settled, and an
  // unsettled reading is not evidence of a new document however big it is.
  const settled = previous !== null && printDiff(now, previous) <= PRINT_SETTLED;
  return { different: settled && diff > PRINT_DIFFERENT, diff, settled };
}

/** Whether the outline sits close enough to the photographed one to be judged by its print. */
export function nearEnough(taken: Quad, now: Quad): boolean {
  for (let i = 0; i < 4; i++) {
    const dx = taken[i].x - now[i].x;
    const dy = taken[i].y - now[i].y;
    if (Math.sqrt(dx * dx + dy * dy) > PRINT_NEAR_PX) return false;
  }
  return true;
}

/** Whether the outline has barely moved since the last tick -- far tighter than MOVE_TOLERANCE. */
export function barelyMoved(before: Quad | null, now: Quad): boolean {
  if (!before) return false;
  for (let i = 0; i < 4; i++) {
    const dx = before[i].x - now[i].x;
    const dy = before[i].y - now[i].y;
    if (Math.sqrt(dx * dx + dy * dy) > PRINT_STILL_PX) return false;
  }
  return true;
}
