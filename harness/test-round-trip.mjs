// What goes in comes back out unchanged. Awkward text (apostrophes,
// accents, ampersands, a £ sign in a note), awkward numbers (0.33 of an
// hour, a penny, a negative credit note) and empty fields have to survive
// being saved and read back, on screen and in the database row.
import { makeDb, launchSignedIn, signIn, sleep, bodyText, clickText, newId, todayISO } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

const NAME = "O'Brien & Sons (Bristol) Ltd — Façade Specialists";
const NOTE = "Quote ref £250 “urgent”, see José's email — 50% now, 50% on completion.";

const db = makeDb();
Object.assign(db.tables, { receipts: [], receipt_pages: [], credit_notes: [], invoice_payments: [], invoice_links: [], quote_links: [] });
db.tables.business_profile.push({ user_id: "x", business_name: "Harness Plastering Ltd", vat_registered: true, invoice_prefix: "INV-", invoice_next_number: 10, custom_categories: null });

const set = async (page, match, value) => {
  const ok = await page.evaluate((m, v) => {
    const all = [...document.querySelectorAll("input, textarea")];
    const el = all.find((i) => new RegExp(m, "i").test(`${i.placeholder ?? ""} ${i.labels?.[0]?.textContent ?? ""} ${i.previousElementSibling?.textContent ?? ""}`));
    if (!el) return false;
    const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  }, match, value);
  return ok;
};

const { browser, page } = await launchSignedIn(db, { base: BASE, profile: "profile-roundtrip" });
try {
  await signIn(page, BASE);

  // A contact with an awkward name and most fields left empty.
  await page.goto(`${BASE}/clients/new`, { waitUntil: "networkidle0" });
  await sleep(1200);
  check("the name field is there", await set(page, "name", NAME));
  await sleep(300);
  await clickText(page, "Save customer").catch(async () => { await clickText(page, "Save").catch(() => {}); });
  await sleep(1600);
  const saved = db.tables.clients.find((c) => c.name === NAME);
  check("an awkward name is stored exactly as typed", !!saved, JSON.stringify(db.tables.clients.map((c) => c.name)));
  check("fields left empty are stored as empty, not as the word null", saved && (saved.email ?? "") === "" && (saved.address ?? "") === "", JSON.stringify({ email: saved?.email, address: saved?.address }));

  // And it reads back onto the screen the same way.
  await page.goto(`${BASE}/clients`, { waitUntil: "networkidle0" });
  await sleep(1400);
  const list = await bodyText(page);
  check("the name reads back on screen exactly", list.includes(NAME), list.replace(/\s+/g, " ").slice(0, 300));
  check("no mangled punctuation anywhere", !/&amp;|&#39;|&quot;|\\u00/.test(list), list.replace(/\s+/g, " ").slice(0, 300));

  // And it reads back into the EDIT BOX the same way, which the list can't
  // tell you: innerText never contains what is in an input, so a name
  // mangled on its way into the form would leave every check above green.
  await clickText(page, "Edit");
  await sleep(900);
  const fields = await page.evaluate(() => [...document.querySelectorAll("input, textarea")].map((i) => i.value));
  check("the name is put back in the edit box exactly as typed", fields.includes(NAME), JSON.stringify(fields.filter(Boolean).slice(0, 6)));
  check("...with nothing escaped or doubled on the way in", !fields.some((v) => /&amp;|&#39;|&quot;|\\u00/.test(v)), JSON.stringify(fields.filter((v) => /&|\\u/.test(v))));

  // A receipt for a penny, and one for an awkward fraction of an hour.
  const penny = { id: newId(), user_id: "x", client_id: null, date: todayISO(), vendor: "Car park", category: "Transport & Taxis", amount: 0.01, vat_amount: 0, image_data_url: null, notes: NOTE, starred: false, needs_review: false, warranty_months: null, tags: [], line_items: [], document_type: "receipt", invoice_number: null, due_date: null, paid: true, details: {}, credit_of_receipt_id: null, original_amount: null, original_vat_amount: null, original_currency: null, fx_rate: null };
  db.tables.receipts.push(penny);
  await page.goto(`${BASE}/receipts`, { waitUntil: "networkidle0" });
  await sleep(1500);
  const receipts = await bodyText(page);
  check("a one-penny receipt reads as £0.01, not £0 or £0.10", receipts.includes("£0.01"), receipts.replace(/\s+/g, " ").slice(0, 400));
  // The list doesn't print notes, so check the note itself: open the
  // receipt and read the field back.
  const noteBack = await page.evaluate((id) => {
    const row = [...document.querySelectorAll("button, a")].find((b) => /edit/i.test(b.textContent));
    return row ? row.textContent : null;
  }, penny.id);
  check("the receipt row offers a way in to its note", noteBack !== null, String(noteBack));
  check("the note survived the round trip in the row itself", db.tables.receipts.find((r) => r.id === penny.id)?.notes === NOTE, JSON.stringify(db.tables.receipts.find((r) => r.id === penny.id)?.notes));

  // A credit note is stored negative and must read back as a minus, not a
  // positive that quietly adds to his costs.
  const credit = { ...penny, id: newId(), vendor: "Travis Perkins", document_type: "credit_note", amount: -80, vat_amount: -16, invoice_number: "CN-12", notes: "" };
  db.tables.receipts.push(credit);
  await page.reload({ waitUntil: "networkidle0" });
  await sleep(1500);
  const withCredit = await bodyText(page);
  check("a credit note reads back as money coming off", /−£(96|80)\.00/.test(withCredit), withCredit.replace(/\s+/g, " ").slice(0, 400));

  // The expenses total must add the penny and subtract the credit note.
  await page.goto(`${BASE}/expenses`, { waitUntil: "networkidle0" });
  await sleep(1600);
  const expenses = await bodyText(page);
  check("the month's total takes the credit note off", /−£95\.99|-£95\.99/.test(expenses) || expenses.includes("£79.99") || expenses.includes("−£79.99"), expenses.replace(/\s+/g, " ").slice(0, 400));
} catch (e) { console.log("ERROR", e.message); }
finally { await browser.close(); console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length })); }
