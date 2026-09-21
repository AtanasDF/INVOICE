import { creditOffDue, invoiceCharge } from "@/lib/cis";
import { money } from "@/lib/money";
import { invoiceBalance, invoiceVat } from "@/lib/invoiceBalance";
import type { CreditNote, Invoice, InvoicePayment } from "@/lib/storage";

// A statement of account: every issued invoice for one customer, what has
// come off it, and what is still owed — the figures the invoice page shows,
// gathered in one place so it can be sent to chase payment.

export type StatementLine = {
  id: string;
  date: string;
  dueDate: string | null;
  number: string;
  charged: number;
  credited: number;
  paid: number;
  balance: number;
  // What the customer is owed BACK on this line, when credits and payments
  // come to more than the invoice. `balance` is clamped at zero, which is
  // right everywhere else in the app -- but a statement is the document
  // that states the account, and it was printing Charged £1,200 /
  // Credited −£1,200 / Paid £1,200 / Owing £0.00, four cells that do not
  // subtract to the number beside them, with the £1,200 he owes back
  // appearing nowhere on it.
  credit: number;
  daysLate: number;
};

export type Ageing = { current: number; d30: number; d60: number; d90: number };

export type Statement = {
  lines: StatementLine[];
  outstanding: number;
  // Money owed back to the customer across the account, if any.
  inCredit: number;
  charged: number;
  paid: number;
  credited: number;
  overdue: number;
  ageing: Ageing;
  oldest: StatementLine | null;
};

const pence = (n: number) => Math.round(n * 100);
const days = (from: string, to: string) => Math.floor((Date.parse(to) - Date.parse(from)) / 86_400_000);

export function buildStatement(
  invoices: Invoice[],
  creditNotes: CreditNote[],
  payments: InvoicePayment[],
  accountVat: boolean,
  today: string
): Statement {
  const lines = invoices
    .filter((inv) => inv.status !== "draft")
    .map((inv): StatementLine => {
      const charge = invoiceCharge(inv, invoiceVat(inv, accountVat));
      const creditedFace = creditNotes.filter((c) => c.invoiceId === inv.id).reduce((sum, c) => sum + c.amount, 0);
      const credited = creditOffDue(charge, creditedFace);
      const paid = payments.filter((p) => p.invoiceId === inv.id).reduce((sum, p) => sum + p.amount, 0);
      const balance = invoiceBalance({ total: charge.due, credited, paid, status: inv.status });
      // The same figure without the clamp, keeping invoiceBalance's own
      // rule that an invoice marked paid by hand before payments existed
      // (migration-023) owes nothing -- most of his history predates them,
      // and dropping that would put "Owing £1,200.00" on statements for
      // invoices settled years ago.
      const credit =
        inv.status === "paid" && paid === 0 ? 0 : Math.max(0, pence(credited) + pence(paid) - pence(charge.due)) / 100;
      return {
        id: inv.id,
        date: inv.date,
        dueDate: inv.dueDate,
        number: inv.number,
        charged: charge.due,
        credited,
        paid,
        balance,
        credit,
        daysLate: inv.dueDate && balance > 0 ? Math.max(0, days(inv.dueDate, today)) : 0,
      };
    })
    .sort((a, b) => (a.date === b.date ? a.number.localeCompare(b.number) : a.date < b.date ? -1 : 1));

  const owing = lines.filter((l) => l.balance > 0);
  // The boxes have to mean what they say: "Not yet late" used to hold
  // everything up to 30 days late, so a statement could state "£1,080.00 of
  // that is late", show the row as "5 days late", and then file that same
  // £1,080 under not yet due -- on the one summary of the debt's age the
  // customer's accounts department reads, which is what decides the order
  // they pay in.
  const ageing = owing.reduce<Ageing>(
    (acc, l) => {
      const where = l.daysLate > 60 ? "d90" : l.daysLate > 30 ? "d60" : l.daysLate > 0 ? "d30" : "current";
      acc[where] = Math.round((acc[where] + l.balance) * 100) / 100;
      return acc;
    },
    { current: 0, d30: 0, d60: 0, d90: 0 }
  );

  const sum = (pick: (l: StatementLine) => number) => Math.round(lines.reduce((t, l) => t + pence(pick(l)), 0)) / 100;
  return {
    lines,
    outstanding: sum((l) => l.balance),
    inCredit: sum((l) => l.credit),
    charged: sum((l) => l.charged),
    paid: sum((l) => l.paid),
    credited: sum((l) => l.credited),
    overdue: Math.round(owing.filter((l) => l.daysLate > 0).reduce((t, l) => t + pence(l.balance), 0)) / 100,
    ageing,
    oldest: owing.filter((l) => l.daysLate > 0).sort((a, b) => b.daysLate - a.daysLate)[0] ?? null,
  };
}

export function statementText(s: Statement, opts: { from: string; to: string; asAt: string; longDate: (iso: string) => string }): string {
  const rows = s.lines
    .filter((l) => l.balance > 0)
    .map((l) => `${l.number} — ${opts.longDate(l.date)} — ${money(l.balance)} owing${l.daysLate > 0 ? ` (${l.daysLate} days late)` : ""}`);
  return [
    `Statement of account for ${opts.to}`,
    `From ${opts.from}, as at ${opts.longDate(opts.asAt)}`,
    "",
    ...(rows.length ? rows : ["Nothing outstanding — thank you."]),
    "",
    `Total owing: ${money(s.outstanding)}`,
    // The text copied into a chasing message has to say it too, or a
    // customer owed money back is asked for money instead.
    ...(s.inCredit > 0 ? [`In your credit: ${money(s.inCredit)}`] : []),
  ].join("\n");
}
