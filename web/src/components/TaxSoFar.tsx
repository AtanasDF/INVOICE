import { TaxEstimate, nextSelfAssessmentDate, yearBillDue } from "@/lib/taxEstimate";
import { longDate } from "@/components/invoice/InvoiceDocument";

const money = (n: number) => `£${Math.round(n).toLocaleString("en-GB")}`;
const exact = (n: number) => `£${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const daysUntil = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);

export default function TaxSoFar({ estimate: e }: { estimate: TaxEstimate }) {
  const nothing = e.invoicesCounted === 0 && e.receiptsCounted === 0;
  const next = nextSelfAssessmentDate(e.through);
  const inDays = daysUntil(e.through, next.date);
  // Nothing to report, or too early to say, is one line of news -- so it gets
  // one line, not a heading with a paragraph under it and the whole apparatus
  // of a card that has nothing to put in it.
  if (nothing || e.tooEarly) {
    return (
      <p className="rounded-xl border bg-white px-4 py-3 text-sm text-neutral-600 shadow-sm">
        <span className="font-medium text-neutral-900">Tax so far · {e.year.label}:</span>{" "}
        {nothing
          ? "nothing invoiced or spent since 6 April yet."
          : "too early in the year to say. A year's allowances against a few days' work gives a figure that means nothing."}
      </p>
    );
  }

  return (
    <div className="rounded-xl border bg-white p-5 text-neutral-900 shadow-sm">
      <h2 className="font-semibold">Tax so far · {e.year.label}</h2>
      <>
          <div className="mt-3">
            <div className="text-2xl font-bold">
              {e.setAside >= 1
                  ? `Set aside about ${money(e.setAside)}`
                  : e.setAside <= -1
                    ? `HMRC may owe you about ${money(-e.setAside)} back`
                    : "No tax on this year so far"}
            </div>
            {(e.total > 0 || e.cisDeducted > 0) && (
              <div className="text-sm text-neutral-600">
                Income tax {money(e.incomeTax)} + Class 4 National Insurance {money(e.class4)}
                {e.cisDeducted > 0 && ` − CIS already taken off ${money(e.cisDeducted)}`}
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
            {e.cisDeducted > 0 && (
              <div className="flex justify-between gap-4 pt-2">
                <dt className="text-neutral-600">CIS kept back by contractors (tax already paid)</dt>
                <dd>{exact(e.cisDeducted)}</dd>
              </div>
            )}
            {e.vatOwed !== null && (
              <div className="flex justify-between gap-4 pt-2">
                <dt className="text-neutral-600">VAT to pay HMRC so far</dt>
                <dd>{exact(e.vatOwed)}</dd>
              </div>
            )}
          </dl>
          {e.projected && e.projected.profit > 0 && (
            <p className="mt-3 text-sm text-neutral-700">
              At this rate the whole year comes to {money(e.projected.profit)} profit and about {money(e.projected.total)} tax
              {e.cisDeducted > 0 &&
                (e.projected.setAside >= 0 ? `, ${money(e.projected.setAside)} of it still to pay after CIS` : `, with about ${money(-e.projected.setAside)} back after CIS`)}
              .
            </p>
          )}
      </>
      <div className="mt-4 rounded-lg bg-neutral-50 p-3 text-sm">
        <p>
          <span className="font-medium">Next Self Assessment date: {longDate(next.date)}</span>
          <span className="text-neutral-600">{inDays === 0 ? " (today)" : inDays === 1 ? " (tomorrow)" : ` (in ${inDays} days)`}</span>
        </p>
        <p className="mt-0.5 text-neutral-600">For {next.what}.</p>
        <p className="mt-2 text-neutral-600">
          This year&apos;s tax ({e.year.label}) is due by {longDate(yearBillDue(e.year))}.
        </p>
      </div>
      <p className="mt-3 text-xs text-neutral-500">
        An estimate for a sole trader in England, Wales or Northern Ireland with no other income: the share of the whole year&apos;s
        tax built up so far if the year carries on like this. Invoices count when issued, not when paid, and every checked receipt
        counts as a business cost. CIS counts from your CIS invoices; HMRC goes by what
        contractors report on their monthly statements. Scottish rates, a job or other income, and payments on account change the
        real bill.
      </p>
    </div>
  );
}
