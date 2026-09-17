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
};

const KEY = "free-invoice-draft";

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
  };
}

export function templateToDraft(t: InvoiceTemplate): FreeInvoiceDraft {
  const base = defaultDraft();
  const date = t.date ?? base.date;
  const paymentTerms = t.paymentTerms ?? base.paymentTerms;
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
    number: t.invoiceNumber ?? "",
    date,
    dueDate: t.dueDate ?? addDays(date, termsDays(paymentTerms) ?? 14),
    paymentTerms,
    currencySymbol: currencySymbol(t.currency),
    vatRegistered: t.showsVat,
    cis: { enabled: t.cis, rate: 20 },
    lines: lines.length ? lines : [emptyLine()],
    notes: t.notes ?? "",
    footer: t.footer ?? "",
  };
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
