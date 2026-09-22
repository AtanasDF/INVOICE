# The files test-multi-docs and test-company-picker hand to the app, into
# harness/multi/. The original generator (multi/gen-multi.py) lived in a
# session scratchpad and was lost with it; both suites had been stopping on
# a missing file since. The stand-in reader in test-multi-docs tells the
# photos apart by their pixel size, so the sizes below are the contract;
# what is drawn on them only has to look like paper. Run from harness/.
#
# multi3.pdf        three pages, three documents (Brakes Bros, Toolstation, Screwfix)
# two-receipts.jpg  1200x900, two receipts side by side (Costa, Tesco)
# usd.jpg           800x1000, a US dollar invoice (GitHub)
# copy.jpg          900x1100, a supplier invoice (Toolstation again, the in-batch duplicate)
# back.jpg          the back of a page, added by hand
# clean2.jpg        1000x700, two clean receipts (North Deli, East Parking)
import io, os
from PIL import Image, ImageDraw, ImageFont

OUT = "multi"
os.makedirs(OUT, exist_ok=True)


def font(size):
    for f in ("/System/Library/Fonts/Supplemental/Arial.ttf", "/System/Library/Fonts/Helvetica.ttc", "/Library/Fonts/Arial.ttf"):
        if os.path.exists(f):
            return ImageFont.truetype(f, size)
    return ImageFont.load_default()


def receipt(d, x, y, w, h, title, lines):
    d.rectangle([x, y, x + w, y + h], fill=(250, 250, 247), outline=(210, 205, 200), width=2)
    d.text((x + 24, y + 24), title, fill=(20, 20, 20), font=font(max(18, w // 12)))
    for i, l in enumerate(lines):
        d.text((x + 24, y + 90 + i * (h // 14)), l, fill=(50, 50, 50), font=font(max(14, w // 20)))


def photo(size, parts, bg=(92, 80, 70)):
    im = Image.new("RGB", size, bg)
    d = ImageDraw.Draw(im)
    for p in parts:
        receipt(d, *p)
    return im


def save_jpeg(im, name):
    im.save(f"{OUT}/{name}", "JPEG", quality=86)


save_jpeg(photo((1200, 900), [
    (30, 40, 540, 820, "COSTA", ["Flat white   3.40", "Croissant    4.20", "", "Total        7.60", "VAT          1.27", "Card"]),
    (630, 40, 540, 820, "TESCO", ["Milk         1.30", "Bread        1.45", "Coffee       2.75", "", "(total torn off)"]),
]), "two-receipts.jpg")

save_jpeg(photo((800, 1000), [(40, 40, 720, 920, "GitHub, Inc.", ["Invoice GH-7", "Sep 8, 2026", "", "Team plan   $21.00", "Total       $21.00", "Paid by card"])], bg=(235, 235, 235)), "usd.jpg")

save_jpeg(photo((900, 1100), [(40, 40, 820, 1020, "Toolstation", ["Invoice T-100", "08/09/26", "", "Drill bits    25.00", "VAT            5.00", "Total         30.00", "Paid"])], bg=(200, 195, 190)), "copy.jpg")

save_jpeg(photo((900, 1100), [(40, 40, 820, 1020, "Page 2", ["Terms and conditions", "Returns within 28 days", "Thank you"])], bg=(200, 195, 190)), "back.jpg")

save_jpeg(photo((1000, 700), [
    (20, 30, 460, 640, "NORTH DELI", ["Sandwich   4.50", "VAT        0.75", "Total      4.50"]),
    (520, 30, 460, 640, "EAST PARKING", ["2 hours    6.00", "VAT        1.00", "Total      6.00"]),
]), "clean2.jpg")

# A three-page PDF, one document per page, drawn as images so no font is needed.
pages = []
for title, lines in (
    ("BRAKES BROS  Invoice BB-1", ["Due 30/09/26", "Veg box   100.00", "VAT        20.00", "Total     120.00", "PAID"]),
    ("TOOLSTATION  T-100", ["Drill bits  25.00", "VAT          5.00", "Total       30.00"]),
    ("SCREWFIX  SF-1", ["Screws      20.00", "VAT          4.00", "Total       24.00"]),
):
    pg = Image.new("RGB", (850, 1100), (255, 255, 255))
    receipt(ImageDraw.Draw(pg), 40, 40, 770, 1020, title, lines)
    pages.append(pg)
pages[0].save(f"{OUT}/multi3.pdf", "PDF", save_all=True, append_images=pages[1:], resolution=100)

print("multi:", sorted(os.listdir(OUT)))
