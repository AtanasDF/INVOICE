// A4 at 96dpi with the 14mm margins the printed sheet uses (ScaledPreview).
export const PAGE_WIDTH = 794;
export const PAGE_HEIGHT = 1123;
export const PAGE_MARGIN = 53;

const BREAK_POINTS = "tr, section, header, footer, table, h1, p, dl > div";

// Where a page may end: under a table row, a section or a line of text,
// never through one. CSS pixels from the top of the sheet.
function breakPoints(sheet: HTMLElement): number[] {
  const top = sheet.getBoundingClientRect().top;
  const points = [...sheet.querySelectorAll(BREAK_POINTS)].map((el) => Math.round(el.getBoundingClientRect().bottom - top));
  return [...new Set(points)].sort((a, b) => a - b);
}

// Each A4 page's slice of the sheet, [start, end) in CSS pixels. Page one
// keeps the sheet's own top margin; later pages get the margin added back.
//
// `height` is how tall the sheet really is. It used to be inferred from the
// last break point, which is a different thing: break points are where a
// page MAY be cut, and everything under the items table -- the VAT
// breakdown, the CIS deduction, the payments, the "Amount due" box and the
// notes -- is plain divs and spans, none of which is one. On a long invoice
// from an account with no bank details and no registered-company footer
// (there is nothing else down there to break on) the last break point is
// the bottom of the table, so the customer's PDF stopped at the final line
// item with no total on it at all.
export function pageSlices(breaks: number[], height?: number): [number, number][] {
  const lastBreak = breaks.length ? breaks[breaks.length - 1] : 0;
  const contentEnd = Math.max(height ?? 0, lastBreak) || PAGE_HEIGHT - PAGE_MARGIN;
  const slices: [number, number][] = [];
  let start = 0;
  while (start < contentEnd) {
    const room = slices.length === 0 ? PAGE_HEIGHT - PAGE_MARGIN : PAGE_HEIGHT - 2 * PAGE_MARGIN;
    const limit = start + room;
    // A couple of pixels over the line is rounding, not another page.
    if (limit + 2 >= contentEnd) {
      slices.push([start, slices.length === 0 ? PAGE_HEIGHT : contentEnd]);
      break;
    }
    // The last break that fits, as long as it doesn't leave the page mostly
    // empty; otherwise cut at the limit.
    const fit = breaks.filter((b) => b > start + room * 0.4 && b <= limit);
    const end = fit.length ? fit[fit.length - 1] : limit;
    slices.push([start, end]);
    start = end;
  }
  return slices;
}

// The on-screen A4 sheet, photographed at 2x and laid onto A4 pages.
// Image based rather than laid out as PDF text, so it is exactly what the
// preview shows on every layout.
export async function renderInvoicePdf(sheet: HTMLElement): Promise<{ base64: string; blob: Blob; save: (filename: string) => void }> {
  const [{ toCanvas }, { jsPDF }] = await Promise.all([import("html-to-image"), import("jspdf")]);
  const options = { pixelRatio: 2, backgroundColor: "#ffffff" };
  // Safari leaves images (the signature) out of the first capture.
  await toCanvas(sheet, options);
  const canvas = await toCanvas(sheet, options);
  const pxPerCss = canvas.width / sheet.offsetWidth;

  const pdf = new jsPDF({ unit: "pt", format: "a4", compress: true });
  const ptPerCss = pdf.internal.pageSize.getWidth() / PAGE_WIDTH;
  // The sheet's own height is the content's bottom; scrollHeight rather
  // than offsetHeight, so nothing that overflows its box is lost.
  pageSlices(breakPoints(sheet), Math.round(Math.max(sheet.scrollHeight, sheet.getBoundingClientRect().height))).forEach(([start, end], page) => {
    const sy = Math.round(start * pxPerCss);
    const sh = Math.min(canvas.height - sy, Math.round((end - start) * pxPerCss));
    if (sh <= 0) return;
    const part = document.createElement("canvas");
    part.width = canvas.width;
    part.height = sh;
    part.getContext("2d")?.drawImage(canvas, 0, sy, canvas.width, sh, 0, 0, canvas.width, sh);
    if (page > 0) pdf.addPage();
    const y = page === 0 ? 0 : PAGE_MARGIN * ptPerCss;
    pdf.addImage(part.toDataURL("image/jpeg", 0.9), "JPEG", 0, y, PAGE_WIDTH * ptPerCss, (sh / pxPerCss) * ptPerCss);
  });
  return { base64: pdf.output("datauristring").split(",")[1], blob: pdf.output("blob"), save: (filename) => pdf.save(filename) };
}
