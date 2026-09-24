// Making a sign-in with a confirmation email (Atanas, 2026-09-22: "once they
// put their registration details they need to click the email and approve
// the registration"). Supabase's answers are mocked: sign-up with no
// session, a refused sign-in for want of the click, the resend, an
// expired link coming back.
import { makeDb, launchSignedIn, sleep, bodyText, SUPA, fakeSession } from "./mockdb.mjs";
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
    if (u.pathname === "/auth/v1/verify") { calls.push({ what: "verify", email: body?.email, token: body?.token, type: body?.type }); if (body?.token === "123456") json(req, 200, fakeSession()); else json(req, 403, { error: "access_denied", error_code: "otp_expired", msg: "Token has expired or is invalid" }); return true; }
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
  // Arriving from the Free page's photo button, as a stranger would.
  await page.goto(`${BASE}/login?next=%2Ffree-invoice`, { waitUntil: "networkidle0" });
  await sleep(500);
  let text = await bodyText(page);
  check("the two ways in are side by side, in plain words", text.includes("Sign in") && text.includes("New here"), text.slice(0, 300));
  await press("New here");
  await sleep(250);
  text = await bodyText(page);
  check("making an account: title, what happens next, and the button", text.includes("Make an account") && text.includes("It's free. We'll send one email to check it's you.") && text.includes("Make my account"), text.slice(0, 400));
  await setField("email", "newcomer@example.com");
  await setField("password", "correct horse battery");
  // The password is typed twice, so a slip can't lock anyone out.
  await setField("again", "correct horse");
  await press("Make my account");
  await sleep(300);
  check("two different passwords are refused in words, and nothing is sent", /not the same/.test(await bodyText(page)) && !calls.some((c) => c.what === "signup"), (await bodyText(page)).slice(0, 200));
  await setField("again", "correct horse battery");
  await press("Make my account");
  await page.waitForFunction(() => /check your email/i.test(document.body.innerText), { timeout: 10000 });
  text = await bodyText(page);
  const signup = calls.find((c) => c.what === "signup");
  check("sign-up's confirmation link brings them back to where they were going", !!signup && /\/login\?next=%2Ffree-invoice$/.test(signup.redirect ?? ""), JSON.stringify(signup?.redirect));
  check("with no session yet the page says to check the email, naming the address", text.includes("We sent an email to newcomer@example.com") && text.includes("Send it again") && text.includes("junk folder"), text.slice(0, 400));
  check("no password box on that screen", !(await page.$('input[name="password"]')));
  await press("Send it again");
  await sleep(500);
  text = await bodyText(page);
  const resend = calls.find((c) => c.what === "resend");
  check("Send it again resends the sign-up email to that address", !!resend && resend.email === "newcomer@example.com" && resend.type === "signup", JSON.stringify(resend));
  check("...and says so", text.includes("Sent again to newcomer@example.com"), text.slice(0, 400));
  check("a status line announces it", await page.evaluate(() => [...document.querySelectorAll('[role="status"]')].some((s) => /Sent again/.test(s.textContent))));

  // The code from the email, typed in: a wrong one is explained; the right one signs in.
  const typeCode = (v) => page.evaluate((val) => {
    const el = document.querySelector("#signup-code");
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, val);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, v);
  await typeCode("999 999");
  await press("Done");
  await sleep(500);
  text = await bodyText(page);
  const wrong = calls.find((c) => c.what === "verify");
  check("a wrong or old code is explained in plain words", text.includes("That code has run out or isn't right") && wrong?.token === "999999" && wrong?.type === "signup" && wrong?.email === "newcomer@example.com", JSON.stringify(wrong));
  await typeCode("12345");
  await press("Done");
  await sleep(300);
  check("a code that isn't six digits is caught before asking", (await bodyText(page)).includes("The code is the six numbers in the email.") && calls.filter((c) => c.what === "verify").length === 1);
  // And it is tied to the code box, not merely announced beside it: a
  // screen reader otherwise reads the words out with no way to reach the
  // field they are about (harness/test-error-on-the-field.mjs).
  const tiedCode = await page.evaluate(() => {
    const box = document.querySelector('input[inputmode="numeric"], #code, input[name="code"]');
    if (!box) return { missing: true };
    const ids = (box.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean);
    return { invalid: box.getAttribute("aria-invalid"), says: ids.map((i) => document.getElementById(i)?.textContent?.trim() ?? "") };
  });
  check("and the code box itself carries it", tiedCode.invalid === "true" && tiedCode.says.some((t) => /six numbers/.test(t)), JSON.stringify(tiedCode));

  await press("I've done it, sign me in");
  await sleep(200);
  text = await bodyText(page);
  check("back on the sign-in form", text.includes("Welcome back.") && !!(await page.$('input[name="password"]')));
  await setField("email", "newcomer@example.com");
  await setField("password", "correct horse battery");
  await press("Sign me in");
  await sleep(600);
  text = await bodyText(page);
  check("a sign-in refused for want of the click is explained in plain words, with a way to resend", text.includes("You haven't said yes to our email yet") && text.includes("Send the email again") && !/invalid_grant|email_not_confirmed/i.test(text), text.slice(0, 400));
  const before = calls.filter((c) => c.what === "resend").length;
  await press("Send the email again");
  await sleep(400);
  check("that button resends to the address typed", calls.filter((c) => c.what === "resend").length === before + 1 && calls.at(-1).email === "newcomer@example.com", JSON.stringify(calls.at(-1)));

  // The right code signs in and goes on to where they were going.
  await page.goto(`${BASE}/login?next=%2Ffree-invoice`, { waitUntil: "networkidle0" });
  await sleep(400);
  await press("New here");
  await sleep(200);
  await setField("email", "second@example.com");
  await setField("password", "correct horse battery");
  await setField("again", "correct horse battery");
  await press("Make my account");
  await page.waitForFunction(() => /check your email/i.test(document.body.innerText), { timeout: 10000 });
  await typeCode("123456");
  await press("Done");
  await page.waitForFunction(() => location.pathname === "/free-invoice", { timeout: 10000 }).catch(() => {});
  check("the right code signs in and goes on to the Free page", page.url().endsWith("/free-invoice"), page.url());
  await page.evaluate(() => localStorage.clear());

  // From another page, so this is a fresh load and not a same-page hash change.
  await page.goto(`${BASE}/free-invoice`, { waitUntil: "domcontentloaded" });
  await page.goto(`${BASE}/login#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired`, { waitUntil: "networkidle0" });
  await sleep(500);
  text = await bodyText(page);
  check("an expired link coming back is explained", text.includes("That link has run out or was already used"), text.slice(0, 300));
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
