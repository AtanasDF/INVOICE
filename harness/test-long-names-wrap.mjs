// Long unbroken names running off the printed sheet (notes/audit-documents.md,
// second pass): the in-app invoice wraps them, the Free page, the quote and
// the statement did not, so a business or customer name with no space in it
// (a web address, a long compound) ran past the right edge and was cut off in
// the PDF and the pictures. wrap-anywhere, as CLAUDE.md says, not
// break-words, which leaves min-content alone and lets one word push a flex row.
import fs from "node:fs";
import path from "node:path";
import { SRC } from "./repo.mjs";
import { sheetBrowser } from "./sheet-dom.mjs";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };
const src = (f) => fs.readFileSync(path.join(SRC, f), "utf8");
const lineWith = (text, needle) => text.split("\n").find((l) => l.includes(needle)) ?? "";

const free = src("components/invoice/InvoiceDocument.tsx");
for (const needle of ["{d.issuer.name", "{i.name"]) {
  const lines = free.split("\n").filter((l) => l.includes(needle) && l.includes("<p"));
  check(`Free page: every header line printing ${needle.slice(1)} wraps`, lines.length > 0 && lines.every((l) => l.includes("wrap-anywhere")), lines.join("\n"));
}
check("Free page: all three layouts covered", free.split("\n").filter((l) => /\{(d\.issuer|i)\.name \|\| "Your business name"\}/.test(l) && l.includes("wrap-anywhere")).length === 3);
check("Free page: the customer's name already wraps", lineWith(free, "{c.name || \"Customer name\"}").includes("wrap-anywhere"));

const quote = src("components/quote/QuoteDocument.tsx");
const quoteHeader = quote.slice(quote.indexOf('<div className="flex items-start justify-between gap-6">'), quote.indexOf("{profile?.businessName"));
check("quote: the business block can shrink and wraps", /<div className="[^"]*min-w-0[^"]*wrap-anywhere/.test(quoteHeader), quoteHeader);
check("quote: the client's name wraps", lineWith(quote, "{client?.name").includes("wrap-anywhere"), lineWith(quote, "{client?.name"));

const statement = src("components/StatementDocument.tsx");
check("statement: the business block can shrink and wraps", /<div className="[^"]*min-w-0[^"]*wrap-anywhere[^"]*text-right/.test(statement), lineWith(statement, "text-right text-sm"));
check("statement: the client's name wraps", lineWith(statement, "{client.name}").includes("wrap-anywhere"), lineWith(statement, "{client.name}"));

const NAME = "NaskoPlasteringAndDecoratingServicesOfWestYorkshireAndTheDalesLimitedwwwnaskoplasteringexample";
const header = (cls) => `<div class="flex justify-between" style="gap: 24px"><div class="${cls}"><p style="font-size: 18px; font-weight: bold">${NAME}</p></div><div class="text-right"><h1>Quote Q-001</h1></div></div>`;
const b = await sheetBrowser();
try {
  const width = (html) => b.run(html, [], (sheet) => ({ scroll: sheet.scrollWidth, client: sheet.clientWidth }));
  const before = await width(header(""));
  check("the fixture is the bug: without the fix the name runs off the sheet", before.scroll > before.client, JSON.stringify(before));
  const after = await width(header("min-w-0 wrap-anywhere"));
  check("with the quote's classes it stays on the sheet", after.scroll <= after.client, JSON.stringify(after));
  const centred = await width(`<header style="text-align: center"><p class="wrap-anywhere" style="font-size: 30px">${NAME}</p></header>`);
  check("the Free page's centred classic header stays on the sheet", centred.scroll <= centred.client, JSON.stringify(centred));
  const compact = await width(`<header class="flex flex-wrap justify-between"><p class="wrap-anywhere" style="font-size: 18px">${NAME}</p><p>1 Mill Lane</p></header>`);
  check("...and the compact one, a flex row", compact.scroll <= compact.client, JSON.stringify(compact));
} catch (e) {
  console.log("ERROR", e.message);
  results.push(false);
} finally {
  await b.close();
  console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
}
