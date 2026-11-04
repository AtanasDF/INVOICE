# Clips of a white page on a PALE surface. Every other clip puts the page on
# a dark brown table, which is the easiest contrast a detector can be given;
# a white invoice on light oak or a white kitchen worktop is what a real
# phone more often sees, and it had never been tried (Atanas, 2026-10-28:
# "it doesn't really recognise the invoice properly, the green lines").
#
#   pale-wood.mjpeg      an A4 invoice on light oak
#   white-worktop.mjpeg  the same invoice on an off-white worktop, a faint
#                        shadow under its edge as paper casts in room light
#   white-noshadow.mjpeg the same, lit from above: no shadow to help, only the
#                        page's own few grey levels against the worktop
#   bare-worktop.mjpeg   the worktop with nothing on it, which must never be
#                        photographed (the gentler second look the detector
#                        takes for a white-on-white page must not invent one)
#
# Same format as gen-conditions.py: concatenated JPEGs, 720x1080, 30fps, ten
# seconds, the page wobbling a pixel or so as a held phone does.
import io, math, random
from PIL import Image, ImageDraw, ImageFont, ImageFilter

W, H, FPS, SECS = 720, 1080, 30, 10
random.seed(28)
try:
    font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Courier New.ttf", 20)
    bold = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 30)
except Exception:
    font = bold = ImageFont.load_default()


def invoice():
    p = Image.new("RGBA", (460, 650), (252, 252, 250, 255))
    d = ImageDraw.Draw(p)
    d.text((30, 30), "NORTHSIDE JOINERY LTD", font=bold, fill=(20, 20, 20, 255))
    d.text((30, 80), "INVOICE 2291   12/10/2026", font=font, fill=(40, 40, 40, 255))
    for i in range(12):
        d.text((30, 140 + i * 30), f"{i+1:02d} oak skirting 2.4m   {(i+1)*12}.50", font=font, fill=(50, 50, 50, 255))
    d.text((30, 560), "VAT 20%        43.20", font=font, fill=(30, 30, 30, 255))
    d.text((30, 600), "TOTAL         259.20", font=bold, fill=(10, 10, 10, 255))
    return p


def oak():
    im = Image.new("RGB", (W, H), (204, 178, 140))
    d = ImageDraw.Draw(im)
    for x in range(0, W, 2):
        s = int(10 * math.sin(x / 17.0) + 6 * math.sin(x / 5.3) + random.randint(-5, 5))
        d.line([(x, 0), (x + random.randint(-3, 3), H)], fill=(204 + s, 178 + s, 140 + s), width=2)
    return im.filter(ImageFilter.GaussianBlur(1.2))


def worktop():
    im = Image.new("RGB", (W, H), (226, 224, 218))
    px = im.load()
    for _ in range(40000):
        x, y = random.randrange(W), random.randrange(H)
        n = random.randint(-14, 8)
        r, g, b = px[x, y]
        px[x, y] = (r + n, g + n, b + n)
    return im.filter(ImageFilter.GaussianBlur(0.8))


def frame(bg, page, cx, cy, angle, shadow):
    im = bg.copy()
    o = page.rotate(angle, expand=True, resample=Image.BICUBIC)
    x, y = int(cx - o.width / 2), int(cy - o.height / 2)
    if shadow:
        s = Image.new("RGBA", im.size, (0, 0, 0, 0))
        mask = o.split()[3]
        s.paste((0, 0, 0, 45), (x + 4, y + 5), mask)
        s = s.filter(ImageFilter.GaussianBlur(5))
        im.paste(s, (0, 0), s)
    im.paste(o, (x, y), o)
    b = io.BytesIO()
    im.save(b, "JPEG", quality=86)
    return b.getvalue()


def write(name, frames):
    with open(name, "wb") as out:
        for f in frames:
            out.write(f)
    print(name, len(frames), "frames")


PAGE = invoice()
wobble = lambda t: (1.2 * math.sin(t * 1.1) + random.uniform(-0.5, 0.5), 1.2 * math.cos(t * 0.9) + random.uniform(-0.5, 0.5))
N = FPS * SECS
# The same order of random draws as before the two new clips, so the first
# two come out exactly as they always have.
OAK, TOP = oak(), worktop()
for name, bg, shadow in [("pale-wood.mjpeg", OAK, False), ("white-worktop.mjpeg", TOP, True), ("white-noshadow.mjpeg", TOP, False)]:
    write(name, [frame(bg, PAGE, 360 + wobble(i / FPS)[0], 540 + wobble(i / FPS)[1], 2.0, shadow) for i in range(N)])


def bare(bg, t):
    # A held phone over an empty worktop: the view drifts a pixel or two.
    dx, dy = wobble(t)
    im = bg.transform(bg.size, Image.AFFINE, (1, 0, dx, 0, 1, dy), resample=Image.BILINEAR)
    b = io.BytesIO()
    im.save(b, "JPEG", quality=86)
    return b.getvalue()


write("bare-worktop.mjpeg", [bare(TOP, i / FPS) for i in range(N)])
