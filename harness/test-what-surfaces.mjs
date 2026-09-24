// What the dashboard puts in front of him, and when. This is the screen he
// opens in the van: a bill he has to pay should appear before it's late,
// an overdue invoice should be obvious, and nothing should shout at him
// about something that isn't due for a fortnight.
import { makeDb, launchSignedIn, signIn, sleep, bodyText, newId, day } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };
const flat = (t) => t.replace(/\s+/g, " ");

const db = makeDb();
Object.assign(db.tables, { receipts: [], receipt_pages: [], credit_notes: [], invoice_payments: [], invoice_links: [], quote_links: [], recurring_expenses: [], recurring_invoices: [] });
db.tables.business_profile.push({ user_id: "x", business_name: "Harness Plastering Ltd", vat_registered: true, invoice_prefix: "INV-", invoice_next_number: 10, show_overdue_reminders: true, custom_categories: null });
const C = newId(), S = newId();
db.tables.clients.push({ id: C, user_id: "x", name: "Acme Kitchens Ltd", email: "a@b.c", address: "", kind: "client", archived: false, is_company: true, reminders_enabled: true, vat_number: "", payment_terms: "", default_currency: "", contact_person: "", phone: "", company_number: null });
db.tables.clients.push({ id: S, user_id: "x", name: "Jewson", email: "", address: "", kind: "supplier", archived: false, is_company: true, reminders_enabled: true, vat_number: "", payment_terms: "", default_currency: "", contact_person: "", phone: "", company_number: null });

const inv = (o) => db.tables.invoices.push({ id: newId(), user_id: "x", client_id: C, date: day(-30), number: o.number, items: [{ description: "Work", quantity: 1, unitPrice: o.net, vatRate: "standard" }], notes: "", due_date: o.due, payment_terms: "", status: o.status ?? "sent", tags: [], vat_registered: true, cis_rate: null });
// Each bill gets its own supplier row: the dashboard shows the linked
// supplier's name in preference to the vendor written on the document, so
// sharing one would make them all read the same.
const supplier = (name) => { const id = newId(); db.tables.clients.push({ id, user_id: "x", name, email: "", address: "", kind: "supplier", archived: false, is_company: true, reminders_enabled: true, vat_number: "", payment_terms: "", default_currency: "", contact_person: "", phone: "", company_number: null }); return id; };
const bill = (o) => db.tables.receipts.push({ id: newId(), user_id: "x", client_id: o.supplierId ?? null, date: day(-10), vendor: o.vendor, category: "Supplies", amount: o.net, vat_amount: 0, image_data_url: null, notes: "", starred: false, needs_review: o.review ?? false, warranty_months: null, tags: [], line_items: [], document_type: o.type ?? "invoice", invoice_number: o.number ?? null, due_date: o.due ?? null, paid: o.paid ?? false, details: {}, credit_of_receipt_id: null, original_amount: null, original_vat_amount: null, original_currency: null, fx_rate: null });

inv({ number: "INV-OVERDUE", net: 1000, due: day(-12) });          // late: must be obvious
inv({ number: "INV-SOON", net: 500, due: day(9) });                 // owed, not late
inv({ number: "INV-PAID", net: 700, due: day(-20), status: "paid" }); // settled: quiet
bill({ vendor: "Jewson", supplierId: S, net: 240, due: day(2), number: "J-1" });     // due in 2 days: show it
bill({ vendor: "Screwfix", supplierId: supplier("Screwfix"), net: 90, due: day(20), number: "S-1" });   // due in 20 days: don't
bill({ vendor: "Wolseley", supplierId: supplier("Wolseley"), net: 310, due: day(-4), number: "W-1" });  // already late
bill({ vendor: "Toolstation", supplierId: supplier("Toolstation"), net: 45, type: "receipt", paid: true, review: true }); // waiting to be checked

const { browser, page } = await launchSignedIn(db, { base: BASE, width: 375, profile: "profile-surfaces" });
// The dashboard holds all three panels at once now, so they can slide, and
// only the one without `inert` is on screen. Reading the whole body reads all
// three -- and the file library beside them, which lists everything saved on
// purpose. A check that something is NOT shown has to ask what is shown.
const onScreen = (pg) => pg.evaluate(() => {
  const live = [...document.querySelectorAll('[role="tabpanel"]')].find((p) => !p.hasAttribute("inert"));
  const lib = document.querySelector('[aria-label="Your file library"]');
  const all = document.body.innerText;
  if (!live) return all;
  const hidden = [...document.querySelectorAll('[role="tabpanel"][inert]')].map((p) => p.innerText);
  let out = all;
  for (const h of hidden) out = out.split(h).join("");
  if (lib) out = out.split(lib.innerText).join("");
  return out;
});

try {
  await signIn(page, BASE);
  await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
  await sleep(2000);
  // Money out is the panel you land on now, so the invoice side has to be
  // asked for. Both are checked below; they are just no longer on screen at
  // the same moment.
  const showPanel = async (label) => {
    await page.evaluate((l) => [...document.querySelectorAll('[role="tab"]')].find((x) => x.textContent.includes(l))?.click(), label);
    await sleep(600);
  };
  const bills = await onScreen(page);
  await showPanel("Invoices & customers");
  const t = await onScreen(page);

  check("the overdue invoice is on the dashboard", t.includes("INV-OVERDUE"), flat(t).slice(0, 400));
  check("the one not yet late is there too, as money owed", t.includes("INV-SOON"), flat(t).slice(0, 400));
  check("a paid invoice doesn't clutter it", !t.includes("INV-PAID"), flat(t).slice(0, 400));
  check("what's owed is the two unpaid ones, not the paid one", /£1,800\.00|£1800\.00/.test(t), flat(t).slice(flat(t).indexOf("Owed") - 60, flat(t).indexOf("Owed") + 60));

  check("a bill due in two days is shown before it's late", t.includes("Jewson"), flat(t).slice(0, 500));
  check("a bill already late is shown", t.includes("Wolseley"), flat(t).slice(0, 500));
  // The card lists everything he owes, which is what a list of bills is for;
  // the amber banner, the push notification and the badge on the app icon
  // count only what's due within three days. A bill three weeks off belongs
  // on the list without being nagged about.
  check("a bill three weeks off is still on the list", t.includes("Screwfix"), flat(t).slice(0, 500));
  check("but it isn't counted as needing paying soon", /2 bills need paying soon/.test(t), flat(t).slice(flat(t).indexOf("need paying") - 40, flat(t).indexOf("need paying") + 40));
  check("the late bill says it's late", /Overdue by \d+ day/.test(bills), flat(bills).slice(flat(bills).indexOf("Wolseley"), flat(bills).indexOf("Wolseley") + 120));

  check("the receipt waiting to be checked is counted", /review/i.test(t), flat(t).slice(0, 500));
  check("nothing on the dashboard is broken", !/NaN|undefined|Application error/.test(t), flat(t).slice(0, 300));
  check("it all fits a phone", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));

  // Once the late bill is paid it should drop off without a reload.
  // Scoped to the bills card: since the dashboard was rebuilt, a supplier's
  // name also appears in "Who you work with", so the whole page's text would
  // say the bill is still there when it has gone.
  const inBills = () =>
    page.evaluate(() => {
      const card = document.querySelector("#bills-to-pay");
      return card ? card.textContent : "";
    });
  const before = (await inBills()).includes("Wolseley");
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("#bills-to-pay button")].find((x) => /Mark as paid/i.test(x.textContent));
    if (b) b.click();
  });
  await sleep(1600);
  const afterBills = await inBills();
  check("marking a bill paid takes it off the list there and then", before && !afterBills.includes("Wolseley"), flat(afterBills).slice(0, 300));
  check("and it is recorded as paid, not deleted", db.tables.receipts.filter((r) => r.vendor === "Wolseley").length === 1 && db.tables.receipts.find((r) => r.vendor === "Wolseley").paid === true, JSON.stringify(db.tables.receipts.map((r) => [r.vendor, r.paid])));
} catch (e) { console.log("ERROR", e.message); }
finally { await browser.close(); console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length })); }
