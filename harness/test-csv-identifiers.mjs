// Excel changing what the printed sheet says (notes/audit-documents.md, second
// pass, N1): an invoice number 0042 opened as 42, an account number 01234567
// lost its zero, a sort code 12-03-56 became 12/03/1956. The file was right
// and the spreadsheet as opened was not. Such a value is now written as
// ="0042", Excel's own form for text, and only such a value: amounts,
// quantities and words are as they were, and the formula guard still holds.
const { sheetCell, csvCell } = await import("./gen/lib/csv.js");
const { sheetCsv } = await import("./gen/lib/sheetFile.js");
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };
const asText = (v) => `"=""${v}"""`;

for (const v of ["0042", "01234567", "00", "12-03-56", "12/03", "1-2", "2026-10-20", "12345678901234567890"]) {
  check(`${v} is kept as text`, sheetCell(v) === asText(v), sheetCell(v));
}
for (const v of ["1", "2.5", "-1", "0", "0.5", "12345678", "£1,000.00", "−£250.00", "£-50.00", "20 Oct 2026", "INV-0042", "GB123456789", "Skim two ceilings", "1 Mill Lane"]) {
  check(`${v} is left as it was`, sheetCell(v) === csvCell(v), sheetCell(v));
}
check("the formula guard still holds", sheetCell('=HYPERLINK("http://x.example")') === `"'=HYPERLINK(""http://x.example"")"`, sheetCell('=HYPERLINK("http://x.example")'));
check("...and a formula wearing digits is not let through as text", sheetCell("=0042") === "'=0042" && sheetCell("-0042+1") === "'-0042+1", `${sheetCell("=0042")} ${sheetCell("-0042+1")}`);
check("a quote in a would-be number cannot escape the quotes", sheetCell('0042"') === csvCell('0042"'), sheetCell('0042"'));
check("a leading-zero value with spaces is left to Excel, which keeps it", sheetCell("01234 567890") === "01234 567890", sheetCell("01234 567890"));
check("csvCell itself is unchanged, for the data exports", csvCell("0042") === "0042" && csvCell("12-03-56") === "12-03-56");

const csv = sheetCsv({
  title: "Invoice 0042",
  blocks: [
    { kind: "text", lines: ["Invoice no.", "0042", "Sort code: 12-03-56", "Account number: 01234567"] },
    { kind: "table", table: { head: ["Description", "Qty", "Amount"], rows: [["Skim", "1", "£480.00"]] } },
    { kind: "text", lines: ["Total due: £480.00"] },
  ],
});
check("the sheet's invoice number line", csv.includes(`\n${asText("0042")}\n`), csv);
check("the sort code beside its label", csv.includes(`Sort code,${asText("12-03-56")}`), csv);
check("the account number beside its label", csv.includes(`Account number,${asText("01234567")}`), csv);
check("the line and the total are untouched", /^Skim,1,£480\.00$/m.test(csv) && /^Total due,£480\.00$/m.test(csv), csv);

console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
