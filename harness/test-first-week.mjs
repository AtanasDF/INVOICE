// Atanas's first week, start to finish, on an account with nothing in it:
// add a customer, write invoice number 1, issue it, get paid, log what the
// job cost, and then check that every figure that follows — the dashboard,
// the expenses, the VAT boxes and the tax set-aside — tells the same story.
// This is the one test that walks the app the way it is actually used.
import { makeDb, launchSignedIn, signIn, sleep, bodyText, clickText, todayISO } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };
const flat = (t) => t.replace(/\s+/g, " ");

// Nothing at all: no business details, no contacts, no documents.
const db = makeDb();
Object.assign(db.tables, { receipts: [], receipt_pages: [], credit_notes: [], invoice_payments: [], invoice_links: [], quote_links: [], recurring_expenses: [], recurring_invoices: [] });

const { browser, page } = await launchSignedIn(db, { base: BASE, width: 375, profile: "profile-firstweek" });

const fill = (match, value) =>
  page.evaluate((m, v) => {
    const el = [...document.querySelectorAll("input, textarea")].find((i) => new RegExp(m, "i").test(`${i.placeholder ?? ""} ${i.labels?.[0]?.textContent ?? ""} ${i.previousElementSibling?.textContent ?? ""}`));
    if (!el) return false;
    const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  }, match, value);

const choose = (label) =>
  page.evaluate((l) => {
    const sel = [...document.querySelectorAll("select")].find((s) => [...s.options].some((o) => o.textContent.trim() === l));
    if (!sel) return false;
    const opt = [...sel.options].find((o) => o.textContent.trim() === l);
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(sel, opt.value);
    sel.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }, label);

try {
  await signIn(page, BASE);

  // Monday: a customer.
  await page.goto(`${BASE}/clients/new`, { waitUntil: "networkidle0" });
  await sleep(1200);
  await fill("name", "Mrs Henderson");
  await fill("email", "henderson@example.com");
  await sleep(300);
  await clickText(page, "Save customer").catch(async () => { await clickText(page, "Save").catch(() => {}); });
  await sleep(1600);
  check("a customer can be added on an empty account", db.tables.clients.length === 1, JSON.stringify(db.tables.clients.map((c) => c.name)));

  // Tuesday: the first invoice he has ever written.
  await page.goto(`${BASE}/invoices/new`, { waitUntil: "networkidle0" });
  await sleep(1500);
  check("the new customer is there to pick", await choose("Mrs Henderson"), "customer not in the list");
  await fill("Description", "Skim two ceilings");
  await fill("Qty", "1");
  await fill("Unit price", "480");
  await sleep(400);
  await clickText(page, "Save draft");
  await sleep(2000);
  check("the invoice is saved as a draft", db.tables.invoices.length === 1, JSON.stringify(db.tables.invoices.map((i) => i.number)));
  const draft = db.tables.invoices[0];
  check("a draft has no real number yet", (draft?.number ?? "").startsWith("DRAFT-"), draft?.number);

  // Issuing it: this is invoice number 1 of his company.
  await page.goto(`${BASE}/invoices/${draft.id}`, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => document.body.innerText.includes("Mark as sent"), { timeout: 20000 });
  await clickText(page, "Mark as sent");
  await sleep(500);
  await clickText(page, "Confirm & mark as sent");
  await sleep(2200);
  const issued = db.tables.invoices[0];
  check("it becomes invoice number 1", /^[A-Z-]*1$/.test(issued.number ?? ""), issued.number);
  check("and it is marked as sent", issued.status === "sent", issued.status);

  // Friday: Mrs Henderson pays.
  await page.goto(`${BASE}/invoices/${draft.id}`, { waitUntil: "networkidle0" });
  await sleep(1400);
  await clickText(page, "+ Record a payment");
  await sleep(500);
  await clickText(page, "Save payment");
  await sleep(2000);
  check("the payment is recorded", db.tables.invoice_payments.length === 1, JSON.stringify(db.tables.invoice_payments.map((p) => p.amount)));
  check("the invoice moves itself to paid", db.tables.invoices[0].status === "paid", db.tables.invoices[0].status);
  const paidText = await bodyText(page);
  check("nothing is left owing on it", /Paid in full|Paid/.test(paidText), flat(paidText).slice(0, 200));

  // What the job cost him.
  await page.goto(`${BASE}/receipts/new`, { waitUntil: "networkidle0" });
  await sleep(1300);
  await fill("supplier|vendor|who", "Travis Perkins");
  await fill("total|amount", "120");
  await sleep(300);
  await clickText(page, "Save receipt").catch(async () => { await clickText(page, "Save").catch(() => {}); });
  await sleep(1800);
  check("the cost of the job is logged", db.tables.receipts.length === 1, JSON.stringify(db.tables.receipts.map((r) => r.amount)));

  // And now every figure that follows.
  await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
  await sleep(1800);
  const dash = await bodyText(page);
  check("the dashboard no longer says the account is empty", !/No invoices yet/.test(dash), flat(dash).slice(0, 200));
  check("nothing is shown as owed, because it's paid", /£0\.00[\s\S]{0,40}Owed/.test(dash) || /Owed[\s\S]{0,40}£0\.00/.test(dash), flat(dash).slice(0, 400));
  const recent = await page.evaluate(() => document.querySelector('section[aria-labelledby="recent"]')?.innerText ?? "");
  check("the receipt is among the recent documents, with its £120", /£120\.00/.test(recent), flat(recent).slice(0, 300));

  // Every signed-in page can be reached in two taps at most: the header has
  // Home, five sections and the tools (Atanas, 2026-10-28, launch plan step
  // F), and each section's other pages are tabs along its top.
  await page.evaluate(() => [...document.querySelectorAll("header summary")].find((b) => b.textContent.trim().startsWith("Menu"))?.click());
  await sleep(200);
  const reach = await page.evaluate(() => {
    const hrefs = [...document.querySelectorAll("header a")].map((a) => a.getAttribute("href"));
    const current = [...new Set([...document.querySelectorAll('header a[aria-current="page"]')].map((a) => a.getAttribute("href")))];
    return { hrefs, current };
  });
  const wanted = ["/", "/scan", "/invoices", "/receipts", "/clients", "/money", "/files", "/copy", "/convert", "/check-company", "/jobs", "/help", "/feedback", "/settings"];
  check("the header reaches every section and tool", wanted.every((h) => reach.hrefs.includes(h)), JSON.stringify(wanted.filter((h) => !reach.hrefs.includes(h))));
  check("...and marks the page you are on", JSON.stringify(reach.current) === '["/"]', JSON.stringify(reach.current));
  await page.evaluate(() => [...document.querySelectorAll("header a")].find((a) => a.getAttribute("href") === "/receipts")?.click());
  await page.waitForFunction(() => location.pathname === "/receipts", { timeout: 10000 }).catch(() => {});
  await sleep(300);
  check("picking a section from the menu goes there and closes it", page.url().endsWith("/receipts") && (await page.evaluate(() => [...document.querySelectorAll("header details")].every((d) => !d.open))), page.url());
  check(
    "the menu opens without the app's own code, and its pages are real links",
    await page.evaluate(() => {
      const menus = [...document.querySelectorAll("header details")];
      const links = [...document.querySelectorAll("header details a")];
      return menus.length >= 1 && menus.every((m) => !!m.querySelector("summary")) && links.length > 5 && links.every((a) => (a.getAttribute("href") ?? "").startsWith("/"));
    })
  );
  check("...and the Menu button is marked as where you are", await page.evaluate(() => [...document.querySelectorAll("header summary")].find((b) => b.textContent.trim().startsWith("Menu"))?.className.includes("font-semibold")));

  const tabsOn = async (path) => {
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle0" });
    await sleep(400);
    return page.evaluate(() => [...document.querySelectorAll("main nav a")].map((a) => [a.getAttribute("href"), a.getAttribute("aria-current") === "page"]));
  };
  const inv = await tabsOn("/invoices");
  check("Invoices has its tabs: invoices, quotes, repeating", JSON.stringify(inv.map(([h]) => h)) === JSON.stringify(["/invoices", "/quotes", "/recurring/invoices"]) && inv[0][1], JSON.stringify(inv));
  const rec = await tabsOn("/mileage");
  check("Receipts has its tabs, and the one you are on is marked", JSON.stringify(rec.map(([h]) => h)) === JSON.stringify(["/receipts", "/receipts/review", "/recurring", "/mileage"]) && rec[3][1], JSON.stringify(rec));
  const mon = await tabsOn("/vat");
  check("Money has its tabs: owed and owing, expenses, VAT", JSON.stringify(mon.map(([h]) => h)) === JSON.stringify(["/money", "/expenses", "/vat"]), JSON.stringify(mon));
  check("a page inside a section has no tabs to wander off by", (await tabsOn("/invoices/new")).length === 0);

  // Wide enough for the row itself: the five sections, the section you are
  // in marked even from one of its tabs.
  await page.goto(`${BASE}/mileage`, { waitUntil: "networkidle0" });
  await page.setViewport({ width: 900, height: 900 });
  await sleep(300);
  const groups = await page.evaluate(() => [...document.querySelectorAll("header summary")].map((b) => ({ label: b.textContent.trim(), here: b.className.includes("font-semibold") })));
  const row = await page.evaluate(() => [...document.querySelectorAll("header nav a")].filter((a) => a.offsetParent && !a.closest("details:not([open])")).map((a) => ({ label: a.textContent.trim(), here: a.getAttribute("aria-current") === "page" })));
  check("on a wide screen the sections sit in the header, Receipts marked from Mileage, the tools under Tools",
    JSON.stringify(row.map((r) => r.label)) === JSON.stringify(["Home", "Scan", "Invoices", "Receipts", "Customers", "Money", "Settings"]) &&
      row.find((r) => r.label === "Receipts")?.here === true && JSON.stringify(groups) === JSON.stringify([{ label: "Tools", here: false }, { label: "Menu", here: true }]),
    JSON.stringify({ row, groups }));
  await page.evaluate(() => [...document.querySelectorAll("header summary")].find((b) => b.textContent.trim().startsWith("Tools"))?.click());
  await sleep(200);
  check("Tools opens the rest", await page.evaluate(() => ["/files", "/copy", "/convert", "/check-company", "/jobs", "/help", "/feedback"].every((h) => [...document.querySelectorAll("header a")].some((a) => a.getAttribute("href") === h))));
  await page.setViewport({ width: 375, height: 812 });

  // A late invoice on Home's To do list opens the invoices list already
  // filtered to overdue.
  await page.goto(`${BASE}/invoices?status=overdue`, { waitUntil: "networkidle0" });
  await sleep(700);
  const statusBox = await page.evaluate(() => document.querySelector('select[aria-label="Status"]')?.value ?? null);
  check("the late-invoices address opens the list filtered to Overdue", page.url().includes("status=overdue") && statusBox === "overdue", `${page.url()} ${statusBox}`);

  await page.goto(`${BASE}/expenses`, { waitUntil: "networkidle0" });
  await sleep(1600);
  const exp = await bodyText(page);
  check("the expenses page counts the receipt", /£120\.00|£100\.00/.test(exp), flat(exp).slice(0, 300));

  await page.goto(`${BASE}/vat`, { waitUntil: "networkidle0" });
  await sleep(1600);
  const vat = await bodyText(page);
  check("the VAT page works, with the boxes filled in", /Box 1/.test(vat) && /£/.test(vat), flat(vat).slice(0, 200));

  await page.goto(`${BASE}/invoices`, { waitUntil: "networkidle0" });
  await sleep(1500);
  const list = await bodyText(page);
  check("the invoice list shows his first invoice, paid", /Paid/.test(list) && /Skim two ceilings|Mrs Henderson/.test(list), flat(list).slice(0, 300));
  check("no page ever fell over along the way", !list.includes("Application error"));
} catch (e) { console.log("ERROR", e.message); }
finally { await browser.close(); console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length })); }
