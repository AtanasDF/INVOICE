# Bent paper: a dog-eared page, a page curling up at the bottom (sides flare),
# a letter folded in thirds (kinks at the creases, shaded panels), a curled
# till receipt; static and hand-held (jitter + sensor noise) versions.
# Red marks sit 4% in from the page edges (corners and mid-sides) so a test can
# tell whether the crop kept the whole page.
import io, math, random, json, sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageChops
exec(open("gen-far.py").read().split("R, T, D = receipt()")[0])  # table(), TABLE, frame(), write(), fonts
random.seed(11)
RED = (225, 20, 20, 255)
MARK_AT = [(0.04, 0.04), (0.5, 0.04), (0.96, 0.04), (0.96, 0.5), (0.96, 0.96), (0.5, 0.96), (0.04, 0.96), (0.04, 0.5)]

def paper(w, h, label, lines=18, small=False):
    pg = Image.new("RGBA", (w, h), (250, 250, 247, 255))
    d = ImageDraw.Draw(pg)
    f = ImageFont.truetype("/System/Library/Fonts/Supplemental/Courier New.ttf", 13 if small else 16)
    d.text((int(w * 0.1), int(h * 0.08)), label, font=bold, fill=(20, 20, 20, 255))
    for i in range(lines):
        d.text((int(w * 0.1), int(h * 0.2) + i * int(h * 0.68 / lines)), f"Item {i+1:02d} ...... {i*7+3}.00", font=f, fill=(35, 35, 35, 255))
    m = max(4, int(min(w, h) * 0.025))
    for fx, fy in MARK_AT:
        cx, cy = fx * w, fy * h
        d.rectangle([cx - m / 2, cy - m / 2, cx + m / 2, cy + m / 2], fill=RED)
    return pg

def dogear(pg, a=80, b=70):
    # Top-right corner folded over: the corner triangle is gone from the
    # silhouette and lies reflected on the page, back side up.
    w, h = pg.size
    p1, p2 = (w - a, 0), (w, b)
    # Reflect the corner (w, 0) across the fold line p1-p2.
    dx, dy = p2[0] - p1[0], p2[1] - p1[1]
    t = ((w - p1[0]) * dx + (0 - p1[1]) * dy) / (dx * dx + dy * dy)
    fx, fy = p1[0] + t * dx, p1[1] + t * dy
    q = (2 * fx - w, 2 * fy - 0)
    out = pg.copy()
    mask = Image.new("L", pg.size, 255)
    ImageDraw.Draw(mask).polygon([p1, (w, 0), p2], fill=0)
    out.putalpha(ImageChops.multiply(out.getchannel("A"), mask))
    shadow = Image.new("RGBA", pg.size, (0, 0, 0, 0))
    ImageDraw.Draw(shadow).polygon([p1, (q[0] - 4, q[1] + 5), p2], fill=(0, 0, 0, 70))
    shadow = shadow.filter(ImageFilter.GaussianBlur(3))
    out = Image.alpha_composite(out, shadow)
    out.putalpha(ImageChops.multiply(out.getchannel("A"), mask))
    flap = ImageDraw.Draw(out)
    flap.polygon([p1, q, p2], fill=(236, 236, 231, 255))
    return out

def warp(pg, s, dy, dx, pad=40):
    # Page (u, v) in 0..1 lands at x = cx + (u - .5) * w * s(v) + dx(v),
    # y = pad + h * (v - dy(v)); drawn by inverting that on a 4px mesh.
    w, h = pg.size
    W2, H2 = w + 2 * pad, h + 2 * pad
    cx = W2 / 2
    def inv(x, y):
        u, v = (x - pad) / w, (y - pad) / h
        for _ in range(8):
            v = (y - pad) / h + dy(v)
            u = 0.5 + (x - cx - dx(v)) / (w * s(v))
        return u * w, v * h
    mesh = []
    step = 4
    for y0 in range(0, H2, step):
        for x0 in range(0, W2, step):
            x1, y1 = x0 + step, y0 + step
            q = inv(x0, y0) + inv(x0, y1) + inv(x1, y1) + inv(x1, y0)
            mesh.append(((x0, y0, x1, y1), q))
    return pg.transform((W2, H2), Image.MESH, mesh, Image.BICUBIC)

def smooth01(t):
    return max(0.0, min(1.0, t))

def flare(k=0.09, v0=0.55, c=0.04):
    t = lambda v: smooth01((v - v0) / (1 - v0))
    return (lambda v: 1 + k * t(v) ** 2, lambda v: c * t(v) ** 3, lambda v: 0.0)

def creased(k=0.035, width=0.1):
    tent = lambda v: max(0.0, 1 - abs(v - 1 / 3) / width) + max(0.0, 1 - abs(v - 2 / 3) / width)
    return (lambda v: 1 + k * tent(v), lambda v: 0.0, lambda v: 0.0)

def snake(k=0.16, v0=0.72, amp=5):
    t = lambda v: smooth01((v - v0) / (1 - v0))
    return (lambda v: 1 + k * t(v) ** 2, lambda v: 0.05 * t(v) ** 3, lambda v: amp * math.sin(2 * math.pi * v * 1.3))

def shade_thirds(pg):
    # The middle panel of a letter folded in thirds catches less light.
    w, h = pg.size
    g = Image.new("L", (1, h))
    for y in range(h):
        v = y / h
        g.putpixel((0, y), 255 - (int(22 * (1 - abs(v - 0.5) / (1 / 6))) if abs(v - 0.5) < 1 / 6 else 0))
    g = g.resize((w, h))
    rgb = ImageChops.multiply(pg.convert("RGB"), Image.merge("RGB", [g, g, g]))
    out = rgb.convert("RGBA")
    out.putalpha(pg.getchannel("A"))
    return out

def torn_top(pg):
    w, h = pg.size
    mask = Image.new("L", pg.size, 0)
    pts = [(x, 6 + (5 if (x // 12) % 2 else 0)) for x in range(0, w + 1, 12)] + [(w, h), (0, h)]
    ImageDraw.Draw(mask).polygon(pts, fill=255)
    out = pg.copy()
    out.putalpha(ImageChops.multiply(out.getchannel("A"), mask))
    return out

def place(obj, cx, cy, angle, noise=0):
    im = TABLE.copy()
    o = obj.rotate(angle, expand=True, resample=Image.BICUBIC)
    # A soft shadow under the paper.
    sh = Image.new("RGBA", o.size, (0, 0, 0, 0))
    sh.putalpha(o.getchannel("A").point(lambda a: 60 if a > 128 else 0).filter(ImageFilter.GaussianBlur(4)))
    im.paste(sh, (int(cx - o.width / 2) + 3, int(cy - o.height / 2) + 4), sh)
    im.paste(o, (int(cx - o.width / 2), int(cy - o.height / 2)), o)
    if noise:
        n = Image.effect_noise(im.size, noise).convert("RGB")
        im = ImageChops.add(im, n, 1.0, -128)
    b = io.BytesIO(); im.save(b, "JPEG", quality=85); return b.getvalue()

PW, PH = 380, 537
specs = {
    "dogear": dogear(paper(PW, PH, "INVOICE D")),
    "flare": warp(paper(PW, PH, "INVOICE F"), *flare()),
    "thirds": warp(shade_thirds(paper(PW, PH, "INVOICE T")), *creased()),
    "receipt": warp(torn_top(paper(150, 470, "TILL", lines=22, small=True)), *snake(), pad=30),
}
angles = {"dogear": 4, "flare": -3, "thirds": 5, "receipt": -6}
SECS = 10
only = sys.argv[1:] or list(specs) + ["dogear-flex"]
if "dogear-flex" in only:
    # Hand-held dog-eared page: the flap springs between 60 and 90px and the
    # page turns a little either way -- across the point where the simplified
    # outline's corner flips between the fold's two ends.
    flat = paper(340, 480, "INVOICE X")
    fr = []
    for i in range(SECS * 30):
        t = i / 30
        a = 60 + 30 * (0.5 + 0.5 * math.sin(2 * math.pi * t / 1.6))
        ang = 2.5 + 1.5 * math.sin(2 * math.pi * t / 4)
        fr.append(place(dogear(flat, int(a), int(a * 0.85)), 360 + random.uniform(-1, 1), 540 + random.uniform(-1, 1), ang, noise=6))
    write("bent-dogear-flex.mjpeg", fr)
    Image.open(io.BytesIO(fr[0])).save("bent-dogear-flex-frame.png")
    only = [n for n in only if n != "dogear-flex"]
    print("dogear-flex", flush=True)
for name in only:
    obj = specs[name]
    obj.save(f"bent-{name}-obj.png")
    write(f"bent-{name}.mjpeg", [place(obj, 360, 540, angles[name])] * (SECS * 30))
    fr = []
    for i in range(SECS * 30):
        fr.append(place(obj, 360 + random.uniform(-3, 3), 540 + random.uniform(-3, 3), angles[name] + random.uniform(-0.5, 0.5), noise=10))
    write(f"bent-{name}-jitter.mjpeg", fr)
    Image.open(io.BytesIO(fr[0])).save(f"bent-{name}-frame.png")
    print(name, obj.size, flush=True)
