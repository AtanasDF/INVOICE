// Settings' account section, trading vs registered name, the one Add
// button, and the camera asking once. Mocked database, no real camera:
// getUserMedia is a canvas stream and the permission state is faked.
import fs from "fs";
import { makeDb, launchSignedIn, signIn, sleep, bodyText, shot, newId, handle, SUPA } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3308";
const DL = new URL("./downloads/", import.meta.url).pathname;
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };
const today = new Date().toISOString().slice(0, 10);

const db = makeDb();
Object.assign(db.tables, { receipts: [], recurring_expenses: [], recurring_invoices: [], credit_notes: [], invoice_payments: [], invoice_links: [], quote_links: [], invoice_reminders_sent: [], receipt_pages: [] });
const CLIENT = newId();
db.tables.clients.push({ id: CLIENT, user_id: "x", name: "Big Co Ltd", email: "pay@bigco.example", address: "2 Client Road\nLeeds\nLS1 2AB", kind: "client", archived: false, is_company: true, reminders_enabled: true, vat_number: "", payment_terms: "14 days", phone: "" });
const INV = newId();
db.tables.invoices.push({ id: INV, user_id: "x", client_id: CLIENT, date: today, number: "INV-000123", items: [{ description: "Plastering", quantity: 1, unitPrice: 500, vatRate: "zero" }], notes: "", due_date: today, payment_terms: "14 days", status: "sent", tags: [], vat_registered: false, cis_rate: null });
db.tables.invoice_links.push({ invoice_id: INV, user_id: "x", token: "a".repeat(43), created_at: today, first_viewed_at: null, last_viewed_at: null, view_count: 0 });
db.tables.business_profile.push({
  user_id: "x",
  business_name: "Nasko Plastering",
  registered_name: "NP Trading Ltd",
  company_number: "12345678",
  account_kind: "limited",
  address: "1 Test Street\nBristol\nBS1 4DJ",
  vat_number: "",
  vat_registered: false,
  bank_details: "Sort 12-34-56 Acc 12345678",
  custom_categories: [],
  invoice_prefix: "INV-",
  invoice_next_number: 124,
});

const setField = (page, selector, value, index = 0) =>
  page.evaluate((sel, v, i) => {
    const el = document.querySelectorAll(sel)[i];
    if (!el) throw new Error("no field " + sel + " #" + i);
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, selector, value, index);
const click = (page, text) => page.evaluate((t) => {
  const b = [...document.querySelectorAll("button,a,label")].find((x) => x.textContent.trim() === t && !x.disabled);
  if (!b) throw new Error("no button: " + t);
  b.click();
}, text);
// A choice in the sheet carries its hint in the same element, so it is
// clicked by its first line.
const pick = (page, label) => page.evaluate((t) => {
  const a = [...document.querySelectorAll('[role="dialog"] a')].find((x) => x.innerText.split("\n")[0].trim() === t);
  if (!a) throw new Error("no choice: " + t);
  a.click();
}, label);
const fits = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const addressLabel = (page) => page.evaluate(() => [...document.querySelectorAll("span,label,legend")].map((e) => e.textContent.trim()).find((t) => /^(Business|Your) address \(optional\)$/.test(t)) ?? "");
// The camera never opens for real here: a canvas stream stands in for it,
// and the permission state is whatever each test says it is.
const fakeCamera = (page, state) =>
  page.evaluateOnNewDocument((s) => {
    // Counted in sessionStorage so the tally survives a page load: the
    // question is how often the app asks across screens, not per page.
    const bump = (k) => sessionStorage.setItem(k, String(Number(sessionStorage.getItem(k) ?? 0) + 1));
    navigator.permissions.query = async (d) => {
      if (d?.name !== "camera") return { state: "prompt", onchange: null };
      bump("perm");
      return { state: s, onchange: null };
    };
    navigator.mediaDevices.getUserMedia = async () => {
      bump("gum");
      if (s === "denied") throw Object.assign(new Error("denied"), { name: "NotAllowedError" });
      const c = document.createElement("canvas");
      c.width = 1280;
      c.height = 720;
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#888";
      ctx.fillRect(0, 0, 1280, 720);
      setInterval(() => ctx.fillRect(0, 0, 1280, 720), 100);
      return c.captureStream(10);
    };
  }, state);
const asks = (page) => page.evaluate(() => ({ gum: Number(sessionStorage.getItem("gum") ?? 0), perm: Number(sessionStorage.getItem("perm") ?? 0) }));

const { browser, page } = await launchSignedIn(db, { base: BASE, profile: "profile-settings-add" });
try {
  const cdp = await page.createCDPSession();
  await cdp.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: DL });
  await signIn(page, BASE);

  // ── Account section ───────────────────────────────────────────────
  await page.goto(BASE + "/settings", { waitUntil: "networkidle0" });
  await sleep(600);
  let text = await bodyText(page);
  check("settings: the signed-in email is shown", text.includes("harness@example.com"), text.slice(0, 300));
  check("settings: says where the data lives", /Supabase|EU \(Ireland\)/.test(text) && text.includes("expire after seven days"));
  check("settings: no delete button, says how to ask instead", !/delete (my )?account/i.test(text) && text.includes("no delete button"));
  const accountButtons = await page.evaluate(() => [...document.querySelectorAll("button")].map((b) => b.textContent.trim()));
  check("settings: sign out, sign-in link and export are all there",
    accountButtons.includes("Sign out") && accountButtons.includes("Email me a sign-in link") && accountButtons.includes("Download all my data"),
    JSON.stringify(accountButtons.slice(0, 8)));
  check("settings: fits 375px", await fits(page));
  await shot(page, "settings-account");

  for (const f of fs.readdirSync(DL).filter((f) => f.endsWith(".json"))) fs.unlinkSync(DL + f);
  await click(page, "Download all my data");
  let dump = null;
  for (let i = 0; i < 40 && !dump; i++) { await sleep(250); dump = fs.readdirSync(DL).find((f) => f.startsWith("my-data-export-")); }
  const dumped = dump ? JSON.parse(fs.readFileSync(DL + dump, "utf8")) : null;
  check("export downloads everything as one JSON file",
    !!dumped && dumped.businessProfile.registeredName === "NP Trading Ltd" && Array.isArray(dumped.invoices) && dumped.invoices.length === 1,
    dump ?? "no file");

  // ── Names kept apart ──────────────────────────────────────────────
  const names = await page.evaluate(() => {
    const combos = [...document.querySelectorAll('input[role="combobox"], input')].filter((i) => i.type === "text" || !i.type);
    return { first: combos[0]?.value ?? "", labels: [...document.querySelectorAll("label")].map((l) => l.textContent.trim()) };
  });
  check("settings: trading name first, registered name and number of their own",
    names.first === "Nasko Plastering" && names.labels.includes("Business name") && names.labels.includes("Registered company name") && names.labels.includes("Company number"),
    JSON.stringify(names).slice(0, 300));

  const numberSel = 'input[placeholder="e.g. 12345678"]';
  await setField(page, numberSel, "87654321");
  await click(page, "Save");
  await sleep(600);
  // The mock's upsert appends rather than merging; every later read uses
  // maybeSingle, so the row it wrote becomes the only one.
  const savedRow = db.tables.business_profile.at(-1);
  db.tables.business_profile = [savedRow];
  check("registered name, number and account kind save",
    savedRow.company_number === "87654321" && savedRow.registered_name === "NP Trading Ltd" && savedRow.account_kind === "limited" && savedRow.business_name === "Nasko Plastering",
    JSON.stringify(savedRow).slice(0, 200));
  check("saved cleanly, no migration warning", (await bodyText(page)).includes("Saved.") && !(await bodyText(page)).includes("migration-029"));

  // ── The address label follows what the account is for ─────────────
  check("limited: business address", (await addressLabel(page)).startsWith("Business address"), await addressLabel(page));
  await page.evaluate(() => [...document.querySelectorAll('input[name="account-kind"]')][2].click());
  await sleep(300);
  const personal = await page.evaluate(() => ({ label: [...document.querySelectorAll("label")].map((l) => l.textContent.trim()), body: document.body.innerText }));
  check("personal use: the name field is 'Your name' and the address is yours",
    personal.label.includes("Your name") && (await addressLabel(page)).startsWith("Your address"),
    JSON.stringify((await addressLabel(page))));
  check("personal use: registered details stay visible once filled in", personal.label.includes("Registered company name"));
  await page.evaluate(() => [...document.querySelectorAll('input[name="account-kind"]')][1].click());
  await sleep(200);
  check("sole trader: business address again", (await addressLabel(page)).startsWith("Business address"), await addressLabel(page));

  // ── Printed on the invoice and on the PDF ─────────────────────────
  await page.goto(`${BASE}/invoices/${INV}`, { waitUntil: "networkidle0" });
  await sleep(900);
  text = await bodyText(page);
  check("invoice: trading name is the headline", text.includes("Nasko Plastering"));
  check("invoice: registered name and number in the footer", text.includes("Registered name: NP Trading Ltd. Company number: 87654321."), text.slice(-300));
  const onSheet = await page.evaluate(() =>
    [...document.querySelectorAll("div")].filter((d) => d.style.width === "794px").map((d) => d.innerText).join("\n"));
  check("PDF sheet carries the same footer", onSheet.includes("Registered name: NP Trading Ltd. Company number: 87654321."), onSheet.slice(-200));
  for (const f of fs.readdirSync(DL).filter((f) => f.endsWith(".pdf"))) fs.unlinkSync(DL + f);
  await click(page, "Download PDF");
  let pdf = null;
  for (let i = 0; i < 80 && !pdf; i++) { await sleep(250); pdf = fs.readdirSync(DL).find((f) => f.endsWith(".pdf")); }
  check("the PDF still builds from that sheet", !!pdf && fs.readFileSync(DL + pdf).subarray(0, 5).toString() === "%PDF-", pdf ?? "no file");
  await shot(page, "settings-invoice-footer");

  // ── One Add button ────────────────────────────────────────────────
  await page.goto(BASE + "/", { waitUntil: "networkidle0" });
  await sleep(700);
  check("dashboard: one Add button, not a stack of them", (await bodyText(page)).includes("+ Add") && !(await bodyText(page)).includes("+ Add a receipt manually"));
  await click(page, "+ Add");
  await sleep(300);
  const sheet = await page.evaluate(() => {
    const d = document.querySelector('[role="dialog"]');
    return { text: d?.innerText ?? "", links: [...(d?.querySelectorAll("a") ?? [])].map((a) => `${a.innerText.split("\n")[0]}|${new URL(a.href).pathname}${new URL(a.href).search}`) };
  });
  check("the sheet says the scanner works the type out", /receipt, a supplier invoice or a credit note/.test(sheet.text), sheet.text.slice(0, 200));
  check("the sheet offers scan, upload, receipt, invoice and quote",
    sheet.links.some((l) => l.startsWith("Scan it|/scan")) &&
    sheet.text.includes("Upload a photo or PDF") &&
    sheet.links.some((l) => l === "Add a receipt by hand|/receipts/new") &&
    sheet.links.some((l) => l === "Write an invoice|/invoices/new") &&
    sheet.links.some((l) => l === "Write a quote|/quotes/new"),
    JSON.stringify(sheet.links));
  check("the sheet fits 375px", await fits(page));
  await shot(page, "settings-add-sheet");
  await pick(page, "Write an invoice");
  await page.waitForFunction(() => location.pathname === "/invoices/new", { timeout: 20000 }).catch(() => {});
  check("picking one goes straight there", page.url().endsWith("/invoices/new"), page.url());

  // A list page's own way in joins the same sheet, never twice.
  await page.goto(BASE + "/invoices", { waitUntil: "networkidle0" });
  await sleep(700);
  await click(page, "+ Add");
  await sleep(300);
  const invoicesSheet = await page.evaluate(() => [...document.querySelectorAll('[role="dialog"] a')].map((a) => `${a.innerText.split("\n")[0]}|${new URL(a.href).pathname}${new URL(a.href).search}`));
  check("invoices list: its own scan is in the sheet, nothing listed twice",
    invoicesSheet.some((l) => l.endsWith("|/invoices/new?scan=1")) &&
    invoicesSheet.filter((l) => l.endsWith("|/invoices/new")).length === 1,
    JSON.stringify(invoicesSheet));

  await browser.close();

  // ── The camera asks once ──────────────────────────────────────────
  // Already allowed: the scanner opens without a second prompt.
  {
    const { browser: b2, page: p2 } = await launchSignedIn(db, { base: BASE, profile: "profile-settings-add" });
    await p2.setUserAgent(IPHONE);
    await fakeCamera(p2, "granted");
    await signIn(p2, BASE);
    await p2.goto(BASE + "/scan", { waitUntil: "networkidle0" });
    await p2.waitForFunction(() => document.querySelector("video")?.srcObject != null, { timeout: 20000 }).catch(() => {});
    await sleep(1200);
    const first = await p2.evaluate(() => ({ live: document.querySelector("video")?.srcObject != null, body: document.body.innerText }));
    const firstAsks = await asks(p2);
    check("granted: the scanner opens, after checking the permission first", first.live && firstAsks.perm >= 1 && firstAsks.gum >= 1 && !/Camera access was denied/.test(first.body), JSON.stringify({ ...firstAsks, live: first.live }));
    check("granted: no 'asked every time' tip", !first.body.includes("Asked for the camera every time?"), first.body.slice(0, 200));
    await p2.goto(BASE + "/", { waitUntil: "networkidle0" });
    await sleep(400);
    await click(p2, "+ Add");
    await sleep(600);
    const afterAsks = await asks(p2);
    const dialog2 = await p2.evaluate(() => document.querySelector('[role="dialog"]').innerText);
    check("granted: another screen reads the answer instead of asking again", afterAsks.gum === firstAsks.gum && afterAsks.perm > firstAsks.perm && !dialog2.includes("camera is blocked"), JSON.stringify({ firstAsks, afterAsks }));
    await b2.close();
  }

  // Refused: the iPhone instructions, and nothing asks again.
  {
    const { browser: b3, page: p3 } = await launchSignedIn(db, { base: BASE, profile: "profile-settings-add-denied" });
    await p3.setUserAgent(IPHONE);
    await fakeCamera(p3, "denied");
    await signIn(p3, BASE);
    await p3.goto(BASE + "/scan", { waitUntil: "networkidle0" });
    await sleep(1500);
    const denied = { ...(await asks(p3)), body: await p3.evaluate(() => document.body.innerText) };
    check("denied: says so instead of a black screen, and never re-asks", denied.body.includes("Camera access was denied") && denied.gum === 0, JSON.stringify(denied).slice(0, 300));
    check("denied: the iPhone instructions are right there", denied.body.includes("iPhone Settings → Safari") && denied.body.includes("Camera → Allow"), denied.body.slice(0, 300));
    check("denied: offers the iPhone camera, which needs no permission", denied.body.includes("Use the iPhone camera instead"), denied.body.slice(0, 300));
    await shot(p3, "settings-camera-denied");
    await p3.goto(BASE + "/", { waitUntil: "networkidle0" });
    await sleep(500);
    await click(p3, "+ Add");
    await sleep(500);
    const dialog = await p3.evaluate(() => document.querySelector('[role="dialog"]').innerText);
    check("denied: the Add sheet warns before you tap Scan", /camera is blocked/.test(dialog) && dialog.includes("iPhone Settings → Safari"), dialog.slice(0, 300));
    await b3.close();
  }

  // ── A database without migration-029 ──────────────────────────────
  {
    const old = makeDb();
    Object.assign(old.tables, { receipts: [], recurring_expenses: [], recurring_invoices: [], credit_notes: [], invoice_payments: [], invoice_links: [], quote_links: [], receipt_pages: [] });
    old.tables.business_profile.push({ user_id: "x", business_name: "Nasko Plastering", address: "1 Test Street", vat_number: "", vat_registered: false, custom_categories: [], invoice_prefix: "INV-", invoice_next_number: 1 });
    let refused = 0;
    const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "*", "Access-Control-Expose-Headers": "*" };
    const { browser: b4, page: p4 } = await launchSignedIn(old, {
      base: BASE,
      profile: "profile-settings-add-old",
      // PostgREST refuses the whole write when a column it doesn't know
      // about is in the body -- exactly what today's database would do.
      intercept: (req, u) => {
        if (u.origin !== SUPA || !u.pathname.startsWith("/rest/v1/business_profile") || req.method() === "GET" || req.method() === "OPTIONS") return false;
        const body = req.postData() ? JSON.parse(req.postData()) : null;
        if (body && "registered_name" in body) {
          refused++;
          req.respond({ status: 400, headers: { ...cors, "content-type": "application/json" }, body: JSON.stringify({ code: "PGRST204", message: "Could not find the 'registered_name' column of 'business_profile' in the schema cache" }) });
          return true;
        }
        const r = handle(old, req.method(), u.pathname, u.search, req.headers(), body);
        req.respond({ status: r.status, headers: { ...cors, "content-type": "application/json" }, body: r.json === null ? "" : JSON.stringify(r.json) });
        return true;
      },
    });
    await signIn(p4, BASE);
    await p4.goto(BASE + "/settings", { waitUntil: "networkidle0" });
    await sleep(700);
    const oldText = await bodyText(p4);
    check("columns absent: settings still loads as before", oldText.includes("Your business") && oldText.includes("harness@example.com") && !oldText.includes("Registered company name"), oldText.slice(0, 200));
    check("columns absent: the address label is the one he has today", (await addressLabel(p4)).startsWith("Business address"), await addressLabel(p4));
    await setField(p4, 'input[placeholder="Account name, sort code, account number / IBAN, etc."]', "Sort 00-00-00", 0).catch(() => {});
    await p4.evaluate(() => { const t = document.querySelector("textarea"); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(t, "1 New Street"); t.dispatchEvent(new Event("input", { bubbles: true })); }).catch(() => {});
    await click(p4, "Save");
    await sleep(700);
    const savedOld = old.tables.business_profile.at(-1);
    old.tables.business_profile = [savedOld];
    check("columns absent: the rest of the profile still saves", refused === 1 && savedOld.business_name === "Nasko Plastering" && !("registered_name" in savedOld), `${refused} ${JSON.stringify(savedOld).slice(0, 150)}`);
    check("columns absent: it says what didn't save", (await bodyText(p4)).includes("migration-029"), (await bodyText(p4)).slice(0, 200));
    await p4.goto(`${BASE}/invoices`, { waitUntil: "networkidle0" });
    await sleep(600);
    check("columns absent: the invoices list is unchanged", (await bodyText(p4)).includes("Invoices"));
    check("columns absent: fits 375px", await fits(p4));
    await shot(p4, "settings-no-migration");
    await b4.close();
  }
} catch (e) {
  console.log("ERROR", e.message);
  await shot(page, "settings-add-error").catch(() => {});
  await browser.close().catch(() => {});
}
console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
