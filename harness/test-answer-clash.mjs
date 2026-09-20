// Two people answering the same quote request at once.
//
// The supplier can answer through their own /r/ link at any moment. The
// owner can be part-way through typing that same supplier's prices in,
// from a quote they were emailed. The form freezes its draft when it opens,
// but the row it checks against was read fresh on every render -- so a
// background refresh (coming back to the tab) quietly adopted the
// supplier's new answer as "the one he has seen", and saving then
// overwrote the supplier's own prices with his, with the clash never
// noticed by anybody.
//
// What should happen: the refresh holds off while the form is open, and if
// the answer really has moved on, the save is refused and says so.
import { makeDb, launchSignedIn, signIn, sleep, bodyText, clickText, newId, UID, day } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

const db = makeDb();
Object.assign(db.tables, { receipts: [], credit_notes: [], invoice_payments: [], quote_requests: [], quote_request_suppliers: [] });
db.tables.business_profile.push({ user_id: UID, business_name: "Harness Ltd", vat_registered: false, invoice_prefix: "INV-", invoice_next_number: 1, custom_categories: null });
const S = newId();
db.tables.clients.push({ id: S, user_id: UID, name: "Travis Perkins", email: "tp@example.com", address: "", kind: "supplier", archived: false, is_company: true, reminders_enabled: false, vat_number: "", payment_terms: "", default_currency: "", contact_person: "", phone: "", company_number: null });
const ITEM = newId();
const REQ = { id: newId(), user_id: UID, title: "Timber", created_at: new Date().toISOString(), items: [{ id: ITEM, description: "4x2 CLS timber, 2.4m", quantity: 40 }], needed_by: day(7), site_address: "", status: "open", choice: null };
db.tables.quote_requests.push(REQ);
const ROW = { id: newId(), user_id: UID, request_id: REQ.id, supplier_id: S, token: "t".repeat(43), sent_at: new Date().toISOString(), status: "waiting", prices: null, delivery: null, vat_included: false, valid_until: null, source: null, document_path: null, previous: null, responded_at: null, responder_name: null, note: "" };
db.tables.quote_request_suppliers.push(ROW);

const { browser, page } = await launchSignedIn(db, { base: BASE, width: 390, profile: "profile-answer-clash" });

const setBox = (i, v) =>
  page.evaluate((idx, val) => {
    const el = [...document.querySelectorAll("input")].filter((x) => !x.disabled && (x.type === "text" || !x.type))[idx];
    if (!el) return false;
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(el, val);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  }, i, v);

// Coming back to the tab is what triggers the background refresh.
const returnToTab = () =>
  page.evaluate(() => {
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("focus"));
  });

// The supplier answers through their own link, in the meantime.
const supplierAnswers = () => {
  const row = db.tables.quote_request_suppliers[0];
  Object.assign(row, { status: "replied", source: "online", responded_at: new Date(Date.now() + 1000).toISOString(), responder_name: "Dave at TP", prices: { [ITEM]: { price: 9.95, unavailable: false, note: "" } }, delivery: 0, vat_included: false });
};

try {
  await signIn(page, BASE);
  await page.goto(`${BASE}/quotes/requests/${REQ.id}`, { waitUntil: "networkidle0" });
  await sleep(1800);

  await clickText(page, "Enter prices");
  await sleep(1200);
  await setBox(0, "12.50");
  await sleep(300);

  // While he is typing, the supplier answers online.
  supplierAnswers();
  const readsBefore = db.log.filter((e) => e.key === "GET quote_request_suppliers").length;
  await returnToTab();
  await sleep(1500);
  const readsAfter = db.log.filter((e) => e.key === "GET quote_request_suppliers").length;
  check("the background refresh holds off while the prices form is open", readsAfter === readsBefore, `${readsBefore} -> ${readsAfter}`);
  check("...so his typing is still there", (await page.evaluate(() => [...document.querySelectorAll("input")].filter((x) => !x.disabled && (x.type === "text" || !x.type))[0]?.value)) === "12.50");

  // Saving now must not silently overwrite the supplier's own answer.
  await clickText(page, "Save their prices");
  await sleep(2200);
  const row = db.tables.quote_request_suppliers[0];
  check("the supplier's own prices are NOT overwritten", row.prices?.[ITEM]?.price === 9.95, JSON.stringify(row.prices));
  check("...and he is told why, rather than it looking saved", /changed since the page loaded|reload/i.test(await bodyText(page)), (await bodyText(page)).replace(/\s+/g, " ").slice(0, 300));

  // Closing the form lets the answer through.
  await clickText(page, "Cancel");
  await sleep(600);
  await returnToTab();
  await sleep(1800);
  const seen = await bodyText(page);
  check("closing the form picks the supplier's answer up", /9\.95|Dave at TP|replied/i.test(seen), seen.replace(/\s+/g, " ").slice(0, 300));

  // And now the owner CAN change it, because the page has seen it.
  await clickText(page, "Change prices");
  await sleep(1200);
  await setBox(0, "12.50");
  await sleep(300);
  await clickText(page, "Save their prices");
  await sleep(2200);
  const after = db.tables.quote_request_suppliers[0];
  check("once the page has seen it, his own figure saves", after.prices?.[ITEM]?.price === 12.5, JSON.stringify(after.prices));
  check("...and what it replaced is kept, not thrown away", Array.isArray(after.previous) && after.previous.some((p) => p.prices?.[ITEM]?.price === 9.95), JSON.stringify(after.previous));
} catch (e) { console.log("ERROR", e.message); results.push(false); }
finally { await browser.close(); console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length })); }
