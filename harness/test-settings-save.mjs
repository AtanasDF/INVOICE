// Settings after Atanas's voice notes (2026-09-22): one VAT switch, a
// one-line numbering card, categories that follow the kind of account,
// neutral colours, arrows a thumb can hit, and a Save bar that stays in
// view and asks before the page is left with unsaved changes.
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

try {
  await signIn(page, BASE);
  await page.goto(`${BASE}/settings`, { waitUntil: "networkidle0" });
  await sleep(600);
  let text = await bodyText(page);

  // ── Order and words ──────────────────────────────────────────────
  const order = ["Your business", "VAT", "Invoice numbering", "Bank details", "Expense categories", "Payment reminders", "Notifications", "Email import", "Your account"];
  const positions = order.map((h) => text.indexOf(`\n${h}\n`));
  check("cards run business first and account last", positions.every((p, i) => p >= 0 && (i === 0 || p > positions[i - 1])), JSON.stringify(positions));
  check("numbering is one line", text.includes("The next invoice will be INV-124.") && !text.includes("no way to override"), text.slice(text.indexOf("Invoice numbering"), text.indexOf("Invoice numbering") + 160));
  check("the stale logo sentence is gone", !text.includes("logo can go here"));
  check("business address is not called optional for a company", /Business address\n/.test(text) && !text.includes("Business address (optional)"));
  const vat = await page.evaluate(() => [...document.querySelectorAll('input[name="vat"]')].map((r) => `${r.closest("label").textContent.trim()}:${r.checked}`));
  check("VAT is one switch of two real radios, off", JSON.stringify(vat) === '["Without VAT:true","With VAT:false"]', JSON.stringify(vat));
  check("the VAT number box is greyed out while VAT is off, its value kept", await page.$eval("#vat-number", (e) => e.disabled && e.value === "GB123456789"));
  check("no essay on the VAT card", !text.includes("deregistering"));

  // ── Colours and targets ──────────────────────────────────────────
  const styles = await page.evaluate(() => {
    const remove = [...document.querySelectorAll("button")].filter((b) => b.textContent.trim() === "Remove");
    const arrows = [...document.querySelectorAll('button[aria-label^="Move "]')];
    const radios = [...document.querySelectorAll('input[type="radio"],input[type="checkbox"]')];
    return {
      removeColours: [...new Set(remove.map((b) => getComputedStyle(b).color))],
      arrowHeights: [...new Set(arrows.map((a) => Math.round(a.getBoundingClientRect().height)))],
      accents: [...new Set(radios.map((r) => getComputedStyle(r).accentColor))],
    };
  });
  // Tailwind 4 answers in lab(); older builds in rgb(). Grey is no hue either way.
  const grey = (c) => {
    const lab = /lab\(([\d.]+) (-?[\d.e-]+) (-?[\d.e-]+)/.exec(c);
    if (lab) return Math.abs(Number(lab[2])) < 3 && Math.abs(Number(lab[3])) < 3;
    const m = /rgb\((\d+), (\d+), (\d+)\)/.exec(c);
    return !!m && Math.abs(m[1] - m[2]) < 12 && Math.abs(m[2] - m[3]) < 12;
  };
  check("Remove is grey, not red", styles.removeColours.length === 1 && grey(styles.removeColours[0]), JSON.stringify(styles.removeColours));
  check("reorder arrows are at least 32px tall", styles.arrowHeights.length && styles.arrowHeights.every((h) => h >= 32), JSON.stringify(styles.arrowHeights));
  check("ticks and radios are dark grey, not blue", styles.accents.every((a) => grey(a)), JSON.stringify(styles.accents));

  // ── Categories follow the kind ───────────────────────────────────
  let cats = await categoryList();
  check("a company with no list of its own starts on the company list", cats.includes("Salaries & PAYE") && cats.includes("Subcontractors") && cats.at(-1) === "Other", JSON.stringify(cats));
  await page.evaluate(() => [...document.querySelectorAll('input[name="account-kind"]')][2].click());
  await sleep(200);
  cats = await categoryList();
  check("switching to personal use swaps an untouched list for the personal one", cats.includes("Groceries") && cats.includes("Childcare") && !cats.includes("Subcontractors"), JSON.stringify(cats));
  const personalText = await bodyText(page);
  check("personal use: no VAT, numbering, bank or reminders cards, and 'About you'", !/\nInvoice numbering\n/.test(personalText) && !/\nBank details\n/.test(personalText) && !/\nPayment reminders\n/.test(personalText) && !/\nVAT\n/.test(personalText) && personalText.includes("About you"), personalText.slice(0, 400));
  await page.evaluate(() => [...document.querySelectorAll('input[name="account-kind"]')][1].click());
  await sleep(200);
  cats = await categoryList();
  check("...and to sole trader for the sole-trader one", cats.includes("Materials & stock") && !cats.includes("Salaries & PAYE") && !cats.includes("Childcare"), JSON.stringify(cats));
  await setField('input[aria-label="Category 1"]', "Bricks & mortar");
  await page.evaluate(() => [...document.querySelectorAll('input[name="account-kind"]')][0].click());
  await sleep(200);
  cats = await categoryList();
  text = await bodyText(page);
  check("an edited list is kept when the kind changes", cats[0] === "Bricks & mortar" && !cats.includes("Salaries & PAYE"), JSON.stringify(cats.slice(0, 3)));
  check("...and the kind's extras are offered, not forced", /The limited-company list also has: .*Salaries & PAYE/.test(text) && text.includes("Add them"), text.slice(text.indexOf("list also has"), text.indexOf("list also has") + 200));
  await click("Add them");
  await sleep(200);
  cats = await categoryList();
  check("Add them adds what's missing, keeps the edit, Other stays last", cats[0] === "Bricks & mortar" && cats.includes("Salaries & PAYE") && cats.at(-1) === "Other" && cats.filter((c) => c === "Other").length === 1, JSON.stringify(cats));
  check("nothing more to offer once added", !(await bodyText(page)).includes("list also has"));
  await click("Reset to defaults");
  await sleep(200);
  cats = await categoryList();
  check("Reset to defaults gives the kind's list", cats[0] === "Materials & stock" && cats.includes("Salaries & PAYE") && !cats.includes("Bricks & mortar"), JSON.stringify(cats.slice(0, 3)));

  // ── Save bar ─────────────────────────────────────────────────────
  check("nothing changed overall, so nothing is unsaved", !(await barText()).includes("Unsaved"), await barText());
  await setField("#invoice-prefix", "HP-");
  await sleep(150);
  check("the numbering line follows the prefix as typed", (await bodyText(page)).includes("The next invoice will be HP-124."));
  check("the Save button is in view while the page is scrolled to the top", await saveVisible());
  check("the bar says the changes are unsaved", (await barText()).includes("Unsaved changes."), await barText());
  await shot(page, "settings-save-bar");
  await page.evaluate(() => [...document.querySelectorAll("a")].find((a) => a.textContent.trim() === "Quotes")?.click());
  await sleep(400);
  check("a tap on a link is held, with the choices", page.url().includes("/settings") && /Save and go/.test(await barText()) && /Leave without saving/.test(await barText()), `${page.url()} ${await barText()}`);
  await click("Stay");
  await sleep(200);
  check("Stay puts the bar back", (await barText()).includes("Unsaved changes.") && !(await barText()).includes("Save and go"));

  await page.evaluate(() => [...document.querySelectorAll('input[name="vat"]')][1].click());
  await sleep(200);
  check("With VAT wakes the number box, filled from what was stored", await page.$eval("#vat-number", (e) => !e.disabled && e.value === "GB123456789"));
  await click("Save");
  await sleep(800);
  const saved = lastProfile();
  check("saved: VAT on, the prefix, the kind, the kind's categories", saved.vat_registered === true && saved.invoice_prefix === "HP-" && saved.account_kind === "limited" && Array.isArray(saved.custom_categories) && saved.custom_categories.includes("Salaries & PAYE"), JSON.stringify({ v: saved.vat_registered, p: saved.invoice_prefix, k: saved.account_kind, n: saved.custom_categories?.length }));
  check("the bar says Saved and nothing is unsaved", (await barText()).includes("Saved.") && !(await barText()).includes("Unsaved"), await barText());

  await setField("#invoice-prefix", "XX-");
  await sleep(150);
  await page.evaluate(() => [...document.querySelectorAll("a")].find((a) => a.textContent.trim() === "Quotes")?.click());
  await sleep(300);
  await click("Leave without saving");
  await page.waitForFunction(() => location.pathname === "/quotes", { timeout: 10000 }).catch(() => {});
  check("Leave without saving goes where the tap was going", page.url().endsWith("/quotes"), page.url());
  check("...and saved nothing", lastProfile().invoice_prefix === "HP-", lastProfile().invoice_prefix);

  await page.goto(`${BASE}/settings`, { waitUntil: "networkidle0" });
  await sleep(600);
  await setField("#invoice-prefix", "ZZ-");
  await sleep(150);
  await page.evaluate(() => [...document.querySelectorAll("a")].find((a) => a.textContent.trim() === "Invoices")?.click());
  await sleep(300);
  await click("Save and go");
  await page.waitForFunction(() => location.pathname === "/invoices", { timeout: 10000 }).catch(() => {});
  check("Save and go saves, then goes", page.url().endsWith("/invoices") && lastProfile().invoice_prefix === "ZZ-", `${page.url()} ${lastProfile().invoice_prefix}`);

  // The browser's Back, a link to this very page, Sign out, and an empty list.
  await page.goto(`${BASE}/settings`, { waitUntil: "networkidle0" });
  await sleep(600);
  await setField("#invoice-prefix", "BK-");
  await sleep(200);
  await page.goBack({ waitUntil: "networkidle0" }).catch(() => {});
  await sleep(500);
  check("the browser's Back with unsaved changes is held on this page", page.url().includes("/settings") && /Save and go/.test(await barText()), `${page.url()} ${await barText()}`);
  await click("Leave without saving");
  await page.waitForFunction(() => location.pathname === "/invoices", { timeout: 10000 }).catch(() => {});
  check("Leave without saving then goes back where Back was going", page.url().endsWith("/invoices"), page.url());
  check("...and saved nothing", lastProfile().invoice_prefix === "ZZ-", lastProfile().invoice_prefix);

  await page.goto(`${BASE}/settings`, { waitUntil: "networkidle0" });
  await sleep(600);
  await setField("#invoice-prefix", "SP-");
  await sleep(200);
  await page.evaluate(() => [...document.querySelectorAll("a")].find((a) => a.textContent.trim() === "Settings")?.click());
  await sleep(400);
  check("a link to this same page is not held", !/Save and go/.test(await barText()) && (await page.$eval("#invoice-prefix", (e) => e.value)) === "SP-", await barText());
  await click("Sign out");
  await sleep(400);
  check("Sign out with unsaved changes is held like a link", page.url().includes("/settings") && /Save and go/.test(await barText()), `${page.url()} ${await barText()}`);
  await click("Stay");
  await sleep(200);

  for (let i = 0; i < 40; i++) {
    const left = await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "Remove"); b?.click(); return !!b; });
    if (!left) break;
    await sleep(30);
  }
  await sleep(300);
  await click("Save");
  await sleep(500);
  check("an empty category list is refused in words, not saved as 'no list'", /Add at least one category before saving/.test(await barText()) && lastProfile().invoice_prefix === "ZZ-", await barText());

  await page.reload({ waitUntil: "networkidle0" });
  await sleep(600);
  await page.evaluate(() => [...document.querySelectorAll('button[aria-label^="Move "]')].find((b) => b.getAttribute("aria-label") === "Move Fuel up").click());
  await sleep(200);
  check("after moving a category, focus follows it", await page.evaluate(() => document.activeElement?.getAttribute("aria-label") === "Move Fuel up"), await page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.tagName));
  await page.evaluate(() => [...document.querySelectorAll('button[aria-label^="Move "]')].find((b) => b.getAttribute("aria-label") === "Move Subcontractors up").click());
  await sleep(200);
  check("moved to the top, focus lands on its other arrow", await page.evaluate(() => document.activeElement?.getAttribute("aria-label") === "Move Subcontractors down"), await page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.tagName));
  check("fits 375px", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
} catch (e) {
  console.log("ERROR", e.message);
  results.push(false);
  await shot(page, "settings-save-error");
} finally {
  await browser.close();
  console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
}
