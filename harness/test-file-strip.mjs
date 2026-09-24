// The file library on the dashboard (Atanas, 2026-09-24): one rectangle with a
// switch, a roller for the date, a button for a period of his own, and the
// documents sliding sideways, big enough to recognise.
//
// The check that matters most is the last one. He spotted the gap himself:
// once a photograph has been emailed away and cleared, the record survives --
// so there must still be a FILE, and it must say what happened rather than
// showing an empty frame.
import { makeDb, launchSignedIn, signIn, sleep, UID, todayISO } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

const YEAR = Number(todayISO().slice(0, 4));
const PIXEL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const db = makeDb();
Object.assign(db.tables, { receipts: [], recurring_expenses: [], invoice_payments: [] });
db.tables.business_profile.push({ user_id: UID, business_name: "Nasko Plastering", vat_registered: false, invoice_prefix: "INV-", invoice_next_number: 1 });
db.tables.clients.push({ id: "c1", user_id: UID, name: "Travis Perkins", kind: "supplier", archived: false });
db.tables.receipts.push(
  { id: "r1", user_id: UID, vendor: "Travis Perkins", date: `${YEAR}-03-14`, amount: 120, vat_amount: 24, document_type: "receipt", paid: true, image_data_url: PIXEL, details: {} },
  { id: "r2", user_id: UID, vendor: "Jewson", date: `${YEAR}-03-20`, amount: 80, vat_amount: 16, document_type: "receipt", paid: true, image_data_url: PIXEL, details: {} },
  { id: "r3", user_id: UID, vendor: "Old Supplier", date: `${YEAR - 1}-07-02`, amount: 55, vat_amount: 11, document_type: "receipt", paid: true, image_data_url: null, details: { photoAgedAt: `${YEAR}-01-05` } },
);
db.tables.invoices.push({ id: "i1", user_id: UID, client_id: "c1", number: "INV-001", date: `${YEAR}-03-14`, due_date: `${YEAR}-04-14`, status: "sent", items: [{ description: "Work", quantity: 1, unitPrice: 500, vatRate: 0 }] });

const { browser, page } = await launchSignedIn(db, { base: BASE, width: 390, profile: "profile-file-strip" });
const strip = () => page.evaluate(() => document.querySelector('[aria-label="Your file library"]')?.innerText ?? "");
const cards = () => page.evaluate(() =>
  [...(document.querySelector('[aria-label="Your file library"]')?.querySelectorAll("li a") ?? [])].map((a) => a.innerText.replace(/\n/g, " | ")));
const pickMode = (m) => page.evaluate((x) => [...document.querySelectorAll('[aria-label="Pictures or files"] button')].find((b) => b.textContent.trim() === x)?.click(), m);
const roll = (col, label) => page.evaluate(({ col, label }) => {
  const list = document.querySelector(`[role="listbox"][aria-label="${col}"]`);
  [...list.querySelectorAll("button")].find((b) => b.textContent.trim().startsWith(label))?.click();
}, { col, label });

try {
  await signIn(page, BASE);
  await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
  await sleep(1600);

  const t = await strip();
  check("the library is on the dashboard, with a title that opens the whole thing", /Your file library/.test(t), t.slice(0, 200));
  check("...and one switch, Photos and Files, not two rectangles", /Photos/.test(t) && /Files/.test(t), t.slice(0, 200));
  check("...and a roller with year, month and day", /Year/.test(t) && /Month/.test(t) && /Day/.test(t), t.slice(0, 300));
  check("...and a way to pick a period of your own", /Pick a period/.test(t), t.slice(0, 300));

  const titleHref = await page.evaluate(() => document.querySelector('[aria-label="Your file library"] a')?.getAttribute("href"));
  check("the title opens the whole library", titleHref === "/files", String(titleHref));

  // --- Photos shows only what has a picture ---
  let c = await cards();
  check("this year's pictures are shown", c.some((x) => /Travis Perkins/.test(x)) && c.some((x) => /Jewson/.test(x)), JSON.stringify(c));
  check("...and last year's is not, because the roller is on this year", !c.some((x) => /Old Supplier/.test(x)), JSON.stringify(c));
  check("...and an invoice is not a picture", !c.some((x) => /INV-001/.test(x)), JSON.stringify(c));

  // --- the roller narrows ---
  const monthsOffered = await page.evaluate(() =>
    [...document.querySelectorAll('[role="listbox"][aria-label="Month"] button')].map((b) => b.textContent.trim()));
  check("the month column actually offers the months", monthsOffered.includes("Mar") && monthsOffered.includes("Jan") && monthsOffered.length === 13, JSON.stringify(monthsOffered));
  await roll("Month", "Mar");
  await sleep(400);
  const dayEnabled = await page.evaluate(() => document.querySelector('[role="listbox"][aria-label="Day"]')?.getAttribute("aria-disabled"));
  check("...and picking one wakes the day column up", dayEnabled === "false", String(dayEnabled));
  c = await cards();
  // Counting is how the old version of this check passed while the month
  // column was empty: "all year" happened to hold the same two documents.
  check("rolling to a month keeps that month", c.some((x) => /Travis Perkins/.test(x)) && c.some((x) => /Jewson/.test(x)) && c.length === 2, JSON.stringify(c));
  await roll("Day", "14");
  await sleep(600);
  c = await cards();
  check("rolling to a day keeps that day alone", c.length === 1 && /Travis Perkins/.test(c[0]), JSON.stringify(c));
  await roll("Day", "All month");
  await sleep(300);
  check("and 'All month' widens it again without starting over", (await cards()).length === 2);

  // --- Files shows everything, including what has lost its picture ---
  await pickMode("Files");
  await sleep(500);
  c = await cards();
  check("Files shows the invoice too, not only the pictures", c.some((x) => /INV-001/.test(x)), JSON.stringify(c));

  await roll("Month", "All year");
  await sleep(400);
  await roll("Year", String(YEAR - 1));
  await sleep(500);
  c = await cards();
  check("a receipt whose photograph was emailed away is still a file", c.some((x) => /Old Supplier/.test(x)), JSON.stringify(c));
  check("...and says what happened to the picture rather than showing an empty frame", c.some((x) => /Emailed to you/.test(x)), JSON.stringify(c));

  // --- a date with nothing in it ---
  await roll("Year", String(YEAR));
  await sleep(300);
  await roll("Month", "Jan");
  await sleep(400);
  const empty = await strip();
  check("a month with nothing says so, and offers the way on", /Nothing that month|No pictures that month/.test(empty) && /open the whole library/.test(empty), empty.slice(-300));
} catch (e) {
  console.log("ERROR", e.message);
  results.push(false);
} finally {
  await browser.close();
  console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
}
