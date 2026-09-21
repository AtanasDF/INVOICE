import { PDFDocument } from "pdf-lib";
import { type DocumentBox, padded } from "@/lib/documentBox";

// Shared by /scan (in the browser) and the inbox import (on the server) to
// cut a PDF that holds several documents into one PDF per document.

export async function pdfPageCount(pdf: string): Promise<number> {
  return (await PDFDocument.load(pdf)).getPageCount();
}

// A PDF of just these pages (1-based) of the original, as a data URL. A
// page with a box is shown cropped to it and then whole, so a box that's
// off loses nothing; a rotated page isn't cropped (the box is in the
// rotated view).
// `context` is the 1-based position of each page that is only the whole
// shared sheet, kept in case the crop is off. The caller used to work it
// out by assuming a boxed cut always becomes cropped + whole -- but a
// rotated page isn't cropped, so it becomes one page while the caller
// counted two, and every later index pointed at the wrong sheet. Scanner
// apps set /Rotate 90 on landscape pages routinely. So the positions are
// reported by the only code that knows them.
export async function pdfWithPages(
  pdf: string,
  pages: { page: number; box: DocumentBox | null }[]
): Promise<{ dataUrl: string; context: number[] }> {
  const source = await PDFDocument.load(pdf);
  const out = await PDFDocument.create();
  const context: number[] = [];
  for (const { page, box } of pages) {
    const [whole] = await out.copyPages(source, [page - 1]);
    if (box && whole.getRotation().angle % 360 === 0) {
      const [cropped] = await out.copyPages(source, [page - 1]);
      const { x, y, width, height } = cropped.getCropBox();
      const [top, left, bottom, right] = padded(box);
      cropped.setCropBox(x + left * width, y + (1 - bottom) * height, (right - left) * width, (bottom - top) * height);
      out.addPage(cropped);
      // The whole sheet that follows the crop.
      context.push(out.getPageCount() + 1);
    }
    out.addPage(whole);
  }
  return { dataUrl: await out.saveAsBase64({ dataUri: true }), context };
}
