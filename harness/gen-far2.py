import io, math, random
from PIL import Image, ImageDraw, ImageFont, ImageFilter
exec(open("gen-far.py").read().split("R, T, D = receipt()")[0])  # reuse table(), receipt(), frame(), write()
random.seed(3)
# A close-up of a coloured bill: the page edge is off-frame, a white 'amount due' box sits on a blue band of text.
def bill():
    im = Image.new("RGB", (W, H), (214, 228, 243))
    d = ImageDraw.Draw(im)
    for y in range(20, H, 26):
        d.text((24, y), "Account 1234 5678  Electricity charges  kWh  18.2p  standing charge", font=font, fill=(40, 60, 90))
    d.rectangle([250, 480, 470, 560], fill=(252, 252, 252))
    d.text((262, 500), "AMOUNT DUE  84.20", font=font, fill=(10, 10, 10))
    b = io.BytesIO(); im.save(b, "JPEG", quality=85); return b.getvalue()
write("bill-box.mjpeg", [bill()] * (10 * 30))
# A far receipt lying at 45 degrees.
R = receipt()
write("far-45.mjpeg", [frame(R, 360, 560, 70, 210, angle=45)] * (12 * 30))
# Batch: page A, a short gap, page B.
def page(label):
    pg = Image.new("RGB", (520, 735), (250, 250, 250))
    d = ImageDraw.Draw(pg)
    d.text((30, 30), label, font=bold, fill=(20, 20, 20))
    for i in range(20): d.text((30, 100 + i * 30), f"Line {i+1} ....... {i*7+3}.00", font=font, fill=(30, 30, 30))
    return pg.convert("RGBA")
A, B = page("INVOICE A"), page("INVOICE B")
fa = frame(A, 360, 560, 460, 650); fb = frame(B, 360, 560, 460, 650); fe = frame()
write("batch-swap.mjpeg", [fa] * (3 * 30) + [fe] * 21 + [fb] * (7 * 30) + [fe] * (2 * 30))
Image.open(io.BytesIO(bill())).save("bill-box.png")
print("ok")
