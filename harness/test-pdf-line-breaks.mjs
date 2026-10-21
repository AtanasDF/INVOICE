// A long notes block cut through a line in the PDF (notes/audit-documents.md,
// second pass, N2). Pages end only at break points -- a table row, a section,
// a paragraph -- and a long notes or terms block is ONE element, with no
// break inside, so a page that fell in it was cut at the limit, through the
// middle of a line of text. The bottom of every line now counts too, unless
// a line beside it runs across that height.
import { sheetBrowser } from "./sheet-dom.mjs";
const { clearOfLines, pageSlices } = await import("./gen/lib/invoicePdf.js");
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

check("clearOfLines: a point under a line is kept", JSON.stringify(clearOfLines([20], [[0, 20], [24, 44]])) === "[20]");
check("clearOfLines: a point through a line beside it is dropped", JSON.stringify(clearOfLines([20, 50], [[0, 20], [10, 30], [30, 50]])) === "[50]");
check("clearOfLines: a pixel's rounding either side is not 'through'", JSON.stringify(clearOfLines([20], [[19.5, 40]])) === "[20]");

const notes = Array.from({ length: 90 }, (_, i) => `Term ${i + 1}: the work is guaranteed for twelve months from the day it is finished.`).join("\n");
const longNotes = (gap) => `<header><h1>Invoice INV-1</h1></header><div style="height: ${gap}px"></div><div class="whitespace-pre-line" style="line-height: 22px">${notes}</div>`;
const COLUMNS = `<header><h1>Invoice INV-1</h1></header><div style="height: 600px"></div>
<div class="flex"><div class="whitespace-pre-line" style="width: 300px; line-height: 20px">${notes.slice(0, 3000)}</div><div class="whitespace-pre-line" style="width: 300px; line-height: 27px; font-size: 18px">${notes.slice(0, 3000)}</div></div>`;
const ROWS = `<header><h1>Invoice INV-1</h1></header><table style="width: 100%">${Array.from({ length: 40 }, (_, i) => `<tr><td style="width: 200px">Line ${i} with a long description that wraps over several lines in its narrow column</td><td>£${i}.00</td></tr>`).join("")}</table>`;

const b = await sheetBrowser();
const measure = (html) =>
  b.run(html, ["invoicePdf"], (sheet, { breakPoints, pageSlices }) => {
    const top = sheet.getBoundingClientRect().top;
    const lines = [];
    const walker = document.createTreeWalker(sheet, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      range.selectNodeContents(n);
      for (const r of range.getClientRects()) if (r.height > 0) lines.push([r.top - top, r.bottom - top]);
    }
    const height = Math.round(sheet.scrollHeight);
    const rows = [...sheet.querySelectorAll("tr")].map((tr) => [tr.getBoundingClientRect().top - top, tr.getBoundingClientRect().bottom - top]);
    // What the old code broke on: the elements' bottoms alone.
    const old = [...new Set([...sheet.querySelectorAll("tr, section, header, footer, table, h1, p, dl > div")].map((el) => Math.round(el.getBoundingClientRect().bottom - top)))].sort((a, b) => a - b);
    return { lines, height, rows, points: breakPoints(sheet), cuts: pageSlices(breakPoints(sheet), height).slice(0, -1).map(([, e]) => e), oldCuts: pageSlices(old, height).slice(0, -1).map(([, e]) => e) };
  });
const through = (cuts, lines) => cuts.filter((y) => lines.some(([t, b]) => t < y - 1 && b > y + 1));

try {
  // Where the old cut lands depends on where the lines fall; move the notes
  // down a pixel at a time until it lands on one, so the fixture really is
  // the bug before it is used to show the fix.
  let n;
  for (let gap = 700; gap < 722; gap++) {
    n = await measure(longNotes(gap));
    if (through(n.oldCuts, n.lines).length) break;
  }
  check("the long notes run over more than one page", n.cuts.length >= 1, JSON.stringify(n.cuts));
  check("...and the old break points cut through a line of them (the fixture shows the bug)", through(n.oldCuts, n.lines).length > 0, JSON.stringify(n.oldCuts));
  check("no page now ends through a line of text", through(n.cuts, n.lines).length === 0, JSON.stringify({ cuts: n.cuts, through: through(n.cuts, n.lines) }));
  check("...and the pages are still full ones, not a line each", n.cuts.every((c, i) => c - (n.cuts[i - 1] ?? 0) > 500), JSON.stringify(n.cuts));

  const c = await measure(COLUMNS);
  check("two columns of different line heights: no page ends through either", c.cuts.length >= 1 && through(c.cuts, c.lines).length === 0, JSON.stringify({ cuts: c.cuts, through: through(c.cuts, c.lines) }));

  const r = await measure(ROWS);
  check("a table still breaks between rows, never inside a wrapped row", r.points.every((p) => !r.rows.some(([t, b]) => t < p - 1 && b > p + 1)), JSON.stringify(r.points.filter((p) => r.rows.some(([t, b]) => t < p - 1 && b > p + 1))));
  check("...and its pages end through no line", r.cuts.length >= 1 && through(r.cuts, r.lines).length === 0, JSON.stringify(r.cuts));
} catch (e) {
  console.log("ERROR", e.message);
  results.push(false);
} finally {
  await b.close();
  console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
}
