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
  // Scanning one in asks for a free sign-in first (Atanas, 2026-09-22), with
  // the draft kept. Typing one in WAS open to all, and this comment said so
  // for three days after it stopped being true: "nothing should work before
  // the user register" closed the whole page, and queue item 29 settled the
  // "free invoice template UK" question with a public article (/how-to-invoice,
  // which is in the gate's public list) rather than by reopening this one.
  // The page went on saying "no sign-in needed" throughout, because this suite
  // signs in before reading it and so never met the gate. The stranger check
  // at the foot of this file exists so the words and the gate cannot part
  // company again.
  const gate = await page.evaluate(() => {
    const link = [...document.querySelectorAll("a")].find((a) => a.textContent.trim() === "Take a photo of an old invoice");
    return { href: link ? decodeURIComponent(new URL(link.href).pathname + new URL(link.href).search) : null, camera: !![...document.querySelectorAll("button,label")].find((b) => b.textContent.trim() === "Take a photo of an old invoice") };
  });
  const opening = await bodyText(page);
  check("signed in, the photo button opens the camera itself", !gate.href && gate.camera, JSON.stringify({ href: gate.href, camera: gate.camera, said: /needs a free sign-in first/.test(opening) }));
  check("the chooser asks in plain words", /How would you like to start\?/.test(opening) && /Type it in/.test(opening) && /Fill in a few boxes/.test(opening), opening.slice(0, 300));
  // Pinned on what the page DOES, not on a sentence: it photographs an old
  // invoice, it builds one, and the three things you can do with the result.
  check("the page says at the top what it is for",
    /Photograph one you.{0,3}ve sent before/.test(opening) && /keep it in your invoices/.test(opening), opening.slice(0, 300));
  // Whatever it says, it must not claim to need no account while the gate
  // sends every stranger to /login. That claim was live for three days.
  check("it does not claim to work without an account", !/no sign-in needed/i.test(opening), opening.slice(0, 300));
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

  // Queue item 7: the dashboard's "Create an invoice" lands a SIGNED-IN person
  // on this page, and an invoice printed or sent but never recorded is outside
  // the accounting record -- nothing chases it, and it counts towards neither
  // the VAT return nor the tax card. Saving into their records used to sit
  // fifth, worded "Keep a copy in the app", as though it were an extra.
  await page.goto(`${BASE}/free-invoice`, { waitUntil: "networkidle0" });
  await sleep(1200);
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => /Type it in/i.test(b.textContent))?.click());
  await sleep(1200);
  const acts = await page.evaluate(() => [...document.querySelectorAll("button")].map((b) => (b.textContent || "").trim()).filter(Boolean));
  const saveIdx = acts.findIndex((a) => /Save to my invoices/i.test(a));
  const sendIdx = acts.findIndex((a) => /Send or share/i.test(a));
  check("signed in, saving into their own records is offered", saveIdx >= 0, JSON.stringify(acts.slice(0, 10)));
  check("...before sending or sharing it", saveIdx >= 0 && sendIdx >= 0 && saveIdx < sendIdx, JSON.stringify({ saveIdx, sendIdx }));
  check("...and not worded as an optional extra", !acts.some((a) => /Keep a copy in the app/i.test(a)), JSON.stringify(acts.slice(0, 10)));

  // ---- What a STRANGER gets -------------------------------------------
  // Everything above signs in first, which is exactly why nobody noticed the
  // page telling people it needed no account: this suite had never once
  // arrived without one. A fresh browser, no session.
  // A second BROWSER, not a second tab: pages in one browser share the
  // origin's localStorage, so a new tab here is still signed in. The first
  // version of this check did exactly that and reported the gate open.
  const { browser: strangerBrowser, page: plain } = await launchSignedIn(db, { base: BASE, width: 390, profile: "profile-free-draft-stranger" });
  try {
    await plain.goto(`${BASE}/free-invoice`, { waitUntil: "networkidle0" });
    await sleep(2500);
    const landed = new URL(plain.url()).pathname;
    // Either answer is defensible and Atanas has decided it twice; what is not
    // defensible is the page's words disagreeing with whichever it is. The
    // gate closes it today, so the page must not offer itself to strangers.
    check("a stranger is sent to sign in, as the gate intends", landed === "/login", landed);
    await plain.goto(`${BASE}/how-to-invoice`, { waitUntil: "networkidle0" });
    await sleep(2000);
    // The public article is what queue item 29 chose INSTEAD of reopening this
    // page. If it ever stops being public, nothing a stranger can read is left.
    check("and the public article a stranger can read is still public", new URL(plain.url()).pathname === "/how-to-invoice", new URL(plain.url()).pathname);
  } finally {
    await strangerBrowser.close();
  }

} catch (e) { console.log("ERROR", e.message); }
finally { await browser.close(); console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length })); }
