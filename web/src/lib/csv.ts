// Excel opens a CSV without a byte-order mark in the old Windows code page,
// so every £ came out as Â£. Numbers and Google Sheets don't mind it.
export const CSV_BOM = "\uFEFF";

// Quoting does not stop a formula: `"=HYPERLINK(...)"` still runs when the
// file is opened. A line typed by the issuer is on the customer's /i/ and /q/
// spreadsheet, so a cell that starts like a formula is made text with a
// leading apostrophe. Only a plain number such as "-50" or "+447700900123" is
// left as it is: "+44 20 7946 0000" has spaces, so Excel would read it as a
// sum, and it gets the apostrophe too.
export function csvCell(value: string | number): string {
  let v = String(value);
  if (/^[=+\-@\t\r]/.test(v) && !/^[+-]?\d[\d,]*(\.\d+)?$/.test(v)) v = `'${v}`;
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

// What a printed sheet holds that Excel would change on opening: an invoice
// number 0042 becomes 42, an account number 01234567 loses its zero, a sort
// code 12-03-56 becomes 12/03/1956 and a long reference loses its last
// digits. ="0042" is Excel's own way of saying text, and Numbers and Google
// Sheets read it the same. It skips the formula guard and needs none: it is
// only ever built round a value of nothing but digits, dashes and slashes,
// so nothing typed can choose what goes between the quotes.
const CHANGED_BY_EXCEL = /^(0\d+|\d{16,}|\d{1,4}([-/])\d{1,4}(\2\d{1,4})?)$/;

export function sheetCell(value: string): string {
  return CHANGED_BY_EXCEL.test(value) ? `"=""${value}"""` : csvCell(value);
}
