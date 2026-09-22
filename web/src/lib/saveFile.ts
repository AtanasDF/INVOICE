// Saving a file to the device: one place, so every format behaves the same.
export function saveBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function saveText(filename: string, body: string, type: string) {
  saveBlob(filename, new Blob([body], { type: `${type};charset=utf-8` }));
}

/** \ / : * ? " < > | are not allowed in a file name on Windows or a Mac. */
export function tidyFileName(name: string, fallback: string): string {
  const clean = name.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  return clean || fallback;
}

/** The printed sheet as a picture, at twice the screen's size so it stays sharp. */
export async function sheetImage(sheet: HTMLElement, type: "image/png" | "image/jpeg"): Promise<Blob> {
  const { toCanvas } = await import("html-to-image");
  const options = { pixelRatio: 2, backgroundColor: "#ffffff" };
  // Safari leaves images (the signature) out of the first capture.
  await toCanvas(sheet, options);
  const canvas = await toCanvas(sheet, options);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.92));
  if (!blob) throw new Error("The picture could not be made.");
  return blob;
}
