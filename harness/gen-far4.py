from PIL import Image, ImageDraw
exec(open("gen-far.py").read().split("R, T, D = receipt()")[0])
pg = Image.new("RGB", (520, 735), (250, 250, 250))
d = ImageDraw.Draw(pg)
d.text((30, 30), "INVOICE 60", font=bold, fill=(20, 20, 20))
for i in range(20): d.text((30, 100 + i * 30), f"Line {i+1} ....... {i*7+3}.00", font=font, fill=(30, 30, 30))
P = pg.convert("RGBA")
frames = []
for a in range(60, -1, -5):
    frames += [frame(P, 360, 540, 300, 424, angle=a)] * 4
frames += [frame(P, 360, 540, 300, 424, angle=0)] * (6 * 30)
write("straighten.mjpeg", frames)
print(len(frames))
