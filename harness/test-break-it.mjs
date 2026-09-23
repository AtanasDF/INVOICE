// Trying to break it, rather than adding to it. A night of wide change --
// themes, a rebuilt dashboard, a new front door, scan limits, invites -- and
// the useful hour afterwards is the one spent on the cases nobody built for:
// an account with nothing in it, an account with far too much, a phone that
// is printing, and a button pressed twice.
import { makeDb, launchSignedIn, signIn, sleep, bodyText, day, UID } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

// ---------------------------------------------------------------- empty
// The state every single account is in for its first few minutes, and the one
// least likely to have been looked at.
const empty = makeDb();
Object.assign(empty.tables, { receipts: [], recurring_expenses: [], invoice_payments: [] });
empty.tables.business_profile.push({ user_id: UID, business_name: "", vat_registered: false, invoice_prefix: "INV-", invoice_next_number: 1 });

const { browser, page } = await launchSignedIn(empty, { base: BASE, width: 390, profile: "profile-break-it" });
let page2 = null;

const tabLabels = () => page.evaluate(() => [...document.querySelectorAll('[role="tab"]')].map((t) => t.textContent.trim()));
const clickTab = (l) => page.evaluate((x) => [...document.querySelectorAll('[role="tab"]')].find((t) => t.textContent.includes(x))?.click(), l);
const errors = [];
page.on("pageerror", (e) => errors.push(String(e.message)));

try {
  await signIn(page, BASE);
  await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
  await sleep(1400);

  const first = await bodyText(page);
  check("a brand new account gets a dashboard, not a blank page", first.length > 200, `${first.length} chars`);
  check("...and is not shown a failure it did not have", !/couldn't load|something went wrong/i.test(first), first.slice(0, 200));
  check("...and is still offered the scanner", /Scan a receipt/i.test(first));

  const labels = await tabLabels();
  check("all three panels are there on an empty account", labels.length === 3, JSON.stringify(labels));
  for (const l of labels) {
    await clickTab(l);
    await sleep(500);
    const t = await bodyText(page);
    check(`"${l}" on an empty account says something rather than nothing`, t.length > 200 && !/NaN|undefined|\[object/.test(t), t.slice(0, 160));
    check(`"${l}" does not claim a total of NaN or £-`, !/£\s*NaN|£-(?!\d)/.test(t), t.slice(0, 160));
  }
  check("nothing threw while walking an empty account", errors.length === 0, JSON.stringify(errors.slice(0, 2)));

  // ------------------------------------------------------- printing
  // The themes are new. A printed invoice must be plain ink on white paper
  // whatever the screen is set to, or somebody posts a customer a grey invoice.
  await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
  for (const theme of ["dark", "forest", "ink"]) {
    await page.evaluate((t) => { localStorage.setItem("theme", t); document.documentElement.dataset.theme = t; }, theme);
    await page.emulateMediaType("print");
    await sleep(300);
    const printed = await page.evaluate(() => {
      const bg = getComputedStyle(document.body).backgroundColor;
      const m = bg.match(/\d+/g)?.map(Number) ?? [255, 255, 255];
      return { bg, light: m[0] > 240 && m[1] > 240 && m[2] > 240 };
    });
    check(`a page printed under the ${theme} theme comes out on white paper`, printed.light, printed.bg);
    await page.emulateMediaType(null);
  }
  // And the theme a phone is set to must survive the print, not be reset by it.
  const kept = await page.evaluate(() => localStorage.getItem("theme"));
  check("printing does not quietly reset somebody's colour", kept === "ink", String(kept));
  await page.evaluate(() => localStorage.removeItem("theme"));

  // ------------------------------------------------------- far too much
  // 500 invoices is not a stress test, it is a busy year for a plasterer who
  // invoices twice a day. It has to open, and it has to add up.
  await browser.close();

  const big = makeDb();
  Object.assign(big.tables, { receipts: [], recurring_expenses: [], invoice_payments: [] });
  big.tables.business_profile.push({ user_id: UID, business_name: "Busy Year Ltd", vat_registered: true, invoice_prefix: "INV-", invoice_next_number: 501 });
  big.tables.clients.push({ id: "c1", user_id: UID, name: "One Big Customer", kind: "client", archived: false });
  for (let i = 0; i < 500; i++) {
    big.tables.invoices.push({
      id: `i${i}`, user_id: UID, client_id: "c1", number: `INV-${String(i).padStart(3, "0")}`,
      date: day(-(i % 300)), due_date: day(-(i % 300) + 30), status: i % 3 === 0 ? "paid" : "sent",
      items: [{ description: "Labour", quantity: 1, unitPrice: 100, vatRate: 20 }],
    });
  }

  const second = await launchSignedIn(big, { base: BASE, width: 390, profile: "profile-break-it-big" });
  page2 = second.page;
  const errs2 = [];
  page2.on("pageerror", (e) => errs2.push(String(e.message)));
  await signIn(page2, BASE);

  const began = Date.now();
  await page2.goto(`${BASE}/`, { waitUntil: "networkidle0" });
  await sleep(2500);
  const took = Date.now() - began;
  const bigText = await bodyText(page2);
  check("a dashboard with 500 invoices opens at all", bigText.length > 200 && /Scan a receipt/i.test(bigText), bigText.slice(0, 160));
  check("...without taking so long it looks broken", took < 12000, `${took}ms`);
  check("...and shows no arithmetic that has gone wrong", !/NaN|£-(?!\d)|Infinity/.test(bigText), (bigText.match(/.{0,40}(NaN|Infinity).{0,40}/) ?? [""])[0]);
  check("...and nothing threw", errs2.length === 0, JSON.stringify(errs2.slice(0, 2)));

  const beganList = Date.now();
  await page2.goto(`${BASE}/invoices`, { waitUntil: "networkidle0" });
  await sleep(2500);
  const listText = await bodyText(page2);
  check("the invoice list opens with 500 in it", /INV-/.test(listText), listText.slice(0, 160));
  check("...in reasonable time", Date.now() - beganList < 12000, `${Date.now() - beganList}ms`);
  const rows = await page2.evaluate(() => document.querySelectorAll('a[href^="/invoices/"]').length);
  check("...and actually lists them rather than silently showing a handful", rows > 20, String(rows));
  check("nothing threw on the list either", errs2.length === 0, JSON.stringify(errs2.slice(0, 2)));

} catch (e) {
  console.log("ERROR", e.message);
  results.push(false);
} finally {
  await browser.close().catch(() => {});
  await page2?.browser().close().catch(() => {});
  console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
}
