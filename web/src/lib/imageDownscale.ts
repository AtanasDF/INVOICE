import { isBlankDataUrl } from "@/lib/settleFew";

// An uncompressed phone photo saved straight to base64 was landing at
// 4-5MB per receipt (receipts.image_data_url, stored directly in
// Postgres) -- and every receipts-list load pulls that column for every
// row, so the page degrades with each receipt added. 1600px on the long
// edge at JPEG 0.8 is comfortably enough for both AI extraction and
// on-screen review, and lands around 300-500KB, roughly a tenth of the
// size. Applied uniformly to every capture path (live camera, native
// iOS camera, upload) so none of them can reintroduce the problem.
export async function downscaleImageDataUrl(dataUrl: string, maxDimension = 1600, quality = 0.8): Promise<string> {
  // An empty image from a canvas past iOS's memory limit is not a PDF to
  // pass through; it is a blank page that would be saved as the document.
  if (isBlankDataUrl(dataUrl)) throw new Error("Couldn't read that image.");
  // Can't raster-resize a PDF -- pass it through untouched.
  if (!dataUrl.startsWith("data:image/")) return dataUrl;

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Couldn't read that image."));
    el.src = dataUrl;
  });

  const scale = Math.min(1, maxDimension / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  const ctx = canvas.getContext("2d");
  // No 2D context: on iOS this is what running out of canvas memory looks
  // like, which is why photos are decoded a couple at a time (settleFew).
  // The original, uncapped image is still a safer fallback than throwing
  // away a capture.
  if (!ctx) return dataUrl;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const out = canvas.toDataURL("image/jpeg", quality);
  // iOS counts every live canvas against one budget for the whole tab and
  // frees them late, so a long batch ran out; a 0x0 canvas holds nothing.
  canvas.width = canvas.height = 0;
  if (isBlankDataUrl(out)) throw new Error("Couldn't read that image.");
  return out;
}
