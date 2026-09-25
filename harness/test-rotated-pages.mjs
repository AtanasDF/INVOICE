// Cutting a PDF whose pages are rotated.
//
// A page carrying two receipts is cut twice, each with its own box, and
// each cut becomes the cropped area followed by the whole sheet -- so a
// box drawn a little wrong loses nothing. `context` records where those
// whole sheets sit, and a later re-read uses it to know which pages are
// only context and not the document itself.
//
// But a ROTATED page is never cropped (the box is in the rotated view),
// so it produces ONE page where the caller counted two. Scanner apps set
// /Rotate 90 on landscape pages as a matter of course. Every context
// index after such a page pointed at the wrong sheet, so on a re-read
// another document's total could be taken as part of this one.
//
// The positions are now reported by the code that writes the pages.
import { createRequire } from "module";
import { pdfWithPages } from "./gen/lib/pdfPages.js";
import { REPO } from "./repo.mjs";
const require = createRequire(`${REPO}/web/`);
const { PDFDocument, degrees } = require("pdf-lib");
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

// Three pages: upright, rotated 90, upright.
async function source() {
  const doc = await PDFDocument.create();
  for (const rotate of [0, 90, 0]) {
    const p = doc.addPage([595, 842]);
    if (rotate) p.setRotation(degrees(rotate));
  }
  return doc.saveAsBase64({ dataUri: true });
}

const BOX = [100, 100, 500, 900];
const pagesOf = async (dataUrl) => (await PDFDocument.load(dataUrl)).getPageCount();

try {
  const src = await source();

  // An upright page with a box: cropped, then whole. The whole sheet is
  // page 2, and that is what context must say.
  let cut = await pdfWithPages(src, [{ page: 1, box: BOX }]);
  check("an upright boxed page becomes crop + whole", (await pagesOf(cut.dataUrl)) === 2, String(await pagesOf(cut.dataUrl)));
  check("...and context points at the whole sheet", JSON.stringify(cut.context) === "[2]", JSON.stringify(cut.context));

  // A rotated page with a box: no crop, so ONE page and no context.
  cut = await pdfWithPages(src, [{ page: 2, box: BOX }]);
  check("a rotated boxed page is not cropped", (await pagesOf(cut.dataUrl)) === 1, String(await pagesOf(cut.dataUrl)));
  check("...so it claims no context page", JSON.stringify(cut.context) === "[]", JSON.stringify(cut.context));

  // The case that was wrong: a rotated boxed page FOLLOWED by an upright
  // boxed one. The old caller counted the rotated page as two, so it put
  // the second document's context at 4 when the whole sheet is at 3.
  cut = await pdfWithPages(src, [{ page: 2, box: BOX }, { page: 3, box: BOX }]);
  check("a rotated page then an upright one gives three pages", (await pagesOf(cut.dataUrl)) === 3, String(await pagesOf(cut.dataUrl)));
  check("...and context is [3], not the [4] the old count gave", JSON.stringify(cut.context) === "[3]", JSON.stringify(cut.context));

  // Unboxed cuts are one page each and no context at all.
  cut = await pdfWithPages(src, [{ page: 1, box: null }, { page: 3, box: null }]);
  check("pages with no box are taken whole", (await pagesOf(cut.dataUrl)) === 2 && cut.context.length === 0, JSON.stringify({ n: await pagesOf(cut.dataUrl), c: cut.context }));

  // Every page the caller asked for is present, whatever the rotation.
  cut = await pdfWithPages(src, [{ page: 1, box: BOX }, { page: 2, box: BOX }, { page: 3, box: null }]);
  check("nothing is lost across a mixed run", (await pagesOf(cut.dataUrl)) === 4, String(await pagesOf(cut.dataUrl)));
  check("...and its context is the one whole sheet after a crop", JSON.stringify(cut.context) === "[2]", JSON.stringify(cut.context));
} catch (e) { console.log("ERROR", e.message); results.push(false); }
console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
