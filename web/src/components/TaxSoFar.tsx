import type { TaxEstimate } from "@/lib/taxEstimate";

const money = (n: number) => `£${Math.round(n).toLocaleString("en-GB")}`;
const exact = (n: number) => `£${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function TaxSoFar({ estimate: e }: { estimate: TaxEstimate }) {
  const nothing = e.invoicesCounted === 0 && e.receiptsCounted === 0;
  return (
    <div className="rounded-xl border bg-white p-5 text-neutral-900 shadow-sm">
      <h2 className="font-semibold">Tax so far · {e.year.label}</h2>
      {nothing ? (
        <p className="mt-2 text-sm text-neutral-600">Nothing invoiced or spent since 6 April yet.</p>
      ) : (
        <>
          <div className="mt-3">
            <div className="text-2xl font-bold">{e.total > 0 ? `Set aside about ${money(e.total)}` : "No tax on this year so far"}</div>
            {e.total > 0 && (
              <div className="text-sm text-neutral-600">
                Income tax {money(e.incomeTax)} + Class 4 National Insurance {money(e.class4)}
              </div>
            )}
          </div>
          <dl className="mt-4 space-y-1 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-neutral-600">Invoiced{e.vatOwed !== null ? " excl. VAT" : ""} ({e.invoicesCounted})</dt>
              <dd>{exact(e.income)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-neutral-600">Costs ({e.receiptsCounted})</dt>
              <dd>−{exact(e.expenses)}</dd>
            </div>
            <div className="flex justify-between gap-4 border-t pt-1 font-medium">
              <dt>Profit</dt>
              <dd>{exact(e.profit)}</dd>
            </div>
            {e.vatOwed !== null && (
              <div className="flex justify-between gap-4 pt-2">
                <dt className="text-neutral-600">VAT to pay HMRC so far</dt>
                <dd>{exact(e.vatOwed)}</dd>
              </div>
            )}
          </dl>
          {e.projected && e.projected.profit > 0 && (
            <p className="mt-3 text-sm text-neutral-700">
              At this rate the whole year comes to {money(e.projected.profit)} profit and about {money(e.projected.total)} tax.
            </p>
          )}
        </>
      )}
      <p className="mt-3 text-xs text-neutral-500">
        An estimate for a sole trader in England, Wales or Northern Ireland with no other income: invoices count when issued, not
        when paid, and every checked receipt counts as a business cost. Scottish rates, a job or other income, and payments on
        account change the real bill.
      </p>
    </div>
  );
}
