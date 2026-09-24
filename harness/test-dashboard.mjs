// The dashboard rebuilt around the scanner (Atanas, 2026-09-23: "the scanner
// is going to play the role of the first page... one big scanner with the
// three things underneath", then three panels on one page, the people you
// work with, and Check a company lower and smaller).
import { makeDb, launchSignedIn, signIn, sleep, bodyText, shot, day, UID } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

const db = makeDb();
// The mock only creates the tables a suite asks for; the dashboard reads
// everything, so the rest are declared empty rather than left undefined.
Object.assign(db.tables, { receipts: [], recurring_expenses: [], invoice_payments: [] });
db.tables.business_profile.push({ user_id: UID, business_name: "Nasko Plastering", vat_registered: false, invoice_prefix: "INV-", invoice_next_number: 43 });
db.tables.clients.push(
  { id: "c1", user_id: UID, name: "Hetherington Groundworks", kind: "client", archived: false },
  { id: "c2", user_id: UID, name: "Travis Perkins", kind: "supplier", archived: false },
  { id: "c3", user_id: UID, name: "Quietest Customer Ltd", kind: "client", archived: false },
  { id: "c4", user_id: UID, name: "Gone Away Ltd", kind: "client", archived: true },
);
db.tables.invoices.push(
  { id: "i1", user_id: UID, client_id: "c1", number: "INV-041", date: day(-9), due_date: day(21), status: "sent", items: [{ description: "Labour", quantity: 1, unitPrice: 800, vatRate: 0 }] },
  { id: "i2", user_id: UID, client_id: "c1", number: "INV-042", date: day(-3), due_date: day(27), status: "sent", items: [{ description: "Labour", quantity: 1, unitPrice: 400, vatRate: 0 }] },
);
db.tables.receipts.push(
  { id: "r1", user_id: UID, client_id: "c2", vendor: "Travis Perkins", date: day(-2), amount: 258, vat_amount: 51.6, document_type: "invoice", paid: false, due_date: day(12), details: {} },
  { id: "r2", user_id: UID, client_id: "", vendor: "BP Kingstown", date: day(-1), amount: 67.28, vat_amount: 13.45, document_type: "receipt", paid: true, details: {} },
);

const { browser, page } = await launchSignedIn(db, { base: BASE, width: 390, profile: "profile-dashboard" });

// All three panels are in the page at once now, so they can slide between each
// other. The one on screen is the one that is not inert -- the others are
// translated out of view, hidden from a screen reader, and inert so nothing in
// them can be tabbed into. Reading document.body would read all three.
const shownPanel = () => page.evaluate(() => {
  const live = [...document.querySelectorAll('[role="tabpanel"]')].find((p) => !p.hasAttribute("inert"));
  return live ? live.innerText : "";
});
const tabs = () => page.evaluate(() => [...document.querySelectorAll('[role="tab"]')].map((t) => ({ label: t.textContent.trim(), on: t.getAttribute("aria-selected") === "true" })));
const clickTab = (label) => page.evaluate((l) => [...document.querySelectorAll('[role="tab"]')].find((t) => t.textContent.includes(l))?.click(), label);

try {
  await signIn(page, BASE);
  await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
  await sleep(1200);

  // --- the scanner at the top ---
  // In document order, ignoring the tip's own dismiss button: the scan comes
  // before everything else you can do here.
  const order = await page.evaluate(() =>
    [...document.querySelectorAll("main a, main label")].map((e) => e.textContent.trim().split("\n")[0]).filter(Boolean));
  check("the big scan comes before everything else you can do", order[0]?.includes("Scan a receipt or bill") && order.indexOf("Create an invoice") === 1, JSON.stringify(order.slice(0, 5)));

  const bigVsSmall = await page.evaluate(() => {
    const big = [...document.querySelectorAll("main a, main label")].find((e) => e.textContent.includes("Scan a receipt or bill"));
    const small = [...document.querySelectorAll("main a, main button")].find((e) => e.textContent.trim().startsWith("Create an invoice"));
    return { big: big?.getBoundingClientRect().height ?? 0, small: small?.getBoundingClientRect().height ?? 0 };
  });
  check("the big one is visibly bigger than the three under it", bigVsSmall.big > bigVsSmall.small * 1.3, JSON.stringify(bigVsSmall));

  // Upload is a <label> wrapping a file input, not a button, so one tap opens
  // the picker -- the selector has to allow for that.
  const three = await page.evaluate(() =>
    [...document.querySelectorAll("main a, main button, main label")].map((e) => e.textContent.trim()).filter((t) => ["Create an invoice", "Copy a document", "Upload a document"].includes(t)));
  check("three working buttons underneath: create, copy, upload", three.length === 3, JSON.stringify(three));

  const text = await bodyText(page);
  check("writing one by hand is offered beside them", /write one by hand/i.test(text), text.slice(0, 400));
  check("the page says what it is for in one line", text.includes("Photograph the paper, and the rest fills itself in."), text.slice(0, 200));

  // --- the people you work with ---
  check("the people panel is there, with both ways to add", text.includes("Who you work with") && text.includes("Add a customer") && text.includes("Add a supplier"), text.slice(0, 800));
  const names = await page.evaluate(() => [...document.querySelectorAll("main ul a")].map((a) => a.textContent.trim().split("\n")[0]));
  check("customers and suppliers are in one list", names.some((n) => n.includes("Hetherington")) && names.some((n) => n.includes("Travis Perkins")), JSON.stringify(names));
  check("an archived contact is not offered", !names.some((n) => n.includes("Gone Away")), JSON.stringify(names));
  check("the busiest comes first", names[0]?.includes("Hetherington"), JSON.stringify(names));

  // Searching finds someone who is not in the first few.
  await page.type("#people-search", "quiet");
  await sleep(300);
  const found = await page.evaluate(() => {
    const live = [...document.querySelectorAll('[role="tabpanel"]')].find((p) => !p.hasAttribute("inert"));
    return [...live.querySelectorAll("ul a")].map((a) => a.textContent.trim().split("\n")[0]);
  });
  check("searching finds a quiet customer", found.length === 1 && found[0].includes("Quietest"), JSON.stringify(found));
  // A controlled input ignores a plain value assignment: React reads its own
  // tracker, so the native setter has to be called for the change to register.
  await page.evaluate(() => {
    const i = document.querySelector("#people-search");
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(i, "");
    i.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await sleep(200);

  // --- a name starts an invoice already addressed to them ---
  const href = await page.evaluate(() => [...document.querySelectorAll("main ul a")].find((a) => a.textContent.includes("Hetherington"))?.getAttribute("href"));
  check("tapping a name goes to a new invoice for them", href === "/invoices/new?client=c1", String(href));
  await page.goto(`${BASE}${href}`, { waitUntil: "networkidle0" });
  await sleep(1200);
  const onNew = await bodyText(page);
  check("...and that customer is already chosen", /Hetherington Groundworks/.test(onNew), onNew.slice(0, 500));
  // A draft has no number of its own -- assign_invoice_number hands one out
  // when the invoice is issued, so the sequence never gaps or repeats. What
  // the page owes him is knowing which number is coming.
  check("...and says which number it will get", /Will be\s*INV-43\s*when you send it/.test(onNew.replace(/\s+/g, " ")), onNew.replace(/\s+/g, " ").slice(0, 400));

  // --- three panels, one page ---
  await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
  await sleep(1000);
  const t = await tabs();
  check("three panels, invoices and customers first", JSON.stringify(t.map((x) => x.label)) === JSON.stringify(["Invoices & customers", "Receipts & bills", "Invoices sent"]) && t[0].on, JSON.stringify(t));

  await clickTab("Receipts & bills");
  await sleep(400);
  const bills = await shownPanel();
  check("the second panel shows what has been scanned", bills.includes("Receipts and bills you have scanned") && bills.includes("Travis Perkins") && bills.includes("BP Kingstown"), bills.slice(0, 600));
  check("...and the people panel is not also on screen", !bills.includes("Who you work with"), bills.slice(0, 300));

  await clickTab("Invoices sent");
  await sleep(400);
  const sent = await shownPanel();
  check("the third panel shows invoices sent, newest first", sent.includes("Invoices you have sent") && sent.indexOf("INV-042") < sent.indexOf("INV-041"), sent.slice(0, 600));

  // The choice is remembered: someone who lives in their receipts should not
  // have to find that panel again every morning.
  await page.reload({ waitUntil: "networkidle0" });
  await sleep(1000);
  const afterReload = await tabs();
  check("the panel you chose is still chosen after a reload", afterReload.find((x) => x.on)?.label === "Invoices sent", JSON.stringify(afterReload));

  await clickTab("Invoices & customers");
  await sleep(400);

  // --- check a company: present, but lower and smaller ---
  const company = await page.evaluate(() => {
    const el = [...document.querySelectorAll("main a")].find((a) => a.textContent.includes("Check a company"));
    if (!el) return null;
    const big = [...document.querySelectorAll("main a, main label")].find((e) => e.textContent.includes("Scan a receipt or bill"));
    return { top: el.getBoundingClientRect().top + window.scrollY, scanTop: big.getBoundingClientRect().top + window.scrollY, size: parseFloat(getComputedStyle(el).fontSize) };
  });
  check("check a company is still there, but below the scanner and smaller", !!company && company.top > company.scanTop && company.size <= 14, JSON.stringify(company));

  await shot(page, "dashboard");
  check("fits 390px", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  await page.setViewport({ width: 320, height: 680 });
  await sleep(400);
  check("fits 320px", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));

  // --- sliding between the panels with a finger (Atanas, 2026-09-24) ---
  // Only the strip moves: the header, the scanner and the tabs stay put. A
  // drag that is mostly up and down must never steal the page's own scroll.
  const swipe = async (fromX, toX, y = 400) => {
    await page.evaluate(({ fromX, toX, y }) => {
      const track = document.querySelector('[role="tabpanel"]').parentElement.parentElement;
      const ev = (type, x) => track.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, bubbles: true, pointerType: "touch", pointerId: 1 }));
      ev("pointerdown", fromX);
      for (let x = fromX; Math.abs(x - toX) > 8; x += (toX - fromX) / 8) ev("pointermove", x);
      ev("pointermove", toX);
      ev("pointerup", toX);
    }, { fromX, toX, y });
    await sleep(600);
  };

  await clickTab("Invoices & customers");
  await sleep(500);
  const before = (await tabs()).findIndex((t) => t.on);
  await swipe(320, 60);
  const afterLeft = (await tabs()).findIndex((t) => t.on);
  check("sliding right to left moves to the next panel", afterLeft === before + 1, JSON.stringify({ before, afterLeft }));

  await swipe(60, 320);
  check("sliding back the other way returns to the one before", (await tabs()).findIndex((t) => t.on) === before, JSON.stringify(await tabs()));

  // Past the end it must stay where it is rather than falling off.
  await swipe(60, 320);
  check("sliding past the first panel stays on the first", (await tabs()).findIndex((t) => t.on) === 0, JSON.stringify(await tabs()));

  // A mostly-vertical drag is a scroll, not a swipe.
  const atStart = (await tabs()).findIndex((t) => t.on);
  await page.evaluate(() => {
    const track = document.querySelector('[role="tabpanel"]').parentElement.parentElement;
    const ev = (type, x, y) => track.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, bubbles: true, pointerType: "touch", pointerId: 2 }));
    ev("pointerdown", 200, 300);
    for (let d = 0; d <= 120; d += 20) ev("pointermove", 200 - d / 4, 300 + d);
    ev("pointerup", 170, 420);
  });
  await sleep(500);
  check("a drag that is mostly up and down does not change panel", (await tabs()).findIndex((t) => t.on) === atStart, JSON.stringify(await tabs()));

  // The panels off screen must be unreachable, not merely out of sight.
  const hidden = await page.evaluate(() =>
    [...document.querySelectorAll('[role="tabpanel"]')].filter((p) => p.hasAttribute("inert")).length);
  check("the two panels you are not looking at are inert and hidden", hidden === 2, String(hidden));

} catch (e) {
  console.log("ERROR", e.message);
  results.push(false);
} finally {
  await browser.close();
  console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
}
