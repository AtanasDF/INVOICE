// What happens after someone taps "Don't Allow" once. On iPhone Safari
// there is no Permissions API for the camera, so a refusal written to
// localStorage could never be corrected: every later visit refused before
// the browser was asked, "Try again" re-read our own no, and the tip under
// it ("iPhone Settings -> Safari -> Camera -> Allow") was advice about a
// block the app was holding itself. The scanner was gone for good.
//
// Safari is stubbed here: navigator.permissions.query rejects, exactly as
// it does on iOS.
import { makeDb, launchSignedIn, signIn, sleep, newId } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

const db = makeDb();
Object.assign(db.tables, { receipts: [], credit_notes: [], invoice_payments: [] });
db.tables.business_profile.push({ user_id: "x", business_name: "H", vat_registered: false, invoice_prefix: "INV-", invoice_next_number: 1, custom_categories: null });

const { browser, page } = await launchSignedIn(db, { base: BASE, width: 375, profile: "profile-camrefusal" });

// Be iOS Safari: no camera permission query, and getUserMedia refuses.
const beSafari = async (refuse) => {
  await page.evaluateOnNewDocument((shouldRefuse) => {
    Object.defineProperty(navigator, "permissions", { configurable: true, value: { query: () => Promise.reject(new TypeError("not supported")) } });
    const err = () => { const e = new Error("Permission denied"); e.name = "NotAllowedError"; return e; };
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: () => (shouldRefuse ? Promise.reject(err()) : Promise.resolve({ getTracks: () => [], getVideoTracks: () => [] })),
        enumerateDevices: () => Promise.resolve([]),
      },
    });
    window.__gumCalls = 0;
    const real = navigator.mediaDevices.getUserMedia;
    navigator.mediaDevices.getUserMedia = (...a) => { window.__gumCalls++; return real(...a); };
  }, refuse);
};

const stored = () => page.evaluate(() => { try { return localStorage.getItem("camera-allowed"); } catch { return "unreadable"; } });
const gumCalls = () => page.evaluate(() => window.__gumCalls ?? 0);

try {
  await signIn(page, BASE);

  // Tap "Don't Allow" once.
  await beSafari(true);
  await page.goto(`${BASE}/scan`, { waitUntil: "networkidle0" });
  await sleep(2500);
  check("the browser was actually asked", (await gumCalls()) >= 1, String(await gumCalls()));
  check("a refusal on Safari is NOT written to storage", (await stored()) !== "0", JSON.stringify(await stored()));

  // Come back later. Safari asks again on every visit; the app must too.
  await page.goto(`${BASE}/free-invoice`, { waitUntil: "domcontentloaded" });
  await page.goto(`${BASE}/scan`, { waitUntil: "networkidle0" });
  await sleep(2500);
  check("the next visit asks the browser again, rather than refusing itself", (await gumCalls()) >= 1, String(await gumCalls()));

  // And once the phone's setting is changed, it works -- which is what the
  // app's own tip promises.
  await beSafari(false);
  await page.goto(`${BASE}/free-invoice`, { waitUntil: "domcontentloaded" });
  await page.goto(`${BASE}/scan`, { waitUntil: "networkidle0" });
  await sleep(2500);
  const asked = await gumCalls();
  const text = await page.evaluate(() => document.body.innerText);
  // The bug this suite exists for is the app holding its OWN no: refusing
  // before the browser is asked, so changing the phone setting can never help.
  // The evidence is that the browser is asked again, not the wording -- a
  // headless Chrome has no camera to give, so some "it didn't open" message is
  // correct here either way. Grepping for the word "blocked" only ever passed
  // because the old wording happened not to use it, and it broke the moment
  // the app started saying, honestly, that the camera is blocked for the site.
  check("after allowing it, the app asks the browser rather than refusing itself", asked >= 1, String(asked));
  check("...and it no longer shows the tip about a refusal it is holding", !/Don.t Allow/i.test(text.slice(0, 600)), text.replace(/\s+/g, " ").slice(0, 300));
  check("and the page didn't fall over on any of it", !text.includes("Application error"), text.slice(0, 200));

  // The dashboard's "Create an invoice" opens the camera on arrival. With the
  // camera blocked, that used to leave a person on a black screen saying
  // "Camera access was denied", with Try again, Upload, and an unlabelled back
  // arrow -- and no way to do the thing the button had promised. They pressed
  // "Create an invoice", not "open the camera".
  await page.goto(`${BASE}/free-invoice?start=photo`, { waitUntil: "networkidle0" });
  await sleep(3000);
  const after = await page.evaluate(() => document.body.innerText);
  check("a blocked camera does not strand anyone on the camera screen", !/Camera access was denied/.test(after), after.replace(/\s+/g, " ").slice(0, 200));
  check("...it says the camera didn't open, in words", /camera didn.t open/i.test(after), after.replace(/\s+/g, " ").slice(0, 300));
  check("...and offers the invoice they actually asked for", /Type it in/.test(after), after.replace(/\s+/g, " ").slice(0, 300));
  check("...with the photo route still there for when they unblock it", /Take a photo of an old invoice/.test(after), after.replace(/\s+/g, " ").slice(0, 300));

  // /scan is the biggest button in the app and opens the camera on arrival,
  // so the same trap was there and mattered more.
  await page.goto(`${BASE}/scan`, { waitUntil: "networkidle0" });
  await sleep(3000);
  const scan = await page.evaluate(() => document.body.innerText);
  check("a blocked camera does not strand anyone on /scan either", !/Camera access was denied/.test(scan), scan.replace(/\s+/g, " ").slice(0, 200));
  check("...it says so and offers the upload", /camera didn.t open/i.test(scan) && /Upload a photo or PDF/.test(scan), scan.replace(/\s+/g, " ").slice(0, 300));
  check("...and typing the receipt in by hand", /Add a receipt by hand/.test(scan), scan.replace(/\s+/g, " ").slice(0, 300));
  check("...and trying the camera again once it is unblocked", /Try the camera again/.test(scan), scan.replace(/\s+/g, " ").slice(0, 300));

  // Copy a document never had it: the camera there opens only on a tap.
  await page.goto(`${BASE}/copy`, { waitUntil: "networkidle0" });
  await sleep(2000);
  const copy = await page.evaluate(() => document.body.innerText);
  check("Copy a document was never affected, and still isn't", !/Camera access was denied/.test(copy) && /Copy a document/.test(copy), copy.replace(/\s+/g, " ").slice(0, 200));
} catch (e) { console.log("ERROR", e.message); }
finally { await browser.close(); console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length })); }
