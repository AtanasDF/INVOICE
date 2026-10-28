# batch-handheld.mjpeg -- batch-swap.mjpeg as a hand holds it: the same two
# documents and the same 21 empty frames between them, but the page never
# stops swaying a few pixels, as it does under a phone held in the air.
#
# Every other batch clip holds the page dead still after frame 20, so the
# batch-only wait for the outline to settle within 3px (66f36fe) passed in
# the harness and never fired on Atanas's iPhone (2026-10-28: "it should be
# scanning automatically"). The sway stays inside the auto-capture gate's own
# MOVE_TOLERANCE, so a single-document scan of the same clip is taken.
import io, math, pathlib

here = pathlib.Path(__file__).resolve().parent
src = (here / "gen-swap-inplace.py").read_text().split("\nframes = []")[0]
ns = {"__name__": "swap"}
exec(compile(src, "gen-swap-inplace.py", "exec"), ns)
TABLE, frame = ns["TABLE"], ns["frame"]


def sway(i):
    t = i / 30
    return (round(3 * math.sin(t * 2 * math.pi * 1.1) + 2 * math.sin(t * 2 * math.pi * 2.3 + 1)),
            round(3 * math.sin(t * 2 * math.pi * 0.9 + 2) + 2 * math.sin(t * 2 * math.pi * 2.7)))


def empty():
    buf = io.BytesIO()
    TABLE.save(buf, "JPEG", quality=84)
    return buf.getvalue()


frames = [frame("a", sway(i)) for i in range(4 * 30)]
frames += [empty()] * 21
frames += [frame("b", sway(i)) for i in range(9 * 30)]

out = here / "batch-handheld.mjpeg"
with open(out, "wb") as f:
    for fr in frames:
        f.write(fr)
print("batch-handheld.mjpeg", sum(len(f) for f in frames) // 1024, "KB", len(frames), "frames")
