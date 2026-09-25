// The VAT domestic reverse charge for building and construction services.
//
// This is the one that can make an invoice legally wrong rather than just
// ugly. Since March 2021, a VAT-registered subcontractor invoicing a
// VAT-registered contractor for CIS work charges NO VAT: the contractor
// accounts for it. The app has had a reverse-charge rate for a long time
// and has always left the VAT off the total -- but the ISSUED invoice, the
// one with a real number that goes to a real contractor, never said so.
// The VAT Regulations 1995 require the words "reverse charge", and HMRC
// require the invoice to make clear the customer must account for the VAT
// and to state how much (or at least the rate).
//
// Stating how much is why there are two kinds now: one "reverse charge"
// could not say whether the customer owes 20% or 5%.
//
// Read from HMRC's own guidance on 2026-09-25, not from memory:
//   gov.uk/guidance/vat-domestic-reverse-charge-for-building-and-construction-services
//   gov.uk/guidance/vat-reverse-charge-technical-guide
import { reverseChargeBreakdown, reverseChargeVat, reverseChargeNote, hasReverseCharge, isReverseCharge, REVERSE_CHARGE_WORDING, reverseChargeCreditNote } from "./gen/lib/reverseCharge.js";
import { computeInvoiceTotals, VAT_RATE_KINDS, VAT_RATE_LABELS } from "./gen/lib/vat.js";
import { reverseChargeAsk } from "./gen/lib/reverseChargePrompt.js";
import { vatFigures } from "./gen/lib/vatReturn.js";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

const line = (unitPrice, vatRate, quantity = 1) => ({ quantity, unitPrice, vatRate, description: "Plastering" });

// ---- What the customer must account for ------------------------------------
const std = [line(1000, "reverse_charge")];
check("20% reverse charge: the customer owes 200 on 1000", reverseChargeVat(std) === 200, String(reverseChargeVat(std)));
const red = [line(1000, "reverse_charge_reduced")];
check("5% reverse charge: the customer owes 50 on 1000", reverseChargeVat(red) === 50, String(reverseChargeVat(red)));
const both = [line(1000, "reverse_charge"), line(200, "reverse_charge_reduced")];
check("both rates on one invoice are kept apart", reverseChargeBreakdown(both).length === 2 && reverseChargeVat(both) === 210, JSON.stringify(reverseChargeBreakdown(both)));

// The whole point: the supplier charges nothing.
const totals = computeInvoiceTotals(both, true);
check("none of it is charged to the customer", totals.totalVat === 0 && totals.total === 1200, JSON.stringify(totals));
check("and the net is still the net", totals.subtotal === 1200);

// Mixed with ordinary work: only the reverse-charge lines shift.
const mixed = [line(1000, "reverse_charge"), line(500, "standard")];
check("ordinary lines on the same invoice still carry VAT", computeInvoiceTotals(mixed, true).totalVat === 100, JSON.stringify(computeInvoiceTotals(mixed, true)));
check("and the reverse-charge VAT is counted separately", reverseChargeVat(mixed) === 200);

// Penny-exactness, the same rule as every other total in the app.
const odd = [line(33.33, "reverse_charge", 3), line(0.01, "reverse_charge_reduced", 7)];
const b = reverseChargeBreakdown(odd);
check("worked in whole pence like everything else", b[0].vat === 20 && b[0].net === 99.99, JSON.stringify(b));

// ---- Nothing to say when it does not apply ---------------------------------
check("a plain invoice says nothing about the reverse charge", reverseChargeNote([line(100, "standard")]) === null);
check("nor a zero-rated one", reverseChargeNote([line(100, "zero")]) === null);
check("hasReverseCharge is false on a plain invoice", hasReverseCharge([line(100, "standard"), line(1, "exempt")]) === false);
check("and true as soon as one line is", hasReverseCharge([line(100, "standard"), line(1, "reverse_charge_reduced")]) === true);
check("only the two reverse-charge kinds count", VAT_RATE_KINDS.filter(isReverseCharge).join() === "reverse_charge,reverse_charge_reduced", VAT_RATE_KINDS.filter(isReverseCharge).join());

// ---- The words the law asks for --------------------------------------------
check("the legal reference is the one HMRC list", /VAT Act 1994 Section 55A/.test(REVERSE_CHARGE_WORDING), REVERSE_CHARGE_WORDING);
check("and it contains the words 'reverse charge'", /reverse charge/i.test(REVERSE_CHARGE_WORDING));
const note = reverseChargeNote(both);
check("the note says who pays HMRC", /Customer to pay the VAT to HMRC/.test(note), note);
check("it states the amount, not just the rate", /£200\.00/.test(note) && /£10\.00/.test(note), note);
check("it states the rate as well", /20%/.test(note) && /5%/.test(note), note);
check("and it says the VAT is not in the total", /not included in the total/i.test(note), note);
// Somebody holding this is a contractor's bookkeeper, not a lawyer.
check("no jargon beyond the reference the law requires", !/\b(taxable person|consideration|supply of services)\b/i.test(note), note);

// A credit note has its own wording in HMRC's guidance.
const cn = reverseChargeCreditNote(200);
check("a credit note says what the customer must adjust", /output tax adjustment of £200\.00/.test(cn) && /reverse charge/i.test(cn), cn);

// ---- The labels say which rate ---------------------------------------------
check("the picker distinguishes the two rates", VAT_RATE_LABELS.reverse_charge === "Reverse charge (20%)" && VAT_RATE_LABELS.reverse_charge_reduced === "Reverse charge (5%)", JSON.stringify([VAT_RATE_LABELS.reverse_charge, VAT_RATE_LABELS.reverse_charge_reduced]));

// ---- The VAT return --------------------------------------------------------
// HMRC: "Suppliers must not enter any output tax on sales under the reverse
// charge. The supplier only needs to enter the net value of the sale."
// This was already right by construction, which is exactly the kind of thing
// that stops being right when somebody changes how VAT is totalled.
const period = { from: "2026-07-01", to: "2026-09-30" };
const inv = (id, items) => ({ id, clientId: "c", date: "2026-08-01", number: id, items, status: "sent", cisRate: 20, vatRegistered: true, dueDate: null, notes: "", paymentTerms: "", tags: [] });
const figures = vatFigures([inv("A", [line(1000, "reverse_charge")])], [], [], [], true, period, "invoice");
check("box 1 carries no output tax for a reverse-charge sale", figures.box1 === 0, JSON.stringify({ box1: figures.box1, box6: figures.box6 }));
check("box 6 still carries the net", figures.box6 === 1000, JSON.stringify(figures.box6));

const mixedFigures = vatFigures([inv("B", [line(1000, "reverse_charge"), line(500, "standard")])], [], [], [], true, period, "invoice");
check("a mixed invoice declares only the ordinary VAT", mixedFigures.box1 === 100, JSON.stringify(mixedFigures.box1));
check("and the whole net of both", mixedFigures.box6 === 1500, JSON.stringify(mixedFigures.box6));

// An unregistered account cannot reverse-charge anything: there is no VAT
// to shift, and saying otherwise on an invoice would be a false statement.
check("an unregistered account charges nothing and shifts nothing", computeInvoiceTotals(both, false).totalVat === 0 && computeInvoiceTotals(both, false).total === 1200);


// ---- Asking, when the app can see the situation ----------------------------
// The rate sat in the picker for years and almost nobody chose it, because
// almost nobody knows the rule exists. What must NOT happen is the app
// asking when the answer is no: a wrong prompt on a tax question teaches
// people to ignore prompts.
const base = { vatRegistered: true, cisRate: 20, customerIsCompany: true, customerVatNumber: "GB220430231", endUserDeclared: false, items: [line(100, "standard")] };
// Read once and guarded: a null here used to throw, which killed the run at
// check 10 of 47 and printed no summary at all. A suite that dies is worse
// than one that fails -- it hides every check after it.
const asked = reverseChargeAsk(base);
check("asks on CIS work for a VAT-registered company", !!asked);
check("and offers to shift the standard-rated line", asked?.becomes[0] === "reverse_charge", JSON.stringify(asked));
const askedReduced = reverseChargeAsk({ ...base, items: [line(100, "reduced")] });
check("reduced-rated work shifts to the 5% kind", askedReduced?.becomes[0] === "reverse_charge_reduced", JSON.stringify(askedReduced));

check("never when the account is not VAT registered", reverseChargeAsk({ ...base, vatRegistered: false }) === null);
check("never without CIS: the charge follows the scheme", reverseChargeAsk({ ...base, cisRate: null }) === null);
check("never for a private customer", reverseChargeAsk({ ...base, customerIsCompany: false, customerVatNumber: "" }) === null);
check("never once they have declared they are an end user", reverseChargeAsk({ ...base, endUserDeclared: true }) === null);
check("never twice: silent once the lines are already reverse charge", reverseChargeAsk({ ...base, items: [line(100, "reverse_charge")] }) === null);
// Zero-rated and exempt work is outside the charge, so there is nothing to
// offer and nothing to ask.
check("nothing to ask when every line is zero-rated", reverseChargeAsk({ ...base, items: [line(100, "zero")] }) === null);
check("nor exempt", reverseChargeAsk({ ...base, items: [line(100, "exempt")] }) === null);
// A sole trader with a VAT number is still a business.
check("a sole trader with a VAT number counts", !!reverseChargeAsk({ ...base, customerIsCompany: false }));
// Mixed: only the lines that can shift are offered.
const mix = reverseChargeAsk({ ...base, items: [line(100, "standard"), line(50, "zero"), line(20, "reduced")] });
check("only the lines the charge covers are offered", mix?.lines.join() === "0,2" && mix?.becomes[2] === "reverse_charge_reduced", JSON.stringify(mix));

// ---- On the document a contractor actually receives -------------------------
// The logic above is worth nothing if the words never reach the page. This
// is the whole bug: the rate existed, the VAT came off, and the invoice
// said nothing.
const { makeDb, launchSignedIn, signIn, sleep, bodyText, newId, day } = await import("./mockdb.mjs");
const BASE = process.env.BASE ?? "http://localhost:3000";
const db = makeDb();
Object.assign(db.tables, { receipts: [], receipt_pages: [], credit_notes: [], invoice_payments: [], invoice_links: [], quote_links: [], recurring_expenses: [], recurring_invoices: [], quotes: [] });
db.tables.business_profile.push({ user_id: "x", business_name: "Harness Plastering Ltd", vat_registered: true, invoice_prefix: "INV-", invoice_next_number: 10, address: "1 Test Street", vat_number: "GB220430231", custom_categories: null });
const C = newId();
db.tables.clients.push({ id: C, user_id: "x", name: "Big Builders Ltd", email: "a@b.c", kind: "client", archived: false, is_company: true, address: "", vat_number: "GB660454836", payment_terms: "", default_currency: "", contact_person: "", phone: "", reminders_enabled: true, company_number: null });
const DECLARED = newId();
db.tables.clients.push({ id: DECLARED, user_id: "x", name: "End User Homes Ltd", email: "e@u.c", kind: "client", archived: false, is_company: true, address: "", vat_number: "GB660454836", payment_terms: "", default_currency: "", contact_person: "", phone: "", reminders_enabled: true, company_number: null, reverse_charge_end_user: true });
const NEW_CLIENT = newId();
db.tables.clients.push({ id: NEW_CLIENT, user_id: "x", name: "Fresh Contractors Ltd", email: "f@b.c", kind: "client", archived: false, is_company: true, address: "", vat_number: "GB660454836", payment_terms: "", default_currency: "", contact_person: "", phone: "", reminders_enabled: true, company_number: null });
const RC = newId(), PLAIN = newId();
db.tables.invoices.push(
  { id: RC, user_id: "x", client_id: C, date: day(-3), number: "INV-000011", items: [{ description: "Plastering, first floor", quantity: 1, unitPrice: 2400, vatRate: "reverse_charge", kind: "labour" }, { description: "Bonding and scrim", quantity: 1, unitPrice: 300, vatRate: "reverse_charge_reduced", kind: "materials" }], notes: "", due_date: day(25), payment_terms: "", status: "sent", tags: [], vat_registered: true, cis_rate: 20 },
  { id: PLAIN, user_id: "x", client_id: C, date: day(-3), number: "INV-000012", items: [{ description: "Plastering", quantity: 1, unitPrice: 1000, vatRate: "standard" }], notes: "", due_date: day(25), payment_terms: "", status: "sent", tags: [], vat_registered: true, cis_rate: null }
);

const { browser, page } = await launchSignedIn(db, { base: BASE, width: 900, profile: "profile-reverse-charge" });
try {
  await signIn(page, BASE);
  await page.goto(`${BASE}/invoices/${RC}`, { waitUntil: "networkidle0" });
  await sleep(1400);
  const doc = await bodyText(page);
  check("the issued invoice carries the legal wording", doc.includes(REVERSE_CHARGE_WORDING), doc.slice(0, 200));
  check("and says the customer pays HMRC", /Customer to pay the VAT to HMRC/.test(doc), doc.slice(0, 200));
  // 20% of 2400 = 480; 5% of 300 = 15.
  check("and states both amounts", /£480\.00/.test(doc) && /£15\.00/.test(doc), (doc.match(/Customer to pay[^.]*\./) || [""])[0]);
  check("the total itself carries no VAT", /Total: £2,700\.00/.test(doc.replace(/\s+/g, " ")), (doc.match(/Total: [^\n]*/) || [""])[0]);
  // CIS is deducted from labour as usual, on top.
  check("CIS still comes off the labour", /CIS deduction/.test(doc));

  // And it must NOT appear where it does not apply -- a note about a tax
  // that is not owed is as wrong as a missing one.
  await page.goto(`${BASE}/invoices/${PLAIN}`, { waitUntil: "networkidle0" });
  await sleep(1400);
  const plain = await bodyText(page);
  check("a plain invoice says nothing about it", !plain.includes(REVERSE_CHARGE_WORDING) && !/Customer to pay the VAT to HMRC/.test(plain), plain.slice(0, 160));
  check("and charges VAT as normal", /£200\.00/.test(plain), (plain.match(/Standard[^\n]*/) || [""])[0]);

  // The picker offers both, in words somebody can choose between.
  await page.goto(`${BASE}/invoices/new`, { waitUntil: "networkidle0" });
  await sleep(1800);
  const options = await page.evaluate(() => [...document.querySelectorAll("select option")].map((o) => o.textContent.trim()));
  check("the invoice form offers both reverse-charge rates", options.includes("Reverse charge (20%)") && options.includes("Reverse charge (5%)"), JSON.stringify(options.filter((o) => /Reverse/.test(o))));

  // Writing the invoice the rule is about: does the app say anything?
  const asked = await page.evaluate(async (clientId) => {
    const setNative = (el, v) => {
      const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v);
      el.dispatchEvent(new Event("change", { bubbles: true }));
      el.dispatchEvent(new Event("input", { bubbles: true }));
    };
    const pick = [...document.querySelectorAll("select")].find((s) => [...s.options].some((o) => o.value === clientId));
    if (!pick) return { noPicker: true };
    setNative(pick, clientId);
    await new Promise((r) => setTimeout(r, 500));
    const cis = [...document.querySelectorAll("input[type=checkbox]")].find((c) => (c.closest("label")?.textContent ?? "").includes("CIS subcontractor"));
    if (!cis) return { noCis: true };
    cis.click();
    await new Promise((r) => setTimeout(r, 400));
    const price = [...document.querySelectorAll("input")].find((i) => (i.getAttribute("aria-label") ?? "") === "Unit price");
    if (price) setNative(price, "1000");
    await new Promise((r) => setTimeout(r, 700));
    return { text: document.body.innerText };
  }, NEW_CLIENT);
  check("it asks whether the invoice should charge VAT at all", /Should this invoice charge VAT at all\?/.test(asked.text ?? ""), JSON.stringify(asked).slice(0, 200));
  check("and explains what happens if they charge it anyway", /cannot reclaim it/.test(asked.text ?? ""));
  check("and names the one thing that turns it off", /end user/i.test(asked.text ?? ""));

  // Saying yes must actually change the lines, not just dismiss the box.
  const after = await page.evaluate(async () => {
    const btn = [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "They pay the VAT");
    if (!btn) return { noButton: true };
    btn.click();
    await new Promise((r) => setTimeout(r, 700));
    const vat = [...document.querySelectorAll("select")].map((s) => s.options[s.selectedIndex]?.textContent?.trim()).filter(Boolean);
    return { vat, stillAsking: /Should this invoice charge VAT at all\?/.test(document.body.innerText) };
  });
  check("saying yes switches the lines to reverse charge", (after.vat ?? []).includes("Reverse charge (20%)"), JSON.stringify(after));
  check("and the question does not come back", after.stillAsking === false, JSON.stringify(after));

  // ---- The customer who has told you they are an end user --------------------
  // One sentence from them turns the whole thing off, and it is a fact about
  // THEM, not about one invoice. Before this was kept, the app asked again on
  // every invoice to that customer for ever -- and a question asked too often
  // is a question people stop reading, which is how somebody ends up
  // answering it wrongly on the one that mattered.
  await page.goto(`${BASE}/invoices/new`, { waitUntil: "networkidle0" });
  await sleep(1800);
  const declared = await page.evaluate(async (clientId) => {
    const setNative = (el, v) => {
      const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v);
      el.dispatchEvent(new Event("change", { bubbles: true }));
      el.dispatchEvent(new Event("input", { bubbles: true }));
    };
    const pick = [...document.querySelectorAll("select")].find((s) => [...s.options].some((o) => o.value === clientId));
    if (!pick) return { noPicker: true };
    setNative(pick, clientId);
    await new Promise((r) => setTimeout(r, 600));
    const cis = [...document.querySelectorAll("input[type=checkbox]")].find((c) => (c.closest("label")?.textContent ?? "").includes("CIS subcontractor"));
    if (cis && !cis.checked) cis.click();
    await new Promise((r) => setTimeout(r, 400));
    const price = [...document.querySelectorAll("input")].find((i) => i.getAttribute("aria-label") === "Unit price");
    if (price) setNative(price, "1000");
    await new Promise((r) => setTimeout(r, 900));
    return { asking: /Should this invoice charge VAT at all\?/.test(document.body.innerText), cisOn: !!cis?.checked };
  }, DECLARED);
  check("CIS work for a customer who has declared is set up the same way", declared.cisOn === true, JSON.stringify(declared));
  check("but they are never asked about the reverse charge again", declared.asking === false, JSON.stringify(declared));

  // What the form really learns from a past invoice. The first version of
  // this test assumed the VAT rate came back with the customer; it does not
  // -- the rate is learned per LINE DESCRIPTION, and the CIS rate per
  // customer. Worth pinning both, because a plasterer billing the same
  // contractor for the same work every month is the whole use case.
  await page.goto(`${BASE}/invoices/new`, { waitUntil: "networkidle0" });
  await sleep(1800);
  const learned = await page.evaluate(async (clientId) => {
    const setNative = (el, v) => {
      const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v);
      el.dispatchEvent(new Event("change", { bubbles: true }));
      el.dispatchEvent(new Event("input", { bubbles: true }));
    };
    const pick = [...document.querySelectorAll("select")].find((s) => [...s.options].some((o) => o.value === clientId));
    setNative(pick, clientId);
    await new Promise((r) => setTimeout(r, 900));
    const cisOn = [...document.querySelectorAll("select")].map((s) => s.options[s.selectedIndex]?.textContent?.trim()).includes("20% (registered)");
    const desc = [...document.querySelectorAll("input")].find((i) => i.getAttribute("aria-label") === "Description");
    setNative(desc, "Plastering, first floor");
    // On blur, not on input: the app waits for a finished description
    // rather than guessing from a half-typed prefix.
    desc.focus();
    desc.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    desc.blur();
    await new Promise((r) => setTimeout(r, 900));
    const vat = [...document.querySelectorAll("select")].map((s) => s.options[s.selectedIndex]?.textContent?.trim()).filter(Boolean);
    return { cisOn, vat, asking: /Should this invoice charge VAT at all\?/.test(document.body.innerText) };
  }, C);
  check("CIS comes back on by itself for a customer billed that way before", learned.cisOn === true, JSON.stringify(learned));
  check("and the same line of work comes back reverse-charged", (learned.vat ?? []).includes("Reverse charge (20%)"), JSON.stringify(learned));
  check("so there is nothing left to ask", learned.asking === false, JSON.stringify(learned));
} catch (e) { console.log("ERROR", e.message); results.push(false); }
finally { await browser.close(); }

console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
