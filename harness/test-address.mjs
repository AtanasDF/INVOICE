import { launch, sleep, url, clickText, shot } from "./camera2.mjs";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };
const FIND = 'input[placeholder="Find address: postcode, or number and street"]';
const { browser, page } = await launch("large.mjpeg");
const finders = () => page.$$(FIND);
const textareaAfter = (i) => page.evaluate((i, sel) => document.querySelectorAll(sel)[i].closest(".space-y-1\\.5").querySelector("textarea").value, i, FIND);
async function search(i, text) {
  const f = (await finders())[i];
  await f.click({ clickCount: 3 });
  await page.keyboard.press("Backspace");
  await f.type(text, { delay: 20 });
  await page.waitForFunction(() => { const n = [...document.querySelectorAll("p")].find((p) => p.className.includes("text-[11px]")); return n && !/Searching/.test(n.textContent); }, { timeout: 15000 });
  await sleep(200);
  return page.evaluate(() => ({ options: [...document.querySelectorAll('[role="option"]')].map((o) => o.textContent), note: [...document.querySelectorAll("p")].find((p) => p.className.includes("text-[11px]"))?.textContent }));
}
const pickOption = (re) => page.evaluate((src) => { const o = [...document.querySelectorAll('[role="option"]')].find((x) => new RegExp(src).test(x.textContent)); o?.click(); return !!o; }, re);
try {
  await page.goto(url("/free-invoice"), { waitUntil: "networkidle0" });
  await page.evaluate(() => { localStorage.clear(); for (const t of ["free-invoice-scan", "free-invoice-signature"]) localStorage.setItem("tip:" + t, "3"); });
  await page.reload({ waitUntil: "networkidle0" });
  await clickText(page, "Start a quote");
  await sleep(500);
  check("a finder on both address fields", (await finders()).length === 2, String((await finders()).length));

  let r = await search(1, "SW1A 2AA");
  check("postcode lists its addresses", r.options[0]?.startsWith("10 Downing Street") && r.options.some((o) => /Not listed/.test(o)), JSON.stringify(r));
  check("credits OpenStreetMap", /OpenStreetMap/.test(r.note ?? ""), r.note);
  await shot(page, "address-dropdown");
  await pickOption("^10 Downing Street");
  await sleep(300);
  check("picking fills the customer address", (await textareaAfter(1)) === "10 Downing Street\nLondon\nSW1A 2AA", JSON.stringify(await textareaAfter(1)));
  check("finder clears after a pick", (await page.evaluate((s) => document.querySelectorAll(s)[1].value, FIND)) === "", "");

  // Street line typed first, then just the postcode.
  const ta = await page.evaluateHandle((s) => document.querySelectorAll(s)[0].closest(".space-y-1\\.5").querySelector("textarea"), FIND);
  await ta.click(); await page.keyboard.type("Unit 4, Mill Lane");
  r = await search(0, "ec1a1bb");
  check("unknown-house postcode offers the town and postcode", r.options.length === 1 && /EC1A 1BB, London/.test(r.options[0]), JSON.stringify(r));
  await pickOption("EC1A 1BB");
  await sleep(300);
  check("postcode-only pick keeps the street line typed above", (await textareaAfter(0)) === "Unit 4, Mill Lane\nLondon\nEC1A 1BB", JSON.stringify(await textareaAfter(0)));
  // Then a different postcode replaces the old town and postcode.
  r = await search(0, "M1 1AE");
  await pickOption(r.options.some((o) => /Not listed/.test(o)) ? "Not listed" : "M1 1AE");
  await sleep(300);
  check("a second postcode replaces town and postcode, keeps the street", (await textareaAfter(0)) === "Unit 4, Mill Lane\nManchester\nM1 1AE", JSON.stringify(await textareaAfter(0)));

  r = await search(1, "10 Downing Street");
  check("number and street finds addresses across the UK", r.options.length >= 3 && r.options.some((o) => /Halesowen|Dudley/.test(o)), JSON.stringify(r.options));
  await page.keyboard.press("ArrowDown"); await page.keyboard.press("ArrowDown"); await page.keyboard.press("Enter");
  await sleep(300);
  check("keyboard pick works", /^10 Downing Street\n(Halesowen|Dudley|Nottingham)\n/.test(await textareaAfter(1)), JSON.stringify(await textareaAfter(1)));

  r = await search(1, "ZZ9 9ZZ");
  check("an unknown postcode says so and offers it as typed", /couldn't find that postcode/.test(r.note ?? "") && r.options.length === 1 && /Use ZZ9 9ZZ as typed/.test(r.options[0]), JSON.stringify(r));
  await page.keyboard.press("Escape");

  await clickText(page, "Preview");
  await sleep(600);
  const t = await page.evaluate(() => document.body.innerText);
  check("preview prints the picked addresses", t.includes("Mill Lane") && t.includes("M1 1AE") && /Halesowen|Dudley|Nottingham/.test(t), t.slice(0, 300));
} catch (e) {
  console.log("ERROR", e.message); await shot(page, "address-error");
} finally {
  await browser.close();
  console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
}
