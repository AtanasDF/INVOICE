# The files the upload suites hand to the app (test-uploads,
# test-review-fixes, test-company-picker). They lived only in a session
# scratchpad and were lost with it, so three suites had been failing on a
# missing file since; this makes them again. Run from harness/.
#
# doc1..3.pdf  one page each, marked DOC1..DOC3 in UTF-16 in the Title, which
#              is how the suites' stand-in reader tells them apart
# bad.jpg      not an image at all, for "a file that can't be read"
# card.png     a business card, for the contact reader
# copy.jpg     a supplier invoice photographed, for the scan page
# back.jpg     its second page
import io, os
from PIL import Image, ImageDraw, ImageFont

OUT = "uploads"
os.makedirs(OUT, exist_ok=True)


def pdf_marked(marker: str, text: str) -> bytes:
    title = b"\xfe\xff" + b"".join(b"\x00" + c.encode() for c in marker)
    stream = f"BT /F1 16 Tf 24 360 Td ({text}) Tj ET".encode()
    objs = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 400] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
        b"<< /Length %d >>\nstream\n" % len(stream) + stream + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        b"<< /Title (" + title + b") /Producer (Invoicer harness) >>",
    ]
    out = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets = []
    for i, o in enumerate(objs, 1):
        offsets.append(len(out))
        out += b"%d 0 obj\n" % i + o + b"\nendobj\n"
    xref = len(out)
    out += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objs) + 1)
    for off in offsets:
        out += b"%010d 00000 n \n" % off
    out += b"trailer\n<< /Size %d /Root 1 0 R /Info 6 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (len(objs) + 1, xref)
    return bytes(out)


def font(size):
    for f in ("/System/Library/Fonts/Supplemental/Arial.ttf", "/System/Library/Fonts/Helvetica.ttc", "/Library/Fonts/Arial.ttf"):
        if os.path.exists(f):
            return ImageFont.truetype(f, size)
    return ImageFont.load_default()


def paper(w, h, lines, title, bg=(250, 250, 248)):
    im = Image.new("RGB", (w, h), bg)
    d = ImageDraw.Draw(im)
    d.text((48, 40), title, fill=(20, 20, 20), font=font(44))
    for i, l in enumerate(lines):
        d.text((48, 130 + i * 44), l, fill=(40, 40, 40), font=font(28))
    return im


for n, text in ((1, "Invoice one"), (2, "Invoice two"), (3, "Invoice three")):
    with open(f"{OUT}/doc{n}.pdf", "wb") as f:
        f.write(pdf_marked(f"DOC{n}", text))

with open(f"{OUT}/bad.jpg", "wb") as f:
    f.write(b"This is not a photograph. " * 40)

card = paper(900, 500, ["Big Co Ltd", "Sam Patel, Director", "sam@bigco.example", "07700 900123", "2 Client Road, Leeds LS1 2AB"], "BIG CO LTD", bg=(255, 255, 255))
card.save(f"{OUT}/card.png")

invoice = paper(1000, 1400, [
    "Northside Joinery Ltd",
    "5 Mill Road, Leeds LS2 7AB",
    "VAT no. GB999",
    "",
    "Invoice NJ-204      08/09/26",
    "",
    "Oak skirting, 12 m        £96.00",
    "Fitting, 4 hours          £120.00",
    "",
    "Subtotal                  £216.00",
    "VAT 20%                    £43.20",
    "Total                     £259.20",
], "INVOICE")
invoice.save(f"{OUT}/copy.jpg", "JPEG", quality=88)

back = paper(1000, 1400, ["Terms: 30 days", "Bank: 12-34-56  12345678", "Thank you for your business."], "PAGE 2")
back.save(f"{OUT}/back.jpg", "JPEG", quality=88)

print("uploads:", sorted(os.listdir(OUT)))
