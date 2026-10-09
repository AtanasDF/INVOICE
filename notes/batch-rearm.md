# Two documents in the same spot, and why the fingerprint was thrown away

**The hole is real and is still open.** After a capture in batch mode, auto-capture
re-arms only when the page it took counts as *gone*, and that test is purely
geometric (`DocumentCapture.tsx`, the `if (!armedRef.current)` block): lost for
`LOST_GRACE_TICKS`, its centre moved more than `TAKEN_MOVED`, or shrunk below
`TAKEN_SHRUNK` of what was taken. Slide the next document into the same place at
the same size and none of those fire, so the second document is never taken.

`batch-swap.mjpeg` — the one clip that covered batching — shows **21 empty frames
between its two pages**, which satisfies "lost". That is the easy case.
`gen-swap-inplace.py` (committed) cuts straight from one document to a different
one in the same rectangle, and reproduces the hole: the stack reaches 1 and stays
there for the whole clip.

## What was tried, measured, and rejected

A 64-sample grey fingerprint of the page (8x8 lattice in page coordinates,
zero-meaned so a lighting change isn't mistaken for a new document), compared with
the fingerprint of the page that was taken; a mean absolute difference over a
threshold counted as a different document.

Sampled on the **raw** per-tick outline it was hopeless. Sampled on the
**smoothed** outline (`medianQuad` of the last three) and required to hold for four
consecutive ticks it got close, and then stopped:

| clip | what it is | swap readings | stack |
|---|---|---|---|
| `swap-inplace` | two documents, same spot | 0 then 16 | 2 — fixed |
| `large` | one A4 invoice, held close | 0-10 | 1 — right |
| `far-receipt` | one receipt, arm's length | 0 | 1 — right |
| `pattern` | one receipt, **patterned floor** | 0, 11, **16** | **2 — wrong** |

The same receipt on a patterned floor reads **16**, which is exactly what a genuine
swap reads. No threshold separates them. The cause is that the fingerprint is taken
in page coordinates, so an outline that wobbles — which is what a busy background
does to it — lands the 64 samples on different parts of the same page.

So it was reverted. A missed second document is an annoyance he can work around by
lifting the first one away; a **duplicated receipt** goes into an accounting record,
and shipping a heuristic that fires on one of four document clips is not a trade
worth making. It is written down here rather than left in the tree half-on.

## What to try next

- Gate the fingerprint on the outline being genuinely still (a stillness counter on
  the smoothed quad), so a busy background simply falls back to today's behaviour
  instead of guessing. Not tried; the worry is that corners can jitter within
  `MOVE_TOLERANCE` and still move 64 sample points across printed text.
- Compare after the perspective warp the capture path already computes, so the
  samples are in flattened-page coordinates rather than in the wobbling quad's.
  More work per tick, but it removes the actual cause rather than masking it.
- Ask him first whether he really does slide the next document straight in, or
  lifts the last one away. **His "each second picture fails" may not be this at all:
  the far likelier cause was the paused video (`be1df24`), where the detector never
  saw the gap because it was getting no frames.** If that fixed it on his phone,
  this hole is worth closing on its merits but is not urgent.

## He reported it again, after the paused-video fix (2026-10-09)

Atanas, from his iPhone: *"the scanner doesnt pile up photos from when scanning so
doesnt allow you to scan more than one file."*

That answers the last question above. `be1df24` (the paused video) is in and he is
still seeing it, so this hole is real and separate — it is not the detector going
blind for want of frames.

**What was NOT the cause**, each checked in the source rather than guessed at:

- `capturedRef` is cleared on the batch success path (`capturedRef.current = false`
  before the `return`), so the shutter is not a one-shot.
- the shutter button carries no `disabled`, and `shutter()` checks only
  `capturedRef`, never `armedRef` — so a manual tap works *even while auto-capture
  is un-armed*. It worked the whole time he was stuck.
- the stack is rendered with a green count badge and the hint says
  "Got it — N scanned", so a capture that happened was visible.

**What was wrong is the other half of it: there was no way out and nothing said
there was.** The hint read `Got it — 1 scanned. Next document…` and went on saying
exactly that for as long as he stood there, while the one control that would have
worked sat underneath it unmentioned. The geometric re-arm is a known limitation;
leaving somebody inside it with no exit is a bug of its own, and the cheaper half
of the fix by a wide margin.

So after `STUCK_MS` (3s) of waiting with a page in frame, the hint changes to:

> If this is a different document, tap the button to scan it.

It asks rather than instructs, deliberately. The page in frame may well be the one
already taken, and this file's own argument stands: a **duplicated** receipt in an
accounting record is worse than a missed one. A shutter exists so the judgement can
be his; the hint's job is only to tell him he has one.

## And then it was closed (2026-10-09, same session)

**The second document in the same spot is now captured on its own.**
`src/lib/pagePrint.ts`, `harness/test-page-print.mjs` (33 checks),
`harness/test-batch-stuck.mjs` (14, against the clips), and
`harness/measure-page-print.mjs`, the tool that chose the numbers.

It is the fingerprint idea again, so here is exactly what is different, because
"tried that, it fired on a patterned floor" was a good reason to stop and the
same reason would apply again.

**1. Cell means, densely sampled — and the density was the whole thing.** The first
attempt took 64 POINT samples on a lattice. I assumed averaging each cell would fix
it and measured a sweep of 4..10 cells against 4..24 sub-samples per axis
(`measure-page-print.mjs`). The grid size barely mattered. The sampling density
mattered enormously: at 4 sub-samples the two populations overlap at **every** grid
size, because a cell ~48px across sampled 4 times is 16 pinpricks ~12px apart and a
7px line of print falls between them — the lattice's mistake one level down. At 16 it
is a genuine area mean. **My first run of this failed exactly as the first attempt
did** (same page up to 1.12, different documents down to 0.54, no threshold between
them) and the sweep is the only reason it is not still failing.

**2. Contrast is divided out, not just brightness.** Shade and glare read 0.02..0.10.
That half was never the problem.

**3. It refuses to answer far more often than it answers.** This is the part that
makes it safe, and the measurements are why. The margin collapses as the outline
goes wrong: **0.287 at 4px of corner error, 0.156 at 8px, 0.003 at 12px.** The
camera's own `MOVE_TOLERANCE` is 2% of a 480px frame — 9.6px a tick — so "still
enough for auto-capture" is nowhere near still enough for this. So the fingerprint
keeps its own gates and says NOTHING when they are not met, leaving the geometric
test exactly as it was:

- the outline moved no more than **3px** since last tick (`PRINT_STILL_PX`), for 3 ticks;
- the page is within **6px** of where it was photographed (`PRINT_NEAR_PX`);
- the reading has **settled** — this tick's is within 0.3 of last tick's (`PRINT_SETTLED`);
- and 8 consecutive ticks agree (`PRINT_AGREE_TICKS`).

**4. The settled rule is the one the clips forced, and it is not in the list above
by luck.** With only the stillness and near gates, `swap-inplace.mjpeg` reached a
stack of **THREE on a two-document clip** — a receipt photographed twice, the single
outcome this is all meant to avoid. The thing that moves when a hand crosses a page,
or a shadow sweeps it, or paper flexes, is not the outline: the corners sit still
while the CONTENT changes. A document put down and left alone reads the same tick to
tick; anything in motion does not. `hand.mjpeg` duplicated before this rule and
passes after it.

**The measured margin**, over 30 synthetic documents in two shapes, plain and on a
patterned floor, in shade and in glare, at the wobble the gate allows:

| | reading |
|---|---|
| the same page, worst | 0.271 |
| a different document, closest | 0.732 |
| threshold | **0.55** |

0.16 of daylight below it and 0.18 above. The first attempt had none: the pattern
case read 16 and a swap read 16.

**Against the clips**: swap-inplace reaches 2 on its own, and **pattern, large,
far-receipt, glare, shadow, hand and tiles all stay at 1** — three consecutive runs,
checked for flakiness because `hand` was intermittent before the settled rule.

**What is still NOT covered, plainly.** A swap where the new document's outline lands
more than 6px from the old one's gets no opinion and falls to geometry, which needs a
96px centre move or a 40% shrink. Two receipts of different sizes dropped in roughly
the same place may well be in that gap. The way out above — the hint naming the
shutter — is what catches those, and it is why that stays even though the hole is
closed. Worth measuring against his real receipts when there are some
(`BENCH_DIR`-style), because synthetic documents are flat, square and evenly lit and
his kitchen worktop is not.
