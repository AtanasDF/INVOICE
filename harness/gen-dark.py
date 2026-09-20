from PIL import Image, ImageEnhance
import io
exec(open("gen-far.py").read().split("R, T, D = receipt()")[0])
R = receipt()
def dim(jpeg, k):
    im = Image.open(io.BytesIO(jpeg))
    im = ImageEnhance.Brightness(im).enhance(k)
    b = io.BytesIO(); im.save(b, "JPEG", quality=85); return b.getvalue()
f = frame(R, 360, 540, 260, 700, angle=3)
write("dark-room.mjpeg", [dim(f, 0.18)] * (20 * 30))
im = Image.open(io.BytesIO(dim(f, 0.18))).convert("L")
print("mean", sum(im.getdata()) / (im.width * im.height))
