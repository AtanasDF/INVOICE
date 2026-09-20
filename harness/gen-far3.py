import io, random
from PIL import Image, ImageDraw
exec(open("gen-far.py").read().split("R, T, D = receipt()")[0])
random.seed(5)
def page(label):
    pg = Image.new("RGB", (520, 735), (250, 250, 250))
    d = ImageDraw.Draw(pg)
    d.text((30, 30), label, font=bold, fill=(20, 20, 20))
    for i in range(20): d.text((30, 100 + i * 30), f"Line {i+1} ....... {i*7+3}.00", font=font, fill=(30, 30, 30))
    return pg.convert("RGBA")
P = page("INVOICE C")
frames = []
for i in range(10 * 30):
    j = random.choice([-4, -2, 0, 2, 4])
    frames.append(frame(P, 360, 560, 200 + j, 283 + j))
write("batch-borderline.mjpeg", frames)
print("ok")
