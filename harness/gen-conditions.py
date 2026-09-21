# Clips for the conditions a real receipt gets photographed in -- items 19
# and 20 of the backlog. Same format as every other generator here:
# concatenated JPEGs, 720x1080, 30fps, which is what Chrome's
# --use-file-for-fake-video-capture plays. Each clip is fourteen seconds:
# the awkward condition first, then the good one, so a suite can assert
# both "did not fire on this" and "did fire once it was right".
#
#   glare.mjpeg      a bright specular patch on the page (fires: glare is not a reason to wait)
#   shadow.mjpeg     a soft shadow across half the page (fires)
#   pattern.mjpeg    the page on a strongly patterned floor (fires: the page, not the tiles)
#   landscape.mjpeg  a page wider than tall (fires)
#   hand.mjpeg       a finger over one corner for 6s, then withdrawn (must not fire until it goes)
#   moving.mjpeg     the phone waving about for 6s, then held still (must not fire until still)
#   tillroll.mjpeg   a long receipt overflowing top and bottom for 6s, then pulled back to fit
import io, math, random
from PIL import Image, ImageDraw, ImageFont, ImageFilter

W, H, FPS, SECS = 720, 1080, 30, 14
random.seed(19)
try:
    font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Courier New.ttf", 22)
    bold = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 34)
except Exception:
    font = bold = ImageFont.load_default()

def table(pattern=False):
    im = Image.new("RGB", (W, H), (70, 52, 40))
    d = ImageDraw.Draw(im)
    if pattern:
        # A tiled floor with strong straight edges, the worst background for
        # a detector that looks for a light rectangle.
        for y in range(0, H, 90):
            for x in range(0, W, 90):
                dark = ((x // 90) + (y // 90)) % 2 == 0
                d.rectangle([x, y, x + 89, y + 89], fill=(120, 100, 80) if dark else (200, 190, 170), outline=(40, 30, 20), width=3)
    else:
        for y in range(0, H, 3):
            s = int(8 * math.sin(y / 23.0) + random.randint(-6, 6))
            d.line([(0, y), (W, y + random.randint(-2, 2))], fill=(70 + s, 52 + s, 40 + s), width=2)
    return im.filter(ImageFilter.GaussianBlur(1.0))

def receipt(w=320, h=900):
    r = Image.new("RGBA", (w, h), (246, 244, 238, 255))
    d = ImageDraw.Draw(r)
    d.text((40, 30), "TOOLSTATION", font=bold, fill=(20, 20, 20, 255))
    n = int((h - 200) / 30)
    for i in range(n):
        d.text((24, 110 + i * 30), f"ITEM {i+1:02d}  x1   {i*3+2}.49", font=font, fill=(40, 40, 40, 255))
    d.text((24, h - 40), "TOTAL      84.20", font=font, fill=(10, 10, 10, 255))
    return r

def page_landscape():
    p = Image.new("RGBA", (876, 620), (252, 251, 249, 255))
    d = ImageDraw.Draw(p)
    d.text((44, 40), "BRIGHTWORK LTD  -  INVOICE 1043", font=bold, fill=(17, 17, 17, 255))
    for i in range(12):
        d.text((44, 120 + i * 34), f"Line {i+1:02d}   plastering, phase two   {(i+1)*38}.40", font=font, fill=(30, 30, 30, 255))
    d.text((44, 560), "TOTAL  1193.88", font=bold, fill=(20, 20, 20, 255))
    return p

def frame(bg, obj, cx, cy, w, h, angle=0.0, after=None):
    im = bg.copy()
    o = obj.resize((w, h), Image.LANCZOS).rotate(angle, expand=True, resample=Image.BICUBIC)
    im.paste(o, (int(cx - o.width / 2), int(cy - o.height / 2)), o)
    if after: after(im)
    px = im.load()
    for _ in range(900):
        x, y = random.randrange(W), random.randrange(H)
        r, g, b = px[x, y]; n = random.randint(-6, 6)
        px[x, y] = (max(0, min(255, r + n)), max(0, min(255, g + n)), max(0, min(255, b + n)))
    b = io.BytesIO(); im.save(b, "JPEG", quality=86); return b.getvalue()

def write(name, frames):
    with open(name, "wb") as out:
        for f in frames: out.write(f)
    print(name, len(frames), "frames")

R, PAGE = receipt(), page_landscape()
TABLE, TILES = table(), table(pattern=True)
N = FPS * SECS
wobble = lambda t: (1.2 * math.sin(t * 1.1) + random.uniform(-0.5, 0.5), 1.2 * math.cos(t * 0.9) + random.uniform(-0.5, 0.5))

# glare: a soft white ellipse over the top third of the receipt, drifting
def glare(im):
    g = Image.new("RGBA", im.size, (0, 0, 0, 0))
    ImageDraw.Draw(g).ellipse([250, 200, 470, 380], fill=(255, 255, 255, 190))
    g = g.filter(ImageFilter.GaussianBlur(22))
    im.paste(g, (0, 0), g)
write("glare.mjpeg", [frame(TABLE, R, 360 + wobble(i / FPS)[0], 540 + wobble(i / FPS)[1], 300, 840, 2.0, glare) for i in range(N)])

# shadow: the left half of the page darkened by a soft-edged shadow
def shadow(im):
    s = Image.new("RGBA", im.size, (0, 0, 0, 0))
    ImageDraw.Draw(s).polygon([(0, 0), (380, 0), (300, H), (0, H)], fill=(0, 0, 0, 110))
    s = s.filter(ImageFilter.GaussianBlur(28))
    im.paste(s, (0, 0), s)
write("shadow.mjpeg", [frame(TABLE, R, 360 + wobble(i / FPS)[0], 540 + wobble(i / FPS)[1], 300, 840, -1.5, shadow) for i in range(N)])

# pattern: same receipt, tiled floor
write("pattern.mjpeg", [frame(TILES, R, 360 + wobble(i / FPS)[0], 540 + wobble(i / FPS)[1], 300, 840, 3.0) for i in range(N)])

# landscape: a page wider than tall, filling the width
write("landscape.mjpeg", [frame(TABLE, PAGE, 360 + wobble(i / FPS)[0], 540 + wobble(i / FPS)[1], 640, 452, 1.0) for i in range(N)])

# hand: a skin-coloured blob with a finger over the top-left corner for 6s
def hand_at(t):
    if t >= 6.0: return None
    def draw(im):
        d = ImageDraw.Draw(im)
        d.ellipse([60, 40, 300, 260], fill=(214, 168, 140))     # palm
        d.rounded_rectangle([200, 120, 330, 175], radius=26, fill=(214, 168, 140))  # finger over the corner
    return draw
write("hand.mjpeg", [frame(TABLE, R, 360 + wobble(i / FPS)[0], 540 + wobble(i / FPS)[1], 300, 840, 2.0, hand_at(i / FPS)) for i in range(N)])

# moving: waving about for 6s -- big swings and a blur -- then held
def moving_frame(i):
    t = i / FPS
    if t < 6.0:
        cx, cy = 360 + 90 * math.sin(t * 5.3), 540 + 70 * math.cos(t * 4.1)
        ang = 2.0 + 9 * math.sin(t * 6.7)
        b = frame(TABLE, R, cx, cy, 300, 840, ang)
        im = Image.open(io.BytesIO(b)).filter(ImageFilter.GaussianBlur(3.5))
        o = io.BytesIO(); im.save(o, "JPEG", quality=86); return o.getvalue()
    w = wobble(t)
    return frame(TABLE, R, 360 + w[0], 540 + w[1], 300, 840, 2.0)
write("moving.mjpeg", [moving_frame(i) for i in range(N)])

# tillroll: a very long receipt overflowing top and bottom for 6s, then
# pulled back so the whole thing is in the frame
LONG = receipt(320, 1900)
def tillroll_frame(i):
    t = i / FPS
    w = wobble(t)
    if t < 6.0: return frame(TABLE, LONG, 360 + w[0], 540 + w[1], 300, 1780, 1.0)   # ends off the top and bottom
    return frame(TABLE, LONG, 360 + w[0], 540 + w[1], 168, 1000, 1.0)                # whole receipt in view
write("tillroll.mjpeg", [tillroll_frame(i) for i in range(N)])
import os; print({f: os.path.getsize(f) // 1024 for f in ["glare.mjpeg", "shadow.mjpeg", "pattern.mjpeg", "landscape.mjpeg", "hand.mjpeg", "moving.mjpeg", "tillroll.mjpeg"]})
