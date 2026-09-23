// Colour, and a theme people can choose (Atanas, 2026-09-23: "we need to make
// the app a bit more colourful... options to change the themes"). The app has
// over 1,300 `neutral-*` classes and not one of them was edited: the scale
// itself is what changes, so what this suite really checks is that ordinary
// classes follow a theme, that the choice survives a reload without a flash of
// grey, and that a printed invoice ignores the whole thing.
import { makeDb, launchSignedIn, signIn, sleep, bodyText, UID } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

const db = makeDb();
db.tables.business_profile.push({ user_id: UID, business_name: "Nasko Plastering", vat_registered: false, invoice_prefix: "INV-", invoice_next_number: 1 });
const { browser, page } = await launchSignedIn(db, { base: BASE, width: 420, profile: "profile-theme" });

// What an ordinary class resolves to right now.
const probe = () =>
  page.evaluate(() => {
    const el = document.createElement("div");
    el.className = "bg-neutral-900 text-neutral-600 border-neutral-200";
    document.body.appendChild(el);
    const c = getComputedStyle(el);
    const out = { bg: c.backgroundColor, text: c.color, border: c.borderTopColor, body: getComputedStyle(document.body).backgroundColor };
    el.remove();
    return out;
  });

// The default is now "follow my phone", so every check below would otherwise
// depend on what the browser running it happens to prefer. Pinned to light,
// and the dark half is tested by pinning it the other way.
const prefers = (value) => page.emulateMediaFeatures([{ name: "prefers-color-scheme", value }]);

try {
  await prefers("light");
  await signIn(page, BASE);
  await page.goto(`${BASE}/settings`, { waitUntil: "networkidle0" });
  await sleep(900);

  const text = await bodyText(page);
  check("Settings offers the colours in plain words", text.includes("How it looks") && text.includes("Pick a colour"), text.slice(0, 200));
  const names = await page.evaluate(() => [...document.querySelectorAll('[role="radio"]')].map((b) => b.textContent.trim().split("\n")[0]));
  check("the phone's own setting is offered first, then the colours", names.length === 7 && names[0].startsWith("Follow my phone") && names[1].startsWith("Grey"), JSON.stringify(names));

  const grey = await probe();
  check("grey is the plain one, and carries no attribute", grey.bg === "rgb(23, 23, 23)" && (await page.evaluate(() => !document.documentElement.hasAttribute("data-theme"))), JSON.stringify(grey));

  // Pick green.
  await page.evaluate(() => [...document.querySelectorAll('[role="radio"]')].find((b) => b.textContent.includes("Green"))?.click());
  await sleep(400);
  const forest = await probe();
  check("picking a colour changes ordinary classes, not just new ones", forest.bg !== grey.bg && forest.text !== grey.text && forest.border !== grey.border, JSON.stringify({ grey, forest }));
  check("...and the page surface follows too", forest.body !== grey.body, JSON.stringify({ g: grey.body, f: forest.body }));
  check("the picker says which one is on", await page.evaluate(() => [...document.querySelectorAll('[role="radio"]')].filter((b) => b.getAttribute("aria-checked") === "true").length === 1));

  // It has to survive a reload, and arrive already coloured.
  await page.reload({ waitUntil: "networkidle0" });
  await sleep(600);
  const afterReload = await probe();
  check("the choice survives a reload", afterReload.bg === forest.bg, JSON.stringify({ forest: forest.bg, afterReload: afterReload.bg }));
  const attrBeforeHydration = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
  check("...and is on the document before React runs, so there is no flash of grey", attrBeforeHydration === "forest", String(attrBeforeHydration));

  // The front door is where a flyer lands, and a stranger has no account to
  // carry a setting: the colour is the device's, so it must apply there too.
  await page.evaluate(() => { try { localStorage.removeItem("sb-auth"); } catch {} });
  await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
  await sleep(500);
  check("the colour applies on the front door as well", (await page.evaluate(() => document.documentElement.getAttribute("data-theme"))) === "forest");

  // A document is a document.
  await page.emulateMediaType("print");
  await sleep(200);
  const printed = await probe();
  await page.emulateMediaType("screen");
  check("an invoice prints in plain ink whatever the colour", printed.bg === "rgb(23, 23, 23)", JSON.stringify(printed));

  // Back to the picker: the front door has no radios on it, and the checks
  // below need one to press.
  await signIn(page, BASE);
  await page.goto(`${BASE}/settings`, { waitUntil: "networkidle0" });
  await sleep(900);

  // Dark is a different kind of change: it turns the page over rather than
  // retinting it, so what `bg-white` means has to move with it.
  await page.evaluate(() => [...document.querySelectorAll('[role="radio"]')].find((b) => b.textContent.trim().startsWith("Dark"))?.click());
  await sleep(400);
  const dark = await page.evaluate(() => {
    const el = document.createElement("div");
    el.className = "bg-white text-neutral-900";
    document.body.appendChild(el);
    const c = getComputedStyle(el);
    const out = { card: c.backgroundColor, words: c.color, body: getComputedStyle(document.body).backgroundColor };
    el.remove();
    return out;
  });
  const bright = (rgb) => { const m = rgb.match(/\d+/g).slice(0, 3).map(Number); return (m[0] + m[1] + m[2]) / 3; };
  check("in the dark a card is dark and the words are light", bright(dark.card) < 80 && bright(dark.words) > 180, JSON.stringify(dark));
  check("...and so is the page behind it", bright(dark.body) < 80, dark.body);

  // The camera is a black viewfinder whatever the app is set to, so its own
  // writing must not follow the lights down.
  const onBlack = await page.evaluate(() => {
    const el = document.createElement("div");
    el.className = "text-ink-on-dark";
    document.body.appendChild(el);
    const c = getComputedStyle(el).color;
    el.remove();
    return c;
  });
  check("white text on a black overlay stays white in the dark", bright(onBlack) > 240, onBlack);

  // A document is a document: it prints in ink on white paper at midnight.
  await page.emulateMediaType("print");
  await sleep(200);
  const printedDark = await page.evaluate(() => {
    const el = document.createElement("div");
    el.className = "bg-white text-neutral-900";
    document.body.appendChild(el);
    const c = getComputedStyle(el);
    const out = { card: c.backgroundColor, words: c.color };
    el.remove();
    return out;
  });
  await page.emulateMediaType("screen");
  check("an invoice still prints black on white in the dark", bright(printedDark.card) > 240 && bright(printedDark.words) < 60, JSON.stringify(printedDark));

  // Rubbish in localStorage must not colour anything or throw.
  await page.evaluate(() => localStorage.setItem("theme", "'; DROP TABLE"));
  await page.reload({ waitUntil: "networkidle0" });
  await sleep(500);
  check("a nonsense stored value falls back to grey", (await page.evaluate(() => document.documentElement.getAttribute("data-theme"))) === null && (await probe()).bg === "rgb(23, 23, 23)");

  // Nobody sets their phone to dark and then expects to set it again here.
  await page.evaluate(() => localStorage.removeItem("theme"));
  await prefers("dark");
  await page.reload({ waitUntil: "networkidle0" });
  await sleep(600);
  check("a phone set to dark gets a dark app without being asked", (await page.evaluate(() => document.documentElement.getAttribute("data-theme"))) === "dark");
  check("...and it is dark before React runs, so a dark room never gets a white flash",
    await page.evaluate(() => getComputedStyle(document.body).backgroundColor).then((c) => c.match(/\d+/g).slice(0, 3).map(Number).reduce((a, b) => a + b, 0) / 3 < 80));

  // But a colour chosen on purpose outranks the phone.
  await page.evaluate(() => [...document.querySelectorAll('[role="radio"]')].find((b) => b.textContent.includes("Sand"))?.click()).catch(() => {});
  await page.goto(`${BASE}/settings`, { waitUntil: "networkidle0" });
  await sleep(700);
  await page.evaluate(() => [...document.querySelectorAll('[role="radio"]')].find((b) => b.textContent.includes("Sand"))?.click());
  await sleep(400);
  await page.reload({ waitUntil: "networkidle0" });
  await sleep(600);
  check("a colour picked on purpose beats the phone's own setting", (await page.evaluate(() => document.documentElement.getAttribute("data-theme"))) === "sand");
  await prefers("light");

  check("fits 320px", await page.setViewport({ width: 320, height: 640 }).then(() => sleep(300)).then(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)));
} catch (e) {
  console.log("ERROR", e.message);
  results.push(false);
} finally {
  await browser.close();
  console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
}
