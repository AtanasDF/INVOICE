# batch-swap.mjpeg -- two different documents, one after the other, with 21
# empty frames of table between them: the easy batching case, where the first
# page is taken away before the second is put down.
#
# test-batch-swap and test-batch-stuck both need it and it had no generator:
# it was made by hand on the old Mac and did not come across on 2026-10-24.
# notes/batch-rearm.md describes it as above; this rebuilds it from that, with
# the same pages and table as gen-swap-inplace.py.
#
# Format, same as the other generators: concatenated JPEGs, 720x1080, 30fps.
import io, pathlib, random

here = pathlib.Path(__file__).resolve().parent
src = (here / "gen-swap-inplace.py").read_text().split("\nframes = []")[0]
ns = {"__name__": "swap"}
exec(compile(src, "gen-swap-inplace.py", "exec"), ns)
TABLE, frame = ns["TABLE"], ns["frame"]
random.seed(21)


def empty():
    buf = io.BytesIO()
    TABLE.save(buf, "JPEG", quality=84)
    return buf.getvalue()


frames = []
for i in range(4 * 30):
    frames.append(frame("a", (0, 0) if i > 20 else (random.randint(-2, 2), random.randint(-2, 2))))
blank = empty()
frames += [blank] * 21
for i in range(9 * 30):
    frames.append(frame("b", (0, 0) if i > 20 else (random.randint(-2, 2), random.randint(-2, 2))))

out = here / "batch-swap.mjpeg"
with open(out, "wb") as f:
    for fr in frames:
        f.write(fr)
print("batch-swap.mjpeg", sum(len(f) for f in frames) // 1024, "KB", len(frames), "frames")
