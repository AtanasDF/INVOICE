#!/bin/zsh
# Regenerates the fixtures for test-odd-files: the images with PIL, the
# PDFs with the app's own pdf-lib. Only ten-mb.jpg is gitignored (it is
# 23MB of noise, deliberately -- noise doesn't compress); the rest are
# small enough to keep, but this makes all of them again from nothing.
set -e
cd "$(dirname "$0")/fixtures"
python3 - <<'PY'
from PIL import Image, ImageDraw, ImageFont
import os
try:
    font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 40)
    small = ImageFont.truetype("/System/Library/Fonts/Supplemental/Courier New.ttf", 28)
except Exception:
    font = small = ImageFont.load_default()
def receipt(w, h):
    im = Image.new("RGB", (w, h), (246, 244, 238)); d = ImageDraw.Draw(im)
    d.text((w*0.08, h*0.05), "TOOLSTATION", font=font, fill=(20,20,20))
    for i in range(12): d.text((w*0.08, h*0.12 + i*h*0.05), f"ITEM {i+1:02d}   x1   {i*3+2}.49", font=small, fill=(40,40,40))
    d.text((w*0.08, h*0.8), "TOTAL      84.20", font=font, fill=(10,10,10)); return im
receipt(1240, 1754).save("scan-page.jpg", "JPEG", quality=80)
receipt(4000, 3000).save("twelve-mp.jpg", "JPEG", quality=88)
big = Image.effect_noise((5200, 3900), 90).convert("RGB")
ImageDraw.Draw(big).text((200, 200), "TOTAL 84.20", font=font, fill=(0,0,0))
big.save("ten-mb.jpg", "JPEG", quality=97)
receipt(1200, 1600).save("receipt-noext", "JPEG", quality=80)
open("photo.heic", "wb").write(b"\x00\x00\x00\x18ftypheic\x00\x00\x00\x00mif1heic" + bytes(4096))
for f in ["scan-page.jpg", "twelve-mp.jpg", "ten-mb.jpg", "receipt-noext", "photo.heic"]: print(f, round(os.path.getsize(f)/1024/1024, 2), "MB")
PY
cd ../../web && node -e '
const { PDFDocument, StandardFonts } = require("pdf-lib"); const fs = require("fs");
const out = "../harness/fixtures/";
(async () => {
  const twenty = await PDFDocument.create(); const font = await twenty.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= 20; i++) { const p = twenty.addPage([595, 842]); p.drawText(`INVOICE 7781 - page ${i} of 20`, { x: 50, y: 780, size: 16, font }); if (i === 20) p.drawText("TOTAL 1,240.00", { x: 50, y: 700, size: 16, font }); }
  fs.writeFileSync(out + "twenty-page.b64", await twenty.saveAsBase64());
  const scanned = await PDFDocument.create(); const img = await scanned.embedJpg(fs.readFileSync(out + "scan-page.jpg"));
  scanned.addPage([595, 842]).drawImage(img, { x: 0, y: 0, width: 595, height: 842 });
  fs.writeFileSync(out + "scanned.b64", await scanned.saveAsBase64());
  const plain = await PDFDocument.create();
  plain.addPage([595, 842]).drawText("Secret invoice", { x: 50, y: 780, size: 16, font: await plain.embedFont(StandardFonts.Helvetica) });
  // A real /Encrypt entry in the trailer, which pdf-lib refuses to load, as it does a password-protected file.
  plain.context.trailerInfo.Encrypt = plain.context.register(plain.context.obj({ Filter: "Standard", V: 2, R: 3, Length: 128, P: -1, O: "<00>", U: "<00>" }));
  fs.writeFileSync(out + "encrypted.b64", Buffer.from(await plain.save({ useObjectStreams: false })).toString("base64"));
  console.log("pdfs written");
})();'
