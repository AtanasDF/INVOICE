// The statement's invoice number and its "12 days late" (notes/audit-documents.md,
// second pass, 2d): the late note is a block span inside the number's cell,
// and cells were read with textContent, which knows nothing of blocks, so
// every text shape said "INV-00112 days late" -- an invoice number that does
// not exist. A cell now gets a space wherever the sheet starts a new line in it.
import { sheetBrowser } from "./sheet-dom.mjs";
import { STATEMENT, ISSUED } from "./sheet-fixtures.mjs";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

const b = await sheetBrowser();
try {
  const out = await b.run(STATEMENT, ["sheetFile"], (sheet, { readSheet, sheetText, sheetCsv, sheetHtml }) => {
    const doc = readSheet(sheet);
    return { doc, txt: sheetText(doc), csv: sheetCsv(doc), html: sheetHtml(doc) };
  });
  const table = out.doc.blocks.find((x) => x.kind === "table")?.table;
  check("the number and the late note are two words in the cell", table?.rows[0][1] === "INV-001 12 days late", JSON.stringify(table?.rows[0]));
  for (const [shape, s] of [["text", out.txt], ["spreadsheet", out.csv], ["web page", out.html]]) {
    check(`no "INV-00112" in the ${shape}`, !s.includes("INV-00112") && s.includes("INV-001 12 days late"), s.slice(0, 400));
  }
  check("an inline £ and its figure stay one word", table?.rows[1][2] === "£90.00", JSON.stringify(table?.rows[1]));
  check("headings read as written, not as the sheet's capitals", JSON.stringify(table?.head) === JSON.stringify(["Date", "Invoice", "Charged", "Credited", "Paid", "Owing"]), JSON.stringify(table?.head));
  check("the plain cells are untouched", JSON.stringify(table?.rows[0].slice(2)) === JSON.stringify(["£500.00", "—", "£120.00", "£380.00"]), JSON.stringify(table?.rows[0]));

  const issued = await b.run(ISSUED, ["sheetFile"], (sheet, { readSheet }) => readSheet(sheet).blocks.find((x) => x.kind === "table").table.rows[0]);
  check("the issued invoice's materials mark is kept apart from the description", issued[0] === "Skim two ceilings Materials", JSON.stringify(issued));

  const br = await b.run("<table><tbody><tr><td>Line one<br>Line two</td></tr></tbody></table>", ["sheetFile"], (sheet, { readSheet }) => readSheet(sheet).blocks.find((x) => x.kind === "table").table.rows[0][0]);
  check("a <br> in a cell is a space", br === "Line one Line two", br);
} catch (e) {
  console.log("ERROR", e.message);
  results.push(false);
} finally {
  await b.close();
  console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
}
