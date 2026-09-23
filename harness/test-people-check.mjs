// What somebody reads when the "prove you're a person" check refuses them.
//
// This is the front door, the check is invisible, and it finishes a beat after
// the page does -- so anybody quick, or on a slow connection in a depot, meets
// it. Before this suite they were told:
//
//   captcha protection: request disallowed (missing-input-response)
//
// which was live on the site. A driver who reads that has no idea what a
// captcha is here, let alone what to do. The wording is the whole fix, so the
// wording is what is pinned.
import { makeDb, launchSignedIn, sleep, bodyText } from "./mockdb.mjs";
import { peopleCheckProblem } from "./gen/lib/peopleCheck.js";
const BASE = process.env.BASE ?? "http://localhost:3000";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

const db = makeDb();
Object.assign(db.tables, { receipts: [], recurring_expenses: [], invoice_payments: [] });
const { browser, page } = await launchSignedIn(db, { base: BASE, width: 390, profile: "profile-people-check" });

const refuse = (msg) =>
  page.evaluateOnNewDocument((m) => {
    const real = window.fetch;
    window.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      if (url.includes("/auth/v1/token") || url.includes("/auth/v1/signup")) {
        return new Response(JSON.stringify({ error_code: "captcha_failed", msg: m, message: m }), { status: 400, headers: { "Content-Type": "application/json" } });
      }
      return real(input, init);
    };
  }, msg);

const trySignIn = async () => {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
  await sleep(800);
  await page.evaluate(() => {
    const set = (n, v) => { const el = document.querySelector(`input[name="${n}"]`); el.value = v; el.dispatchEvent(new Event("input", { bubbles: true })); };
    set("email", "someone@example.com");
    set("password", "abcdefgh");
  });
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => /Sign me in/i.test(b.textContent))?.click());
  await sleep(1500);
  return bodyText(page);
};

try {
  await refuse("captcha protection: request disallowed (missing-input-response)");
  const t = await trySignIn();
  check("nobody is shown Cloudflare's own words", !/missing-input-response|request disallowed|captcha protection/i.test(t), (t.match(/.{0,120}(captcha|disallowed).{0,60}/i) ?? [""])[0]);
  check("...they are told the check hadn't finished", /check that you're a person hadn't finished/i.test(t), t.slice(0, 400));
  check("...and what to do about it", /press the button again/i.test(t), t.slice(0, 400));
  check("...and it does not say the word captcha at all", !/captcha/i.test(t), t.slice(0, 400));

  // The wording itself, straight from the app's own code.
  const stale = peopleCheckProblem(new Error("captcha protection: request disallowed (timeout-or-duplicate)"));
  check("a stale token says the same simple thing", /give it a second/i.test(stale), String(stale));
  const other = peopleCheckProblem(new Error("captcha verification process failed"));
  check("any other people-check trouble says reload and try once more", /reload the page/i.test(other), String(other));
  check("an ordinary failure is left alone for the usual wording", peopleCheckProblem(new Error("Invalid login credentials")) === null);
  check("...and so is nothing at all", peopleCheckProblem(null) === null && peopleCheckProblem(undefined) === null);
  for (const m of [stale, other]) {
    check(`"${String(m).slice(0, 28)}..." blames nobody`, !/\b(you failed|invalid|error|denied|forbidden)\b/i.test(String(m)), String(m));
  }
} catch (e) {
  console.log("ERROR", e.message);
  results.push(false);
} finally {
  await browser.close();
  console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
}
