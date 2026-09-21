# Ten synthetic UK documents with known figures, for bench-engines.mjs
# (backlog item 24: Gemini against Claude on the same documents, timed).
# Six supplier invoices, three till receipts and one credit note, each a
# 1240x1754 JPEG (A4 at 150 dpi) with a little tilt and noise so it reads
# like a photo rather than a render. The truth for each is written to
# bench-docs/manifest.json. Regenerate any time; nothing here is kept.
import io, json, math, os, random
from PIL import Image, ImageDraw, ImageFont, ImageFilter

random.seed(24)
OUT = "bench-docs"
os.makedirs(OUT, exist_ok=True)
try:
    mono = ImageFont.truetype("/System/Library/Fonts/Supplemental/Courier New.ttf", 26)
    sans = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 26)
    bold = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 40)
    small = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 20)
except Exception:
    mono = sans = bold = small = ImageFont.load_default()

VENDORS = [
    ("Brightwork Plastering Ltd", "14 Feeder Road, Bristol BS2 0SB", "GB 341 2298 07"),
    ("Travis Perkins", "Unit 3, Winterstoke Road, Bristol BS3 2NS", "GB 408 0246 66"),
    ("Screwfix Direct Ltd", "Trade Counter, Avonmouth BS11 8AZ", "GB 232 5555 12"),
    ("Jewson Ltd", "Feeder Road, Bristol BS2 0TQ", "GB 178 2903 44"),
    ("City Plumbing Supplies", "Days Road, Bristol BS5 0DZ", "GB 663 1177 09"),
    ("Toolstation", "Ashton Gate, Bristol BS3 2EJ", "GB 903 4421 87"),
    ("Howdens Joinery", "Bath Road, Brislington BS4 5NL", "GB 112 7364 19"),
]
ITEMS = ["Multi-finish plaster 25kg", "Plasterboard 12.5mm 2400x1200", "Bonding coat 25kg", "Scrim tape 90m", "Angle bead 3m", "PVA 5L",
         "Skim bucket", "Corner trowel", "Insulation board 50mm", "Dry lining screws 38mm", "Beading 2.4m", "Sand 25kg"]

def money(x): return f"{x:,.2f}"

def lines(n):
    out = []
    for _ in range(n):
        qty = random.choice([1, 2, 3, 4, 5, 6, 8, 10, 12])
        unit = round(random.uniform(1.5, 48.0), 2)
        out.append((random.choice(ITEMS), qty, unit, round(qty * unit, 2)))
    return out

def photo(im):
    im = im.rotate(random.uniform(-1.4, 1.4), expand=False, fillcolor=(236, 232, 226), resample=Image.BICUBIC)
    px = im.load()
    for _ in range(9000):
        x, y = random.randrange(im.width), random.randrange(im.height)
        r, g, b = px[x, y]; n = random.randint(-9, 9)
        px[x, y] = (max(0, min(255, r + n)), max(0, min(255, g + n)), max(0, min(255, b + n)))
    return im.filter(ImageFilter.GaussianBlur(0.6))

def invoice(i, credit=False):
    v = VENDORS[i % len(VENDORS)]
    d = f"{random.randint(1, 28):02d}/{random.randint(1, 9):02d}/2026"
    dd, mm, yy = d.split("/")
    num = f"{'CN' if credit else 'INV'}-{random.randint(1000, 9999)}"
    ls = lines(random.randint(3, 6))
    net = round(sum(l[3] for l in ls), 2)
    vat = round(net * 0.2, 2)
    total = round(net + vat, 2)
    im = Image.new("RGB", (1240, 1754), (250, 249, 246))
    dr = ImageDraw.Draw(im)
    dr.text((90, 90), v[0], font=bold, fill=(20, 20, 20))
    dr.text((90, 145), v[1], font=small, fill=(70, 70, 70))
    dr.text((90, 172), f"VAT No {v[2]}", font=small, fill=(70, 70, 70))
    dr.text((820, 90), "CREDIT NOTE" if credit else "INVOICE", font=bold, fill=(20, 20, 20))
    dr.text((820, 150), f"No. {num}", font=sans, fill=(30, 30, 30))
    dr.text((820, 185), f"Date {d}", font=sans, fill=(30, 30, 30))
    if not credit: dr.text((820, 220), f"Due {(int(dd) % 28) + 1:02d}/{(int(mm) % 12) + 1:02d}/2026", font=sans, fill=(30, 30, 30))
    dr.text((90, 290), "Bill to: A. Dimitrov, 7 Mill Lane, Bristol BS1 4DJ", font=sans, fill=(30, 30, 30))
    y = 400
    dr.text((90, y), "Description", font=small, fill=(90, 90, 90)); dr.text((760, y), "Qty", font=small, fill=(90, 90, 90))
    dr.text((880, y), "Unit", font=small, fill=(90, 90, 90)); dr.text((1040, y), "Total", font=small, fill=(90, 90, 90))
    y += 40
    for desc, qty, unit, tot in ls:
        dr.text((90, y), desc, font=sans, fill=(25, 25, 25)); dr.text((760, y), str(qty), font=sans, fill=(25, 25, 25))
        dr.text((880, y), money(unit), font=sans, fill=(25, 25, 25)); dr.text((1040, y), money(tot), font=sans, fill=(25, 25, 25))
        y += 44
    y += 30
    sign = "-" if credit else ""
    dr.text((820, y), "Subtotal", font=sans, fill=(30, 30, 30)); dr.text((1040, y), sign + money(net), font=sans, fill=(30, 30, 30)); y += 40
    dr.text((820, y), "VAT 20%", font=sans, fill=(30, 30, 30)); dr.text((1040, y), sign + money(vat), font=sans, fill=(30, 30, 30)); y += 40
    dr.text((820, y), "Total", font=bold, fill=(20, 20, 20)); dr.text((1040, y), sign + "£" + money(total), font=bold, fill=(20, 20, 20))
    dr.text((90, 1560), "Payment by bank transfer within 14 days. Sort 12-34-56 Account 1029 3847", font=small, fill=(70, 70, 70))
    return photo(im), {"documentType": "credit_note" if credit else "invoice", "vendor": v[0], "date": f"2026-{mm}-{dd}", "invoiceNumber": num,
                       "totalAmount": total, "vatAmount": vat, "lines": len(ls)}

def receipt(i):
    v = VENDORS[(i * 3 + 1) % len(VENDORS)]
    d = f"{random.randint(1, 28):02d}/{random.randint(1, 9):02d}/2026"
    dd, mm, yy = d.split("/")
    ls = lines(random.randint(2, 5))
    total = round(sum(l[3] for l in ls), 2)
    vat = round(total - total / 1.2, 2)
    im = Image.new("RGB", (1240, 1754), (236, 232, 226))
    strip = Image.new("RGB", (560, 1300), (247, 245, 240))
    dr = ImageDraw.Draw(strip)
    dr.text((60, 50), v[0].upper(), font=bold, fill=(15, 15, 15))
    dr.text((60, 110), v[1], font=small, fill=(60, 60, 60))
    dr.text((60, 138), f"VAT {v[2]}", font=small, fill=(60, 60, 60))
    dr.text((60, 190), f"{d}  {random.randint(8, 18):02d}:{random.randint(0, 59):02d}", font=mono, fill=(30, 30, 30))
    y = 260
    for desc, qty, unit, tot in ls:
        dr.text((60, y), f"{desc[:22]:<22}", font=mono, fill=(30, 30, 30)); y += 30
        dr.text((60, y), f"  {qty} @ {money(unit):>8}   {money(tot):>9}", font=mono, fill=(30, 30, 30)); y += 36
    y += 20
    dr.text((60, y), f"TOTAL           £{money(total):>9}", font=mono, fill=(10, 10, 10)); y += 36
    dr.text((60, y), f"VAT INCL 20%     {money(vat):>9}", font=mono, fill=(30, 30, 30)); y += 36
    dr.text((60, y), "CARD  ****4417   APPROVED", font=mono, fill=(30, 30, 30)); y += 60
    dr.text((60, y), "Thank you for shopping with us", font=small, fill=(60, 60, 60))
    im.paste(strip, (340, 220))
    return photo(im), {"documentType": "receipt", "vendor": v[0], "date": f"2026-{mm}-{dd}", "invoiceNumber": None, "totalAmount": total, "vatAmount": vat, "lines": len(ls)}

manifest = []
docs = [invoice(i) for i in range(6)] + [receipt(i) for i in range(3)] + [invoice(9, credit=True)]
for k, (im, truth) in enumerate(docs, start=1):
    name = f"doc-{k:02d}.jpg"
    im.save(os.path.join(OUT, name), "JPEG", quality=86)
    manifest.append({"file": name, **truth})
json.dump(manifest, open(os.path.join(OUT, "manifest.json"), "w"), indent=1)
print(len(manifest), "documents in", OUT)
