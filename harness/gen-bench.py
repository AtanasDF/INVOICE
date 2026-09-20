# Work-frame greys (480x917, what processFrame sees on the 375x716 video) of
# bent pages under parameter sweeps, as PGM, with the flat page's true corners
# where there is one. For the node bench (bench-corners.mjs).
import io, math, random, json, os, sys
from PIL import Image, ImageDraw, ImageChops, ImageFilter
src = open("gen-bent.py").read().split("PW, PH = 380, 537")[0]
exec(src)
SX, SW = (720 - 375 / (716 / 1080)) / 2, 375 / (716 / 1080)
WW, WH = 480, round(1080 / SW * 480)
os.makedirs("bench", exist_ok=True)

def to_work(im):
    return im.crop((round(SX), 0, round(SX + SW), 1080)).resize((WW, WH), Image.BILINEAR).convert("L")

def truth(obj_w, obj_h, pad, pw, ph, angle, cx=360, cy=540):
    # Page corners (inside the padded object) after PIL's rotate(expand) and paste.
    a = math.radians(angle)
    ow, oh = obj_w, obj_h
    cos, sin = math.cos(a), math.sin(a)
    ew = abs(ow * cos) + abs(oh * sin)
    eh = abs(ow * sin) + abs(oh * cos)
    ew, eh = math.ceil(ew - 1e-9), math.ceil(eh - 1e-9)
    ox, oy = int(cx - ew / 2), int(cy - eh / 2)
    out = []
    for (x, y) in [(pad, pad), (pad + pw, pad), (pad + pw, pad + ph), (pad, pad + ph)]:
        dx, dy = x - ow / 2, y - oh / 2
        rx = dx * cos + dy * sin + ew / 2
        ry = -dx * sin + dy * cos + eh / 2
        fx, fy = ox + rx, oy + ry
        out.append(((fx - SX) * WW / SW, fy * WH / 1080))
    return out

def place_im(obj, cx, cy, angle, noise=0):
    return Image.open(io.BytesIO(place(obj, cx, cy, angle, noise)))

cases = []
def add(name, obj, angle, tr=None, noise=0, seed=0):
    random.seed(seed)
    im = place_im(obj, 360, 540, angle, noise)
    g = to_work(im)
    fn = f"bench/{name}.pgm"
    g.save(fn)
    cases.append({"name": name, "file": fn, "w": WW, "h": WH, "truth": tr})

PW, PH = 380, 537
base = paper(PW, PH, "INVOICE B")
for ang in [0, 4, 12, 30]:
    add(f"flat-a{ang}", base, ang, truth(PW, PH, 0, PW, PH, ang))
for (a, b) in [(40, 35), (80, 70), (120, 100)]:
    obj = dogear(base, a, b)
    for ang in [0, 4, 12, 30]:
        for s in range(3 if ang == 4 else 1):
            add(f"dogear-{a}-a{ang}-n{s}", obj, ang, truth(PW, PH, 0, PW, PH, ang), noise=8 if s else 0, seed=s)
for k in [0.05, 0.09, 0.15]:
    obj = warp(base, *flare(k=k))
    add(f"flare-{k}", obj, -3)
for k in [0.035, 0.07, 0.1, 0.13]:
    obj = warp(shade_thirds(base), *creased(k=k))
    for s in range(3):
        add(f"thirds-{k}-n{s}", obj, 5, noise=8 if s else 0, seed=s)
rc = warp(torn_top(paper(150, 470, "TILL", lines=22, small=True)), *snake(), pad=30)
for s in range(3):
    add(f"receipt-n{s}", rc, -6, noise=8 if s else 0, seed=s)
for f in ["far-receipt-frame.png", "far-curl-frame.png", "bill-box.png"]:
    g = to_work(Image.open(f).convert("RGB"))
    fn = f"bench/{f.replace('.png', '')}.pgm"
    g.save(fn)
    cases.append({"name": f.replace(".png", ""), "file": fn, "w": WW, "h": WH, "truth": None})
json.dump(cases, open("bench/cases.json", "w"), indent=0)
print(len(cases), WW, WH)
