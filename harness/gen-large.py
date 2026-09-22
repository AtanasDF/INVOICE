# large.mjpeg -- a full A4 invoice held close, filling most of the frame.
#
# Nine suites launch Chrome's fake camera with this clip, and it had no
# generator: the clips are gitignored (~770MB) and this one was only ever
# made by hand in a session scratchpad that has since been wiped. The
# README said "gen-*.py regenerates the clips", which was not true of the
# one clip most suites depend on. Now it is.
#
# Format, same as the other generators: concatenated JPEGs, 720x1080, 30fps.
# Chrome's --use-file-for-fake-video-capture reads exactly that.
import io, math, random
from PIL import Image, ImageDraw, ImageFont, ImageFilter

W, H = 720, 1080
random.seed(11)
try:
    font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 15)
    small = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 12)
    bold = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 30)
    head = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 17)
except Exception:
    font = small = bold = head = ImageFont.load_default()


def table():
    im = Image.new("RGB", (W, H), (68, 50, 38))
    d = ImageDraw.Draw(im)
    for y in range(0, H, 3):
        s = int(8 * math.sin(y / 23.0) + random.randint(-6, 6))
        d.line([(0, y), (W, y + random.randint(-2, 2))], fill=(68 + s, 50 + s, 38 + s), width=2)
    return im.filter(ImageFilter.GaussianBlur(1.2))


TABLE = table()


def invoice(w=620, h=876):
    # A4 proportions (1:1.414), printed like the app's own issued invoice so
    # a reading of it is plausible as well as detectable.
    p = Image.new("RGBA", (w, h), (252, 251, 249, 255))
    d = ImageDraw.Draw(p)
    d.text((44, 46), "BRIGHTWORK LTD", font=bold, fill=(17, 17, 17, 255))
    d.text((44, 84), "14 Feeder Road, Bristol BS2 0SB", font=small, fill=(90, 90, 90, 255))
    d.text((44, 100), "VAT 341 2298 07", font=small, fill=(90, 90, 90, 255))

    d.text((w - 210, 46), "INVOICE", font=head, fill=(17, 17, 17, 255))
    d.text((w - 210, 72), "No. INV-1043", font=font, fill=(40, 40, 40, 255))
    d.text((w - 210, 94), "Date  14/03/2026", font=font, fill=(40, 40, 40, 255))
    d.text((w - 210, 116), "Due   28/03/2026", font=font, fill=(40, 40, 40, 255))

    d.text((44, 168), "Bill to", font=small, fill=(120, 120, 120, 255))
    d.text((44, 188), "Acme Kitchens Ltd", font=font, fill=(20, 20, 20, 255))
    d.text((44, 210), "1 Mill Lane, Bristol BS1 4DJ", font=small, fill=(80, 80, 80, 255))

    top = 268
    d.line([(44, top), (w - 44, top)], fill=(200, 200, 200, 255), width=2)
    for label, x in (("Description", 48), ("Qty", w - 250), ("Price", w - 185), ("Total", w - 100)):
        d.text((x, top + 10), label, font=small, fill=(120, 120, 120, 255))
    d.line([(44, top + 32), (w - 44, top + 32)], fill=(200, 200, 200, 255), width=1)

    rows = [
        ("Plastering, ground floor", "12.5", "38.40", "480.00"),
        ("Bonding and skim coat", "3", "64.95", "194.85"),
        ("Insulation board", "7", "22.15", "155.05"),
        ("Making good after first fix", "1", "120.00", "120.00"),
        ("Waste removal", "1", "45.00", "45.00"),
    ]
    y = top + 44
    for desc, qty, price, total in rows:
        d.text((48, y), desc, font=font, fill=(30, 30, 30, 255))
        d.text((w - 250, y), qty, font=font, fill=(30, 30, 30, 255))
        d.text((w - 185, y), price, font=font, fill=(30, 30, 30, 255))
        d.text((w - 100, y), total, font=font, fill=(30, 30, 30, 255))
        y += 30
        d.line([(44, y - 6), (w - 44, y - 6)], fill=(232, 232, 232, 255), width=1)

    y += 18
    for label, amount, f in (("Subtotal", "994.90", font), ("VAT 20%", "198.98", font), ("Total", "1193.88", head)):
        d.text((w - 250, y), label, font=f, fill=(30, 30, 30, 255))
        d.text((w - 110, y), amount, font=f, fill=(20, 20, 20, 255))
        y += 30

    d.text((44, h - 96), "Payment by bank transfer within 14 days.", font=small, fill=(90, 90, 90, 255))
    d.text((44, h - 76), "Sort 12-34-56   Account 1029 3847", font=small, fill=(90, 90, 90, 255))
    d.rectangle([0, 0, w - 1, h - 1], outline=(224, 222, 218, 255), width=2)
    return p


PAGE = invoice()


def frame(cx, cy, w, h, angle):
    im = TABLE.copy()
    o = PAGE.resize((w, h), Image.LANCZOS).rotate(angle, expand=True, resample=Image.BICUBIC)
    im.paste(o, (int(cx - o.width / 2), int(cy - o.height / 2)), o)
    # A little sensor noise, or every frame is byte-identical and the
    # sharpness reading is unnaturally perfect.
    px = im.load()
    for _ in range(1400):
        x, y = random.randrange(W), random.randrange(H)
        r, g, b = px[x, y]
        n = random.randint(-7, 7)
        px[x, y] = (max(0, min(255, r + n)), max(0, min(255, g + n)), max(0, min(255, b + n)))
    b = io.BytesIO()
    im.save(b, "JPEG", quality=88)
    return b.getvalue()


# Held in a hand: the page barely moves, which is what the detector's
# "steady for N ticks" path expects. 14 seconds at 30fps.
frames = []
for i in range(14 * 30):
    t = i / 30.0
    frames.append(frame(
        360 + 1.5 * math.sin(t * 1.1) + random.uniform(-0.6, 0.6),
        540 + 1.5 * math.cos(t * 0.9) + random.uniform(-0.6, 0.6),
        # 440 of 720 px wide: the phone shows a middle strip of the sensor
        # (about 499 px here), and a page wider than that runs off both
        # sides and is rightly never found (CLAUDE.md, 2026-09-21).
        440, 622,
        1.4 + 0.25 * math.sin(t * 0.7),
    ))

with open("large.mjpeg", "wb") as out:
    for f in frames:
        out.write(f)

Image.open(io.BytesIO(frames[0])).save("large-frame.png")
import os
print("large.mjpeg", os.path.getsize("large.mjpeg") // 1024, "KB,", len(frames), "frames")
