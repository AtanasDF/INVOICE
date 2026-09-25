// What the reader was not sure of, on a document nobody watched it read.
//
// The app's rule (CLAUDE.md): only fill in what the reading is sure of, and
// say so. On /scan that works -- somebody is there, the form marks a
// doubtful field, they look at it before saving.
//
// A document that arrives BY EMAIL is read with nobody there. The reader's
// doubt was thrown away at the door, so an amount it had flagged as a guess
// landed in the accounting record looking exactly as confident as one it
// was certain about. "A wrong total that looks confident goes into the
// accounting record unchallenged, while an empty box gets looked at" --
// this is the third case, a wrong total that looked confident and was
// never empty.
//
// notes/competitor-research.md calls this a market-wide hole: not one of
// the twelve apps shows which field its reader doubted.
import { makeDb, launchSignedIn, signIn, sleep, bodyText, newId, day } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

const db = makeDb();
Object.assign(db.tables, { receipts: [], receipt_pages: [], credit_notes: [], invoice_payments: [], invoice_links: [], quote_links: [], recurring_expenses: [], recurring_invoices: [], quotes: [] });
db.tables.business_profile.push({ user_id: "x", business_name: "Harness Ltd", vat_registered: true, invoice_prefix: "INV-", invoice_next_number: 10, custom_categories: null });

const receipt = (details) => ({
  id: newId(), user_id: "x", client_id: null, date: day(-2), vendor: "Smudged Supplies", category: "Materials",
  amount: 100, vat_amount: 20, image_data_url: null, notes: "", starred: false, needs_review: true,
  warranty_months: null, tags: ["via-email"], line_items: [], document_type: "receipt", invoice_number: null,
  due_date: null, paid: true, details, credit_of_receipt_id: null, original_amount: null,
  original_vat_amount: null, original_currency: null, fx_rate: null,
});
// One the reader doubted twice, one it was sure of.
db.tables.receipts.push(receipt({ unsure: ["total", "date"] }), receipt({}));

const { browser, page } = await launchSignedIn(db, { base: BASE, width: 900, profile: "profile-unsure" });
try {
  await signIn(page, BASE);
  await page.goto(`${BASE}/receipts/review`, { waitUntil: "networkidle0" });
  await sleep(1600);
  const text = await bodyText(page);
  // The supplier is the VALUE of a box, and innerText does not include
  // those -- the first version of this check looked for it in the page's
  // words and would have failed even with the page working perfectly.
  const suppliers = await page.evaluate(() => [...document.querySelectorAll('input[aria-label="Supplier"]')].map((i) => i.value));
  check("the review page shows the emailed documents", suppliers.filter((v) => v === "Smudged Supplies").length === 2, JSON.stringify(suppliers));

  const marks = await page.evaluate(() => {
    // Each receipt's OWN card: the nearest ancestor of its Supplier box that
    // holds exactly one of them. Filtering every element that CONTAINS one
    // returns the whole page repeatedly, which is how the first version
    // reported both receipts as identical.
    const cards = [...document.querySelectorAll('input[aria-label="Supplier"]')].map((input) => {
      let card = input;
      while (card.parentElement && card.parentElement.querySelectorAll('input[aria-label="Supplier"]').length === 1) card = card.parentElement;
      return card;
    });
    return cards.map((card) => {
      const flagged = [...card.querySelectorAll("span")]
        // The innermost only: the badge is a span inside a label span, and
        // counting both reported every doubted field twice.
        .filter((s) => s.children.length === 0)
        .filter((s) => /double-check this/i.test(s.textContent ?? ""))
        .map((s) => (s.parentElement?.textContent ?? "").replace(/double-check this/i, "").trim());
      return flagged;
    });
  });
  const first = marks[0] ?? [];
  check("the doubted fields are marked", first.length === 2, JSON.stringify(marks));
  check("the total is one of them", first.some((t) => /Total/.test(t)), JSON.stringify(first));
  check("and the date", first.some((t) => /Date/.test(t)), JSON.stringify(first));
  check("but not the supplier, which it was sure of", !first.some((t) => /^Supplier/.test(t)), JSON.stringify(first));

  // The words matter: this is the same badge the scan page uses, because it
  // means the same thing to the same person.
  check("it says what to do, not that something is wrong", /double-check this/i.test(text), text.slice(0, 300));
  check("and nothing about confidence, models or scores", !/confidence|low|score|probability/i.test(text.replace(/Low\b/g, "")), text.slice(0, 300));

  // A document the reader was sure of carries no marks at all -- a badge on
  // everything is a badge on nothing.
  const second = marks[1] ?? [];
  check("a document it was sure of is left unmarked", second.length === 0, JSON.stringify(second));

  // The flag must never be the only thing saying it: the figure is still
  // editable, and saving is still one press.
  const editable = await page.evaluate(() => {
    const t = [...document.querySelectorAll('input[aria-label="Total (£, incl. VAT)"]')][0];
    return t ? !t.disabled && !t.readOnly : false;
  });
  check("a doubted figure is still the person's to correct", editable === true);
} catch (e) { console.log("ERROR", e.message); results.push(false); }
finally { await browser.close(); console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length })); }
