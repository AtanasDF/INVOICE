import io, random, math
from PIL import Image, ImageDraw, ImageFont, ImageFilter
W, H = 720, 1080
random.seed(7)
try:
    font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Courier New.ttf", 22)
    bold = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 34)
except Exception:
    font = bold = ImageFont.load_default()

def table():
    im = Image.new("RGB", (W, H), (70, 52, 40))
    d = ImageDraw.Draw(im)
    for y in range(0, H, 3):  # wood grain
        s = int(8 * math.sin(y / 23.0) + random.randint(-6, 6))
        d.line([(0, y), (W, y + random.randint(-2, 2))], fill=(70 + s, 52 + s, 40 + s), width=2)
    return im.filter(ImageFilter.GaussianBlur(1.2))

TABLE = table()

def receipt(torn=False):
    r = Image.new("RGBA", (320, 900), (246, 244, 238, 255))
    d = ImageDraw.Draw(r)
    d.text((40, 30), "TOOLSTATION", font=bold, fill=(20, 20, 20, 255))
    for i in range(24):
        d.text((24, 110 + i * 30), f"ITEM {i+1:02d}  x1   {i*3+2}.49", font=font, fill=(40, 40, 40, 255))
    d.text((24, 860), "TOTAL      84.20", font=font, fill=(10, 10, 10, 255))
    if torn:  # zigzag torn bottom edge, slightly bulged sides
        mask = Image.new("L", r.size, 0)
        md = ImageDraw.Draw(mask)
        pts = [(0, 0), (320, 0)]
        for y in range(0, 880, 40):
            pts.append((320 - int(6 * math.sin(y / 140.0 * math.pi)), y))
        for x in range(320, -1, -20):
            pts.append((x, 880 + (12 if (x // 20) % 2 else 0)))
        for y in range(880, 0, -40):
            pts.append((int(5 * math.sin(y / 140.0 * math.pi)), y))
        md.polygon(pts, fill=255)
        r.putalpha(mask)
    return r

def dark_thing():
    r = Image.new("RGBA", (300, 600), (22, 22, 26, 255))
    ImageDraw.Draw(r).rectangle([12, 12, 288, 588], outline=(50, 50, 55, 255), width=6)
    return r

def frame(obj=None, cx=0, cy=0, w=0, h=0, angle=0.0):
    im = TABLE.copy()
    if obj is not None:
        o = obj.resize((w, h), Image.LANCZOS).rotate(angle, expand=True, resample=Image.BICUBIC)
        im.paste(o, (int(cx - o.width / 2), int(cy - o.height / 2)), o)
    b = io.BytesIO(); im.save(b, "JPEG", quality=85); return b.getvalue()

def write(name, frames):
    with open(name, "wb") as out:
        for f in frames: out.write(f)

R, T, D = receipt(), receipt(True), dark_thing()
still = lambda *a, secs=14, **k: [frame(*a, **k)] * int(secs * 30)
write("far-receipt.mjpeg", still(R, 360, 560, 62, 190, angle=5))
write("far-receipt-curl.mjpeg", still(T, 350, 540, 80, 240, angle=-8))
write("far-offcentre.mjpeg", still(R, 150, 540, 62, 190, angle=3))
write("dark-thing.mjpeg", still(D, 360, 560, 90, 180, angle=4))
jit = []
for i in range(14 * 30):
    jit.append(frame(R, 360 + random.randint(-2, 2), 560 + random.randint(-2, 2), 70, 210, angle=5 + random.uniform(-0.3, 0.3)))
write("far-jitter.mjpeg", jit)
Image.open(io.BytesIO(frame(R, 360, 560, 62, 190, angle=5))).save("far-receipt-frame.png")
Image.open(io.BytesIO(frame(T, 350, 540, 80, 240, angle=-8))).save("far-curl-frame.png")
import os; print({f: os.path.getsize(f)//1024 for f in os.listdir('.') if f.endswith('.mjpeg')})
