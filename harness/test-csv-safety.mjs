// The spreadsheet shape of an invoice or quote, opened in Excel
// (notes/audit-documents.md 3c).
//
// - No byte-order mark: Excel opens a BOM-less CSV in the old Windows code
//   page, so every £ came out as Â£.
// - Quoting does not stop a formula. A line the issuer described as
//   =HYPERLINK(...) ran in the customer's spreadsheet when they saved the
//   invoice from their /i/ link. A cell that starts like a formula is made
//   text; a plain number, negative or not, is left alone.
const { csvCell, CSV_BOM } = await import("./gen/lib/csv.js");
const { sheetCsv } = await import("./gen/lib/sheetFile.js");
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

const doc = {
  title: "Invoice INV-1",
  blocks: [
    { kind: "text", lines: ["Invoice INV-1", "Total due: £480.00"] },
    { kind: "table", table: { head: ["Description", "Qty", "Unit price", "Amount"], rows: [
      ['=HYPERLINK("http://x.example","click")', "1", "£400.00", "£400.00"],
      ["+SUM(A1:A9)", "-1", "£80.00", "−£80.00"],
      ["@cmd", "2", "-50", "£-50.00"],
      ["-2+3", "1", "£1.00", "£1.00"],
      ["Line with\r a carriage return", "1", "£0.00", "£0.00"],
    ] } },
  ],
};
const csv = sheetCsv(doc);
check("the file starts with a byte-order mark, so Excel reads £ as £", csv.startsWith(CSV_BOM) && csv.charCodeAt(0) === 0xfeff);
check("...and only one", !csv.slice(1).includes(CSV_BOM));
check("a formula in a description is written as text", csv.includes(`"'=HYPERLINK(""http://x.example"",""click"")"`), csv);
check("+, @ and a sum-looking - are made text too", csv.includes("'+SUM(A1:A9)") && csv.includes("'@cmd") && csv.includes("'-2+3"), csv);
check("a plain negative number is left a number", /^"?'?\+SUM\(A1:A9\)"?,-1,/m.test(csv) && /,-50,/.test(csv), csv);
check("money cells are not touched", csv.includes("£400.00") && csv.includes("−£80.00") && csv.includes("£-50.00"));
check("a carriage return is quoted, not left to split the row", csv.includes('"Line with\r a carriage return"'), JSON.stringify(csv));
check("the totals still pair label and figure", /^Total due,£480\.00$/m.test(csv), csv);

check("csvCell: ordinary words untouched", csvCell("Skim two ceilings") === "Skim two ceilings");
check("csvCell: a phone number in international form stays as typed", csvCell("+447700900123") === "+447700900123");
check("csvCell: a tab at the start is neutralised", csvCell("\t=1+1").startsWith("'"));
check("csvCell: numbers pass through", csvCell(-12.5) === "-12.5" && csvCell(0) === "0");
// csv.ts said this was "left as it is" while the code guarded it; the code was
// right, since Excel reads +44 20 ... as a sum (second pass, N4).
check("csvCell: a phone number with spaces gets the apostrophe, as the comment now says", csvCell("+44 20 7946 0000") === "'+44 20 7946 0000", csvCell("+44 20 7946 0000"));

// Identifiers kept as text (N1) go round the guard, so it must still hold
// for everything that is not purely digits and dashes.
const ids = sheetCsv({ title: "x", blocks: [{ kind: "text", lines: ["Sort code: 12-03-56", "Ref: =0042", "Ref: -0042+1"] }] });
check("the sheet keeps a sort code as text", ids.includes('Sort code,"=""12-03-56"""'), ids);
check("...and still guards a formula that starts with digits after =", ids.includes("Ref,'=0042") && ids.includes("Ref,'-0042+1"), ids);

console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
