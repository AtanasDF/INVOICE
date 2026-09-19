import type { InvoiceLayoutStyle, InvoiceLineKind, InvoiceTemplate } from "@/lib/invoiceTemplate";
import { computeInvoiceTotals, VAT_RATES, VatRateKind } from "@/lib/vat";

export type FreeInvoiceLine = { description: string; quantity: number; unitPrice: number; vatRate: VatRateKind; kind: InvoiceLineKind };

export type FreeInvoiceDraft = {
  version: 1;
  layout: InvoiceLayoutStyle;
  issuer: InvoiceTemplate["issuer"];
  bank: InvoiceTemplate["bank"];
  customer: InvoiceTemplate["customer"];
  number: string;
  date: string;
  dueDate: string;
  paymentTerms: string;
  currencySymbol: string;
  vatRegistered: boolean;
  cis: { enabled: boolean; rate: 20 | 30 };
  reverseCharge: boolean;
  lines: FreeInvoiceLine[];
  notes: string;
  footer: string;
  signature: string | null;
  signedBy: string;
};

const KEY = "free-invoice-draft";
const SIGNATURE_KEY = "free-invoice-signature";

// Kept apart from the draft so it survives Start over and fills every new
// invoice on this device.
export function readSavedSignature(): { image: string | null; name: string } {
  try {
    const raw = localStorage.getItem(SIGNATURE_KEY);
    const v: unknown = raw ? JSON.parse(raw) : null;
    if (v && typeof v === "object" && typeof (v as { image?: unknown }).image === "string") {
      const s = v as { image: string; name?: unknown };
      return { image: s.image, name: typeof s.name === "string" ? s.name : "" };
    }
  } catch {
    // nothing saved, or storage blocked
  }
  return { image: null, name: "" };
}

export function saveSignature(image: string | null, name: string) {
  try {
    if (image) localStorage.setItem(SIGNATURE_KEY, JSON.stringify({ image, name }));
    else localStorage.removeItem(SIGNATURE_KEY);
  } catch {
    // private mode / storage blocked -- it just won't be remembered
  }
}

export const PAYMENT_TERMS = ["Upon receipt", "7 days", "14 days", "30 days"] as const;

export function currencySymbol(code: string | null): string {
  if (!code) return "£";
  try {
    const parts = new Intl.NumberFormat("en-GB", { style: "currency", currency: code, currencyDisplay: "narrowSymbol" }).formatToParts(0);
    return parts.find((p) => p.type === "currency")?.value ?? `${code} `;
  } catch {
    return `${code} `;
  }
}

export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function addDays(iso: string, days: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function termsDays(terms: string): number | null {
  if (terms === "Upon receipt") return 0;
  const m = /^(\d+) days$/.exec(terms);
  return m ? Number(m[1]) : null;
}

export function emptyLine(): FreeInvoiceLine {
  return { description: "", quantity: 1, unitPrice: 0, vatRate: "standard", kind: "labour" };
}

export function defaultDraft(): FreeInvoiceDraft {
  const date = todayIso();
  const saved = readSavedSignature();
  return {
    version: 1,
    layout: "modern",
    issuer: { name: null, address: null, email: null, phone: null, website: null, vatNumber: null, companyNumber: null, utr: null },
    bank: { accountName: null, sortCode: null, accountNumber: null, iban: null, reference: null },
    customer: { name: null, address: null, email: null },
    number: "",
    date,
    dueDate: addDays(date, 14),
    paymentTerms: "14 days",
    currencySymbol: "£",
    vatRegistered: false,
    cis: { enabled: false, rate: 20 },
    reverseCharge: false,
    lines: [emptyLine()],
    notes: "",
    footer: "",
    signature: saved.image,
    signedBy: saved.name,
  };
}

// A label printed in front of the number ("No. 30", "Invoice #30") is not
// part of it.
export function stripNumberLabel(number: string): string {
  return number.trim().replace(/^(?:invoice\s*)?(?:(?:no|nr|num|number)\b\.?|#)\s*[:.]?\s*(?=\d)/i, "").trim();
}

// The sequence moves on by one, keeping its zero padding: "INV-0042"
// becomes "INV-0043" and "2026/30" becomes "2026/31". When the last digit
// run is a year after a sequence ("042/2026"), the sequence moves, not the
// year. A number with no digits can't be continued, so it comes back empty
// rather than repeated.
export function nextInvoiceNumber(number: string): string {
  const n = stripNumberLabel(number);
  const runs = [...n.matchAll(/\d+/g)];
  if (!runs.length) return "";
  const last = runs[runs.length - 1];
  const target = runs.length > 1 && /^(19|20)\d\d$/.test(last[0]) ? runs[runs.length - 2] : last;
  const next = String(Number(target[0]) + 1).padStart(target[0].length, "0");
  return n.slice(0, target.index) + next + n.slice(target.index! + target[0].length);
}

function daysBetween(from: string, to: string): number | null {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Number.isNaN(a) || Number.isNaN(b) || b < a ? null : Math.round((b - a) / 86_400_000);
}

// A printed "Payment due within 14 days" maps onto the preset of the same
// length; anything else stays as printed.
function presetTerms(printed: string | null, days: number | null): string | null {
  if (days === 0) return "Upon receipt";
  if (days !== null && PAYMENT_TERMS.includes(`${days} days` as (typeof PAYMENT_TERMS)[number])) return `${days} days`;
  if (!printed) return null;
  if (/receipt|immediate/i.test(printed)) return "Upon receipt";
  const m = /(\d+)\s*days?/i.exec(printed);
  if (m && PAYMENT_TERMS.includes(`${Number(m[1])} days` as (typeof PAYMENT_TERMS)[number])) return `${Number(m[1])} days`;
  return printed;
}

// A scanned invoice is the model for the NEXT one: everything that stays
// the same is kept, the number moves on and the date is today.
export function templateToDraft(t: InvoiceTemplate): FreeInvoiceDraft {
  const base = defaultDraft();
  const printedGap = t.date && t.dueDate ? daysBetween(t.date, t.dueDate) : null;
  // A printed gap that isn't one of the presets is kept as custom terms.
  const paymentTerms = presetTerms(t.paymentTerms, printedGap) ?? (printedGap !== null ? `${printedGap} days` : base.paymentTerms);
  const gap = termsDays(paymentTerms) ?? printedGap ?? 14;
  const lines = t.lineItems.map((l) => ({
    description: l.description,
    quantity: l.quantity,
    unitPrice: l.unitPrice,
    vatRate: (t.showsVat ? "standard" : "zero") as VatRateKind,
    kind: l.kind,
  }));
  return {
    ...base,
    layout: t.layout.style,
    issuer: { ...t.issuer },
    bank: { ...t.bank },
    customer: { ...t.customer },
    number: t.invoiceNumber ? nextInvoiceNumber(t.invoiceNumber) : "",
    dueDate: addDays(base.date, gap),
    paymentTerms,
    currencySymbol: currencySymbol(t.currency),
    vatRegistered: t.showsVat,
    cis: { enabled: t.cis, rate: 20 },
    lines: lines.length ? lines : [emptyLine()],
    notes: t.notes ?? "",
    footer: t.footer ?? "",
  };
}

// Same business, customer and lines; the next number, dated today.
export function nextDraft(d: FreeInvoiceDraft): FreeInvoiceDraft {
  const date = todayIso();
  const days = termsDays(d.paymentTerms) ?? daysBetween(d.date, d.dueDate) ?? 14;
  return { ...d, number: d.number ? nextInvoiceNumber(d.number) : "", date, dueDate: addDays(date, days) };
}

type StoredDraft = Partial<Omit<FreeInvoiceDraft, "version" | "lines" | "cis" | "issuer" | "bank" | "customer">> & {
  version: 1;
  lines: (Pick<FreeInvoiceLine, "description" | "quantity" | "unitPrice"> & Partial<FreeInvoiceLine>)[];
  cis: FreeInvoiceDraft["cis"];
  issuer: Partial<FreeInvoiceDraft["issuer"]>;
  bank: Partial<FreeInvoiceDraft["bank"]>;
  customer: Partial<FreeInvoiceDraft["customer"]>;
};

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function isStoredDraft(v: unknown): v is StoredDraft {
  if (!isObject(v) || v.version !== 1) return false;
  const lines = v.lines;
  if (!Array.isArray(lines)) return false;
  if (!lines.every((l) => isObject(l) && typeof l.description === "string" && typeof l.quantity === "number" && typeof l.unitPrice === "number")) return false;
  const cis = v.cis;
  if (!isObject(cis) || typeof cis.enabled !== "boolean" || (cis.rate !== 20 && cis.rate !== 30)) return false;
  return isObject(v.issuer) && isObject(v.bank) && isObject(v.customer);
}

export function readFreeInvoiceDraft(): FreeInvoiceDraft | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const stored: unknown = JSON.parse(raw);
    if (!isStoredDraft(stored)) throw new Error("Unrecognised draft");
    const base = defaultDraft();
    return {
      ...base,
      ...stored,
      issuer: { ...base.issuer, ...stored.issuer },
      bank: { ...base.bank, ...stored.bank },
      customer: { ...base.customer, ...stored.customer },
      lines: stored.lines.map((l) => ({ ...emptyLine(), ...l })),
    };
  } catch {
    clearFreeInvoiceDraft();
    return null;
  }
}

export function writeFreeInvoiceDraft(d: FreeInvoiceDraft) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...d, version: 1 }));
  } catch {
    // private mode / storage blocked -- the draft just won't survive a reload
  }
}

export function clearFreeInvoiceDraft() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // nothing stored to clear
  }
}

export type DraftTotals = ReturnType<typeof computeInvoiceTotals> & {
  lines: FreeInvoiceLine[];
  labourNet: number;
  materialsNet: number;
  cisDeduction: number;
  netPaymentDue: number;
  reverseChargeVat: number;
};

const round = (n: number) => Math.round(n * 100) / 100;

// Blank rows the editor keeps around never make it onto the page. Every
// figure is rounded to pence before anything is derived from it, so the
// printed rows add up.
export function computeDraftTotals(d: FreeInvoiceDraft): DraftTotals {
  const lines = d.lines.filter((l) => l.description.trim() || l.unitPrice);
  const reverse = d.vatRegistered && d.reverseCharge;
  const raw = computeInvoiceTotals(reverse ? lines.map((l) => ({ ...l, vatRate: "reverse_charge" as const })) : lines, d.vatRegistered);
  const subtotal = round(raw.subtotal);
  const vatByRate = raw.vatByRate.map((v) => ({ ...v, net: round(v.net), vat: round(v.vat) }));
  const totalVat = round(vatByRate.reduce((s, v) => s + v.vat, 0));
  const total = round(subtotal + totalVat);
  const net = (kind: InvoiceLineKind) => round(lines.filter((l) => l.kind === kind).reduce((s, l) => s + l.quantity * l.unitPrice, 0));
  const labourNet = net("labour");
  const cisDeduction = d.cis.enabled ? round((labourNet * d.cis.rate) / 100) : 0;
  return {
    subtotal,
    vatByRate,
    totalVat,
    total,
    lines,
    labourNet,
    materialsNet: net("materials"),
    cisDeduction,
    netPaymentDue: round(total - cisDeduction),
    reverseChargeVat: reverse ? round(subtotal * VAT_RATES.standard) : 0,
  };
}
