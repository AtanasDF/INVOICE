// Which line arms the camera, and which fires it -- for the duplicate-receipt
// bug in notes/everything.md item 59.
//
// A TOOL, not a suite. It needs instrumentation in DocumentCapture.tsx that is
// deliberately NOT committed: a `trace()` helper pushing to `window.__scanTrace`
// at each of the sites below. Add them, build, run this, then take them out
// again. The instrumentation is left out because a debug global in a shipped
// bundle is its own small bug, and because the trace changes the timing -- which
// is itself a finding, see below.
//
//   const trace = (what) => { (window.__scanTrace ??= []).push(`${Math.round(performance.now())} ${what}`); };
//
//   arm:restart        the stream effect, where armedRef.current = true
//   arm:rearm          the re-arm gate, with swap=/still=/ref=
//   arm:capture-failed the capture error path
//   fire:auto          the auto-capture gate, where capturedRef.current = true
//   capture / shutter / addShots / cameraLost
//
// WHAT IT ALREADY FOUND, and it is the reason the first four fixes did nothing:
//
//   4437 fire:auto swap=-1 still=1      <- the shot
//   5552 arm:rearm  swap=-1 still=0     <- armed again, fingerprint SILENT
//   7718 fire:auto  swap=-1 still=8     <- the same receipt, twice
//
// `swap=-1` means the page fingerprint had NO OPINION, every time. The cause is
// the line above it: auto-capture fires once the outline has been still for ONE
// tick by its own 9.6px tolerance (MOVE_TOLERANCE), while a fingerprint is only
// recorded after THREE ticks within 3px (PRINT_STILL_PX). So `taken.print` is
// null for a real capture, and every mechanism built on it is inert. Four
// separate "fixes" were measured against a no-op; one of them looked like a
// regression and was only noise.
//
// WHAT WAS TRIED AFTER THAT, and why it is not committed either: adopt a
// settled reading of the same page as its reference a moment after the shot,
// and let a settled same-page reading un-arm. Traced runs came back 4/4 clean
// and a plain run came back 5 duplicates in 8 -- the same build. The trace's own
// overhead moves the timing, so the protection lands in time or does not
// depending on the machine. A duplicated receipt goes into an accounting
// record, so a fix that works on a quiet machine is not a fix.
//
// NEXT: either make auto-capture itself wait for the fingerprint's stillness
// (which guarantees a reference for every captured page, and is a better shot
// anyway -- a receipt photographed at still=1 was taken before the lens
// settled), or stop relying on the fingerprint for SAFETY and find a rule that
// cannot race. Measure with CLIP= and N= against a production build.
//
// Run: node trace-batch-capture.mjs          (CLIP=hand.mjpeg N=4 by default)
import { makeDb } from "./mockdb.mjs";
import { launchCameraSignedIn } from "./camera-signed.mjs";
const BASE = "http://localhost:3100";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < Number(process.env.N ?? 4); i++) {
  const db = makeDb();
  db.tables.business_profile.push({ business_name: "Harness Ltd", vat_registered: false });
  const { browser, page } = await launchCameraSignedIn(db, process.env.CLIP ?? "hand.mjpeg", BASE);
  try {
    await page.evaluate(() => { localStorage.setItem("scanner-auto","on"); for (const t of ["scanner-auto","scanner-stack","camera-allow","dashboard-welcome","scan-batch"]) localStorage.setItem("tip:"+t,"3"); });
    await page.goto(BASE + "/scan", { waitUntil: "networkidle0" });
    await page.waitForFunction(() => document.querySelector("video")?.videoWidth > 2, { timeout: 20000 });
    let most = 0;
    for (const t0 = Date.now(); Date.now() - t0 < 16000; ) {
      most = Math.max(most, await page.evaluate(() => Number(document.querySelector('[aria-label^="Review "]')?.getAttribute("aria-label")?.match(/\d+/)?.[0] ?? 0)));
      if (most > 1) break;
      await sleep(150);
    }
    const tr = await page.evaluate(() => window.__scanTrace ?? []);
    console.log(`\n===== run ${i + 1}: stack ${most} ${most > 1 ? "<<< DUPLICATE" : ""}`);
    console.log(tr.join("\n"));
  } catch (e) { console.log("ERROR", e.message); } finally { await browser.close(); }
}
