# swap-inplace.mjpeg -- two different documents, one after the other, in
# exactly the same place, with no empty frame between them.
#
# Atanas, 2026-09-26: "each second picture fails, it doesn't want to show
# anything"; "it glitched on the second document. It didn't want to upload
# more than one." The re-arm test after a capture was purely geometric --
# the page counted as gone when it was lost, moved, or shrank -- so sliding
# the next document into the same spot at the same size changed nothing it
# looked at and auto-capture never re-armed.
#
# batch-swap.mjpeg, the one clip that covered batching, shows 21 empty frames
# between its two pages. That is the easy case, and it is not the one he does.
# This clip cuts straight from one document to the other in the same rect.
#
# Format, same as the other generators: concatenated JPEGs, 720x1080, 30fps.
import io, math, random
from PIL import Image, ImageDraw, ImageFont, ImageFilter

W, H = 720, 1080
random.seed(9)
try:
    reg = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 11)
    big = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 19)
except Exception:
    reg = big = ImageFont.load_default()

PW, PH = 330, 466
PX, PY = (W - PW) // 2, (H - PH) // 2


def table():
    im = Image.new("RGB", (W, H), (66, 49, 37))
    d = ImageDraw.Draw(im)
    for y in range(0, H, 3):
        s = int(7 * math.sin(y / 21.0) + random.randint(-5, 5))
        d.line([(0, y), (W, y + random.randint(-2, 2))], fill=(66 + s, 49 + s, 37 + s), width=2)
    return im.filter(ImageFilter.GaussianBlur(1.1))


TABLE = table()


def page(kind):
    # Two documents that no fingerprint could confuse: a wide invoice with a
    # table of lines, and a narrow till receipt with its text down one side.
    p = Image.new("RGB", (PW, PH), (250, 249, 246) if kind == "a" else (243, 242, 238))
    d = ImageDraw.Draw(p)
    if kind == "a":
        d.text((18, 16), "NORTHGATE SUPPLY", font=big, fill=(15, 15, 15))
        d.text((18, 44), "Invoice NG-2291   14/03/2026", font=reg, fill=(70, 70, 70))
        d.line([(18, 66), (PW - 18, 66)], fill=(180, 180, 180), width=2)
        for i in range(16):
            y = 80 + i * 21
            d.text((20, y), f"Item {i + 1} — timber batten 38x63", font=reg, fill=(25, 25, 25))
            d.text((PW - 62, y), f"{(i + 3) * 7}.40", font=reg, fill=(25, 25, 25))
        d.line([(18, 428), (PW - 18, 428)], fill=(180, 180, 180), width=2)
        d.text((PW - 132, 438), "Total  914.80", font=big, fill=(15, 15, 15))
    else:
        d.text((16, 18), "CAFE ORIOLE", font=big, fill=(20, 20, 20))
        for i in range(9):
            y = 58 + i * 34
            d.text((18, y), ("FLAT WHITE", "PASTRY", "SOUP", "BREAD", "TEA", "JUICE", "CAKE", "WATER", "TIP")[i], font=reg, fill=(30, 30, 30))
            d.text((150, y), f"{2 + i}.{(i * 3) % 10}0", font=reg, fill=(30, 30, 30))
        d.rectangle([16, 368, PW - 16, 448], outline=(60, 60, 60), width=2)
        d.text((28, 382), "TOTAL     41.70", font=big, fill=(15, 15, 15))
        d.text((28, 414), "CARD  **** 4417", font=reg, fill=(60, 60, 60))
    return p


A, B = page("a"), page("b")


def frame(kind, jitter):
    im = TABLE.copy()
    ox, oy = jitter
    im.paste(A if kind == "a" else B, (PX + ox, PY + oy))
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=84)
    return buf.getvalue()


frames = []
# Four seconds of document A, held still enough to be taken.
for i in range(4 * 30):
    frames.append(frame("a", (0, 0) if i > 20 else (random.randint(-2, 2), random.randint(-2, 2))))
# Then straight to B, in the same rectangle. No gap, nothing lost, nothing
# moved, nothing shrunk: only what is printed on it changes.
for i in range(9 * 30):
    frames.append(frame("b", (0, 0)))

with open("swap-inplace.mjpeg", "wb") as f:
    for fr in frames:
        f.write(fr)
print("swap-inplace.mjpeg", sum(len(f) for f in frames) // 1024, "KB", len(frames), "frames")
