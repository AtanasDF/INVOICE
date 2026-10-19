// Excel opens a CSV without a byte-order mark in the old Windows code page,
// so every £ came out as Â£. Numbers and Google Sheets don't mind it.
export const CSV_BOM = "\uFEFF";

// Quoting does not stop a formula: `"=HYPERLINK(...)"` still runs when the
// file is opened. A line typed by the issuer is on the customer's /i/ and /q/
// spreadsheet, so a cell that starts like a formula is made text with a
// leading apostrophe. A plain number, "-50" or "+44 20...", is left as it is.
export function csvCell(value: string | number): string {
  let v = String(value);
  if (/^[=+\-@\t\r]/.test(v) && !/^[+-]?\d[\d,]*(\.\d+)?$/.test(v)) v = `'${v}`;
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}
