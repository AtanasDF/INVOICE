// The printed sheets' shapes, copied from the components as they render
// (StatementDocument, InvoiceDocument's Classic and Modern, IssuedInvoice),
// for the suites that read them with sheet-dom.mjs. Kept to the structure
// readSheet and the PDF care about: which element wraps which, what is a
// table, a tfoot, a rowgroup heading, a block span, a dt/dd.

// One root <div>, a block "days late" span inside the number's cell, the
// totals and ageing after the table, the uppercase headings.
export const STATEMENT = `
<div>
  <div class="flex justify-between">
    <div><h1>Statement of account</h1><p>As at 20 Oct 2026</p></div>
    <div class="min-w-0 wrap-anywhere text-right"><p>Nasko Plastering</p><p>1 Mill Lane</p></div>
  </div>
  <div><p class="uppercase">For</p><p class="wrap-anywhere">Acme Kitchens Ltd</p></div>
  <table>
    <thead><tr class="uppercase"><th>Date</th><th>Invoice</th><th>Charged</th><th>Credited</th><th>Paid</th><th>Owing</th></tr></thead>
    <tbody>
      <tr><td>8 Oct 2026</td><td>INV-001<span class="block">12 days late</span></td><td>£500.00</td><td>—</td><td>£120.00</td><td>£380.00</td></tr>
      <tr><td>18 Oct 2026</td><td>INV-002</td><td><span>£</span><span>90.00</span></td><td>—</td><td>—</td><td>£90.00</td></tr>
    </tbody>
  </table>
  <div class="flex"><div class="w-64"><div class="flex justify-between"><span>Total owing</span><span>£470.00</span></div></div></div>
  <div><p class="uppercase">How old it is</p><div class="grid"><div><p>Not yet late</p><p>£90.00</p></div></div></div>
  <div><p class="uppercase">How to pay</p><p>Sort code: 12-03-56</p></div>
</div>`;

// The Free page, classic layout, CIS on: one <article> root, "Labour" and
// "Materials" as rowgroup headings in tbody, every total in the tfoot, the
// notes and payment details after the table, bank details as dt/dd.
export const FREE_CIS = `
<article class="invoice-document">
  <header><p class="wrap-anywhere">Nasko Plastering</p><p class="whitespace-pre-line">1 Mill Lane
Leeds</p></header>
  <hr />
  <section>
    <h1 class="uppercase">Invoice</h1>
    <dl class="flex flex-wrap"><div><dt class="uppercase">Invoice no.</dt><dd>0042</dd></div><div><dt class="uppercase">Date</dt><dd>20 October 2026</dd></div></dl>
  </section>
  <div><section><p class="uppercase">Bill to</p><p class="wrap-anywhere">Big Co Ltd</p></section></div>
  <div>
    <table>
      <thead><tr class="uppercase"><th scope="col">Description</th><th scope="col">Qty</th><th scope="col">Unit price</th><th scope="col">Amount</th></tr></thead>
      <tbody>
        <tr><th scope="rowgroup" colspan="4" class="uppercase">Labour</th></tr>
        <tr><td>Skim two ceilings</td><td>1</td><td>£1,000.00</td><td>£1,000.00</td></tr>
        <tr><th scope="rowgroup" colspan="4" class="uppercase">Materials</th></tr>
        <tr><td>Plaster</td><td>2</td><td>£50.00</td><td>£100.00</td></tr>
      </tbody>
      <tfoot>
        <tr><td colspan="3">Labour</td><td>£1,000.00</td></tr>
        <tr><td colspan="3">Materials</td><td>£100.00</td></tr>
        <tr><td colspan="3">Total</td><td>£1,100.00</td></tr>
        <tr><td colspan="3">CIS deduction (20% of labour)</td><td>£200.00</td></tr>
        <tr><td colspan="3">Net payment due</td><td>£900.00</td></tr>
      </tfoot>
    </table>
  </div>
  <section><p class="uppercase">Notes</p><p class="whitespace-pre-line">Thanks for the work</p></section>
  <section>
    <p class="uppercase">Payment details</p>
    <dl class="grid grid-cols-auto">
      <div class="contents"><dt>Sort code</dt><dd>12-03-56</dd></div>
      <div class="contents"><dt>Account number</dt><dd>01234567</dd></div>
    </dl>
  </section>
  <footer><p>VAT Act 1994 Section 55A applies</p></footer>
</article>`;

// IssuedInvoice returns a fragment, so each block is already a child of the
// sheet; its order must not change.
export const ISSUED = `
<div class="flex"><div class="min-w-0 wrap-anywhere"><p>Nasko Plastering</p></div><div class="text-right"><h1>Invoice INV-000029</h1></div></div>
<div><p>Billed to</p><p class="wrap-anywhere">Big Co Ltd</p></div>
<div><table><thead><tr><th>Description</th><th>Qty</th><th>Unit price</th><th>Amount</th></tr></thead>
<tbody><tr><td class="wrap-anywhere">Skim two ceilings<span class="block">Materials</span></td><td>2</td><td>£240.00</td><td>£480.00</td></tr></tbody></table></div>
<div><p>Total: £480.00</p></div>
<div class="whitespace-pre-line">Thanks</div>
<div class="print:hidden"><p>Marked part-paid before payments were recorded</p></div>`;
