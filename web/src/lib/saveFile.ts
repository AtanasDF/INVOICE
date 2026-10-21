import { isStandalone } from "@/lib/install";
import { isIOS } from "@/lib/platform";
import { firstChars } from "@/lib/firstChars";

// Saving a file to the device: one place, so every format behaves the same.
export function saveBlob(filename: string, blob: Blob) {
  // The home-screen app on an iPhone handles a download link badly (nothing
  // happens, or a viewer opens with no way back), so it gets the share
  // sheet, which has Save to Files. A sheet that can't open, because the tap
  // was spent on an earlier await, falls back to the link; one closed by
  // the person saves nothing, as they chose.
  if (isIOS() && isStandalone()) {
    const file = new File([blob], filename, { type: blob.type });
    if (navigator.canShare?.({ files: [file] })) {
      navigator.share({ files: [file] }).catch((err: unknown) => {
        if ((err as { name?: string } | null)?.name !== "AbortError") downloadLink(filename, blob);
      });
      return;
    }
  }
  downloadLink(filename, blob);
}

function downloadLink(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Not at once: Safari first asks "Do you want to download...?", and an
  // address revoked before that is answered saves nothing. FileSaver.js
  // waits 40 seconds for the same reason.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

// Several files from one tap. Safari keeps only the first of several
// downloads started together, so an iPhone gets them all in one share
// sheet and everything else gets them one after another.
export function saveBlobs(files: { name: string; blob: Blob }[]) {
  if (files.length === 1) return saveBlob(files[0].name, files[0].blob);
  const later = () => files.forEach((f, i) => setTimeout(() => downloadLink(f.name, f.blob), i * 700));
  if (isIOS()) {
    const all = files.map((f) => new File([f.blob], f.name, { type: f.blob.type }));
    if (navigator.canShare?.({ files: all })) {
      navigator.share({ files: all }).catch((err: unknown) => {
        if ((err as { name?: string } | null)?.name !== "AbortError") later();
      });
      return;
    }
  }
  later();
}

export function saveText(filename: string, body: string, type: string) {
  saveBlob(filename, new Blob([body], { type: `${type};charset=utf-8` }));
}

/** \ / : * ? " < > | are not allowed in a file name on Windows or a Mac. */
export function tidyFileName(name: string, fallback: string): string {
  const clean = firstChars(name.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim(), 80).trim();
  return clean || fallback;
}

// Twice the screen's size, so it stays sharp, but never past the 16.7 million
// pixels iOS Safari will draw on one canvas: a sheet longer than about four
// and a half A4 pages came out blank at 2x.
export function sheetPixelRatio(width: number, height: number): number {
  return Math.min(2, Math.sqrt(16_777_216 / Math.max(1, width * height)));
}

/** The printed sheet as a picture, at twice the screen's size so it stays sharp. */
export async function sheetImage(sheet: HTMLElement, type: "image/png" | "image/jpeg"): Promise<Blob> {
  const { toCanvas } = await import("html-to-image");
  const options = { pixelRatio: sheetPixelRatio(sheet.offsetWidth, sheet.scrollHeight), backgroundColor: "#ffffff" };
  // Safari leaves images (the signature) out of the first capture.
  await toCanvas(sheet, options);
  const canvas = await toCanvas(sheet, options);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.92));
  if (!blob) throw new Error("The picture could not be made.");
  return blob;
}
