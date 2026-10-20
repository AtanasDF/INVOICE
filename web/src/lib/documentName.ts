// One name for a document's file, whichever way it leaves: the PDF button,
// the share sheet, the email attachment and Save as. Save as on the customer's
// /i/ and /q/ pages said "Invoice INV-1" where the PDF said "Invoice-INV-1",
// and the PDF's turned every letter outside ASCII into a dash.
export function documentFileName(kind: "invoice" | "quote", number: string, ext = "pdf"): string {
  const label = kind === "quote" ? "Quote" : "Invoice";
  const clean = number.replace(/[^\p{L}\p{N}._-]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  return `${clean ? `${label}-${clean}` : label}${ext ? `.${ext}` : ""}`;
}
