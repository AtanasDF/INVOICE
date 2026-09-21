# The two torch clips that had no generator (test-torch, test-torch-nocv;
# neither in run-all.sh). Same receipt and table as gen-dark.py and
# gen-dim.py, from gen-far.py's helpers, 20 seconds held still:
#
#   torch-bright.mjpeg  a well-lit room -- the torch button shows and must
#                       stay off, however long the page is held
#   dark-nocv2.mjpeg    as dark as dark-room.mjpeg, for the run where OpenCV
#                       is kept from loading: the torch must still come on,
#                       since the light reading doesn't need edge detection
from PIL import Image, ImageEnhance
import io
exec(open("gen-far.py").read().split("R, T, D = receipt()")[0])
R = receipt()
def dim(jpeg, k):
    im = Image.open(io.BytesIO(jpeg))
    im = ImageEnhance.Brightness(im).enhance(k)
    b = io.BytesIO(); im.save(b, "JPEG", quality=85); return b.getvalue()
def mean(jpeg):
    im = Image.open(io.BytesIO(jpeg)).convert("L")
    return round(sum(im.getdata()) / (im.width * im.height), 1)
bright = frame(R, 360, 540, 300, 820, angle=2)
write("torch-bright.mjpeg", [bright] * (20 * 30))
dark = dim(frame(R, 360, 540, 260, 700, angle=3), 0.18)
write("dark-nocv2.mjpeg", [dark] * (20 * 30))
# DARK_LEVEL in DocumentCapture.tsx is 55: the bright clip must sit well
# above it and the dark one well below.
print("mean grey: bright", mean(bright), "dark", mean(dark))
