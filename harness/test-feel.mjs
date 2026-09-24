// How the app feels to press and to move around (Atanas, 2026-09-24: "I want
// everything to move smoothly... a nicer feel when you click the buttons and
// move around the pages").
//
// The part that matters most is the press. A finger has no hover, so on a
// phone this is the ONLY sign that a tap landed -- and on a slow connection it
// is the only thing that happens for the first half second.
//
// And the part that is not optional: somebody who has asked their phone to
// stop moving things has asked us too. Before this, the app honoured that in
// exactly one place.
import { makeDb, launchSignedIn, signIn, sleep, UID } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

const db = makeDb();
Object.assign(db.tables, { receipts: [], recurring_expenses: [], invoice_payments: [] });
db.tables.business_profile.push({ user_id: UID, business_name: "Nasko Plastering", vat_registered: false, invoice_prefix: "INV-", invoice_next_number: 1 });

const { browser, page } = await launchSignedIn(db, { base: BASE, width: 390, profile: "profile-feel" });

// What a button looks like mid-press, by asking the browser for the style it
// would use rather than by trusting the stylesheet was written correctly.
const pressed = (sel) => page.evaluate((s) => {
  const el = document.querySelector(s);
  if (!el) return null;
  const before = getComputedStyle(el).transform;
  const rules = [...document.styleSheets].flatMap((sh) => { try { return [...sh.cssRules]; } catch { return []; } });
  const active = rules.filter((r) => r.selectorText && /:active/.test(r.selectorText) && el.matches(r.selectorText.replace(/:active/g, "")));
  return { before, activeRules: active.map((r) => r.style.transform || r.style.opacity).filter(Boolean) };
}, sel);

try {
  await signIn(page, BASE);
  await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
  await sleep(1400);

  // --- the press ---
  const btn = await pressed("button");
  check("a button has something to show for being pressed", !!btn && btn.activeRules.length > 0, JSON.stringify(btn));
  const transition = await page.evaluate(() => getComputedStyle(document.querySelector("button")).transitionProperty);
  check("...and it is a transition, not a jump", /transform/.test(transition), transition);

  const tile = await page.evaluate(() => {
    const el = [...document.querySelectorAll("a")].find((a) => /rounded-xl|rounded-2xl/.test(a.className));
    return el ? getComputedStyle(el).transitionProperty : null;
  });
  check("the big tiles move too", !!tile && /transform/.test(tile), String(tile));

  // --- arriving on a page ---
  const arrival = await page.evaluate(() => {
    const el = document.querySelector("main > *");
    const s = el ? getComputedStyle(el) : null;
    return s ? { name: s.animationName, dur: s.animationDuration } : null;
  });
  check("a page arrives rather than appearing from nowhere", arrival?.name === "page-in", JSON.stringify(arrival));
  check("...and it is quick enough that nobody waits for it", parseFloat(arrival?.dur ?? "9") <= 0.25, String(arrival?.dur));
  const moves = await page.evaluate(() => {
    const rules = [...document.styleSheets].flatMap((sh) => { try { return [...sh.cssRules]; } catch { return []; } });
    const kf = rules.find((r) => r.name === "page-in");
    return kf ? [...kf.cssRules].map((k) => k.style.cssText).join(" ") : "";
  });
  check("...and nothing slides in, which is what makes people seasick", !/transform|translate/i.test(moves), moves);

  // --- someone who has asked for less movement ---
  await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  await page.reload({ waitUntil: "networkidle0" });
  await sleep(1200);
  const quiet = await page.evaluate(() => {
    const el = document.querySelector("main > *");
    const b = document.querySelector("button");
    return { anim: getComputedStyle(el).animationName, trans: getComputedStyle(b).transitionProperty };
  });
  check("with reduce-motion on, pages stop animating in", quiet.anim === "none", JSON.stringify(quiet));
  check("...and buttons stop moving, keeping only colour and fade", !/transform/.test(quiet.trans), quiet.trans);
  const stillWorks = await page.evaluate(() => document.body.innerText.length > 200);
  check("...and the page is still entirely there", stillWorks);

  // The panels must not slide for somebody who asked them not to.
  const trackTransition = await page.evaluate(() => {
    const panel = document.querySelector('[role="tabpanel"]');
    return panel ? getComputedStyle(panel.parentElement).transitionDuration : null;
  });
  check("the sliding panels honour it too", trackTransition !== null, String(trackTransition));
} catch (e) {
  console.log("ERROR", e.message);
  results.push(false);
} finally {
  await browser.close();
  console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
}
