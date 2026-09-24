// The Feedback page sends through the app's route and says so; a failed
// send keeps what was typed. The route is mocked here (test-feedback runs
// the real one); this is what the page does with its answers.
import { makeDb, launchSignedIn, signIn, sleep, bodyText } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

const db = makeDb();
db.tables.feedback = [{ id: "f0000000-0000-4000-8000-000000000001", user_id: "x", message: "An older note", category: "Other", page: "/", created_at: "2026-09-01T10:00:00Z" }];
let answer = { status: 200, body: { id: "f0000000-0000-4000-8000-000000000002", createdAt: "2026-09-22T05:00:00Z", emailed: true } };
const posted = [];
const { browser, page } = await launchSignedIn(db, {
  base: BASE,
  profile: "profile-feedback-page",
  intercept: (req, u) => {
    if (u.pathname !== "/api/feedback") return false;
    posted.push({ auth: req.headers().authorization ?? "", body: JSON.parse(req.postData() || "{}") });
    req.respond({ status: answer.status, headers: { "content-type": "application/json" }, body: JSON.stringify(answer.body) });
    return true;
  },
});
const setMessage = (t) => page.evaluate((v) => {
  const el = document.querySelector("textarea");
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(el, v);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}, t);
const send = () => page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Send feedback").click());

try {
  await signIn(page, BASE);
  await page.goto(`${BASE}/feedback`, { waitUntil: "networkidle0" });
  await sleep(600);
  let text = await bodyText(page);
  check("the page says where it goes", text.includes("It goes straight to the person who makes this."), text.slice(0, 200));
  check("earlier notes are listed", text.includes("An older note"));

  await setMessage("The Save button is hidden on my phone.");
  await send();
  await sleep(600);
  text = await bodyText(page);
  check("the route was called with the token, the words, the category and the page", posted.length === 1 && posted[0].auth.startsWith("Bearer ") && posted[0].body.message === "The Save button is hidden on my phone." && posted[0].body.category === "Bug" && posted[0].body.page === "/feedback", JSON.stringify(posted[0]).slice(0, 200));
  check("it says Sent. Thank you.", text.includes("Sent. Thank you."), text.slice(0, 300));
  check("the box is cleared and the note is listed first", (await page.$eval("textarea", (e) => e.value)) === "" && text.indexOf("The Save button is hidden") < text.indexOf("An older note"));
  check("the announcer carries it for a screen reader", await page.evaluate(() => [...document.querySelectorAll('[role="status"]')].some((s) => s.textContent.trim() === "Sent. Thank you.")));

  answer = { status: 400, body: { error: "Keep it under 5,000 characters (this is 5,001)." } };
  await setMessage("x".repeat(5001));
  await send();
  await sleep(600);
  text = await bodyText(page);
  check("a refused send shows the route's own words as an alert", text.includes("Keep it under 5,000 characters") && (await page.$('[role="alert"]')) !== null, text.slice(0, 300));
  check("...and keeps what was typed", (await page.$eval("textarea", (e) => e.value)).length === 5001);
  check("...and drops the earlier Sent", !text.includes("Sent. Thank you."));

  answer = { status: 502, body: {} };
  await setMessage("Second try");
  await send();
  await sleep(600);
  text = await bodyText(page);
  check("a failed send says so in plain words and keeps the text", /Couldn't send feedback\. Try again in a minute\./.test(text) && (await page.$eval("textarea", (e) => e.value)) === "Second try", text.slice(0, 300));
  check("fits 375px", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
} catch (e) {
  console.log("ERROR", e.message);
  results.push(false);
} finally {
  await browser.close();
  console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
}
