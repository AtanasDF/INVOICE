// The conditions a receipt actually gets photographed in.
//
// Seven clips from gen-conditions.py, each fourteen seconds: the awkward
// condition first, the good one from six seconds in. Four of them are
// things the scanner should shrug off and take the photo anyway -- glare,
// a shadow, a patterned floor, a landscape page. Three are things it must
// NOT fire on until they stop: a finger over a corner, the phone waving
// about, a till roll running off the top and bottom of the frame.
//
// What is watched is the auto-capture itself: when the first photo is
// posted to the reader, measured from the moment the camera came up.
import fs from "fs";
import { launch, openScanner, sleep, hint, measure } from "./camera3.mjs";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };
const HERE = new URL(".", import.meta.url).pathname;
const only = process.argv[2];

// Runs one clip: returns the time of the first capture in ms from the
// camera coming up, or null if none within `waitMs`, plus the hints seen.
async function run(clip, waitMs) {
  if (!fs.existsSync(HERE + clip)) return { missing: true };
  const { browser, page, posted } = await launch(clip);
  const hints = new Set();
  try {
    await openScanner(page, { auto: "on" });
    const t0 = Date.now();
    let first = null;
    while (Date.now() - t0 < waitMs) {
      if (posted.length && first === null) { first = Date.now() - t0; break; }
      const h = await hint(page).catch(() => null);
      if (h) hints.add(String(h).slice(0, 60));
      await sleep(200);
    }
    return { first, hints: [...hints], posted: posted.length };
  } catch (e) {
    return { error: e.message };
  } finally {
    await browser.close();
  }
}

// Like run(), and also measures the first captured image.
async function runMeasured(clip, waitMs) {
  if (!fs.existsSync(HERE + clip)) return { missing: true };
  const { browser, page, posted } = await launch(clip);
  try {
    await openScanner(page, { auto: "on" });
    const t0 = Date.now();
    while (Date.now() - t0 < waitMs && !posted.length) await sleep(200);
    const first = posted.length ? Date.now() - t0 : null;
    const img = posted[0]?.[0];
    const m = img ? await measure(page, img) : null;
    return { first, w: m?.w ?? null, h: m?.h ?? null, aspect: m ? +(m.w / m.h).toFixed(3) : null };
  } catch (e) { return { error: e.message }; } finally { await browser.close(); }
}

const SWITCH_MS = 6000;   // when each clip's awkward condition ends
const SLACK_MS = 500;     // frames in flight

try {
  // Should fire anyway.
  for (const [clip, what] of [["glare.mjpeg", "glare on the page"], ["shadow.mjpeg", "a shadow across the page"], ["pattern.mjpeg", "a page on a tiled floor"], ["landscape.mjpeg", "a landscape page"]]) {
    if (only && only !== clip) continue;
    const r = await run(clip, 12000);
    if (r.missing) { check(`${what}: clip is present`, false, `${clip} missing -- run gen-conditions.py`); continue; }
    check(`${what} is still captured`, r.first !== null && !r.error, JSON.stringify(r));
  }

  // A finger over one corner: the detector fits straight lines to the
  // sides and puts the corner where they meet (the bent-paper work in
  // CLAUDE.md), so it fires with the finger there rather than waiting --
  // and what it must not do is cut the page at the finger. The receipt in
  // the clip is 300 wide for 840 tall, so the crop has to be about that
  // shape: cut at the finger it would be far wider or far shorter.
  if (!only || only === "hand.mjpeg") {
    const r = await runMeasured("hand.mjpeg", 12000);
    if (r.missing) check("a finger over a corner: clip is present", false, "hand.mjpeg missing -- run gen-conditions.py");
    else {
      check("a finger over a corner is still captured, the corner recovered from the sides", r.first !== null, JSON.stringify(r));
      check("...and the crop is page-shaped, not cut at the finger", r.aspect !== null && Math.abs(r.aspect - 300 / 840) < 0.07, JSON.stringify(r));
    }
  }

  // Must wait for the condition to stop.
  for (const [clip, what] of [["moving.mjpeg", "a phone waving about"], ["tillroll.mjpeg", "a till roll running off the frame"]]) {
    if (only && only !== clip) continue;
    const r = await run(clip, 16000);
    if (r.missing) { check(`${what}: clip is present`, false, `${clip} missing -- run gen-conditions.py`); continue; }
    check(`${what} is NOT captured while it lasts`, r.first === null || r.first > SWITCH_MS - SLACK_MS, JSON.stringify(r));
    check(`...and IS captured once it stops`, r.first !== null && r.first > SWITCH_MS - SLACK_MS, JSON.stringify(r));
  }
} catch (e) { console.log("ERROR", e.message); results.push(false); }
console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
