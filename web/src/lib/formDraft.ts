import { VAT_RATE_KINDS, type VatRateKind } from "@/lib/vat";
import { todayISO, ukDate } from "@/lib/today";

// The half-typed new receipt and new invoice, kept on the device as they are
// typed.
//
// useLeaveGuard asks "Leave this page?" before a full page load, which is what
// a link tapped with no signal becomes. iPhone Safari ignores beforeunload, and
// an iPhone is what Atanas uses, so there the form was simply gone. The Free
// page never had this problem because it keeps `free-invoice-draft` as it goes;
// this is the same idea for the two forms that write to his books.
//
// Both keys hold somebody's own work, so both are in PERSONAL_LOCAL_KEYS in
// accountSwitch.ts and go when a different account signs in on the device.
//
// Photographs are never kept: a phone photo is megabytes as a data URL, and
// localStorage holds about five in all, shared with the Free page's draft and
// signature. The draft says a photo was there so it can be asked for again.
export const RECEIPT_DRAFT_KEY = "new-receipt-draft";
export const INVOICE_DRAFT_KEY = "new-invoice-draft";

// Long enough to come back after a week away, short enough that a forgotten
// one doesn't greet him in spring.
export const DRAFT_MAX_AGE_DAYS = 30;

export type ReceiptLineDraft = { description: string; quantity: number; unitPrice: number; category: string | null };

export type ReceiptDraftFields = {
  clientId: string;
  // The supplier's name when picked, so a supplier archived meanwhile comes
  // back as typed text instead of vanishing.
  clientName: string;
  supplierText: string;
  date: string;
  vendor: string;
  category: string;
  totalAmount: string;
  vatAmount: string;
  currency: string;
  fxRateInput: string;
  notes: string;
  lineItems: ReceiptLineDraft[];
  warrantyMonths: string;
  tagsInput: string;
  hadPhoto: boolean;
};

export type InvoiceLineDraft = { description: string; quantity: number; unitPrice: number; vatRate: VatRateKind; kind?: "labour" | "materials" };

export type InvoiceDraftFields = {
  clientId: string;
  clientName: string;
  customerText: string;
  date: string;
  dueDate: string;
  dueDateManual: boolean;
  paymentTerms: string;
  termsLength: number | null;
  items: InvoiceLineDraft[];
  cisRate: number | null;
  notes: string;
  tagsInput: string;
  // Whether it began as the Free page's invoice, so saving still clears that.
  imported: boolean;
};

export type DraftKind = "receipt" | "invoice";
type FieldsOf<K extends DraftKind> = K extends "receipt" ? ReceiptDraftFields : InvoiceDraftFields;
export type SavedDraft<K extends DraftKind> = { savedAt: string; fields: FieldsOf<K> };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown) => (typeof v === "string" ? v : "");
const num = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
const isoDate = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "");

// Only the fields named here are ever stored: anything else handed in,
// a photograph included, is dropped on the way through.
export function receiptDraftFields(v: unknown): ReceiptDraftFields | null {
  if (!isObject(v)) return null;
  return {
    clientId: str(v.clientId),
    clientName: str(v.clientName),
    supplierText: str(v.supplierText),
    date: isoDate(v.date),
    vendor: str(v.vendor),
    category: str(v.category),
    totalAmount: str(v.totalAmount),
    vatAmount: str(v.vatAmount),
    currency: /^[A-Z]{3}$/.test(str(v.currency)) ? str(v.currency) : "GBP",
    fxRateInput: str(v.fxRateInput),
    notes: str(v.notes),
    lineItems: (Array.isArray(v.lineItems) ? v.lineItems : []).filter(isObject).map((l) => ({
      description: str(l.description),
      quantity: num(l.quantity, 1),
      unitPrice: num(l.unitPrice, 0),
      category: typeof l.category === "string" ? l.category : null,
    })),
    warrantyMonths: str(v.warrantyMonths),
    tagsInput: str(v.tagsInput),
    hadPhoto: v.hadPhoto === true,
  };
}

export function invoiceDraftFields(v: unknown): InvoiceDraftFields | null {
  if (!isObject(v)) return null;
  const items = (Array.isArray(v.items) ? v.items : []).filter(isObject).map((l): InvoiceLineDraft => ({
    description: str(l.description),
    quantity: num(l.quantity, 1),
    unitPrice: num(l.unitPrice, 0),
    vatRate: VAT_RATE_KINDS.includes(l.vatRate as VatRateKind) ? (l.vatRate as VatRateKind) : ("standard" as const),
    ...(l.kind === "labour" || l.kind === "materials" ? { kind: l.kind } : {}),
  }));
  return {
    clientId: str(v.clientId),
    clientName: str(v.clientName),
    customerText: str(v.customerText),
    date: isoDate(v.date),
    dueDate: isoDate(v.dueDate),
    dueDateManual: v.dueDateManual === true,
    paymentTerms: str(v.paymentTerms),
    termsLength: typeof v.termsLength === "number" && Number.isFinite(v.termsLength) ? v.termsLength : null,
    items: items.length ? items : [{ description: "", quantity: 1, unitPrice: 0, vatRate: "standard" }],
    cisRate: v.cisRate === 20 || v.cisRate === 30 ? v.cisRate : null,
    notes: str(v.notes),
    tagsInput: str(v.tagsInput),
    imported: v.imported === true,
  };
}

// Something worth offering back. A picked customer, a date or a category on
// their own are not: they take a tap to redo, and counting them would let the
// dashboard's "invoice this customer" link, which arrives with one chosen,
// overwrite a real draft before a key was pressed.
export function receiptHasWork(f: ReceiptDraftFields): boolean {
  return !!(f.vendor.trim() || f.supplierText.trim() || f.totalAmount.trim() || f.vatAmount.trim() || f.notes.trim() || f.lineItems.length || f.warrantyMonths.trim() || f.tagsInput.trim());
}

export function invoiceHasWork(f: InvoiceDraftFields): boolean {
  return !!(f.customerText.trim() || f.notes.trim() || f.paymentTerms.trim() || f.tagsInput.trim() || f.items.some((i) => i.description.trim() || i.unitPrice));
}

const DRAFTS = {
  receipt: { key: RECEIPT_DRAFT_KEY, parse: receiptDraftFields, hasWork: receiptHasWork },
  invoice: { key: INVOICE_DRAFT_KEY, parse: invoiceDraftFields, hasWork: invoiceHasWork },
} as const;

export function draftKey(kind: DraftKind): string {
  return DRAFTS[kind].key;
}

export function hasWork<K extends DraftKind>(kind: K, fields: FieldsOf<K>): boolean {
  return (DRAFTS[kind].hasWork as (f: FieldsOf<K>) => boolean)(fields);
}

export function encodeDraft(kind: DraftKind, fields: unknown, now: Date): string | null {
  const picked = DRAFTS[kind].parse(fields);
  return picked ? JSON.stringify({ version: 1, savedAt: now.toISOString(), fields: picked }) : null;
}

// Anything unreadable, too old, from the future or with nothing in it is
// treated as no draft at all.
export function decodeDraft<K extends DraftKind>(kind: K, raw: string | null, now: Date): SavedDraft<K> | null {
  if (!raw) return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObject(v) || v.version !== 1 || typeof v.savedAt !== "string") return null;
  const at = Date.parse(v.savedAt);
  if (Number.isNaN(at) || at > now.getTime() + 60_000 || now.getTime() - at > DRAFT_MAX_AGE_DAYS * 86_400_000) return null;
  const fields = DRAFTS[kind].parse(v.fields) as FieldsOf<K> | null;
  if (!fields || !hasWork(kind, fields)) return null;
  return { savedAt: v.savedAt, fields };
}

// What the autosave does with the form as it now stands.
//
// - write: there is work, and it is not just the form as it opened (an
//   imported Free-page invoice needs no second copy until it is changed).
// - clear: nothing worth keeping and no draft waiting to be answered -- the
//   form was emptied, so the draft goes with it.
// - hold: otherwise. Above all, an untouched form never removes the draft it
//   is offering back.
//
// Typing into the form while the offer is up writes, so the newest work is
// the one kept: on an iPhone the next tap may be the one that loses it.
export function autosaveStep(s: { work: boolean; changed: boolean; offerPending: boolean; paused: boolean }): "write" | "clear" | "hold" {
  if (s.paused) return "hold";
  if (s.work && s.changed) return "write";
  if (!s.work && !s.offerPending) return "clear";
  return "hold";
}

// A contact picked in the draft comes back only while it is still a live one;
// otherwise its name goes in the box as typed text, so nothing silently
// attaches to an archived record and nothing silently disappears. `liveIds`
// null means the list has not loaded yet, and the id is trusted.
export function restoreContact(clientId: string, clientName: string, typed: string, liveIds: string[] | null): { clientId: string; text: string } {
  if (!clientId) return { clientId: "", text: typed };
  if (liveIds === null || liveIds.includes(clientId)) return { clientId, text: "" };
  return { clientId: "", text: typed || clientName };
}

const LONDON_TIME = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit" });
const LONDON_DAY = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", day: "numeric", month: "long" });

// When it was last typed into, in London, as somebody would say it.
export function draftWhen(savedAt: string, today: string = todayISO()): string {
  const day = ukDate(savedAt);
  if (!day) return "earlier";
  const at = new Date(savedAt);
  if (day === today) return `today at ${LONDON_TIME.format(at)}`;
  const yesterday = new Date(Date.parse(`${today}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  if (day === yesterday) return `yesterday at ${LONDON_TIME.format(at)}`;
  return `on ${LONDON_DAY.format(at)}`;
}

// Storage is guarded throughout: private mode throws, a full store throws, and
// neither should ever stop somebody typing.
export function readFormDraft<K extends DraftKind>(kind: K): SavedDraft<K> | null {
  try {
    return decodeDraft(kind, localStorage.getItem(DRAFTS[kind].key), new Date());
  } catch {
    return null;
  }
}

export function writeFormDraft(kind: DraftKind, fields: unknown) {
  const encoded = encodeDraft(kind, fields, new Date());
  if (!encoded) return;
  try {
    localStorage.setItem(DRAFTS[kind].key, encoded);
  } catch {
    // storage full or blocked -- the leave guard is all there is then
  }
}

export function clearFormDraft(kind: DraftKind) {
  try {
    localStorage.removeItem(DRAFTS[kind].key);
  } catch {
    // nothing stored to clear
  }
}
