// The wall someone meets at 50, and the one thing worth doing about it
// (queue item 21). The refusal comes from the scan route, so the route is
// answered by a stand-in here rather than the reader being called for real.
//
// What this is really protecting: a refusal is not a failure. Nothing broke,
// nothing was lost, and there is something to do — so it must not look like
// the red box that means "scanning failed". Getting that wrong turns a
// generous limit into a frightening one.
import { makeDb, launchSignedIn, signIn, sleep, bodyText, UID } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

const PIXEL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const db = makeDb();
Object.assign(db.tables, { receipts: [], recurring_expenses: [], invoice_payments: [] });
db.tables.business_profile.push({ user_id: UID, business_name: "Nasko Plastering", vat_registered: false, invoice_prefix: "INV-", invoice_next_number: 1 });
db.allowance = { plan: "free", welcome: false, usedToday: 600, usedThisMonth: 600, dayLimit: 50, monthLimit: 600, topUpUsed: false, topUpAvailable: true, day: "2026-09-23", month: "2026-09" };

const { browser, page } = await launchSignedIn(db, { base: BASE, width: 390, profile: "profile-scan-wall" });

// Stands in for /api/scan refusing, which is what the route does when the
// allowance is spent. Everything else about the page is the real thing.
const refuseScans = (reason, topUpAvailable) =>
  page.evaluateOnNewDocument((r, t) => {
    const real = window.fetch;
    window.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      if (url.includes("/api/scan")) {
        const body = r === "day"
          ? { error: "That's 50 documents today, which is the most a free account can read in one day. It starts again tomorrow morning. You can still copy a document or write an invoice by hand.", limit: { reason: "day", dayLimit: 50 } }
          : t
            ? { error: "That's 600 documents this month. You can have another 600 for this month — just ask, once.", limit: { reason: "month", monthLimit: 600, topUpAvailable: true } }
            : { error: "That's the extra 600 used as well. It starts again on the 1st. You can still copy a document or write an invoice by hand.", limit: { reason: "month", monthLimit: 1200, topUpAvailable: false } };
        return new Response(JSON.stringify(body), { status: 429, headers: { "Content-Type": "application/json" } });
      }
      return real(input, init);
    };
  }, reason, topUpAvailable);

const scanOnce = async () => {
  await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
  await page.evaluate((p) => sessionStorage.setItem("scan-handoff-capture", JSON.stringify({ dataUrl: p, mediaType: "image/png" })), PIXEL);
  await page.goto(`${BASE}/scan`, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => document.body.innerText.length > 120, { timeout: 20000 }).catch(() => {});
  await sleep(2200);
  return bodyText(page);
};

try {
  await signIn(page, BASE);

  // --- the daily wall ---
  await refuseScans("day", false);
  let t = await scanOnce();
  check("the daily wall says the number and when it comes back", /50 documents today/.test(t) && /starts again tomorrow morning/i.test(t), t.slice(0, 500));
  check("...and says what still works", /copy a document or write an invoice by hand/i.test(t), t.slice(0, 500));
  check("...and offers no top-up, because the day is not the month", !/another 600/.test(t), t.slice(0, 500));

  const dayLook = await page.evaluate(() => {
    const el = [...document.querySelectorAll("div")].find((d) => /documents today/.test(d.textContent) && d.children.length < 6);
    return el ? { red: /rgb\(2[0-9]{2}, *[0-9]+, *[0-9]+\)/.test(getComputedStyle(el).backgroundColor) || /red/.test(el.className), cls: el.className } : null;
  });
  check("...and is not dressed as a failure", dayLook && !/red/.test(dayLook.cls), JSON.stringify(dayLook));

  // --- the monthly wall, which has something to offer ---
  await refuseScans("month", true);
  t = await scanOnce();
  check("the monthly wall offers the extra 600", /600 documents this month/.test(t) && /another 600 for this month/.test(t), t.slice(0, 500));
  const button = await page.evaluate(() => [...document.querySelectorAll("button")].some((b) => /Give me another 600 this month/i.test(b.textContent)));
  check("...with a button to ask for it", button);
  check("...and says it costs nothing", /costs you nothing/i.test(t), t.slice(0, 600));

  // Pressed twice, which is what a slow phone gets: the button is disabled
  // while it asks, but React only disables it on the re-render AFTER the first
  // press, so two presses in the same tick both get through to the handler.
  // The claim itself is once-a-month in the database, so the worst case is not
  // two allowances -- it is being told "you have already had the extra" one
  // beat after being told "here is your extra", which reads as having been
  // refused something that was just granted.
  await page.evaluate(() => {
    window.__claims = 0;
    const real = window.fetch;
    window.fetch = (input, init) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      if (url.includes("claim_scan_topup")) window.__claims++;
      return real(input, init);
    };
  });
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => /Give me another 600/i.test(x.textContent));
    b?.click();
    b?.click();
  });
  await sleep(2500);
  const claims = await page.evaluate(() => window.__claims);
  check("pressing the top-up twice only asks the database once", claims === 1, `${claims} calls`);
  const after = await bodyText(page);
  check("...and does not tell somebody they have already had what they just got", !/already had the extra/i.test(after), after.slice(0, 400));
  t = await bodyText(page);
  // A blank page would pass the "button is gone" check below for the wrong
  // reason, so say plainly what happened instead.
  // The notice must survive the press: clearing it here once unmounted the very
  // message that says the extra was granted, so the panel vanished and nobody
  // could tell whether the button had done anything at all.
  const stillThere = await page.evaluate(() => [...document.querySelectorAll('[role=status]')].map(e => e.innerText).join(' ').length > 40);
  check("the notice stays put rather than vanishing on the press", stillThere);
  check("pressing it grants the extra and says so", /another 600 for this month\. Carry on\.|That's another 600/i.test(t), t.slice(0, 500));
  check("...and the button goes once it has been used", !(await page.evaluate(() => [...document.querySelectorAll("button")].some((b) => /Give me another 600/i.test(b.textContent)))));

  // Having topped up, the document that was refused still needs reading. The
  // "Try again" button lives in the red failure box, and the refusal notice
  // stands in that same slot -- so without something here, the only way to use
  // the 600 just granted is to work out for yourself that the page must be
  // reloaded.
  const canRetry = await page.evaluate(() =>
    [...document.querySelectorAll("button")].some((b) => /Try again|Read it now|Read it again/i.test(b.textContent)));
  check("after topping up there is a way to read the refused document", canRetry, await bodyText(page).then((x) => x.slice(0, 400)));

  // --- a real failure AFTER the wall has been met ---
  // The refusal is kept in its own piece of state so it can be shown its own
  // way. It is set in exactly one place and was cleared in none, so once
  // somebody met the wall on this page, the limit notice owned the error slot
  // for the rest of the page's life: top up, carry on, and the next document
  // that genuinely fails shows the old message about the limit instead of what
  // went wrong -- and the "Try again" button lives in the red box that never
  // appears.
  await page.evaluateOnNewDocument(() => {
    const real = window.fetch;
    window.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      if (url.includes("/api/scan")) return new Response(JSON.stringify({ error: "Something went wrong reading that." }), { status: 500, headers: { "Content-Type": "application/json" } });
      return real(input, init);
    };
  });
  t = await scanOnce();
  check("a genuine failure after the wall is shown as a failure", /Try again/i.test(t), t.slice(0, 500));
  check("...and not as the old message about the limit", !/another 600 for this month/i.test(t), t.slice(0, 500));

  // --- and once the extra is spent too ---
  await refuseScans("month", false);
  t = await scanOnce();
  check("with the extra gone it says when it resets, and offers nothing it cannot give", /extra 600 used/.test(t) && /starts again on the 1st/i.test(t), t.slice(0, 500));
  check("...no button is offered that would only fail", !(await page.evaluate(() => [...document.querySelectorAll("button")].some((b) => /Give me another 600/i.test(b.textContent)))));
  check("...and it still says what works", /copy a document or write an invoice by hand/i.test(t), t.slice(0, 500));
} catch (e) {
  console.log("ERROR", e.message);
  results.push(false);
} finally {
  await browser.close();
  console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
}
