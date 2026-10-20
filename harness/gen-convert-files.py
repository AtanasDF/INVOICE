# The awkward files test-convert hands to Change a file (notes/audit-convert.md).
# Small, so they are kept in the repo under convert-files/ and this only
# remakes them. Needs pypdf and Pillow. Run from harness/.
#
# owner-only.pdf  a permissions password only: opens anywhere, and pdf-lib
#                 copied its pages across as garbage
# locked.pdf      needs a password to open at all
# scanned.pdf     one page with no words on it, as a scan has
# photo.webp      pdf-lib takes PNG and JPEG only
# sideways.jpg    stored 300 wide by 200 tall with EXIF turn 6, so it is a
#                 portrait photo the way a phone writes one
# big.jpg         5712 x 4284, an iPhone 24-megapixel photo's size
# page.html       a web page with a script in it and no gaps between paragraphs
import io, os
from PIL import Image, ImageDraw
from pypdf import PdfWriter
from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject

OUT = "convert-files"
os.makedirs(OUT, exist_ok=True)


def text_pdf(lines):
    w = PdfWriter()
    for text in lines:
        p = w.add_blank_page(300, 400)
        if text is None:
            continue
        font = DictionaryObject({NameObject("/Type"): NameObject("/Font"), NameObject("/Subtype"): NameObject("/Type1"), NameObject("/BaseFont"): NameObject("/Helvetica")})
        p[NameObject("/Resources")] = DictionaryObject({NameObject("/Font"): DictionaryObject({NameObject("/F1"): w._add_object(font)})})
        s = DecodedStreamObject()
        s.set_data(f"BT /F1 16 Tf 24 360 Td ({text}) Tj ET".encode())
        p[NameObject("/Contents")] = w._add_object(s)
    return w


def save(w, name, **encrypt):
    if encrypt:
        w.encrypt(**encrypt)
    buf = io.BytesIO()
    w.write(buf)
    return buf.getvalue()


def put(name, data):
    with open(os.path.join(OUT, name), "wb") as f:
        f.write(data)


put("owner-only.pdf", save(text_pdf(["Invoice total 480 pounds"]), "", user_password="", owner_password="owner", algorithm="AES-128"))
put("locked.pdf", save(text_pdf(["Invoice total 480 pounds"]), "", user_password="secret", owner_password="owner", algorithm="AES-256"))
put("scanned.pdf", save(text_pdf([None]), ""))

img = Image.new("RGB", (300, 200), "white")
ImageDraw.Draw(img).rectangle([20, 20, 120, 180], fill="black")
buf = io.BytesIO(); img.save(buf, "WEBP"); put("photo.webp", buf.getvalue())
exif = Image.Exif(); exif[0x0112] = 6
buf = io.BytesIO(); img.save(buf, "JPEG", exif=exif.tobytes()); put("sideways.jpg", buf.getvalue())
buf = io.BytesIO(); Image.new("RGB", (5712, 4284), (240, 240, 235)).save(buf, "JPEG", quality=60); put("big.jpg", buf.getvalue())

put("page.html", b'<!doctype html><html><head><style>.x{color:red}</style></head><body><h1>Invoice 7</h1><p>Total</p><p>\xc2\xa340.00</p><script>var secret="tracking code";</script></body></html>')
print(OUT + ":", sorted(os.listdir(OUT)))
