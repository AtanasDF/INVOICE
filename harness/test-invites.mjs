// Invite a friend (migration-037). The arithmetic and every refusal were
// exercised in SQL against the real database, rolled back; what is checked here
// is the half a person touches: that a code is kept when they arrive from a
// friend's link, that it rides onto the account at sign-up, that it pays
// nothing at that moment, and that none of it appears at all while the feature
// is switched off.
//
// The switch matters as much as the feature: this ships to main before anyone
// has decided to turn it on, exactly as the scan limits did.
import { makeDb, launchSignedIn, signIn, sleep, bodyText, UID } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

const db = makeDb();
Object.assign(db.tables, { receipts: [], recurring_expenses: [], invoice_payments: [] });
db.tables.business_profile.push({ user_id: UID, business_name: "Nasko Plastering", vat_registered: false, invoice_prefix: "INV-", invoice_next_number: 1 });

const { browser, page } = await launchSignedIn(db, { base: BASE, width: 390, profile: "profile-invites" });
const stored = () => page.evaluate(() => localStorage.getItem("invite-code"));

try {
  await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
  await page.evaluate(() => localStorage.clear());

  // --- arriving from a friend's link ---
  await page.goto(`${BASE}/?invite=K7RM2QX`, { waitUntil: "networkidle0" });
  await sleep(700);
  check("a friend's code is kept when they arrive", (await stored()) === "K7RM2QX", String(await stored()));

  await page.goto(`${BASE}/?invite=OTHER99`, { waitUntil: "networkidle0" });
  await sleep(600);
  check("a second link does not overwrite the friend who actually brought them", (await stored()) === "K7RM2QX", String(await stored()));

  await page.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
  await sleep(500);
  check("it survives the wander between arriving and signing up", (await stored()) === "K7RM2QX", String(await stored()));

  // --- rubbish in the address bar ---
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${BASE}/?invite=${encodeURIComponent("<script>alert(1)</script>")}`, { waitUntil: "networkidle0" });
  await sleep(500);
  const messy = await stored();
  check("a code full of rubbish is cleaned or dropped", messy === null || /^[A-Z0-9]{4,12}$/.test(messy), String(messy));

  await page.evaluate(() => localStorage.clear());
  await page.goto(`${BASE}/?invite=AB`, { waitUntil: "networkidle0" });
  await sleep(500);
  check("something far too short to be a code is ignored", (await stored()) === null, String(await stored()));

  await page.evaluate(() => localStorage.clear());
  await page.goto(`${BASE}/?invite=${"Z".repeat(80)}`, { waitUntil: "networkidle0" });
  await sleep(500);
  check("something absurdly long is cut short rather than stored whole", ((await stored()) ?? "").length <= 12, String((await stored()) ?? "").length);

  // --- switched off, which is how it ships ---
  await signIn(page, BASE);
  await page.goto(`${BASE}/settings`, { waitUntil: "networkidle0" });
  await sleep(1400);
  const t = await bodyText(page);
  check("with the switch off nothing on Settings mentions inviting anyone", !/Tell a mate|invite/i.test(t), t.slice(0, 400));
  check("...and no code is asked for", !(await page.evaluate(() => document.body.innerText.includes("Send my link"))));

  // --- and the claim pays nothing at sign-up, by construction ---
  const sent = await page.evaluate(async () => {
    const seen = [];
    const real = window.fetch;
    window.fetch = async (...args) => {
      const url = String(args[0]?.url ?? args[0]);
      if (/rpc\/(claim_invite|reward_invite_if_due|my_invite_code)/.test(url)) seen.push(url.split("/rpc/")[1]);
      return real(...args);
    };
    await new Promise((r) => setTimeout(r, 400));
    window.fetch = real;
    return seen;
  });
  check("nothing asks to be rewarded from the browser at all", !sent.some((u) => u.startsWith("reward_invite_if_due")), JSON.stringify(sent));
} catch (e) {
  console.log("ERROR", e.message);
  results.push(false);
} finally {
  await browser.close();
  console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
}
