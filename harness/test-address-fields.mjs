// Address in its own fields (house/street, area, town, postcode) with one
// Find. Atanas's bug: a postcode pick wiped the street typed above it.
// Real lookups (postcodes.io + photon), Free page.
import { launch, sleep, url, clickText, shot } from "./camera2.mjs";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };
const { browser, page } = await launch("large.mjpeg");
const blocks = () => page.$$('input[placeholder="House number and street"]');
// Every field of the i-th address block.
const fields = (i) => page.evaluate((i) => {
  const block = [...document.querySelectorAll('input[placeholder="House number and street"]')][i].closest(".space-y-2");
  const v = (label) => block.querySelector(`input[aria-label="${label}"]`)?.value ?? null;
  return { line1: v("House number and street"), line2: v("Flat, building or area"), town: v("Town or city"), postcode: v("Postcode") };
}, i);
const type = (i, label, text) => page.evaluate((i, label, text) => {
  const el = [...document.querySelectorAll('input[placeholder="House number and street"]')][i].closest(".space-y-2").querySelector(`input[aria-label="${label}"]`);
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, text);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("blur", { bubbles: true }));
}, i, label, text);
// The note under the list is the block's own 12px paragraph (it was 11px
// before the contrast floor of 2026-09-22).
const noteIn = (i) => [...document.querySelectorAll('input[placeholder="House number and street"]')][i].closest(".space-y-2").querySelector("p.text-xs");
const findIn = async (i) => {
  await page.evaluate((i) => [...document.querySelectorAll('input[placeholder="House number and street"]')][i].closest(".space-y-2").querySelector("button").click(), i);
  await page.waitForFunction((i) => { const n = [...document.querySelectorAll('input[placeholder="House number and street"]')][i].closest(".space-y-2").querySelector("p.text-xs"); return n && !/Searching/.test(n.textContent) && !/Fill in a postcode|Lists the addresses/.test(n.textContent); }, { timeout: 20000 }, i);
  await sleep(200);
  return page.evaluate((i) => {
    const block = [...document.querySelectorAll('input[placeholder="House number and street"]')][i].closest(".space-y-2");
    const notes = [...block.querySelectorAll("p.text-xs")];
    return {
      options: [...block.querySelectorAll('[role="option"]')].map((o) => o.textContent),
      note: notes.map((n) => n.textContent).find((t) => !/Fill in a postcode|Lists the addresses/.test(t)) ?? notes.at(-1)?.textContent,
    };
  }, i);
};
const pickOption = (re) => page.evaluate((src) => { const o = [...document.querySelectorAll('[role="option"] button')].find((x) => new RegExp(src).test(x.textContent)); o?.click(); return !!o; }, re);
try {
  await page.goto(url("/free-invoice"), { waitUntil: "networkidle0" });
  await page.evaluate(() => { localStorage.clear(); for (const t of ["free-invoice-scan", "free-invoice-signature"]) localStorage.setItem("tip:" + t, "3"); });
  await page.reload({ waitUntil: "networkidle0" });
  await clickText(page, "Start a quote");
  await sleep(500);
  // The addresses sit behind "Add more details" until something is in them.
  check("a fresh editor shows no address boxes yet", (await blocks()).length === 0, String((await blocks()).length));
  await clickText(page, "Add more details");
  await sleep(400);
  check("address fields on both addresses", (await blocks()).length === 2, String((await blocks()).length));
  check("no separate find box or address textarea any more", !(await page.$('input[placeholder="Find address: postcode, or number and street"]')) && (await page.$$('textarea[aria-label]')).length === 0);

  // The bug: a street typed in, then a postcode, must keep both.
  await type(0, "House number and street", "Unit 4, Mill Lane");
  await type(0, "Postcode", "ec1a 1bb");
  let r = await findIn(0);
  check("postcode lists what's there, or offers the postcode itself", r.options.length >= 1, JSON.stringify(r).slice(0, 200));
  check("credits OpenStreetMap", /OpenStreetMap/.test(r.note ?? ""), r.note);
  check("picked the postcode-only option", await pickOption("Use just the postcode|^EC1A 1BB"));
  await sleep(300);
  let f = await fields(0);
  check("street typed above is kept", f.line1 === "Unit 4, Mill Lane", JSON.stringify(f));
  check("town and postcode filled in", f.town === "London" && f.postcode === "EC1A 1BB", JSON.stringify(f));

  // A second postcode replaces town and postcode, still keeping the street.
  await type(0, "Postcode", "M1 1AE");
  r = await findIn(0);
  check("picked the postcode-only option again", await pickOption("Use just the postcode|^M1 1AE"));
  await sleep(300);
  f = await fields(0);
  check("street still there, town and postcode moved", f.line1 === "Unit 4, Mill Lane" && f.postcode === "M1 1AE" && f.town === "Manchester", JSON.stringify(f));

  // A full address pick fills every field.
  await type(1, "Postcode", "SW1A 2AA");
  r = await findIn(1);
  check("a known postcode lists real addresses", r.options.some((o) => /Downing Street/i.test(o)), JSON.stringify(r.options).slice(0, 200));
  check("picked 10 Downing Street", await pickOption("10 Downing Street"));
  await sleep(300);
  f = await fields(1);
  check("full pick fills street, town and postcode", /Downing Street/.test(f.line1 ?? "") && f.town === "London" && f.postcode === "SW1A 2AA", JSON.stringify(f));

  // Number and street, with no postcode.
  await type(1, "Postcode", "");
  await type(1, "House number and street", "10 Downing Street");
  await type(1, "Town or city", "");
  r = await findIn(1);
  check("number and street finds addresses", r.options.length >= 1, JSON.stringify(r.options).slice(0, 200));
  check("picking one fills its postcode", (await pickOption("Downing Street")) && (await sleep(300), (await fields(1)).postcode?.length >= 5), JSON.stringify(await fields(1)));

  // A fuzzy match from the other end of the country is not offered:
  // "149 Benares Road" once listed a school in Devon and one in Hampshire.
  await type(1, "Postcode", "");
  await type(1, "House number and street", "149 Benares Road");
  await type(1, "Town or city", "London");
  r = await findIn(1);
  check("the road itself is offered", r.options.some((o) => /Benares Road/i.test(o)), JSON.stringify(r.options).slice(0, 300));
  check("a street typed lists only places carrying its name", r.options.length >= 1 && r.options.every((o) => /Benares/i.test(o)), JSON.stringify(r.options).slice(0, 300));
  check("...nothing from Devon or Hampshire", !r.options.some((o) => /Teignmouth|Steep|Bedales/i.test(o)), JSON.stringify(r.options).slice(0, 300));

  // A postcode the free directory has no houses for says so plainly
  // (Atanas's own, 2026-09-22: "it gives you nothing"). Only checked while
  // OpenStreetMap still has none there.
  await type(1, "House number and street", "");
  await type(1, "Town or city", "");
  await type(1, "Postcode", "SE18 1HU");
  r = await findIn(1);
  if (r.options.length === 1 && /Fills in the town and postcode/.test(r.options[0])) {
    check("no houses listed: the note says so and what to do", /No houses are listed for SE18 1HU/.test(r.note ?? "") && /type your house number and street/.test(r.note ?? ""), r.note);
  } else {
    check("SE18 1HU now has houses in the free directory (the wording case can't be shown here)", true);
  }
  check("picked the postcode itself", await pickOption("Use just the postcode|^SE18 1HU"));
  await sleep(300);
  f = await fields(1);
  check("it fills the town and postcode and leaves the street for typing", f.town === "London" && f.postcode === "SE18 1HU" && f.line1 === "", JSON.stringify(f));
  await type(1, "House number and street", "149 Benares Road");

  // A postcode that doesn't exist.
  await type(0, "House number and street", "Unit 4, Mill Lane");
  await type(0, "Postcode", "ZZ99 9ZZ");
  r = await findIn(0);
  check("an unknown postcode says so and offers it as typed", /couldn't find that postcode/i.test(r.note ?? "") && r.options.length === 1, JSON.stringify(r).slice(0, 200));
  await pickOption("ZZ99");
  await sleep(300);
  f = await fields(0);
  check("keeping it as typed leaves the street and town alone", f.line1 === "Unit 4, Mill Lane" && f.postcode === "ZZ99 9ZZ" && f.town === "Manchester", JSON.stringify(f));

  await shot(page, "address-fields");
  check("fits 375px", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));

  // The address reaches the printed document.
  await clickText(page, "Preview");
  await sleep(800);
  const t = await page.evaluate(() => document.body.innerText);
  check("preview prints the addresses", t.includes("Mill Lane") && t.includes("Benares Road") && t.includes("SE18 1HU"), t.slice(0, 300));
} catch (e) { console.log("ERROR", e.message); await shot(page, "address-fields-error"); }
finally { await browser.close(); console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length })); }
