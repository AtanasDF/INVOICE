// Making a sign-in with a confirmation email (Atanas, 2026-09-22: "once they
// put their registration details they need to click the email and approve
// the registration"). Supabase's answers are mocked: sign-up with no
// session, a refused sign-in for want of the click, the resend, an
// expired link coming back.
import { makeDb, launchSignedIn, sleep, bodyText, SUPA } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

const db = makeDb();
const calls = [];
let signInAnswer = { status: 400, body: { error: "invalid_grant", error_description: "Email not confirmed", code: "email_not_confirmed", msg: "Email not confirmed" } };
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "*", "Access-Control-Expose-Headers": "*" };
const json = (req, status, body) => req.respond({ status, headers: { ...cors, "content-type": "application/json" }, body: JSON.stringify(body) });
const { browser, page } = await launchSignedIn(db, {
  base: BASE,
  profile: "profile-sign-up",
  intercept: (req, u) => {
    if (u.origin !== SUPA) return false;
    if (req.method() === "OPTIONS") { req.respond({ status: 204, headers: cors, body: "" }); return true; }
    let body = null;
    try { body = req.postData() ? JSON.parse(req.postData()) : null; } catch { body = null; }
    if (u.pathname === "/auth/v1/signup") { calls.push({ what: "signup", email: body?.email, redirect: u.searchParams.get("redirect_to"), raw: body }); json(req, 200, { id: "u-new", aud: "authenticated", role: "", email: body?.email, email_confirmed_at: null, identities: [], created_at: "2026-09-22T05:00:00Z" }); return true; }
    if (u.pathname === "/auth/v1/resend") { calls.push({ what: "resend", email: body?.email, type: body?.type, raw: body }); json(req, 200, {}); return true; }
    if (u.pathname === "/auth/v1/token" && u.searchParams.get("grant_type") === "password") { calls.push({ what: "signin", email: body?.email }); json(req, signInAnswer.status, signInAnswer.body); return true; }
    return false;
  },
});
const setField = (name, value) => page.evaluate((n, v) => {
  const el = document.querySelector(`input[name="${n}"]`);
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, v);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}, name, value);
const press = (text) => page.evaluate((t) => {
  const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === t && !x.disabled);
  if (!b) throw new Error("no button: " + t);
  b.click();
}, text);

try {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
  await sleep(500);
  let text = await bodyText(page);
  check("the way in for a newcomer is in plain words", text.includes("New here? Make a sign-in") && !/account/i.test(text), text.slice(0, 300));
  await press("New here? Make a sign-in");
  await sleep(200);
  text = await bodyText(page);
  check("making a sign-in: title and button say so", text.includes("Make your sign-in") && text.includes("Make my sign-in"), text.slice(0, 300));
  await setField("email", "newcomer@example.com");
  await setField("password", "correct horse battery");
  await press("Make my sign-in");
  await page.waitForFunction(() => document.body.innerText.includes("Check your email"), { timeout: 10000 });
  text = await bodyText(page);
  const signup = calls.find((c) => c.what === "signup");
  check("sign-up asks for the confirmation link to come back to the app", !!signup && /\/login\?next=%2F$/.test(signup.redirect ?? ""), JSON.stringify(signup?.redirect));
  check("with no session yet the page says to check the email, naming the address", text.includes("We've sent a link to newcomer@example.com") && text.includes("Send it again") && text.includes("junk folder"), text.slice(0, 400));
  check("no password box on that screen", !(await page.$('input[name="password"]')));
  await press("Send it again");
  await sleep(500);
  text = await bodyText(page);
  const resend = calls.find((c) => c.what === "resend");
  check("Send it again resends the sign-up email to that address", !!resend && resend.email === "newcomer@example.com" && resend.type === "signup", JSON.stringify(resend));
  check("...and says so", text.includes("Sent again to newcomer@example.com"), text.slice(0, 400));
  check("a status line announces it", await page.evaluate(() => [...document.querySelectorAll('[role="status"]')].some((s) => /Sent again/.test(s.textContent))));

  await press("I've tapped the link, sign me in");
  await sleep(200);
  text = await bodyText(page);
  check("back on the sign-in form", text.includes("Welcome back.") && !!(await page.$('input[name="password"]')));
  await setField("email", "newcomer@example.com");
  await setField("password", "correct horse battery");
  await press("Sign in");
  await sleep(600);
  text = await bodyText(page);
  check("a sign-in refused for want of the click is explained in plain words, with a way to resend", text.includes("hasn't been confirmed yet") && text.includes("Send the email again") && !/invalid_grant|email_not_confirmed/i.test(text), text.slice(0, 400));
  const before = calls.filter((c) => c.what === "resend").length;
  await press("Send the email again");
  await sleep(400);
  check("that button resends to the address typed", calls.filter((c) => c.what === "resend").length === before + 1 && calls.at(-1).email === "newcomer@example.com", JSON.stringify(calls.at(-1)));

  // From another page, so this is a fresh load and not a same-page hash change.
  await page.goto(`${BASE}/free-invoice`, { waitUntil: "domcontentloaded" });
  await page.goto(`${BASE}/login#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired`, { waitUntil: "networkidle0" });
  await sleep(500);
  text = await bodyText(page);
  check("an expired link coming back is explained", text.includes("That link has expired or was already used"), text.slice(0, 300));
  check("...and the reason is cleared from the address", !page.url().includes("error_description"), page.url());
  check("no blue text on the page", await page.evaluate(() => ![...document.querySelectorAll("a,button")].some((e) => /blue/.test(e.className))));
  check("fits 375px", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
} catch (e) {
  console.log("ERROR", e.message);
  results.push(false);
} finally {
  await browser.close();
  console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
}
