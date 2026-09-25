import type { ReactNode } from "react";
import { cisApplies, computeDraftTotals, DraftTotals, FreeInvoiceDraft, FreeInvoiceLine } from "@/lib/freeInvoiceDraft";
import type { InvoiceLineKind } from "@/lib/invoiceTemplate";
import { VAT_RATE_LABELS } from "@/lib/vat";
import { REVERSE_CHARGE_WORDING, reverseChargeNote } from "@/lib/reverseCharge";

export { REVERSE_CHARGE_WORDING } from "@/lib/reverseCharge";

const KIND_LABEL: Record<InvoiceLineKind, string> = { labour: "Labour", materials: "Materials", other: "Other" };
const KIND_ORDER: InvoiceLineKind[] = ["labour", "materials", "other"];

export function formatMoney(symbol: string, n: number): string {
  return `${symbol}${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function longDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

type Row = [string, string];

const title = (d: FreeInvoiceDraft) => (d.docType === "quote" ? "Quote" : "Invoice");
const numberLabel = (d: FreeInvoiceDraft) => (d.docType === "quote" ? "Quote no." : "Invoice no.");

function metaRows(d: FreeInvoiceDraft): Row[] {
  const quote = d.docType === "quote";
  const rows: Row[] = [
    [numberLabel(d), d.number],
    ["Date", d.date ? longDate(d.date) : ""],
    [quote ? "Valid until" : "Due date", d.dueDate ? longDate(d.dueDate) : ""],
    ["Terms", quote ? "" : d.paymentTerms],
  ];
  return rows.filter(([, v]) => v);
}

// A quote asks for no payment yet, so it carries no bank details.
export function bankRows(d: FreeInvoiceDraft): Row[] {
  if (d.docType === "quote") return [];
  const b = d.bank;
  if (!(b.accountName || b.sortCode || b.accountNumber || b.iban)) return [];
  const rows: [string, string | null][] = [
    ["Account name", b.accountName],
    ["Sort code", b.sortCode],
    ["Account number", b.accountNumber],
    ["IBAN", b.iban],
    ["Reference", b.reference || d.number],
  ];
  return rows.filter((r): r is Row => !!r[1]);
}

function idRows(d: FreeInvoiceDraft, withVat: boolean): string[] {
  const i = d.issuer;
  return [
    i.utr && `UTR ${i.utr}`,
    i.companyNumber && `Company no. ${i.companyNumber}`,
    withVat && d.vatRegistered && i.vatNumber && `VAT no. ${i.vatNumber}`,
  ].filter((s): s is string => !!s);
}

function contactLine(d: FreeInvoiceDraft): string {
  return [d.issuer.email, d.issuer.phone, d.issuer.website].filter(Boolean).join("  ·  ");
}

function BillTo({ d, dense }: { d: FreeInvoiceDraft; dense?: boolean }) {
  const c = d.customer;
  return (
    <section>
      <p className={`font-semibold uppercase tracking-wider text-neutral-500 ${dense ? "text-[10px]" : "text-xs"}`}>{d.docType === "quote" ? "For" : "Bill to"}</p>
      <p className={`wrap-anywhere font-semibold ${dense ? "" : "mt-1 text-base"}`}>{c.name || "Customer name"}</p>
      {c.address && <p className="whitespace-pre-line text-neutral-600">{c.address}</p>}
      {c.email && <p className="text-neutral-600">{c.email}</p>}
    </section>
  );
}

function LinesTable({ d, t, dense, bold }: { d: FreeInvoiceDraft; t: DraftTotals; dense?: boolean; bold?: boolean }) {
  const sym = d.currencySymbol;
  const reverse = d.vatRegistered && d.reverseCharge;
  const cols = d.vatRegistered ? 5 : 4;
  const cell = dense ? "py-1" : "py-2";
  const groups: [string, FreeInvoiceLine[]][] = cisApplies(d)
    ? KIND_ORDER.map((k): [string, FreeInvoiceLine[]] => [KIND_LABEL[k], t.lines.filter((l) => l.kind === k)]).filter(([, ls]) => ls.length)
    : [["", t.lines]];

  const line = (l: FreeInvoiceLine, i: number) => (
    <tr key={i} className="border-b border-neutral-200 align-top">
      <td className={`${cell} wrap-anywhere pr-3`}>{l.description}</td>
      <td className={`${cell} text-right tabular-nums`}>{l.quantity}</td>
      <td className={`${cell} text-right tabular-nums`}>{formatMoney(sym, l.unitPrice)}</td>
      {d.vatRegistered && <td className={`${cell} text-right text-neutral-600`}>{VAT_RATE_LABELS[reverse ? "reverse_charge" : l.vatRate]}</td>}
      <td className={`${cell} text-right tabular-nums`}>{formatMoney(sym, l.quantity * l.unitPrice)}</td>
    </tr>
  );

  const total = (label: string, value: number, style: "muted" | "plain" | "final") => (
    <tr key={label} className={style === "final" ? `border-t-2 border-neutral-900 ${bold ? "text-lg" : "text-base"} font-bold` : "text-neutral-700"}>
      <td colSpan={cols - 1} className={`${style === "final" ? "pt-2" : "pt-1"} pr-4 text-right`}>{label}</td>
      <td className={`${style === "final" ? "pt-2" : "pt-1"} text-right tabular-nums`}>{formatMoney(sym, value)}</td>
    </tr>
  );

  const totals: ReactNode[] = [];
  if (cisApplies(d)) {
    totals.push(total("Labour", t.labourNet, "muted"), total("Materials", t.materialsNet, "muted"));
  }
  if (cisApplies(d) || d.vatRegistered) totals.push(total("Subtotal", t.subtotal, "muted"));
  for (const v of t.vatByRate) totals.push(total(`VAT ${VAT_RATE_LABELS[v.kind]}`, v.vat, "muted"));
  if (reverse) totals.push(total("VAT to be accounted for by the customer (20%)", t.reverseChargeVat, "muted"));
  if (cisApplies(d)) {
    totals.push(
      total("Total", t.total, "plain"),
      total(`CIS deduction (${d.cis.rate}% of labour)`, t.cisDeduction, "muted"),
      total("Net payment due", t.netPaymentDue, "final")
    );
  } else {
    totals.push(total(d.docType === "quote" ? "Total" : "Total due", t.total, "final"));
  }

  return (
    <table className={`w-full ${dense ? "text-xs" : ""}`}>
      <thead>
        <tr className={`border-b-2 border-neutral-900 text-left text-neutral-500 ${dense ? "text-[10px]" : "text-xs"} uppercase tracking-wider`}>
          <th scope="col" className={`${cell} pr-3 font-semibold`}>Description</th>
          <th scope="col" className={`${cell} text-right font-semibold`}>Qty</th>
          <th scope="col" className={`${cell} text-right font-semibold`}>Unit price</th>
          {d.vatRegistered && <th scope="col" className={`${cell} text-right font-semibold`}>VAT</th>}
          <th scope="col" className={`${cell} text-right font-semibold`}>Amount</th>
        </tr>
      </thead>
      <tbody>
        {groups.map(([label, ls]) => (
          <Group key={label || "all"} label={label} cols={cols} dense={dense}>
            {ls.map(line)}
          </Group>
        ))}
        {!t.lines.length && (
          <tr className="border-b border-neutral-200">
            <td colSpan={cols} className={`${cell} text-neutral-400`}>Describe the work on the first line</td>
          </tr>
        )}
      </tbody>
      <tfoot>{totals}</tfoot>
    </table>
  );
}

// Fragments can't carry keys through map() cleanly, and a labelled group
// row must sit inside the same tbody as its lines for print page breaks.
function Group({ label, cols, dense, children }: { label: string; cols: number; dense?: boolean; children: ReactNode }) {
  return (
    <>
      {label && (
        <tr>
          <th scope="rowgroup" colSpan={cols} className={`${dense ? "pt-2 pb-0.5 text-[10px]" : "pt-4 pb-1 text-xs"} text-left font-semibold uppercase tracking-wider text-neutral-500`}>
            {label}
          </th>
        </tr>
      )}
      {children}
    </>
  );
}

function Notes({ d, dense }: { d: FreeInvoiceDraft; dense?: boolean }) {
  if (!d.notes.trim()) return null;
  return (
    <section className={dense ? "mt-3 text-xs" : "mt-8"}>
      <p className={`font-semibold uppercase tracking-wider text-neutral-500 ${dense ? "text-[10px]" : "text-xs"}`}>Notes</p>
      <p className="mt-1 whitespace-pre-line text-neutral-700">{d.notes}</p>
    </section>
  );
}

function Signature({ d, dense }: { d: FreeInvoiceDraft; dense?: boolean }) {
  if (!d.signature) return null;
  return (
    <section className={dense ? "mt-3" : "mt-10"}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={d.signature} alt="Signature" className={`${dense ? "h-10" : "h-14"} w-auto max-w-[16rem] object-contain`} />
      <p className={`mt-1 w-56 border-t border-neutral-400 pt-1 text-neutral-500 ${dense ? "text-[10px]" : "text-xs"}`}>
        {d.signedBy.trim() || "Signed"}
      </p>
    </section>
  );
}

// Classic and modern print the VAT number in the header, so only compact
// carries it here.
function Footer({ d, dense, withVat }: { d: FreeInvoiceDraft; dense?: boolean; withVat?: boolean }) {
  const ids = idRows(d, !!withVat);
  const reverse = d.vatRegistered && d.reverseCharge;
  if (!ids.length && !reverse && !d.footer.trim()) return null;
  return (
    <footer className={`border-t border-neutral-300 text-neutral-500 ${dense ? "mt-4 pt-2 text-[10px]" : "mt-10 pt-3 text-xs"}`}>
      {ids.length > 0 && <p>{ids.join("  ·  ")}</p>}
      {/* The wording alone is not enough: HMRC require the invoice to state
          how much VAT the customer must account for, or at least the rate.
          The free page printed the section number and stopped there. */}
      {reverse && (
        <>
          <p className="font-medium text-neutral-900">{REVERSE_CHARGE_WORDING}</p>
          {reverseChargeNote(d.lines.map((l) => ({ quantity: l.quantity, unitPrice: l.unitPrice, vatRate: "reverse_charge" as const }))) && (
            <p className="text-neutral-900">
              {reverseChargeNote(d.lines.map((l) => ({ quantity: l.quantity, unitPrice: l.unitPrice, vatRate: "reverse_charge" as const })))}
            </p>
          )}
        </>
      )}
      {d.footer.trim() && <p className="whitespace-pre-line">{d.footer}</p>}
    </footer>
  );
}

function Classic({ d, t }: { d: FreeInvoiceDraft; t: DraftTotals }) {
  const contact = contactLine(d);
  const bank = bankRows(d);
  return (
    <>
      <header className="text-center">
        <p className="text-3xl font-bold tracking-tight">{d.issuer.name || "Your business name"}</p>
        {d.issuer.address && <p className="mt-2 whitespace-pre-line text-neutral-600">{d.issuer.address}</p>}
        {contact && <p className="mt-1 text-neutral-600">{contact}</p>}
        {d.vatRegistered && d.issuer.vatNumber && <p className="mt-1 text-neutral-600">VAT no. {d.issuer.vatNumber}</p>}
      </header>
      <hr className="my-6 border-t border-neutral-900" />
      <section className="text-center">
        <h1 className="text-xl font-semibold uppercase tracking-[0.35em]">{title(d)}</h1>
        <dl className="mt-3 flex flex-wrap justify-center gap-x-10 gap-y-2">
          {metaRows(d).map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs uppercase tracking-wider text-neutral-500">{k}</dt>
              <dd className="font-medium">{v}</dd>
            </div>
          ))}
        </dl>
      </section>
      <div className="mt-10">
        <BillTo d={d} />
      </div>
      <div className="mt-8">
        <LinesTable d={d} t={t} />
      </div>
      <Notes d={d} />
      {bank.length > 0 && (
        <section className="mt-8 rounded-md border border-neutral-900 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Payment details</p>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1">
            {bank.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-neutral-600">{k}</dt>
                <dd className="font-medium">{v}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
      <Signature d={d} />
      <Footer d={d} />
    </>
  );
}

function Modern({ d, t }: { d: FreeInvoiceDraft; t: DraftTotals }) {
  const contact = contactLine(d);
  const bank = bankRows(d);
  return (
    <>
      <header className="flex items-start justify-between gap-10">
        <div className="min-w-0">
          <p className="text-2xl font-bold tracking-tight">{d.issuer.name || "Your business name"}</p>
          {d.issuer.address && <p className="mt-2 whitespace-pre-line text-neutral-600">{d.issuer.address}</p>}
          {contact && <p className="mt-1 text-neutral-600">{contact}</p>}
          {d.vatRegistered && d.issuer.vatNumber && <p className="mt-1 text-neutral-600">VAT no. {d.issuer.vatNumber}</p>}
        </div>
        <div className="shrink-0 text-right">
          <h1 className="text-3xl font-bold tracking-tight">{title(d)}</h1>
          <dl className="mt-3 grid grid-cols-[auto_auto] gap-x-5 gap-y-1">
            {metaRows(d).map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-neutral-500">{k}</dt>
                <dd className="font-medium">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </header>
      <div className="mt-14">
        <BillTo d={d} />
      </div>
      <div className="mt-10">
        <LinesTable d={d} t={t} bold />
      </div>
      <Notes d={d} />
      {bank.length > 0 && (
        <section className="mt-12 border-t border-neutral-300 pt-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Payment details</p>
          <dl className="mt-3 grid grid-cols-2 gap-x-10 gap-y-3">
            {bank.map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs text-neutral-500">{k}</dt>
                <dd className="font-medium">{v}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
      <Signature d={d} />
      <Footer d={d} />
    </>
  );
}

function Compact({ d, t }: { d: FreeInvoiceDraft; t: DraftTotals }) {
  const i = d.issuer;
  const business = [i.address?.replace(/\s*\n\s*/g, ", "), i.email, i.phone, i.website].filter(Boolean).join("  ·  ");
  const bank = bankRows(d);
  const meta = metaRows(d).filter(([k]) => k !== numberLabel(d));
  return (
    <div className="text-xs">
      <header className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <p className="text-lg font-bold tracking-tight">{i.name || "Your business name"}</p>
        {business && <p className="text-neutral-600">{business}</p>}
      </header>
      <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-y border-neutral-900 py-1.5">
        <h1 className="font-semibold uppercase tracking-widest">{title(d)}{d.number && ` ${d.number}`}</h1>
        <p className="text-neutral-700">{meta.map(([k, v]) => `${k} ${v}`).join("  ·  ")}</p>
      </div>
      <div className="mt-3">
        <BillTo d={d} dense />
      </div>
      <div className="mt-3">
        <LinesTable d={d} t={t} dense />
      </div>
      <Notes d={d} dense />
      {bank.length > 0 && (
        <section className="mt-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Payment details</p>
          <p className="mt-0.5">
            {bank.map(([k, v]) => (
              <span key={k} className="mr-4 inline-block">
                <span className="text-neutral-500">{k}</span> <span className="font-medium">{v}</span>
              </span>
            ))}
          </p>
        </section>
      )}
      <Signature d={d} dense />
      <Footer d={d} dense withVat />
    </div>
  );
}

export default function InvoiceDocument({ draft }: { draft: FreeInvoiceDraft }) {
  const t = computeDraftTotals(draft);
  return (
    <article className="invoice-document bg-white text-sm leading-relaxed text-neutral-900" lang="en-GB">
      {draft.layout === "classic" && <Classic d={draft} t={t} />}
      {draft.layout === "modern" && <Modern d={draft} t={t} />}
      {draft.layout === "compact" && <Compact d={draft} t={t} />}
    </article>
  );
}
