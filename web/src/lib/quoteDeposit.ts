import type { Invoice, InvoiceItem, Quote } from "@/lib/storage";
import { VAT_RATES, VAT_RATE_LABELS, computeInvoiceTotals } from "@/lib/vat";

const round = (n: number) => Math.round(n * 100) / 100;
// Unit prices keep four decimals (as New invoice does for VAT-inclusive
// prices), so a deposit's net lines add back up to the exact pence.
const round4 = (n: number) => Math.round(n * 10000) / 10000;

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
      unitPrice: round4(share / (1 + VAT_RATES[r.kind])),
      vatRate: r.kind,
    };
  });
}

// On the final invoice: the deposit invoice's own lines taken off again, so
// the balance and its VAT are right whatever the deposit invoice ended up
// saying. Whatever was credited against the deposit invoice isn't taken off:
// the lines shrink in proportion, and a fully credited deposit takes nothing.
export function depositDeductions(depositInvoice: Pick<Invoice, "items" | "number" | "status">, credited = 0, vatRegistered = true): InvoiceItem[] {
  const gross = computeInvoiceTotals(depositInvoice.items, vatRegistered).total;
  const keep = gross > 0 ? Math.max(0, 1 - credited / gross) : 0;
  if (keep === 0) return [];
  const ref = depositInvoice.status === "draft" ? "" : ` (invoice ${depositInvoice.number}${credited > 0 ? ", less its credit" : ""})`;
  return depositInvoice.items.map((it) => ({
    description: `Less deposit${ref}${depositInvoice.items.length > 1 ? `, ${VAT_RATE_LABELS[it.vatRate]} part` : ""}`,
    quantity: -1,
    unitPrice: round4(it.quantity * it.unitPrice * keep),
    vatRate: it.vatRate,
  }));
}
