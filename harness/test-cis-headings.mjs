// The Free page's "Labour" and "Materials" headings (notes/audit-documents.md,
// 2a, still open in the second pass): they are rowgroup <th> rows in tbody,
// and readTable kept only <td>, so every text shape listed the lines with
// nothing saying which the CIS was taken off.
import { sheetBrowser } from "./sheet-dom.mjs";
import { FREE_CIS } from "./sheet-fixtures.mjs";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

const b = await sheetBrowser();
try {
  const out = await b.run(FREE_CIS, ["sheetFile"], (sheet, { readSheet, sheetText, sheetCsv, sheetHtml }) => {
    const doc = readSheet(sheet);
    return { rows: doc.blocks.find((x) => x.kind === "table").table.rows, head: doc.blocks.find((x) => x.kind === "table").table.head, txt: sheetText(doc), csv: sheetCsv(doc), html: sheetHtml(doc) };
  });
  check("the table reads Labour, its line, Materials, its line", JSON.stringify(out.rows.map((r) => r[0])) === JSON.stringify(["Labour", "Skim two ceilings", "Materials", "Plaster"]), JSON.stringify(out.rows));
  check("a heading row is one cell, not padded with blanks", out.rows[0].length === 1 && out.rows[2].length === 1, JSON.stringify(out.rows));
  check("the column headings are still the header row", JSON.stringify(out.head) === JSON.stringify(["Description", "Qty", "Unit price", "Amount"]), JSON.stringify(out.head));
  check("text: Labour above the labour line, Materials above the materials", /\nLabour\s*\nSkim two ceilings/.test(out.txt) && /\nMaterials\s*\nPlaster/.test(out.txt), out.txt);
  check("spreadsheet: the same", /^Labour\nSkim two ceilings,1,"£1,000\.00","£1,000\.00"\nMaterials\nPlaster,/m.test(out.csv), out.csv);
  check("web page: the same", /<td>Labour<\/td><\/tr><tr><td>Skim two ceilings/.test(out.html) && /<td>Materials<\/td><\/tr><tr><td>Plaster/.test(out.html), out.html.slice(0, 800));
  check("the footer's subtotals are still there too", /^Labour: £1,000\.00$/m.test(out.txt) && /^CIS deduction \(20% of labour\): £200\.00$/m.test(out.txt), out.txt);

  const rowHeader = await b.run(`<table><tbody><tr><th scope="row">Mon</th><td>4</td><td>£80.00</td></tr></tbody></table>`, ["sheetFile"], (sheet, { readSheet }) => readSheet(sheet).blocks.find((x) => x.kind === "table").table.rows);
  check("a row with cells keeps its cells as before", JSON.stringify(rowHeader) === JSON.stringify([["4", "£80.00"]]), JSON.stringify(rowHeader));
} catch (e) {
  console.log("ERROR", e.message);
  results.push(false);
} finally {
  await b.close();
  console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
}
