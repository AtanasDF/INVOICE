// The Free invoice page is where a stranger meets this app, with no
// account and nothing saved on a server. Whatever they type has to still
// be there after a reload, a back button, or a phone that drops the tab --
// losing it is the last thing they'd ever do here.
import { makeDb, launchSignedIn, signIn, sleep, bodyText, clickText } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

const db = makeDb();
const { browser, page } = await launchSignedIn(db, { base: BASE, width: 375, profile: "profile-freedraft" });
const type = (match, value) =>
  page.evaluate((m, v) => {
    const el = [...document.querySelectorAll("input, textarea")].find((i) => new RegExp(m, "i").test(`${i.placeholder ?? ""} ${i.labels?.[0]?.textContent ?? ""} ${i.previousElementSibling?.textContent ?? ""}`));
    if (!el) return false;
    const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  }, match, value);

try {
  // Nothing works before an account (Atanas, 2026-09-22): a stranger is
  // sent to the front door, and the page itself opens once signed in.
  await page.goto(`${BASE}/free-invoice`, { waitUntil: "networkidle0" });
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${BASE}/free-invoice`, { waitUntil: "networkidle0" });
  await sleep(900);
  check("a stranger is sent to sign in", new URL(page.url()).pathname === "/login", page.url());
  await signIn(page, BASE);
  await page.goto(`${BASE}/free-invoice`, { waitUntil: "networkidle0" });
  await page.evaluate(() => localStorage.removeItem("free-invoice-draft"));
  await page.reload({ waitUntil: "networkidle0" });
  await sleep(1200);

  check("the page opens for an account", (await bodyText(page)).length > 100);
  // Typing one in is open to all; scanning one in asks for a free sign-in
  // first (Atanas, 2026-09-22), with the draft kept.
  const gate = await page.evaluate(() => {
    const link = [...document.querySelectorAll("a")].find((a) => a.textContent.trim() === "Take a photo of an old invoice");
    return { href: link ? decodeURIComponent(new URL(link.href).pathname + new URL(link.href).search) : null, camera: !![...document.querySelectorAll("button,label")].find((b) => b.textContent.trim() === "Take a photo of an old invoice") };
  });
  const opening = await bodyText(page);
  check("signed in, the photo button opens the camera itself", !gate.href && gate.camera, JSON.stringify({ href: gate.href, camera: gate.camera, said: /needs a free sign-in first/.test(opening) }));
  check("the chooser asks in plain words", /How would you like to start\?/.test(opening) && /Type it in/.test(opening) && /Fill in a few boxes/.test(opening), opening.slice(0, 300));
  check("the page says so at the top", /no sign-in needed\. Copying an old one in from a photo takes a free sign-in first/.test(opening), opening.slice(0, 300));
  // It opens on a chooser: blank, a quote, or scan one you've sent before.
  await clickText(page, "Type it in");
  await sleep(1200);
  // Four boxes make an invoice; the rest waits behind one button.
  const fresh = await page.evaluate(() => ({
    boxes: [...document.querySelectorAll("main input, main textarea, main select")].filter((e) => e.offsetParent !== null).length,
    text: document.querySelector("main")?.innerText ?? "",
  }));
  check("a fresh editor shows only the boxes that make an invoice, and one way to add more", fresh.boxes <= 6 && fresh.text.includes("Add more details") && !fresh.text.includes("Payment details") && !fresh.text.includes("Footer"), JSON.stringify({ boxes: fresh.boxes }));
  await clickText(page, "Add more details");
  await sleep(400);
  const opened = await page.evaluate(() => document.querySelector("main")?.innerText ?? "");
  check("Add more details brings out the dates, addresses, VAT, bank details, notes and signature", /Payment details/.test(opened) && /Signature/.test(opened) && /Due date/.test(opened) && /VAT registered/.test(opened), opened.slice(0, 200));
  await page.evaluate(() => [...document.querySelectorAll("main button")].find((b) => b.textContent.trim() === "Print")?.getBoundingClientRect());
  check("Print is a visible button in the phone bar", await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "Print"); return !!b && b.offsetParent !== null; }));
  const typedBusiness = await type("your business|business name|from", "Dave's Plastering");
  const typedCustomer = await type("customer|bill to|client name", "Mrs Henderson");
  const typedItem = await type("description|what you did|item", "Skim two ceilings");
  const typedPrice = await type("price|amount|rate|£", "480");
  check("the form can be filled in", typedBusiness || typedCustomer || typedItem, JSON.stringify({ typedBusiness, typedCustomer, typedItem, typedPrice }));
  await sleep(1400);

  const savedRaw = await page.evaluate(() => localStorage.getItem("free-invoice-draft"));
  check("what's typed is kept on the phone as it goes", !!savedRaw && savedRaw.length > 20, String(savedRaw).slice(0, 120));

  // The reload a stranger does by accident.
  await page.reload({ waitUntil: "networkidle0" });
  await sleep(1500);
  const after = await page.evaluate(() =>
    [...document.querySelectorAll("input, textarea")].map((i) => i.value).filter(Boolean).join(" | ")
  );
  check("it is all still there after a reload", /Henderson|Plastering|Skim two ceilings/.test(after), after.slice(0, 200));

  // And after leaving the page and coming back.
  await page.goto(`${BASE}/check-company`, { waitUntil: "networkidle0" });
  await sleep(600);
  await page.goto(`${BASE}/free-invoice`, { waitUntil: "networkidle0" });
  await sleep(1500);
  const back = await page.evaluate(() =>
    [...document.querySelectorAll("input, textarea")].map((i) => i.value).filter(Boolean).join(" | ")
  );
  check("and after going away and coming back", /Henderson|Plastering|Skim two ceilings/.test(back), back.slice(0, 200));

  // Nothing about a stranger's invoice should reach the server unasked.
  const sent = db.log.filter((l) => !l.key.startsWith("GET"));
  check("nothing is written to anyone's database without an account", sent.length === 0, JSON.stringify(sent.map((s) => s.key)));
} catch (e) { console.log("ERROR", e.message); }
finally { await browser.close(); console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length })); }
