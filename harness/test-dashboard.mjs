// Home in two screens (launch plan step G, 2026-10-28): what needs doing, the
// big scan with Upload and New invoice under it, three figures, and the last
// few documents. The panels, the people list, the file library and the
// late-payment breakdown went to the pages built for them, so this checks they
// are gone as much as that the new page is there.
import { makeDb, launchSignedIn, signIn, sleep, bodyText, day, UID } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

const db = makeDb();
// The mock only creates the tables a suite asks for; the dashboard reads
// everything, so the rest are declared empty rather than left undefined.
Object.assign(db.tables, { receipts: [], recurring_expenses: [], invoice_payments: [] });
db.tables.business_profile.push({ user_id: UID, business_name: "Nasko Plastering", vat_registered: false, invoice_prefix: "INV-", invoice_next_number: 43, show_overdue_reminders: true });
db.tables.clients.push(
  { id: "c1", user_id: UID, name: "Hetherington Groundworks", kind: "client", archived: false },
  { id: "c2", user_id: UID, name: "Travis Perkins", kind: "supplier", archived: false },
);
db.tables.invoices.push(
  { id: "i1", user_id: UID, client_id: "c1", number: "INV-040", date: day(-40), due_date: day(-10), status: "sent", items: [{ description: "Labour", quantity: 1, unitPrice: 100, vatRate: 0 }] },
  { id: "i2", user_id: UID, client_id: "c1", number: "INV-041", date: day(-9), due_date: day(21), status: "sent", items: [{ description: "Labour", quantity: 1, unitPrice: 800, vatRate: 0 }] },
  { id: "i3", user_id: UID, client_id: "c1", number: "INV-042", date: day(-3), due_date: day(27), status: "sent", items: [{ description: "Labour", quantity: 1, unitPrice: 400, vatRate: 0 }] },
);
db.tables.receipts.push(
  { id: "r1", user_id: UID, client_id: "c2", vendor: "Travis Perkins", date: day(-2), amount: 258, vat_amount: 51.6, document_type: "invoice", paid: false, due_date: day(2), details: {} },
  { id: "r2", user_id: UID, client_id: "", vendor: "BP Kingstown", date: day(-1), amount: 67.28, vat_amount: 13.45, document_type: "receipt", paid: true, details: {} },
  { id: "r3", user_id: UID, client_id: "", vendor: "Screwfix", date: day(0), amount: 10, vat_amount: 2, document_type: "receipt", paid: true, needs_review: true, details: {} },
  ...[4, 5, 6, 7].map((n) => ({ id: `r${n}`, user_id: UID, client_id: "", vendor: `Old Shop ${n}`, date: day(-60 - n), amount: 5, vat_amount: 0, document_type: "receipt", paid: true, details: {} })),
);

const { browser, page } = await launchSignedIn(db, { base: BASE, width: 390, profile: "profile-dashboard" });
// An iPhone 14's screen, so "two screens" means his two screens.
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });

try {
  await signIn(page, BASE);
  await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
  await sleep(1500);
  const text = await bodyText(page);

  check("the page says what it is for in one line", text.includes("Photograph the paper, and the rest fills itself in."), text.slice(0, 200));

  // --- what needs doing, at the top ---
  const todo = await page.evaluate(() => {
    const s = document.querySelector('section[aria-labelledby="todo"]');
    return s ? [...s.querySelectorAll("a")].map((a) => [a.textContent.trim().replace(/\s*›$/, ""), a.getAttribute("href")]) : null;
  });
  check("a To do list comes first", !!todo, String(todo));
  check("...with the receipt to check, going to Needs review", todo?.some(([t, h]) => t === "1 receipt to check" && h === "/receipts/review"), JSON.stringify(todo));
  check("...the late invoice and what it comes to", todo?.some(([t, h]) => t === "1 invoice late, £100.00" && h === "/invoices?status=overdue"), JSON.stringify(todo));
  check("...and the bill due in two days", todo?.some(([t, h]) => t === "1 bill to pay soon" && h === "/money#you-owe"), JSON.stringify(todo));
  check("...and nothing that is not due", todo?.length === 3, JSON.stringify(todo));
  check("no banners with close buttons any more", !(await page.$('main button[aria-label="Dismiss"]')));

  // --- the scanner ---
  const order = await page.evaluate(() => {
    const s = document.querySelector('section[aria-label="Scan something"]');
    return [...s.querySelectorAll("a, label, button")].map((e) => e.textContent.trim().split("\n")[0]).filter(Boolean);
  });
  check("the big scan, then Upload and New invoice", order[0]?.includes("Scan a receipt or bill") && order[1] === "Upload" && order[2] === "New invoice", JSON.stringify(order));
  const sizes = await page.evaluate(() => {
    const big = document.querySelector('main a[href="/scan"]').getBoundingClientRect();
    const small = document.querySelector('main a[href="/invoices/new"]').getBoundingClientRect();
    return { big: Math.round(big.height), small: Math.round(small.height) };
  });
  check("the big one is visibly bigger than the two under it", sizes.big > sizes.small * 1.3, JSON.stringify(sizes));
  const offer = await page.evaluate(() => {
    const tile = document.querySelector('main a[href="/invoices/new"]');
    const photo = document.querySelector('a[href="/free-invoice?start=photo"]');
    return tile && photo ? Math.round(photo.getBoundingClientRect().top - tile.getBoundingClientRect().bottom) : null;
  });
  check("photographing an old invoice is offered right under New invoice", offer !== null && offer >= 0 && offer < 40, String(offer));

  // --- three figures ---
  const figures = await page.evaluate(() =>
    ["/money", "/money#you-owe", "/money#tax"].map((h) => document.querySelector(`main .grid-cols-3 a[href="${h}"]`)?.innerText.replace(/\n/g, " ") ?? null));
  check("owed to you counts every invoice still open", figures[0] === "Owed to you £1,300.00", JSON.stringify(figures));
  check("you owe is the unpaid bill with its VAT", figures[1] === "You owe £309.60", JSON.stringify(figures));
  check("tax so far is there and goes to Money", !!figures[2]?.startsWith("Tax so far"), JSON.stringify(figures));

  // --- recent ---
  const recent = await page.evaluate(() =>
    [...(document.querySelector('section[aria-labelledby="recent"]')?.querySelectorAll("li a") ?? [])].map((a) => a.innerText.split("\n")[0]));
  check("the last five documents, newest first, invoices and receipts together", JSON.stringify(recent) === JSON.stringify(["Screwfix", "BP Kingstown", "Travis Perkins", "Hetherington Groundworks", "Hetherington Groundworks"]), JSON.stringify(recent));
  check("...with the way to everything", !!(await page.$('section[aria-labelledby="recent"] a[href="/files"]')));

  // --- what left ---
  check("no panels or tabs on Home", !(await page.$('[role="tablist"]')) && !(await page.$('[role="tabpanel"]')));
  check("no people list", !text.includes("Who you work with"), text.slice(0, 300));
  check("no file library", !(await page.$('[aria-label="Your file library"]')));
  check("no late-payment breakdown", !text.includes("How late"), text.slice(0, 300));

  const size = await page.evaluate(() => ({
    h: document.documentElement.scrollHeight,
    v: window.innerHeight,
    parts: [...document.querySelector("main > div").children].map((e) => `${(e.getAttribute("aria-label") || e.textContent || "").trim().slice(0, 18)}:${Math.round(e.getBoundingClientRect().height)}`),
  }));
  // Measured to the end of Recent: the setting-up card below it is there only
  // until the account is set up, and can be put away.
  const daily = await page.evaluate(() => Math.round(document.querySelector('section[aria-labelledby="recent"]').getBoundingClientRect().bottom + window.scrollY));
  check("what he opens Home for fits two screens on a phone", daily <= size.v * 2, JSON.stringify({ daily, ...size }));
  const setupBelow = await page.evaluate(() => {
    const setup = document.querySelector('section[aria-labelledby="getting-started"]');
    const recent = document.querySelector('section[aria-labelledby="recent"]');
    return !setup || !!(recent.compareDocumentPosition(setup) & Node.DOCUMENT_POSITION_FOLLOWING);
  });
  check("...with setting up below it once there are documents", setupBelow);
  check("fits 390px", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  await page.setViewport({ width: 320, height: 700 });
  await sleep(400);
  check("fits 320px", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
} catch (e) {
  console.log("ERROR", e.message);
  results.push(false);
} finally {
  await browser.close();
  console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
}
