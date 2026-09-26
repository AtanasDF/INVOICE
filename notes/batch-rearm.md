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
