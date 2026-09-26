# tiles.mjpeg -- a tiled kitchen worktop, and nothing else on it.
#
# Atanas on an iPhone, 2026-09-26: "once I point it down, he scans the tiles
# in my kitchen and he takes the picture of that... it should be documents,
# not just tiles. You shouldn't be able to scan tiles just because it has an
# edge." A tile beat every test the detector applied to a large shape: big,
# rectangular, lighter than the grout round it, nothing printed nearby.
#
# Three things have to be true of this clip or it proves nothing, and the
# first two took a couple of goes:
#  - one tile must sit whole inside the VISIBLE strip, which is about 566 of
#    the 720 px the clip is wide (the video is cover-fitted to the screen, so
#    a portrait phone shows a middle band -- see CLAUDE.md);
#  - it must be large enough to pass MIN_COVERAGE, or auto-capture never
#    considers it and a suite watching for a photograph passes for the wrong
#    reason;
#  - and the phone must be held STILL for a stretch, because auto-capture
#    wants STABLE_MS of the outline not moving. The first version drifted the
#    whole way through, never fired, and made the suite vacuous.
#
# Format, same as the other generators: concatenated JPEGs, 720x1080, 30fps.
import io, math, random
from PIL import Image, ImageDraw, ImageFilter

W, H = 720, 1080
random.seed(26)

TILE, GROUT = 320, 16
PITCH = TILE + GROUT
# Chosen so the tile laid at (336, 672) in the big image lands at (200, 380)
# in the frame: 320 px square, centred in the visible strip.
BX, BY = 136, 292


def wall(ox, oy, light):
    im = Image.new("RGB", (W + 400, H + 400), (104, 100, 97))
    d = ImageDraw.Draw(im)
    for ty in range(-1, (H + 400) // PITCH + 2):
        for tx in range(-1, (W + 400) // PITCH + 2):
            x, y = tx * PITCH, ty * PITCH
            # Gloss: each tile a slightly different shade with a highlight
            # along the top. Nothing printed anywhere -- that is the point.
            shade = light + random.randint(-6, 6)
            d.rectangle([x, y, x + TILE, y + TILE], fill=(shade, shade - 2, shade - 5))
            d.rectangle([x + 10, y + 10, x + TILE - 10, y + 54], fill=(min(255, shade + 8),) * 3)
    return im.filter(ImageFilter.GaussianBlur(0.6)).crop((BX + ox, BY + oy, BX + ox + W, BY + oy + H))


frames = []
for i in range(14 * 30):
    t = i / 30.0
    if t < 6:
        ox = int(20 * math.sin(t / 1.1) + random.randint(-1, 1))
        oy = int(16 * math.cos(t / 0.9) + random.randint(-1, 1))
    else:
        ox, oy = 0, 0
    buf = io.BytesIO()
    wall(ox, oy, 228 if t < 6 else 236).save(buf, "JPEG", quality=82)
    frames.append(buf.getvalue())

with open("tiles.mjpeg", "wb") as f:
    for fr in frames:
        f.write(fr)
print("tiles.mjpeg", sum(len(f) for f in frames) // 1024, "KB", len(frames), "frames")
