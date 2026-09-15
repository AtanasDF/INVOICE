// An uncompressed phone photo saved straight to base64 was landing at
// 4-5MB per receipt (receipts.image_data_url, stored directly in
// Postgres) -- and every receipts-list load pulls that column for every
// row, so the page degrades with each receipt added. 1600px on the long
// edge at JPEG 0.8 is comfortably enough for both AI extraction and
// on-screen review, and lands around 300-500KB, roughly a tenth of the
// size. Applied uniformly to every capture path (live camera, native
// iOS camera, upload) so none of them can reintroduce the problem.
export async function downscaleImageDataUrl(dataUrl: string, maxDimension = 1600, quality = 0.8): Promise<string> {
  // Can't raster-resize a PDF -- pass it through untouched.
  if (!dataUrl.startsWith("data:image/")) return dataUrl;

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Could not read this image."));
    el.src = dataUrl;
  });

  const scale = Math.min(1, maxDimension / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  const ctx = canvas.getContext("2d");
  // No 2D context available -- vanishingly unlikely, but the original,
  // uncapped image is a safer fallback than throwing away a capture.
  if (!ctx) return dataUrl;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", quality);
}
