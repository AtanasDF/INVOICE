// Failures that said nothing, or said the wrong thing.
//
// Four of the third review's findings share one shape: something went
// wrong and the screen either stayed silent or reported the opposite of
// what had actually happened. Each check here fails against the code
// before 2026-09-20.
//
//  - A dashboard that couldn't reach the database cleared the home-screen
//    badge, which is the same signal as "nothing is due".
//  - "Log it" on a recurring expense saved the expense, then said it
//    hadn't, and left the button there to be pressed again.
//  - A photo the browser can't decode attached nothing and said nothing.
//  - Saving Settings wrote the page-load invoice counter back over a
//    counter that had moved on since.
import { makeDb, launchSignedIn, signIn, sleep, bodyText, clickText, newId, UID, day } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };
const today = day(0);

const db = makeDb();
Object.assign(db.tables, {
  receipts: [], credit_notes: [], invoice_payments: [], invoice_links: [], quote_links: [],
  recurring_expenses: [], recurring_invoices: [], push_subscriptions: [],
});
db.tables.business_profile.push({ user_id: UID, business_name: "Harness Ltd", vat_registered: false, invoice_prefix: "INV-", invoice_next_number: 124, custom_categories: null });
const C = newId();
db.tables.clients.push({ id: C, user_id: "x", name: "Acme Kitchens Ltd", email: "", address: "", kind: "client", archived: false, is_company: true, reminders_enabled: true, vat_number: "", payment_terms: "", default_currency: "", contact_person: "", phone: "", company_number: null });
// Two overdue invoices, a bill due tomorrow and a recurring expense
// already due: a badge of 4.
for (const n of [1, 2]) {
  db.tables.invoices.push({ id: newId(), user_id: "x", client_id: C, date: day(-40), number: `INV-${n}`, items: [{ description: "Work", quantity: 1, unitPrice: 500, vatRate: "standard" }], notes: "", due_date: day(-20), payment_terms: "", status: "sent", tags: [], vat_registered: false, cis_rate: null });
}
db.tables.receipts.push({ id: newId(), user_id: "x", client_id: null, date: day(-3), vendor: "Travis Perkins", category: "Materials", amount: 200, vat_amount: 40, document_type: "invoice", invoice_number: "TP-1", due_date: day(1), paid: false, needs_review: false, details: null, image_data_url: null, original_amount: null, original_vat_amount: null, original_currency: null, fx_rate: null, starred: false, warranty_months: null, tags: [], line_items: [], credit_of_receipt_id: null });
const REC = newId();
db.tables.recurring_expenses.push({ id: REC, user_id: "x", supplier_id: null, description: "Van insurance", category: "Motor", amount: 142, vat_amount: 0, day_of_month: 1, next_due_date: day(-1), active: true });

const { browser, page } = await launchSignedIn(db, { base: BASE, width: 390, profile: "profile-quiet" });

// Record every badge call instead of letting it reach the OS.
const watchBadge = () =>
  page.evaluateOnNewDocument(() => {
    window.__badge = [];
    Object.defineProperty(navigator, "setAppBadge", { configurable: true, value: (n) => { window.__badge.push(`set:${n}`); return Promise.resolve(); } });
    Object.defineProperty(navigator, "clearAppBadge", { configurable: true, value: () => { window.__badge.push("clear"); return Promise.resolve(); } });
  });
const badgeCalls = () => page.evaluate(() => window.__badge ?? []);

try {
  await watchBadge();
  await signIn(page, BASE);

  // --- the badge -------------------------------------------------------
  await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
  await sleep(1800);
  check("a good dashboard load puts the count on the icon", (await badgeCalls()).includes("set:4"), JSON.stringify(await badgeCalls()));

  db.fail = { "GET invoices": 20 };
  await page.goto(`${BASE}/free-invoice`, { waitUntil: "domcontentloaded" });
  await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
  await sleep(1800);
  const failedText = await bodyText(page);
  check("a failed dashboard load says so", /couldn.t|could not/i.test(failedText), failedText.replace(/\s+/g, " ").slice(0, 200));
  check("...and does NOT take the number off the home-screen icon", !(await badgeCalls()).includes("clear"), JSON.stringify(await badgeCalls()));
  db.fail = {};

  // An account with genuinely nothing due must still clear it, or the
  // badge would be a number that never goes away.
  const kept = db.tables.invoices.splice(0, db.tables.invoices.length);
  const keptBills = db.tables.receipts.splice(0, db.tables.receipts.length);
  const keptRecurring = db.tables.recurring_expenses.splice(0, db.tables.recurring_expenses.length);
  await page.goto(`${BASE}/free-invoice`, { waitUntil: "domcontentloaded" });
  await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
  await sleep(1800);
  check("nothing due really does clear the icon", (await badgeCalls()).includes("clear"), JSON.stringify(await badgeCalls()));
  db.tables.invoices.push(...kept);
  db.tables.receipts.push(...keptBills);
  db.tables.recurring_expenses.push(...keptRecurring);

  // --- "Log it" on a recurring expense ---------------------------------
  db.fail = { "PATCH recurring_expenses": 20 };
  await page.goto(`${BASE}/recurring`, { waitUntil: "networkidle0" });
  await sleep(1400);
  await clickText(page, "Log it");
  await sleep(2000);
  const afterLog = await bodyText(page);
  check("the expense really was written", db.tables.receipts.some((r) => r.vendor === "Van insurance"), JSON.stringify(db.tables.receipts.map((r) => r.vendor)));
  check("...and the screen does not claim it failed", !/Could not log this expense/i.test(afterLog), afterLog.replace(/\s+/g, " ").slice(0, 260));
  check("...it says the expense is logged but the reminder didn't move on", /is logged/i.test(afterLog) && /twice/i.test(afterLog), afterLog.replace(/\s+/g, " ").slice(0, 260));
  check("...and it stops offering to log it again", !/Log it/.test(afterLog), afterLog.replace(/\s+/g, " ").slice(0, 200));
  db.fail = {};

  // --- a photo the browser can't decode --------------------------------
  await page.goto(`${BASE}/receipts/new`, { waitUntil: "networkidle0" });
  await sleep(1200);
  // Chrome cannot decode this: the header says JPEG, the bytes are not.
  await page.evaluate(() => {
    const input = document.querySelector('input[type="file"]');
    const bad = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6, 7, 8])], "receipt.jpg", { type: "image/jpeg" });
    const dt = new DataTransfer();
    dt.items.add(bad);
    input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await sleep(2500);
  const afterPhoto = await bodyText(page);
  check("an unreadable photo says so instead of attaching nothing in silence", /Could not read this photo/i.test(afterPhoto), afterPhoto.replace(/\s+/g, " ").slice(0, 300));

  // --- the invoice counter ---------------------------------------------
  await page.goto(`${BASE}/settings`, { waitUntil: "networkidle0" });
  await sleep(1800);
  // An invoice is marked sent on the phone while this page sits open.
  db.tables.business_profile[0].invoice_next_number = 130;
  await page.evaluate(() => {
    const el = [...document.querySelectorAll("textarea")].find((t) => /bank/i.test(t.previousElementSibling?.textContent ?? "")) ?? document.querySelector("textarea");
    if (el) {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
      setter.call(el, "Sort 11-22-33  Account 9999 0000");
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }
  });
  await clickText(page, "Save settings").catch(async () => { await clickText(page, "Save"); });
  await sleep(2200);
  check("saving Settings doesn't rewind a counter that moved on", db.tables.business_profile[0].invoice_next_number === 130, String(db.tables.business_profile[0].invoice_next_number));
  check("...and the field on screen now agrees with it", (await page.evaluate(() => [...document.querySelectorAll("input")].map((i) => i.value).join("|"))).includes("130"), await page.evaluate(() => [...document.querySelectorAll("input")].map((i) => i.value).join("|")));

  // A number typed on purpose must still win. Typed with the keyboard,
  // not poked in through the value setter: a React-controlled input
  // ignores that, and a test that quietly changes nothing passes for the
  // wrong reason.
  const numberField = await page.evaluateHandle(() =>
    [...document.querySelectorAll("input")].find(
      (i) => i.type === "number" && /Next number/i.test((i.closest("label")?.textContent ?? "") + " " + (i.previousElementSibling?.textContent ?? ""))
    )
  );
  const el = numberField.asElement();
  check("the Next number field is findable", !!el);
  if (el) {
    // A number input doesn't reliably select on triple-click, so clear it
    // the way a person would.
    await el.click();
    await page.keyboard.press("End");
    for (let i = 0; i < 8; i++) await page.keyboard.press("Backspace");
    await page.keyboard.type("200");
    await sleep(400);
    const onScreen = await page.evaluate((n) => n.value, el);
    check("...and the typing actually reached the field", onScreen === "200", onScreen);
    await clickText(page, "Save");
    await sleep(2400);
  }
  check("...and it is still one profile row, not a second one appended", db.tables.business_profile.length === 1, String(db.tables.business_profile.length));
  check("but a number typed on purpose still wins", db.tables.business_profile[0].invoice_next_number === 200, String(db.tables.business_profile[0].invoice_next_number));
} catch (e) { console.log("ERROR", e.message); results.push(false); }
finally { await browser.close(); console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length })); }
