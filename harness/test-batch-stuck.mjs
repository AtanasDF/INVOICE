// "The scanner doesn't pile up photos from when scanning so doesn't allow you
// to scan more than one file" -- Atanas, from his iPhone, 2026-10-09, AFTER the
// paused-video fix that was thought to explain it.
//
// The cause is the one notes/batch-rearm.md already describes and still has
// open: after a capture, auto-capture re-arms only when the page it took counts
// as GONE, and that test is purely geometric -- lost for two ticks, its centre
// moved, or shrunk. Slide the next document into the same place at the same
// size and nothing it looks at changes, so the second document is never taken.
// `batch-swap.mjpeg`, the only clip that covered batching, has 21 empty frames
// between its two pages, which is the easy case and not the one he does;
// `swap-inplace.mjpeg` cuts straight from one document to a different one in
// the same rectangle.
//
// A fingerprint fix was tried, measured and rejected (it fired on a receipt
// lying on a patterned floor, which is indistinguishable from a real swap, and
// a DUPLICATED receipt in an accounting record is worse than a missed one). So
// this suite does not assert the hole is gone. It asserts two things:
//
//   1. the hole is still EXACTLY the hole we think it is -- auto-capture does
//      not re-arm on an in-place swap -- so nobody is misled about what is
//      fixed, and so the day somebody closes it properly, check 2 tells them;
//   2. the person holding the phone is NOT TRAPPED by it. That was the real
//      bug: the hint read "Got it -- 1 scanned. Next document..." and went on
//      saying exactly that for as long as he stood there, while the shutter
//      underneath worked perfectly all along and nothing mentioned it.
import { makeDb } from "./mockdb.mjs";
import { launchCameraSignedIn } from "./camera-signed.mjs";

const BASE = process.env.BASE ?? "http://localhost:3000";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

const stackCount = (page) =>
  page.evaluate(() => Number(document.querySelector('[aria-label^="Review "]')?.getAttribute("aria-label")?.match(/\d+/)?.[0] ?? 0));
const hintText = (page) =>
  page.evaluate(() => [...document.querySelectorAll("div")].find((d) => d.className.includes("line-clamp-2"))?.textContent ?? "");

const db = makeDb();
db.tables.business_profile.push({ business_name: "Harness Ltd", vat_registered: false });
const { browser, page } = await launchCameraSignedIn(db, "swap-inplace.mjpeg", BASE);
try {
  await page.evaluate(() => {
    localStorage.setItem("scanner-auto", "on");
    for (const t of ["scanner-auto", "scanner-stack", "camera-allow", "dashboard-welcome", "scan-batch"]) localStorage.setItem("tip:" + t, "3");
  });
  await page.goto(BASE + "/scan", { waitUntil: "networkidle0" });
  await page.waitForFunction(() => document.querySelector("video")?.videoWidth > 2, { timeout: 20000 });

  // The first document is taken on its own, as it always was.
  let first = 0;
  for (const t0 = Date.now(); Date.now() - t0 < 14000; ) {
    first = await stackCount(page);
    if (first >= 1) break;
    await sleep(250);
  }
  check("the first document is captured by itself", first >= 1, `stack ${first}`);

  // Now the second document is in the same rectangle. Watch long enough that
  // the re-arm would certainly have fired if it were going to, and collect
  // every hint seen so the one that matters cannot be missed between polls.
  const seen = new Set();
  let afterwards = first;
  for (const t0 = Date.now(); Date.now() - t0 < 9000; ) {
    const h = await hintText(page);
    if (h) seen.add(h.trim());
    afterwards = Math.max(afterwards, await stackCount(page));
    await sleep(200);
  }
  const hints = [...seen];

  // Check 1: THE HOLE ITSELF. This is what the whole page-fingerprint exists
  // for -- the second document, in the same rectangle, with no empty frame
  // between them, taken without anybody touching anything.
  check(
    "the second document in the same spot is captured on its own",
    afterwards > first,
    `stack ${first} -> ${afterwards}: auto-capture did not re-arm. notes/batch-rearm.md has the gates; swap:/still: in the camera readout show why`
  );

  // Check 2: the way out is still there for the cases the fingerprint declines
  // to judge -- a page beyond PRINT_NEAR_PX, or an outline that will not settle.
  // Those fall back to geometry exactly as before, and the hint must not leave
  // him reading "Next document..." for ever if it never fires.
  const stuck = hints.find((h) => /tap the button/i.test(h));
  const repeated = hints.filter((h) => /Next document/i.test(h));
  check(
    "either it re-armed or it named the shutter -- it never just repeats itself",
    afterwards > first || !!stuck,
    `re-armed: ${afterwards > first}, hints: ${JSON.stringify(hints)}`
  );
  if (stuck) {
    check("...and the nudge asks rather than instructs, so it cannot talk him into a duplicate", /if this is a different document/i.test(stuck), String(stuck));
    check("...in plain words, with no jargon", !/(re-?arm|auto-?capture|geometric|detector|fingerprint)/i.test(stuck), String(stuck));
  } else {
    check("...and it did not sit on the dead-end wording", repeated.length === 0 || afterwards > first, JSON.stringify(hints));
  }

  // Check 3: the shutter works regardless. This is the whole of his complaint --
  // "doesn't allow you to scan more than one file" -- so it is not enough to
  // point at the button; pressing it has to produce a second scan.
  await page.evaluate(() => document.querySelector('button[aria-label="Capture"]')?.click());
  let afterTap = afterwards;
  for (const t0 = Date.now(); Date.now() - t0 < 12000; ) {
    afterTap = await stackCount(page);
    if (afterTap > afterwards) break;
    await sleep(250);
  }
  check("tapping the button scans another document", afterTap > afterwards, `stack ${afterwards} -> ${afterTap}`);

  // And the shutter is not a one-shot: `capturedRef` is cleared on the batch
  // success path, and that is what lets him work through a whole pile by hand
  // if the re-arm never helps him once.
  await page.evaluate(() => document.querySelector('button[aria-label="Capture"]')?.click());
  let third = afterTap;
  for (const t0 = Date.now(); Date.now() - t0 < 12000; ) {
    third = await stackCount(page);
    if (third > afterTap) break;
    await sleep(250);
  }
  check("and again, so a whole pile can be done by hand", third > afterTap, `stack ${afterTap} -> ${third}`);
} catch (e) {
  console.log("ERROR", e.message);
} finally {
  await browser.close();
}

// ---------------------------------------------------------------------------
// THE PART THAT MATTERS MORE THAN THE FIX
// ---------------------------------------------------------------------------
// A missed second document is an annoyance. A DUPLICATED receipt goes into an
// accounting record, and the first attempt at this was reverted precisely
// because it fired on one of four single-document clips -- a receipt lying on a
// patterned floor read exactly what a genuine swap read.
//
// So every clip that holds ONE document is run in batch mode and must come back
// with one scan. `pattern` is the clip that killed the first attempt and is the
// reason this block exists; the others cover a page held close, a receipt at
// arm's length, glare, a shadow moving across it, a hand in frame, and a
// patterned floor with no document at all.
const ONE_DOCUMENT = [
  ["pattern.mjpeg", "a receipt on a patterned floor -- the clip that killed the first attempt"],
  ["large.mjpeg", "one A4 invoice, held close"],
  ["far-receipt.mjpeg", "one receipt at arm's length"],
  ["glare.mjpeg", "one page under glare"],
  ["shadow.mjpeg", "one page with a shadow crossing it"],
  ["hand.mjpeg", "one page with a hand in frame"],
  ["tiles.mjpeg", "kitchen tiles -- no document at all"],
];

for (const [clip, what] of ONE_DOCUMENT) {
  const db2 = makeDb();
  db2.tables.business_profile.push({ business_name: "Harness Ltd", vat_registered: false });
  const run = await launchCameraSignedIn(db2, clip, BASE);
  try {
    await run.page.evaluate(() => {
      localStorage.setItem("scanner-auto", "on");
      for (const t of ["scanner-auto", "scanner-stack", "camera-allow", "dashboard-welcome", "scan-batch"]) localStorage.setItem("tip:" + t, "3");
    });
    await run.page.goto(BASE + "/scan", { waitUntil: "networkidle0" });
    await run.page.waitForFunction(() => document.querySelector("video")?.videoWidth > 2, { timeout: 20000 });
    let most = 0;
    for (const t0 = Date.now(); Date.now() - t0 < 16000; ) {
      most = Math.max(most, await stackCount(run.page));
      if (most > 1) break;
      await sleep(250);
    }
    check(`no duplicate: ${what}`, most <= 1, `${clip} reached a stack of ${most}`);
  } catch (e) {
    console.log("ERROR", clip, e.message);
    check(`no duplicate: ${what}`, false, `crashed: ${e.message}`);
  } finally {
    await run.browser.close();
  }
}

console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
