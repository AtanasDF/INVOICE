// Putting the app on a phone (Atanas, 2026-09-23: "how is the app going to be
// downloaded"). It has always been installable and nothing ever said so. What
// matters here is that the steps shown match the phone someone is holding —
// being told the wrong steps is worse than being told none — and that someone
// who already has the icon is not nagged about getting it.
import { makeDb, launchSignedIn, signIn, sleep, bodyText, UID } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

const db = makeDb();
Object.assign(db.tables, { receipts: [], recurring_expenses: [], invoice_payments: [] });
db.tables.business_profile.push({ user_id: UID, business_name: "Nasko Plastering", vat_registered: false, invoice_prefix: "INV-", invoice_next_number: 1 });

const { browser, page } = await launchSignedIn(db, { base: BASE, width: 390, profile: "profile-get-app" });

// No request interception here: the harness uses it to route every Supabase
// call to the mock, and taking it over blanks the whole app. So the cases are
// staged through navigator alone, before the page loads — a reload would wipe
// anything set after it.
async function stage({ ios = false, standalone = false } = {}) {
  await page.evaluateOnNewDocument(
    (isIos, isStandalone) => {
      // These scripts accumulate across stages, so each definition has to be
      // replaceable -- redefining a locked property throws and takes the rest
      // of the script with it, which is how an earlier run quietly staged
      // nothing at all.
      if (isIos) Object.defineProperty(navigator, "userAgent", { configurable: true, get: () => "Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Mobile/15E148 Safari/604.1" });
      if (isStandalone) Object.defineProperty(navigator, "standalone", { configurable: true, get: () => true });
    },
    ios,
    standalone,
  );
}

// Chrome offers an install of its own accord in headless, and there is no
// honest way to stop it — so the browser cases are the ones that can be
// staged, and the plain by-hand wording is reached the way a real person
// reaches it: the browser offered, the offer failed.
const fireOffer = (throws = false) =>
  page.evaluate((shouldThrow) => {
    const e = new Event("beforeinstallprompt");
    e.prompt = async () => {
      if (shouldThrow) throw new Error("dismissed");
      window.__prompted = true;
    };
    Object.defineProperty(e, "userChoice", { value: Promise.resolve({ outcome: "accepted" }) });
    window.dispatchEvent(e);
  }, throws);

const hasInstallButton = () => page.evaluate(() => [...document.querySelectorAll("button")].some((b) => b.textContent.trim() === "Install it"));

try {
  // Fetched, not navigated to. Since 2026-09-24 a service worker is
  // registered for everybody rather than only for whoever turned on
  // notifications, and it takes navigations -- so goto() on a JSON file
  // came back with no response at all and this suite died on its first
  // line. It is a file; read it like one.
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  const m = await page.evaluate(async (url) => (await fetch(url, { cache: "no-store" })).json(), `${BASE}/manifest.json`);
  // iOS fills a transparent home-screen icon with BLACK, under its own rounded
  // mask, so the apple icon must be fully opaque -- ours was the 192, which is
  // 4% non-opaque at its anti-aliased edges. It must also exist at all.
  // Fetched rather than navigated to: three navigations in a row to read one
  // header made this flake under the four-at-a-time run while passing alone.
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  const appleHref = await page.evaluate(() => document.querySelector('link[rel="apple-touch-icon"]')?.getAttribute("href") ?? null);
  check("the page points iOS at an apple-touch-icon of its own", appleHref === "/apple-icon.png", String(appleHref));
  const appleRes = await page.evaluate(async (href) => {
    const r = await fetch(href, { cache: "no-store" });
    return { status: r.status, type: r.headers.get("content-type") ?? "" };
  }, appleHref ?? "/apple-icon.png");
  check("...and it is really there, as a PNG", appleRes.status === 200 && appleRes.type.includes("png"), JSON.stringify(appleRes));
  await page.goto(`${BASE}/manifest.json`, { waitUntil: "domcontentloaded" });
  check("the app really is installable: manifest, name, standalone, both icons",
    m.display === "standalone" && !!m.name && (m.icons ?? []).some((i) => i.sizes === "192x192") && (m.icons ?? []).some((i) => i.sizes === "512x512"),
    JSON.stringify(m).slice(0, 200));

  await signIn(page, BASE);

  // --- an ordinary browser, before it has offered anything ---
  await page.goto(`${BASE}/settings`, { waitUntil: "networkidle0" });
  await sleep(900);
  let text = await bodyText(page);
  check("the card is there and says what it gets you", text.includes("Put Invoiceover on your phone") && /own icon and opens full screen/.test(text), text.slice(0, 300));
  check("...and does not pretend it comes from a shop", /Nothing to download from a shop/.test(text));

  // --- Chrome's own offer ---
  await fireOffer();
  await sleep(400);
  check("when the browser offers, a real Install button appears", await hasInstallButton());
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Install it").click());
  await sleep(400);
  check("...and pressing it asks the browser rather than explaining", await page.evaluate(() => window.__prompted === true));
  check("...and the button goes once it has been used", !(await hasInstallButton()));

  // --- the offer fails, so we fall back to telling them ---
  await page.goto(`${BASE}/settings`, { waitUntil: "networkidle0" });
  await sleep(900);
  await fireOffer(true);
  await sleep(300);
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Install it")?.click());
  await sleep(400);
  text = await bodyText(page);
  check("a failed offer falls back to the by-hand steps", /three dots or lines/.test(text) && /Add to Home screen/.test(text), text.slice(0, 700));

  // --- an iPhone, which never offers and needs Apple's own wording ---
  await stage({ ios: true });
  await page.goto(`${BASE}/settings`, { waitUntil: "networkidle0" });
  await sleep(900);
  text = await bodyText(page);
  check("an iPhone is told about the share button and Add to Home Screen", /share button/.test(text) && /Add to Home Screen/.test(text), text.slice(0, 700));
  check("...and is not told to look for a three-dot menu it does not have", !/three dots or lines/.test(text), text.slice(0, 700));
  await fireOffer();
  await sleep(300);
  check("...and an offer from a browser pretending to be one does not override that", !(await hasInstallButton()));

  // --- someone who already has the icon ---
  await stage({ ios: true, standalone: true });
  await page.goto(`${BASE}/settings`, { waitUntil: "networkidle0" });
  await sleep(900);
  text = await bodyText(page);
  check("someone already running it standalone is not nagged", !text.includes("Put Invoiceover on your phone"), text.slice(0, 300));

  check("fits 320px", await page.setViewport({ width: 320, height: 680 }).then(() => sleep(300)).then(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)));
} catch (e) {
  console.log("ERROR", e.message);
  results.push(false);
} finally {
  await browser.close();
  console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
}
