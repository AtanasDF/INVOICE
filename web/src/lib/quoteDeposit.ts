import type { Invoice, InvoiceItem, Quote } from "@/lib/storage";
import { VAT_RATES, VAT_RATE_LABELS, computeInvoiceTotals } from "@/lib/vat";

const round = (n: number) => Math.round(n * 100) / 100;

export const depositTag = (quoteNumber: string) => `deposit for ${quoteNumber}`;

// The deposit in pounds, incl. VAT, never more than the quote itself.
export function depositGross(quote: Pick<Quote, "deposit" | "items">, vatRegistered: boolean): number | null {
  if (!quote.deposit) return null;
  const total = round(computeInvoiceTotals(quote.items, vatRegistered).total);
  const d = quote.deposit.kind === "percent" ? (total * quote.deposit.value) / 100 : quote.deposit.value;
  return round(Math.max(0, Math.min(d, total)));
}

// Lines for the deposit invoice. A VAT-registered deposit carries VAT in
// the same proportions as the quote, one line per rate, so the deposit
// invoice's total is the deposit and its VAT is the right share.
export function depositLines(quote: Pick<Quote, "deposit" | "items" | "number">, vatRegistered: boolean): InvoiceItem[] {
  const gross = depositGross(quote, vatRegistered) ?? 0;
  const pct = quote.deposit?.kind === "percent" ? ` (${quote.deposit.value}%)` : "";
  const label = `Deposit${pct} for quote ${quote.number}`;
  const totals = computeInvoiceTotals(quote.items, vatRegistered);
  if (!vatRegistered || totals.total <= 0 || totals.vatByRate.length === 0) {
    return [{ description: label, quantity: 1, unitPrice: gross, vatRate: quote.items[0]?.vatRate ?? "standard" }];
  }
  const several = totals.vatByRate.length > 1;
  return totals.vatByRate.map((r) => {
    const share = (gross * (r.net + r.vat)) / totals.total;
    return {
      description: several ? `${label}, ${VAT_RATE_LABELS[r.kind]} part` : label,
      quantity: 1,
      unitPrice: round(share / (1 + VAT_RATES[r.kind])),
      vatRate: r.kind,
    };
  });
}

// On the final invoice: the deposit invoice's own lines taken off again, so
// the balance and its VAT are right whatever the deposit invoice ended up
// saying.
export function depositDeductions(depositInvoice: Pick<Invoice, "items" | "number" | "status">): InvoiceItem[] {
  const ref = depositInvoice.status === "draft" ? "" : ` (invoice ${depositInvoice.number})`;
  return depositInvoice.items.map((it) => ({
    description: `Less deposit${ref}${depositInvoice.items.length > 1 ? `, ${VAT_RATE_LABELS[it.vatRate]} part` : ""}`,
    quantity: -1,
    unitPrice: round(it.quantity * it.unitPrice),
    vatRate: it.vatRate,
  }));
}
