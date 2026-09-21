// Receipt photos that live in storage rather than in the row.
//
// A receipt's image_data_url is either an inline data: URL (older rows) or
// "storage:<uid>/<folder>/<n>.<ext>" in the private bucket, turned into a
// 7-day signed URL on read. Two things have to hold when the signing
// fails, because a builder's receipts are the evidence behind his expenses:
// the page must still know a photo EXISTS rather than showing the receipt
// as having none, and the data export must refuse rather than quietly
// write a file with the images missing.
import { makeDb, launchSignedIn, signIn, sleep, bodyText, newId, UID, todayISO } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

const db = makeDb();
Object.assign(db.tables, { receipts: [], receipt_pages: [], credit_notes: [], invoice_payments: [], recurring_expenses: [], recurring_invoices: [] });
db.tables.business_profile.push({ user_id: UID, business_name: "Harness Ltd", vat_registered: false, invoice_prefix: "INV-", invoice_next_number: 1, custom_categories: null });
const STORED = `storage:${UID}/2026-09/1.jpg`;
db.tables.receipts.push({ id: newId(), user_id: UID, client_id: null, date: todayISO(), vendor: "Jewson", category: "Materials", amount: 120, vat_amount: 24, image_data_url: STORED, notes: "", starred: false, needs_review: false, warranty_months: null, tags: [], line_items: [], document_type: "receipt", invoice_number: null, due_date: null, paid: true, details: {}, credit_of_receipt_id: null, original_amount: null, original_vat_amount: null, original_currency: null, fx_rate: null });

const { browser, page } = await launchSignedIn(db, { base: BASE, width: 390, profile: "profile-stored-photos" });

const thumbs = () => page.evaluate(() => [...document.querySelectorAll("img")].map((i) => i.getAttribute("src") ?? "").filter((s) => !s.startsWith("data:image/svg")));

try {
  await signIn(page, BASE);

  // Signing works: the photo is shown from a signed link, not the raw ref.
  await page.goto(`${BASE}/receipts`, { waitUntil: "networkidle0" });
  await sleep(2000);
  const ok = await thumbs();
  check("a stored photo is asked to be signed", (db.signed ?? 0) >= 1, String(db.signed));
  check("...and shown from the signed link", ok.some((s) => /token=mock/.test(s)), JSON.stringify(ok).slice(0, 200));
  check("...never as the raw storage reference", !ok.some((s) => s.startsWith("storage:")), JSON.stringify(ok).slice(0, 200));

  // Signing fails: the receipt must not look like it has no photo.
  db.storageFails = true;
  db.signed = 0;
  await page.goto(`${BASE}/free-invoice`, { waitUntil: "domcontentloaded" });
  await page.goto(`${BASE}/receipts`, { waitUntil: "networkidle0" });
  await sleep(2200);
  const t = await bodyText(page);
  check("the receipt is still listed when its photo can't be signed", /Jewson/.test(t), t.replace(/\s+/g, " ").slice(0, 200));
  check("...and nothing falls over", !/Application error/.test(t), t.slice(0, 200));
  const failedThumbs = await page.evaluate(() =>
    [...document.querySelectorAll("img, a")].map((e) => e.getAttribute("src") ?? e.getAttribute("href") ?? "").filter(Boolean)
  );
  check("...the app still knows a photo exists, rather than showing none", failedThumbs.some((s) => s.startsWith("storage:")), JSON.stringify(failedThumbs).slice(0, 220));

  // The export must refuse rather than write a file with the photo missing.
  await page.goto(`${BASE}/settings`, { waitUntil: "networkidle0" });
  await sleep(1800);
  const clicked = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => /Download all my data/i.test(x.textContent ?? ""));
    b?.click();
    return !!b;
  });
  check("there is a Download all my data button", clicked);
  await sleep(3000);
  const after = await bodyText(page);
  check("an export that can't reach a photo says so rather than leaving it out", /couldn.t be reached|stopped rather than leave it out|Try again/i.test(after), after.replace(/\s+/g, " ").slice(0, 320));
  db.storageFails = false;
} catch (e) { console.log("ERROR", e.message); results.push(false); }
finally { await browser.close(); console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length })); }
