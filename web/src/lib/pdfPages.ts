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
export async function pdfWithPages(pdf: string, pages: { page: number; box: DocumentBox | null }[]): Promise<string> {
  const source = await PDFDocument.load(pdf);
  const out = await PDFDocument.create();
  for (const { page, box } of pages) {
    const [whole] = await out.copyPages(source, [page - 1]);
    if (box && whole.getRotation().angle % 360 === 0) {
      const [cropped] = await out.copyPages(source, [page - 1]);
      const { x, y, width, height } = cropped.getCropBox();
      const [top, left, bottom, right] = padded(box);
      cropped.setCropBox(x + left * width, y + (1 - bottom) * height, (right - left) * width, (bottom - top) * height);
      out.addPage(cropped);
    }
    out.addPage(whole);
  }
  return out.saveAsBase64({ dataUri: true });
}
