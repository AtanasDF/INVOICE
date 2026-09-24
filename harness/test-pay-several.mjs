// Marking several invoices paid at once (Atanas, 2026-09-24: "it should let
// you mark a few of them... pay this company only, pay that company only").
//
// Money arrives in a lump: one customer settles three invoices with a single
// transfer. Ticking them one at a time on three separate pages is the wrong
// shape for that, and it is the shape the app had.
import { makeDb, launchSignedIn, signIn, sleep, bodyText, UID, day } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

const db = makeDb();
Object.assign(db.tables, { receipts: [], recurring_expenses: [], invoice_payments: [] });
db.tables.business_profile.push({ user_id: UID, business_name: "Nasko Plastering", vat_registered: false, invoice_prefix: "INV-", invoice_next_number: 10 });
db.tables.clients.push(
  { id: "c1", user_id: UID, name: "Hetherington", kind: "client", archived: false },
  { id: "c2", user_id: UID, name: "Bowes Build", kind: "client", archived: false },
);
const inv = (id, n, client, price) => ({ id, user_id: UID, client_id: client, number: n, date: day(-20), due_date: day(-5), status: "sent", items: [{ description: "Labour", quantity: 1, unitPrice: price, vatRate: 0 }] });
db.tables.invoices.push(inv("i1", "INV-001", "c1", 400), inv("i2", "INV-002", "c1", 600), inv("i3", "INV-003", "c2", 250));

const { browser, page } = await launchSignedIn(db, { base: BASE, width: 390, profile: "profile-pay-several" });
const panel = () => page.evaluate(() => {
  const h = [...document.querySelectorAll("h2")].find((x) => x.textContent.trim() === "Awaiting payment");
  return h ? h.closest("div.rounded-xl").innerText : "";
});
const click = (t) => page.evaluate((x) => [...document.querySelectorAll("button")].find((b) => b.textContent.trim().startsWith(x))?.click(), t);

try {
  await signIn(page, BASE);
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await sleep(2000);
  await page.evaluate(() => [...document.querySelectorAll('[role="tab"]')].find((t) => t.textContent.includes("Invoices & customers"))?.click());
  await sleep(600);

  let t = await panel();
  check("all three are awaiting payment", /INV-001/.test(t) && /INV-002/.test(t) && /INV-003/.test(t), t.slice(0, 300));
  check("...and marking several is offered", /Mark several paid/.test(t), t.slice(0, 200));

  await click("Mark several paid");
  await sleep(500);
  t = await panel();
  check("it offers all of them at once", /All of them/.test(t), t.slice(0, 300));
  check("...and everything from one company", /All from Hetherington/.test(t) && /All from Bowes Build/.test(t), t.slice(0, 300));

  // One company only.
  await click("All from Hetherington");
  await sleep(400);
  const ticked = await page.evaluate(() => [...document.querySelectorAll('input[type="checkbox"]')].filter((c) => c.checked).length);
  check("picking a company ticks only that company's invoices", ticked === 2, String(ticked));
  t = await panel();
  check("...and the button says how many and how much", /Mark 2 paid/.test(t) && /£1,000\.00/.test(t), t.slice(-200));

  await click("Mark 2 paid");
  await page.waitForFunction(() => !document.body.innerText.includes("INV-001"), { timeout: 20000 }).catch(() => {});
  await sleep(1200);

  const paid = db.tables.invoice_payments;
  check("both payments are recorded, for what was owed", paid.length === 2 && paid.some((p) => p.amount === 400) && paid.some((p) => p.amount === 600), JSON.stringify(paid.map((p) => p.amount)));
  check("...both invoices are paid", db.tables.invoices.filter((i) => i.status === "paid").length === 2, JSON.stringify(db.tables.invoices.map((i) => [i.number, i.status])));
  check("...and the other company's invoice is untouched", db.tables.invoices.find((i) => i.id === "i3").status === "sent");

  t = await panel();
  check("the two paid ones leave the list, the third stays", !/INV-001/.test(t) && !/INV-002/.test(t) && /INV-003/.test(t), t.slice(0, 300));
} catch (e) {
  console.log("ERROR", e.message);
  results.push(false);
} finally {
  await browser.close();
  console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
}
