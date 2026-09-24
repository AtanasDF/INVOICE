import type { CreditNote, Invoice, InvoicePayment, Receipt } from "@/lib/storage";
import { invoiceCharge, creditOffDue } from "@/lib/cis";
import { invoiceBalance, invoiceVat } from "@/lib/invoiceBalance";
import { addDays } from "@/lib/reminderTemplates";

// Everything owed to you and everything you owe, in the order it matters:
// late first, then this week, then the rest. The figures come from the same
// rules as the invoice page -- what the customer owes is `due` (the total
// less any CIS), less credit notes in the share they were paying, less what
// has come in.

export type Owed = {
  id: string;
  who: string;
  what: string;
  amount: number;
  dueDate: string | null;
  daysLate: number;
  when: "late" | "soon" | "later" | "undated";
};

export type MoneyScreen = {
  owedToYou: Owed[];
  youOwe: Owed[];
  totalIn: number;
  totalOut: number;
  // What is left once everything on this page has been settled both ways.
  net: number;
  lateIn: number;
  lateOut: number;
};

const days = (from: string, to: string) => Math.floor((Date.parse(to) - Date.parse(from)) / 86_400_000);

// "Soon" is the next seven days. Anything without a date cannot be late and
// cannot be soon, so it sorts last rather than being guessed at.
function bucket(dueDate: string | null, today: string): { when: Owed["when"]; daysLate: number } {
  if (!dueDate) return { when: "undated", daysLate: 0 };
  const late = days(dueDate, today);
  if (late > 0) return { when: "late", daysLate: late };
  return { when: dueDate <= addDays(today, 7) ? "soon" : "later", daysLate: 0 };
}

const ORDER: Record<Owed["when"], number> = { late: 0, soon: 1, later: 2, undated: 3 };

// Late first and the latest of those first, then by when it falls due. Two
// on the same day sort by size, because the bigger one is the one to chase.
const inOrder = (a: Owed, b: Owed) =>
  ORDER[a.when] - ORDER[b.when] ||
  (a.when === "late" ? b.daysLate - a.daysLate : (a.dueDate ?? "").localeCompare(b.dueDate ?? "")) ||
  b.amount - a.amount;

export function moneyScreen(
  invoices: Invoice[],
  creditNotes: CreditNote[],
  payments: InvoicePayment[],
  receipts: Receipt[],
  nameOf: (clientId: string | null) => string,
  accountVat: boolean,
  today: string
): MoneyScreen {
  const creditBy = new Map<string, number>();
  for (const c of creditNotes) creditBy.set(c.invoiceId, (creditBy.get(c.invoiceId) ?? 0) + c.amount);
  const paidBy = new Map<string, number>();
  for (const p of payments) paidBy.set(p.invoiceId, (paidBy.get(p.invoiceId) ?? 0) + p.amount);

  const owedToYou = invoices
    .filter((inv) => inv.status === "sent" || inv.status === "partial")
    .map((inv): Owed => {
      const charge = invoiceCharge(inv, invoiceVat(inv, accountVat));
      const amount = invoiceBalance({
        total: charge.due,
        credited: creditOffDue(charge, creditBy.get(inv.id) ?? 0),
        paid: paidBy.get(inv.id) ?? 0,
        status: inv.status,
      });
      return { id: inv.id, who: nameOf(inv.clientId), what: inv.number, amount, dueDate: inv.dueDate, ...bucket(inv.dueDate, today) };
    })
    .filter((o) => o.amount > 0)
    .sort(inOrder);

  // A bill is a supplier invoice that has not been paid. One still waiting
  // to be checked is left out: nobody should be chased for a figure a
  // machine read and nobody has looked at.
  const youOwe = receipts
    .filter((r) => r.documentType === "invoice" && !r.paid && !r.needsReview)
    .map((r): Owed => ({
      id: r.id,
      who: nameOf(r.clientId) || r.vendor || "Unknown supplier",
      what: r.invoiceNumber ?? "",
      amount: Math.round((r.amount + r.vatAmount) * 100) / 100,
      dueDate: r.dueDate,
      ...bucket(r.dueDate, today),
    }))
    .filter((o) => o.amount > 0)
    .sort(inOrder);

  const sum = (rows: Owed[]) => Math.round(rows.reduce((s, r) => s + r.amount, 0) * 100) / 100;
  const totalIn = sum(owedToYou);
  const totalOut = sum(youOwe);
  return {
    owedToYou,
    youOwe,
    totalIn,
    totalOut,
    net: Math.round((totalIn - totalOut) * 100) / 100,
    lateIn: sum(owedToYou.filter((o) => o.when === "late")),
    lateOut: sum(youOwe.filter((o) => o.when === "late")),
  };
}
