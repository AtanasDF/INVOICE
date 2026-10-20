// Single-root sheets came out of order (notes/audit-documents.md, second pass,
// 2d): readSheet reads a block's words, then its tables, and the statement
// (one <div>) and the Free page (one <article>) are each ONE block, so their
// "Total owing", notes, bank details and footer all came out above the lines
// they follow on paper. A lone wrapper holding a table is now looked inside.
import { sheetBrowser } from "./sheet-dom.mjs";
import { STATEMENT, FREE_CIS, ISSUED } from "./sheet-fixtures.mjs";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };
// Case aside: innerText applies the sheet's capitals ("HOW TO PAY").
const before = (s, a, z) => { const [l, x, y] = [s.toLowerCase(), a.toLowerCase(), z.toLowerCase()]; return l.indexOf(x) >= 0 && l.indexOf(y) >= 0 && l.indexOf(x) < l.indexOf(y); };

const b = await sheetBrowser();
const read = (html) => b.run(html, ["sheetFile"], (sheet, { readSheet, sheetText, sheetCsv }) => { const d = readSheet(sheet); return { txt: sheetText(d), csv: sheetCsv(d), kinds: d.blocks.map((x) => x.kind) }; });
try {
  const st = await read(STATEMENT);
  check("statement: who it's for comes before the invoices", before(st.txt, "Acme Kitchens Ltd", "INV-001"), st.txt);
  check("statement: Total owing comes after them", before(st.txt, "INV-002", "Total owing"), st.txt);
  check("statement: the ageing and How to pay after that", before(st.txt, "Total owing", "Not yet late") && before(st.txt, "Not yet late", "How to pay"), st.txt);
  check("statement: the spreadsheet in the same order", before(st.csv, "INV-002", "Total owing") && before(st.csv, "Acme Kitchens Ltd", "INV-001"), st.csv);

  const free = await read(`<div>${FREE_CIS}</div>`);
  check("Free page, two wrappers deep: the lines come before the notes", before(free.txt, "Skim two ceilings", "Thanks for the work"), free.txt);
  check("...the totals before the notes", before(free.txt, "Net payment due", "Thanks for the work"), free.txt);
  check("...and the payment details and footer last", before(free.txt, "Thanks for the work", "Payment details") && before(free.txt, "Payment details", "Section 55A"), free.txt);
  check("...with the business and customer still above the lines", before(free.txt, "Nasko Plastering", "Skim two ceilings") && before(free.txt, "Big Co Ltd", "Skim two ceilings"), free.txt);

  const issued = await read(ISSUED);
  check("issued invoice: order unchanged, the total after the lines", before(issued.txt, "Big Co Ltd", "Skim two ceilings") && before(issued.txt, "Skim two ceilings", "Total: £480.00") && before(issued.txt, "Total: £480.00", "Thanks"), issued.txt);
  check("issued invoice: what is hidden in print stays out", !issued.txt.includes("Marked part-paid"), issued.txt);

  const hiddenSibling = await read(`<div>${STATEMENT}<p class="print:hidden">Copy the figures</p></div>`);
  check("a screen-only sibling does not stop the sheet being looked inside", before(hiddenSibling.txt, "INV-002", "Total owing") && !hiddenSibling.txt.includes("Copy the figures"), hiddenSibling.txt);

  const words = await read(`<div><p>One <span>paragraph</span> with <b>inline</b> words</p></div>`);
  check("a lone wrapper with no table is read as before, one line", words.txt.includes("One paragraph with inline words"), words.txt);

  const svg = await read(`<svg width="10" height="10"></svg><div><p>After the mark</p></div>`);
  check("an SVG on the sheet no longer stops every text shape", svg.txt.includes("After the mark"), svg.txt);
} catch (e) {
  console.log("ERROR", e.message);
  results.push(false);
} finally {
  await b.close();
  console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
}
