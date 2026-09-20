from PIL import Image, ImageEnhance
import io
exec(open("gen-far.py").read().split("R, T, D = receipt()")[0])
R = receipt()
def dim(jpeg, k):
    im = Image.open(io.BytesIO(jpeg))
    im = ImageEnhance.Brightness(im).enhance(k)
    b = io.BytesIO(); im.save(b, "JPEG", quality=85); return b.getvalue()
f = frame(R, 360, 540, 300, 820, angle=2)
d = dim(f, 0.45)
write("dim-room.mjpeg", [d] * (20 * 30))
im = Image.open(io.BytesIO(d)).convert("L")
print("mean", sum(im.getdata()) / (im.width * im.height))
