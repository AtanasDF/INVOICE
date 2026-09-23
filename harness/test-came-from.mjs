// Which flyer brought them (Atanas, 2026-09-23: "we can do the different code
// too"). A QR code per depot costs nothing and is the only way he learns which
// depot worked -- without it he prints five hundred flyers and finds out
// nothing. The tag is kept on the device, because someone arrives from a
// flyer and makes an account minutes or days later, long after the address has
// lost its query string.
import { makeDb, launchSignedIn, sleep, UID } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

const db = makeDb();
Object.assign(db.tables, { receipts: [], recurring_expenses: [], invoice_payments: [] });
db.tables.business_profile.push({ user_id: UID, business_name: "Nasko Plastering", vat_registered: false, invoice_prefix: "INV-", invoice_next_number: 1 });

const { browser, page } = await launchSignedIn(db, { base: BASE, width: 390, profile: "profile-came-from" });
const stored = () => page.evaluate(() => localStorage.getItem("came-from"));
const clear = () => page.evaluate(() => localStorage.clear());

try {
  await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
  await clear();

  await page.goto(`${BASE}/?from=carlisle-dhl`, { waitUntil: "networkidle0" });
  await sleep(600);
  check("a flyer's tag is kept when they arrive", (await stored()) === "carlisle-dhl", String(await stored()));

  // The first flyer is the one that worked; a later code is someone already here.
  await page.goto(`${BASE}/?from=london-street`, { waitUntil: "networkidle0" });
  await sleep(600);
  check("a later code does not overwrite the one that brought them", (await stored()) === "carlisle-dhl", String(await stored()));

  // It has to survive the wander between arriving and signing up.
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
  await sleep(500);
  check("it survives moving around the site", (await stored()) === "carlisle-dhl", String(await stored()));

  // Somebody playing with the address bar gets nothing stored.
  await clear();
  await page.goto(`${BASE}/?from=${encodeURIComponent('<script>alert(1)</script>')}`, { waitUntil: "networkidle0" });
  await sleep(500);
  const messy = await stored();
  check("a tag full of rubbish is cleaned to something harmless or dropped", messy === null || /^[a-z0-9-]+$/.test(messy), String(messy));
  check("...and nothing resembling a script survives", !/[<>()/]/.test(messy ?? ""), String(messy));

  await clear();
  await page.goto(`${BASE}/?from=${"x".repeat(200)}`, { waitUntil: "networkidle0" });
  await sleep(500);
  check("an absurdly long tag is cut short rather than stored whole", ((await stored()) ?? "").length <= 40, String((await stored()) ?? "").length);

  await clear();
  await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
  await sleep(500);
  check("arriving with no flyer stores nothing at all", (await stored()) === null, String(await stored()));

  // What the account actually carries: the tag rides on sign-up itself, so
  // there is no table to add and nothing personal is kept.
  await page.goto(`${BASE}/?from=carlisle-amazon`, { waitUntil: "networkidle0" });
  await sleep(600);
  const sent = await page.evaluate(async () => {
    const seen = [];
    const realFetch = window.fetch;
    window.fetch = async (...args) => {
      const [url, init] = args;
      if (String(url).includes("/auth/v1/signup")) seen.push(init?.body ? JSON.parse(init.body) : null);
      return realFetch(...args);
    };
    document.querySelector('[role="tab"]:nth-of-type(2)')?.click();
    await new Promise((r) => setTimeout(r, 300));
    const set = (sel, v) => {
      const el = document.querySelector(sel);
      if (!el) return;
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(el, v);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    };
    set('input[name="email"]', "driver@example.com");
    set('input[name="password"]', "hunter22");
    set('input[name="again"]', "hunter22");
    document.querySelector("main form")?.requestSubmit();
    await new Promise((r) => setTimeout(r, 800));
    window.fetch = realFetch;
    return seen;
  });
  const body = sent[0];
  check("making an account carries the flyer with it", body?.data?.came_from === "carlisle-amazon", JSON.stringify(sent).slice(0, 300));
  check("...and carries nothing else about them", body ? Object.keys(body.data ?? {}).join() === "came_from" : false, JSON.stringify(body?.data));
} catch (e) {
  console.log("ERROR", e.message);
  results.push(false);
} finally {
  await browser.close();
  console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
}
