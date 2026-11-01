// Settings after Atanas's voice notes (2026-09-22): one VAT switch, a
// one-line numbering card, categories that follow the kind of account,
// neutral colours, arrows a thumb can hit, and a Save bar that stays in
// view and asks before the page is left with unsaved changes.
//
// Since launch step H (2026-11-01) Settings is a short landing page and four
// pages -- Business, Invoices and payments, Receipts and expenses, Account --
// each with its own Save bar. The profile is still one row, so the new risk
// is one page's Save undoing another's: checked at the end.
import { makeDb, launchSignedIn, signIn, sleep, bodyText, shot } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

const db = makeDb();
Object.assign(db.tables, { receipts: [], recurring_expenses: [], recurring_invoices: [], credit_notes: [], invoice_payments: [], invoice_links: [], quote_links: [], invoice_reminders_sent: [], receipt_pages: [] });
db.tables.business_profile.push({
  user_id: "x", business_name: "Nasko Plastering", registered_name: "", company_number: "", account_kind: "limited",
  address: "1 Test Street\nBristol\nBS1 4DJ", vat_number: "GB123456789", vat_registered: false, bank_details: "",
  custom_categories: [], invoice_prefix: "INV-", invoice_next_number: 124,
});
const lastProfile = () => { const row = db.tables.business_profile.at(-1); db.tables.business_profile = [row]; return row; };

const { browser, page } = await launchSignedIn(db, { base: BASE, profile: "profile-settings-save" });
const click = (text) => page.evaluate((t) => {
  const b = [...document.querySelectorAll("button,a")].find((x) => x.textContent.trim() === t && !x.disabled);
  if (!b) throw new Error("no button: " + t);
  b.click();
}, text);
const setField = (selector, value) => page.evaluate((sel, v) => {
  const el = document.querySelector(sel);
  if (!el) throw new Error("no field " + sel);
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, v);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}, selector, value);
const categoryList = () => page.evaluate(() => [...document.querySelectorAll('input[aria-label^="Category "]')].map((i) => i.value));
const barText = () => page.evaluate(() => document.querySelector(".sticky")?.innerText.replace(/\s+/g, " ").trim() ?? "");
const saveVisible = () => page.evaluate(() => {
  const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "Save");
  const r = b?.getBoundingClientRect();
  return !!r && r.top >= 0 && r.bottom <= window.innerHeight;
});

const menuLink = async (label) => {
  await page.evaluate(() => [...document.querySelectorAll("header summary")].find((b) => b.textContent.trim().startsWith("Menu"))?.click());
  await sleep(250);
  const ok = await page.evaluate((l) => {
    const a = [...document.querySelectorAll("header a")].find((x) => x.textContent.trim() === l);
    a?.click();
    return !!a;
  }, label);
  if (!ok) throw new Error("no link in the menu: " + label);
};
const go = async (path) => {
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle0" });
  await sleep(600);
};
try {
  await signIn(page, BASE);

  // ── The landing page ─────────────────────────────────────────────
  await go("/settings");
  let text = await bodyText(page);
  const sections = await page.evaluate(() => [...document.querySelectorAll("main a[href^='/settings/']")].map((a) => a.getAttribute("href")));
  check("Settings lists four sections, business first and account last", JSON.stringify(sections) === '["/settings/business","/settings/invoices","/settings/expenses","/settings/account"]', JSON.stringify(sections));
  check("each says what is inside", ["Your name, address", "Invoice numbers, bank details", "Expense categories and the address", "Sign-in, colours and dark mode"].every((t) => text.includes(t)), text.slice(0, 600));
  check("the landing page is one short screen", await page.evaluate(() => document.documentElement.scrollHeight <= 844), await page.evaluate(() => document.documentElement.scrollHeight));
  check("the landing page fits 375px", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));

  // ── Business: order and words ────────────────────────────────────
  await go("/settings/business");
  text = await bodyText(page);
  check("business: name, then VAT", text.indexOf("Business name") >= 0 && text.indexOf("Business name") < text.indexOf("\nVAT\n"), text.slice(0, 400));
  check("business has none of the other pages' cards", !/\nInvoice numbering\n|\nExpense categories\n|\nNotifications\n|\nEmail import\n/.test(text));
  check("the stale logo sentence is gone", !text.includes("logo can go here"));
  check("business address is not called optional for a company", /Business address\n/.test(text) && !text.includes("Business address (optional)"));
  const vat = await page.evaluate(() => [...document.querySelectorAll('input[name="vat"]')].map((r) => `${r.closest("label").textContent.trim()}:${r.checked}`));
  check("VAT is one switch of two real radios, off", JSON.stringify(vat) === '["Without VAT:true","With VAT:false"]', JSON.stringify(vat));
  check("the VAT number box is greyed out while VAT is off, its value kept", await page.$eval("#vat-number", (e) => e.disabled && e.value === "GB123456789"));
  check("no essay on the VAT card", !text.includes("deregistering"));
  check("a way back to Settings", await page.evaluate(() => [...document.querySelectorAll("main a")].some((a) => a.getAttribute("href") === "/settings" && a.textContent.includes("Settings"))));

  // ── Colours ──────────────────────────────────────────────────────
  // Tailwind 4 answers in lab(); older builds in rgb(). Grey is no hue either way.
  const grey = (c) => {
    const lab = /lab\(([\d.]+) (-?[\d.e-]+) (-?[\d.e-]+)/.exec(c);
    if (lab) return Math.abs(Number(lab[2])) < 3 && Math.abs(Number(lab[3])) < 3;
    const m = /rgb\((\d+), (\d+), (\d+)\)/.exec(c);
    return !!m && Math.abs(m[1] - m[2]) < 12 && Math.abs(m[2] - m[3]) < 12;
  };
  const accents = await page.evaluate(() => [...new Set([...document.querySelectorAll('input[type="radio"],input[type="checkbox"]')].map((r) => getComputedStyle(r).accentColor))]);
  check("ticks and radios are dark grey, not blue", accents.every((a) => grey(a)), JSON.stringify(accents));

  // ── Personal use, from the Business page ─────────────────────────
  await page.evaluate(() => [...document.querySelectorAll('input[name="account-kind"]')][2].click());
  await sleep(200);
  const personalText = await bodyText(page);
  check("personal use: no VAT card, and 'About you'", !/\nVAT\n/.test(personalText) && personalText.includes("About you"), personalText.slice(0, 400));
  check("the bar says the change is unsaved", (await barText()).includes("Unsaved changes."), await barText());
  await click("Save");
  await sleep(800);
  check("saved: personal use, nothing else moved", lastProfile().account_kind === "personal" && lastProfile().invoice_prefix === "INV-" && lastProfile().vat_number === "GB123456789", JSON.stringify(lastProfile()));
  await go("/settings/expenses");
  let cats = await categoryList();
  check("an untouched list follows the kind: the personal one", cats.includes("Groceries") && cats.includes("Childcare") && !cats.includes("Subcontractors"), JSON.stringify(cats));
  await go("/settings");
  check("personal use: the landing page leaves out Invoices and payments", !(await page.evaluate(() => [...document.querySelectorAll("main a")].some((a) => a.getAttribute("href") === "/settings/invoices"))));
  await go("/settings/business");
  await page.evaluate(() => [...document.querySelectorAll('input[name="account-kind"]')][0].click());
  await sleep(200);
  await click("Save");
  await sleep(800);
  check("back to a company", lastProfile().account_kind === "limited");

  // ── Categories follow the kind ───────────────────────────────────
  await go("/settings/expenses");
  cats = await categoryList();
  check("a company with no list of its own starts on the company list", cats.includes("Salaries & PAYE") && cats.includes("Subcontractors") && cats.at(-1) === "Other", JSON.stringify(cats));
  const styles = await page.evaluate(() => {
    const remove = [...document.querySelectorAll("button")].filter((b) => b.textContent.trim() === "Remove");
    const arrows = [...document.querySelectorAll('button[aria-label^="Move "]')];
    return {
      removeColours: [...new Set(remove.map((b) => getComputedStyle(b).color))],
      arrowHeights: [...new Set(arrows.map((a) => Math.round(a.getBoundingClientRect().height)))],
    };
  });
  check("Remove is grey, not red", styles.removeColours.length === 1 && grey(styles.removeColours[0]), JSON.stringify(styles.removeColours));
  check("reorder arrows are at least 32px tall", styles.arrowHeights.length && styles.arrowHeights.every((h) => h >= 32), JSON.stringify(styles.arrowHeights));
  // A saved starting list (every Save used to write one) follows the kind too.
  lastProfile().custom_categories = ["Materials & stock", "Subcontractors", "Staff wages", "Fuel", "Mileage", "Travel & hotels", "Meals when away", "Rent & rates", "Gas & Electric", "Repairs", "Phone & internet", "Office & stationery", "Software & subscriptions", "Advertising", "Bank charges & interest", "Accountant & legal", "Insurance", "Tools & equipment", "Training", "Other"];
  lastProfile().account_kind = "sole_trader";
  await go("/settings/business");
  await page.evaluate(() => [...document.querySelectorAll('input[name="account-kind"]')][0].click());
  await sleep(200);
  await click("Save");
  await sleep(800);
  check("a saved, untouched sole-trader list becomes the company list when the kind changes", lastProfile().account_kind === "limited" && lastProfile().custom_categories?.includes("Salaries & PAYE"), JSON.stringify(lastProfile().custom_categories));
  await go("/settings/expenses");
  await setField('input[aria-label="Category 1"]', "Bricks & mortar");
  await click("Save");
  await sleep(800);
  lastProfile().custom_categories = lastProfile().custom_categories.filter((c) => c !== "Salaries & PAYE");
  await go("/settings/business");
  await page.evaluate(() => [...document.querySelectorAll('input[name="account-kind"]')][1].click());
  await sleep(200);
  await click("Save");
  await sleep(800);
  await page.evaluate(() => [...document.querySelectorAll('input[name="account-kind"]')][0].click());
  await sleep(200);
  await click("Save");
  await sleep(800);
  await go("/settings/expenses");
  cats = await categoryList();
  text = await bodyText(page);
  check("an edited list is kept when the kind changes", cats[0] === "Bricks & mortar" && !cats.includes("Salaries & PAYE"), JSON.stringify(cats.slice(0, 3)));
  check("...and the kind's extras are offered, not forced", /The limited-company list also has: .*Salaries & PAYE/.test(text) && text.includes("Add them"), text.slice(text.indexOf("list also has"), text.indexOf("list also has") + 200));
  await click("Add them");
  await sleep(200);
  cats = await categoryList();
  check("Add them adds what's missing, keeps the edit, Other stays last", cats[0] === "Bricks & mortar" && cats.includes("Salaries & PAYE") && cats.at(-1) === "Other" && cats.filter((c) => c === "Other").length === 1, JSON.stringify(cats));
  check("nothing more to offer once added", !(await bodyText(page)).includes("list also has"));
  // It asks first, naming the categories that go (notes/audit-components.md,
  // section 4): one press used to replace the list, and the next Save kept it.
  let resetAsked = "";
  page.once("dialog", (d) => { resetAsked = d.message(); d.accept().catch(() => {}); });
  await click("Reset to defaults");
  await sleep(200);
  check("Reset to defaults asks first, naming what goes", resetAsked.includes("Bricks & mortar"), resetAsked);
  cats = await categoryList();
  check("Reset to defaults gives the kind's list", cats[0] === "Materials & stock" && cats.includes("Salaries & PAYE") && !cats.includes("Bricks & mortar"), JSON.stringify(cats.slice(0, 3)));
  await click("Save");
  await sleep(800);
  check("saved: the kind's categories", lastProfile().custom_categories?.[0] === "Materials & stock" && lastProfile().custom_categories.includes("Salaries & PAYE"), JSON.stringify(lastProfile().custom_categories?.slice(0, 3)));

  // ── Invoices and payments: the Save bar ──────────────────────────
  await go("/settings/invoices");
  text = await bodyText(page);
  check("numbering is one line", text.includes("The next invoice will be INV-124.") && !text.includes("no way to override"), text.slice(text.indexOf("Invoice numbering"), text.indexOf("Invoice numbering") + 160));
  const order = ["Invoice numbering", "Bank details", "Payment reminders"];
  const positions = order.map((h) => text.indexOf(`\n${h}\n`));
  check("numbering, bank details, reminders, in that order", positions.every((p, i) => p >= 0 && (i === 0 || p > positions[i - 1])), JSON.stringify(positions));
  check("nothing unsaved on arrival", !(await barText()).includes("Unsaved"), await barText());
  await setField("#invoice-prefix", "HP-");
  await sleep(150);
  check("the numbering line follows the prefix as typed", (await bodyText(page)).includes("The next invoice will be HP-124."));
  check("the Save button is in view while the page is scrolled to the top", await saveVisible());
  check("the bar says the changes are unsaved", (await barText()).includes("Unsaved changes."), await barText());
  await shot(page, "settings-save-bar");
  // On a phone the header's pages are behind one Menu button; the guard
  // holds a tap on any link, in the menu as anywhere else.
  await menuLink("Invoices");
  await sleep(400);
  check("a tap on a link is held, with the choices", page.url().includes("/settings/invoices") && /Save and go/.test(await barText()) && /Leave without saving/.test(await barText()), `${page.url()} ${await barText()}`);
  await click("Stay");
  await page.keyboard.press("Escape");
  await sleep(200);
  check("Stay puts the bar back", (await barText()).includes("Unsaved changes.") && !(await barText()).includes("Save and go"));
  await click("Save");
  await sleep(800);
  let saved = lastProfile();
  check("saved: the prefix, and the other pages' fields as they were", saved.invoice_prefix === "HP-" && saved.account_kind === "limited" && saved.vat_registered === false && saved.business_name === "Nasko Plastering" && saved.custom_categories?.[0] === "Materials & stock", JSON.stringify({ p: saved.invoice_prefix, k: saved.account_kind, v: saved.vat_registered, n: saved.business_name }));
  check("the bar says Saved and nothing is unsaved", (await barText()).includes("Saved.") && !(await barText()).includes("Unsaved"), await barText());

  await setField("#invoice-prefix", "XX-");
  await sleep(150);
  await menuLink("Invoices");
  await sleep(300);
  await click("Leave without saving");
  await page.waitForFunction(() => location.pathname === "/invoices", { timeout: 10000 }).catch(() => {});
  check("Leave without saving goes where the tap was going", page.url().endsWith("/invoices"), page.url());
  check("...and saved nothing", lastProfile().invoice_prefix === "HP-", lastProfile().invoice_prefix);

  await go("/settings/invoices");
  await setField("#invoice-prefix", "ZZ-");
  await sleep(150);
  await menuLink("Invoices");
  await sleep(300);
  await click("Save and go");
  await page.waitForFunction(() => location.pathname === "/invoices", { timeout: 10000 }).catch(() => {});
  check("Save and go saves, then goes", page.url().endsWith("/invoices") && lastProfile().invoice_prefix === "ZZ-", `${page.url()} ${lastProfile().invoice_prefix}`);

  // The browser's Back, the way back to Settings, and Sign out.
  await go("/settings/invoices");
  await setField("#invoice-prefix", "BK-");
  await sleep(200);
  await page.goBack({ waitUntil: "networkidle0" }).catch(() => {});
  await sleep(500);
  check("the browser's Back with unsaved changes is held on this page", page.url().includes("/settings/invoices") && /Save and go/.test(await barText()), `${page.url()} ${await barText()}`);
  await click("Leave without saving");
  await page.waitForFunction(() => location.pathname === "/invoices", { timeout: 10000 }).catch(() => {});
  check("Leave without saving then goes back where Back was going", page.url().endsWith("/invoices"), page.url());
  check("...and saved nothing", lastProfile().invoice_prefix === "ZZ-", lastProfile().invoice_prefix);

  await go("/settings/invoices");
  await setField("#invoice-prefix", "SP-");
  await sleep(200);
  await page.evaluate(() => [...document.querySelectorAll("main a")].find((a) => a.getAttribute("href") === "/settings")?.click());
  await sleep(400);
  check("the way back to Settings is held too, since it leaves this page", page.url().includes("/settings/invoices") && /Save and go/.test(await barText()), `${page.url()} ${await barText()}`);
  await click("Stay");
  await sleep(200);
  await click("Sign out");
  await sleep(400);
  check("Sign out with unsaved changes is held like a link", page.url().includes("/settings/invoices") && /Save and go/.test(await barText()), `${page.url()} ${await barText()}`);
  await click("Stay");
  await page.keyboard.press("Escape");
  await sleep(200);

  // ── One page's Save never undoes another's ───────────────────────
  await go("/settings/business");
  lastProfile().invoice_prefix = "OT-";
  lastProfile().bank_details = "Sort code 00-00-00";
  await setField("#business-name", "Nasko Plastering Ltd");
  await sleep(150);
  await click("Save");
  await sleep(800);
  saved = lastProfile();
  check("a Business save keeps a prefix and bank details saved elsewhere since it opened", saved.business_name === "Nasko Plastering Ltd" && saved.invoice_prefix === "OT-" && saved.bank_details === "Sort code 00-00-00", JSON.stringify({ n: saved.business_name, p: saved.invoice_prefix, b: saved.bank_details }));

  for (const path of ["/settings/business", "/settings/invoices", "/settings/expenses", "/settings/account"]) {
    await go(path);
    check(`${path} fits 375px`, await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  }

  // ── Receipts and expenses: an empty list, and focus ──────────────
  await go("/settings/expenses");
  for (let i = 0; i < 40; i++) {
    const left = await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "Remove"); b?.click(); return !!b; });
    if (!left) break;
    await sleep(30);
  }
  await sleep(300);
  await click("Save");
  await sleep(500);
  check("an empty category list is refused in words, not saved as 'no list'", /Add at least one category before saving/.test(await barText()) && lastProfile().custom_categories?.length > 0, await barText());

  await page.reload({ waitUntil: "networkidle0" });
  await sleep(600);
  await page.evaluate(() => [...document.querySelectorAll('button[aria-label^="Move "]')].find((b) => b.getAttribute("aria-label") === "Move Fuel up").click());
  await sleep(200);
  check("after moving a category, focus follows it", await page.evaluate(() => document.activeElement?.getAttribute("aria-label") === "Move Fuel up"), await page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.tagName));
  await page.evaluate(() => [...document.querySelectorAll('button[aria-label^="Move "]')].find((b) => b.getAttribute("aria-label") === "Move Subcontractors up").click());
  await sleep(200);
  check("moved to the top, focus lands on its other arrow", await page.evaluate(() => document.activeElement?.getAttribute("aria-label") === "Move Subcontractors down"), await page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.tagName));
} catch (e) {
  console.log("ERROR", e.message);
  results.push(false);
  await shot(page, "settings-save-error");
} finally {
  await browser.close();
  console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
}
