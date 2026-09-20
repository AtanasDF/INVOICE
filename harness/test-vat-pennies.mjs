// VAT, to the penny, on the awkward invoices: three rates on one job, half
// hours, a third of a day, and prices that land on a half penny. Every
// screen, the PDF, the email and the balance owed are all built from this
// one function, so if it disagrees with itself by a penny, they all do.
import { VAT_RATES, computeInvoiceTotals } from "./gen/lib/vat.js";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };
const line = (q, p, rate) => ({ description: "x", quantity: q, unitPrice: p, vatRate: rate });
const pence = (n) => Math.round(n * 100);

check("the rates are the UK's", VAT_RATES.standard === 0.2 && VAT_RATES.reduced === 0.05 && VAT_RATES.zero === 0, JSON.stringify(VAT_RATES));

// A plain one.
let t = computeInvoiceTotals([line(1, 100, "standard")], true);
check("£100 at 20% is £120", t.total === 120 && t.totalVat === 20, JSON.stringify(t));

// Not VAT registered: no VAT anywhere, and the total is just the net.
t = computeInvoiceTotals([line(1, 100, "standard")], false);
check("not registered means no VAT is added", t.total === 100 && t.totalVat === 0 && t.vatByRate.length === 0, JSON.stringify(t));

// Three rates on one invoice, each rounded on its own.
t = computeInvoiceTotals([line(1, 100, "standard"), line(1, 100, "reduced"), line(1, 100, "zero")], true);
check("each rate is worked out separately", t.vatByRate.length === 3, JSON.stringify(t.vatByRate));
check("20% + 5% + 0% on £300 is £25 of VAT", t.totalVat === 25 && t.total === 325, JSON.stringify(t));
check("the rates add up to the total VAT", pence(t.vatByRate.reduce((s, e) => s + e.vat, 0)) === pence(t.totalVat));
check("the nets add up to the subtotal", pence(t.vatByRate.reduce((s, e) => s + e.net, 0)) === pence(t.subtotal));
check("subtotal plus VAT is exactly the total", pence(t.subtotal) + pence(t.totalVat) === pence(t.total));

// A half penny: 5% of £155.05 is £7.7525.
t = computeInvoiceTotals([line(7, 22.15, "reduced")], true);
check("a half-penny of VAT rounds once, not twice", t.totalVat === 7.75 && t.total === 162.8, JSON.stringify(t));

// A third of a day, twelve and a half hours, and other real quantities.
t = computeInvoiceTotals([line(0.33, 300, "standard"), line(12.5, 38.4, "standard")], true);
check("awkward quantities still come out to the penny", pence(t.subtotal) + pence(t.totalVat) === pence(t.total), JSON.stringify(t));
check("0.33 of £300 plus 12.5 at £38.40 is £579.00 net", t.subtotal === 579, String(t.subtotal));
check("and £115.80 of VAT", t.totalVat === 115.8, String(t.totalVat));

// Lines at the same rate are added before the VAT is worked out, so the
// rounding happens once per rate and not once per line.
const together = computeInvoiceTotals([line(1, 0.05, "standard"), line(1, 0.05, "standard"), line(1, 0.05, "standard")], true);
check("three penny lines are added before rounding", together.totalVat === 0.03, JSON.stringify(together));

// Nothing at all.
t = computeInvoiceTotals([], true);
check("an empty invoice is £0.00, not NaN", t.total === 0 && t.totalVat === 0 && t.subtotal === 0, JSON.stringify(t));

// A credit line (negative) on an invoice.
t = computeInvoiceTotals([line(1, 100, "standard"), line(-1, 40, "standard")], true);
check("a negative line comes off before the VAT", t.subtotal === 60 && t.totalVat === 12 && t.total === 72, JSON.stringify(t));

// A thousand lines: the total must not drift.
const many = Array.from({ length: 1000 }, () => line(1, 0.07, "standard"));
t = computeInvoiceTotals(many, true);
check("a thousand 7p lines add up exactly", t.subtotal === 70 && t.totalVat === 14 && t.total === 84, JSON.stringify(t));

console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
