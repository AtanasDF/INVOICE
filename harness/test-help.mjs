// The walkthroughs, and the rules the design note called not optional.
//
// notes/help-chat-design.md: honour reduce-motion, nothing auto-plays,
// every step has its words, lazy-loaded. Each of those is here, because
// each of them is the difference between help and an irritation for exactly
// the person this is for.
//
// The frames are recorded by harness/record-help.mjs against the real app,
// so a button that moves fails that run rather than leaving a help picture
// of a button that is not there. This suite checks the other half: that
// every caption HAS a frame, and that the page works without them.
import { readFileSync, existsSync, statSync } from "node:fs";
import { HELP_JOURNEYS, frameSrc, journey } from "./gen/lib/helpJourneys.js";
import { makeDb, launchSignedIn, signIn, sleep, bodyText } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const PUBLIC = "/Users/nasko/Desktop/INVOICE/web/public";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

check("there are walkthroughs to check", HELP_JOURNEYS.length >= 4, String(HELP_JOURNEYS.length));

// ---- Every caption has a picture, and every picture a caption ---------------
let missing = [], oversize = [], empty = [];
for (const j of HELP_JOURNEYS) {
  check(`${j.id}: has steps and a starting place`, j.steps.length >= 3 && j.start.startsWith("/"), JSON.stringify({ steps: j.steps.length, start: j.start }));
  j.steps.forEach((s, i) => {
    const file = PUBLIC + frameSrc(j.id, i);
    if (!existsSync(file)) return missing.push(frameSrc(j.id, i));
    const kb = statSync(file).size / 1024;
    if (kb > 90) oversize.push(`${frameSrc(j.id, i)} ${Math.round(kb)}KB`);
    if (!s.caption.trim()) empty.push(`${j.id}/${i}`);
  });
}
check("every step has a recorded frame", missing.length === 0, JSON.stringify(missing));
check("and none of them blows the page-weight budget", oversize.length === 0, JSON.stringify(oversize));
check("every step has its words", empty.length === 0, JSON.stringify(empty));

// The whole point of generating them: no two steps may show the same thing.
// A duplicate is a step that taught nothing, and the recorder is the only
// place that can catch it -- so check the recorder still refuses them.
const recorder = readFileSync("/Users/nasko/Desktop/INVOICE/harness/record-help.mjs", "utf8");
check("the recorder refuses two identical frames", /identical to/.test(recorder) && /createHash/.test(recorder));
check("and refuses a caption with nothing to ring", /nothing to ring for/.test(recorder));
check("and never deletes a frame it did not write", /\^\\\\d\\\\d\\\\.webp\$/.test(recorder) || /\\d\\d\\.webp/.test(recorder));

// Captions say what a step is FOR. "Click the button" is the failure mode.
const clicky = HELP_JOURNEYS.flatMap((j) => j.steps.map((s) => s.caption)).filter((c) => /^(click|tap|press) /i.test(c.trim()));
check("no step is just 'click the button'", clicky.length === 0, JSON.stringify(clicky));
const tooLong = HELP_JOURNEYS.flatMap((j) => j.steps.map((s) => s.caption)).filter((c) => c.split(/\s+/).length > 28);
check("and none of them is a paragraph", tooLong.length === 0, JSON.stringify(tooLong));

check("an unknown walkthrough is simply not one", journey("nope") === null);

// ---- The page itself --------------------------------------------------------
const db = makeDb();
Object.assign(db.tables, { receipts: [], receipt_pages: [], credit_notes: [], invoice_payments: [], invoice_links: [], quote_links: [], recurring_expenses: [], recurring_invoices: [], quotes: [] });
db.tables.business_profile.push({ user_id: "x", business_name: "Harness Ltd", vat_registered: true, invoice_prefix: "INV-", invoice_next_number: 10, custom_categories: null });

const { browser, page } = await launchSignedIn(db, { base: BASE, width: 390, profile: "profile-help" });
try {
  await signIn(page, BASE);
  await page.goto(`${BASE}/help`, { waitUntil: "networkidle0" });
  await sleep(900);
  const list = await bodyText(page);
  check("the page opens with the list, not an empty box", HELP_JOURNEYS.every((j) => list.includes(j.title)), list.slice(0, 200));
  // His instinct, and the right one: a box asks you to know the question
  // already; a list lets you recognise it.
  check("nothing is playing before anybody asked", !/Stop/.test(list));

  // Open one and step it.
  const opened = await page.evaluate((title) => {
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim().startsWith(title));
    b?.click();
    return !!b;
  }, HELP_JOURNEYS[0].title);
  check("a walkthrough opens", opened === true);
  await sleep(700);
  const inside = await bodyText(page);
  check("every one of its steps is written out", HELP_JOURNEYS[0].steps.every((s) => inside.includes(s.caption)), inside.slice(0, 200));
  check("it offers to play, back, next and do it now", /Play it through/.test(inside) && /Next/.test(inside) && /Do it now/.test(inside));

  // The words are the walkthrough. With the pictures gone it still works.
  const worksWithoutPictures = await page.evaluate(() => {
    const img = document.querySelector("section img");
    if (img) img.dispatchEvent(new Event("error"));
    return document.body.innerText.length;
  });
  await sleep(400);
  const stillThere = await bodyText(page);
  check("and it still works with the pictures gone", HELP_JOURNEYS[0].steps.every((s) => stillThere.includes(s.caption)), String(worksWithoutPictures));

  // Lazy: not a byte until the help is opened.
  const lazy = await page.evaluate(() => [...document.querySelectorAll("section img")].every((i) => i.getAttribute("loading") === "lazy"));
  check("the frames are lazy-loaded", lazy);

  // Stepping is announced, for somebody driving it by keyboard.
  const announced = await page.evaluate(() => !!document.querySelector('[role="status"]')?.textContent?.includes("Step 1 of"));
  check("which step you are on is read out", announced);

  // ---- reduce motion ---------------------------------------------------------
  await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  await page.goto(`${BASE}/help`, { waitUntil: "networkidle0" });
  await sleep(700);
  await page.evaluate((title) => [...document.querySelectorAll("button")].find((x) => x.textContent.trim().startsWith(title))?.click(), HELP_JOURNEYS[0].title);
  await sleep(700);
  const reduced = await bodyText(page);
  check("somebody who asked for less movement is not offered a player", !/Play it through/.test(reduced), reduced.slice(0, 200));
  check("but still gets every step, and can step them", HELP_JOURNEYS[0].steps.every((s) => reduced.includes(s.caption)) && /Next/.test(reduced));
} catch (e) { console.log("ERROR", e.message); results.push(false); }
finally { await browser.close(); console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length })); }
