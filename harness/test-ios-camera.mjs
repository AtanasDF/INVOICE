// The iPhone camera and scanning fixes (notes/ios-safari.md, findings 3, 4,
// 14, 15 and 16), held without a phone: the rules are in lib and run here,
// and the places they are wired in are read from the source so a later edit
// can't quietly put the old behaviour back. Only a real iPhone shows the
// timing; this pins the decisions.
import fs from "node:fs";
import { REPO } from "./repo.mjs";
import { MUTE_GRACE_MS, interruptionAction, watchdogMayFire } from "./gen/lib/cameraInterruption.js";
import { DECODE_AT_ONCE, isBlankDataUrl, settleFew } from "./gen/lib/settleFew.js";
import { KEPT_FOR_MS, KEPT_READINGS_KEY, keptFromText, keptToText, readingsToKeep } from "./gen/lib/keptReadings.js";
import { PERSONAL_SESSION_KEYS } from "./gen/lib/accountSwitch.js";

const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };
const src = (f) => fs.readFileSync(`${REPO}/web/src/${f}`, "utf8");

// --- 3: an interruption is waited out, not torn down ---
const s = (o) => ({ ended: false, muted: false, hidden: false, visibleForMs: 10_000, ...o });
check("a muted track on a hidden page waits", interruptionAction(s({ muted: true, hidden: true, visibleForMs: 0 })) === "wait");
check("even an ended track waits while the page is hidden (no prompt nobody can see)", interruptionAction(s({ ended: true, hidden: true, visibleForMs: 0 })) === "wait");
check("muted just after coming back waits for iOS to unmute it", interruptionAction(s({ muted: true, visibleForMs: 300 })) === "wait");
check("still muted past the grace is reopened", interruptionAction(s({ muted: true, visibleForMs: MUTE_GRACE_MS })) === "restart");
check("an ended track on a visible page is reopened", interruptionAction(s({ ended: true })) === "restart");
check("unmuted and visible carries on", interruptionAction(s({})) === "carry-on");
check("the grace is a couple of seconds, not a frame", MUTE_GRACE_MS >= 1000 && MUTE_GRACE_MS <= 5000, String(MUTE_GRACE_MS));

// --- 16: the watchdog stands down while a shot is taken ---
check("the watchdog may fire on a live, idle camera", watchdogMayFire(false, false));
check("not while a shot is being taken", !watchdogMayFire(false, true));
check("not while interrupted", !watchdogMayFire(true, false));

const cap = src("components/DocumentCapture.tsx");
check("mute no longer calls cameraLost directly", !/addEventListener\("mute",\s*lost\)/.test(cap) && /addEventListener\("mute", check\)/.test(cap));
check("unmute is listened for", /addEventListener\("unmute", check\)/.test(cap));
check("the page going out of view is watched, and unwatched on cleanup", /addEventListener\("visibilitychange", onVisibility\)/.test(cap) && /removeEventListener\("visibilitychange", onVisibility\)/.test(cap) && /unwatch\(\);\s*stopStream\(\);/.test(cap));
check("the frame loop pauses while interrupted", /statusRef\.current === "live" && !interruptedRef\.current/.test(cap));
check("the watchdog asks watchdogMayFire before calling the camera lost", /if \(!watchdogMayFire\(interruptedRef\.current, capturingRef\.current\)\) return;/.test(cap));
check("capture marks itself in flight for its whole length", /capturingRef\.current = true;\s*try \{\s*await shoot\(\);\s*\} finally \{\s*capturingRef\.current = false;/.test(cap));
check("a dropped shot is said out loud", (cap.match(/return dropped\(\);/g) ?? []).length === 3 && /const dropped = \(\) => showFailure\(/.test(cap));
check("camera permission still goes only through lib/camera", !/getUserMedia\(/.test(cap));

// --- 15: canvases released, a blank image refused ---
check('"data:," is blank', isBlankDataUrl("data:,"));
check('"data:image/png;base64," with nothing in it is blank', isBlankDataUrl("data:image/png;base64,"));
check("a real JPEG is not", !isBlankDataUrl("data:image/jpeg;base64,/9j/4AAQ"));
check("a PDF is not", !isBlankDataUrl("data:application/pdf;base64,JVBERi0"));
const render = cap.slice(cap.indexOf("async function renderCapture"), cap.indexOf("async function capture()"));
check("renderCapture releases the frame, the still and the warped page", /finally \{\s*release\(frame, still, out\);/.test(render));
check("the warp's OpenCV images are freed in a finally", /finally \{\s*for \(const m of mats\) m\.delete\(\);/.test(render) && !/\bsrc\.delete\(\);/.test(render));
check("a blank render is a failure, not a page", /if \(!image \|\| isBlankDataUrl\(image\)\) throw/.test(cap));
check("the thumbnails and work frames are released", /release\(small\);/.test(cap) && /release\(c, src !== source \? src : null\);/.test(cap) && /const like = likeness[^;]*;\s*release\(c\);/.test(cap));
const down = src("lib/imageDownscale.ts");
check("the downscaler refuses a blank image instead of passing it through", /if \(isBlankDataUrl\(dataUrl\)\) throw/.test(down) && /if \(isBlankDataUrl\(out\)\) throw/.test(down));
check("the downscaler releases its canvas", /canvas\.width = canvas\.height = 0;/.test(down));

// --- 14: many photos are decoded a couple at a time ---
let running = 0, most = 0;
const order = [];
const settled = await settleFew([1, 2, 3, 4, 5, 6, 7], 2, async (n) => {
  running++; most = Math.max(most, running);
  await new Promise((r) => setTimeout(r, 5 * (8 - n)));
  running--;
  order.push(n);
  if (n === 4) throw new Error("bad file");
  return n * 10;
});
check("never more than two at once", most === 2, String(most));
check("results come back in the order chosen", settled.map((r) => r.status === "fulfilled" ? r.value : "x").join() === "10,20,30,x,50,60,70");
check("one bad file is a rejection, not the end of the batch", settled[3].status === "rejected" && settled[6].status === "fulfilled");
check("an empty choice settles to nothing", (await settleFew([], 2, async () => 1)).length === 0);
check("two at a time", DECODE_AT_ONCE === 2);
for (const f of ["components/UploadFilesButton.tsx", "components/UploadPanel.tsx"]) {
  check(`${f} reads through readUploads, not all at once`, /await readUploads\(/.test(src(f)) && !/Promise\.allSettled\(/.test(src(f)));
}
check("the camera's own file picker reads a couple at a time", /settleFew\(files, DECODE_AT_ONCE, readFile\)/.test(cap) && !/Promise\.allSettled\(files\.map/.test(cap));
check("scanHandoff's readUploads is the limited one", /settleFew\(files, DECODE_AT_ONCE, readUpload\)/.test(src("lib/scanHandoff.ts")));

// --- 4: readings survive a reload, and leaving asks first ---
const docs = [
  { result: { vendor: "Tesco" }, error: null, done: null },
  { result: { vendor: "Saved" }, error: null, done: "saved" },
  { result: { vendor: "Skipped" }, error: null, done: "skipped" },
  { result: null, error: null, done: null },
  { result: null, error: "Scanning failed.", done: null },
];
check("only read, unsaved documents are kept", JSON.stringify(readingsToKeep(docs)) === JSON.stringify([{ vendor: "Tesco" }]));
const now = 1_800_000_000_000;
const text = keptToText([{ vendor: "Tesco", totalAmount: 12.4 }], now);
check("kept readings round-trip", keptFromText(text, now + 60_000)[0]?.vendor === "Tesco");
check("nothing to keep writes nothing", keptToText([], now) === null);
check("stale readings are not offered", keptFromText(text, now + KEPT_FOR_MS + 1).length === 0);
check("readings from the future (a clock change) are not offered", keptFromText(text, now - 60_000).length === 0);
check("rubbish in storage is nothing, not a crash", keptFromText("{nope", now).length === 0 && keptFromText('{"at":1}', now).length === 0 && keptFromText(null, now).length === 0);
check("no photo is kept", !/dataUrl|pages/.test(keptToText(readingsToKeep(docs), now)));
check("the key is personal, cleared when somebody else signs in", PERSONAL_SESSION_KEYS.includes(KEPT_READINGS_KEY));

const scan = src("app/scan/page.tsx");
check("/scan writes the readings through on every change to the walk", /if \(walk\) keepReadings\(readingsToKeep\(walk\.docs\)\);/.test(scan));
check("/scan offers kept readings before the camera opens over them", /scanCaptureWaiting\(\) \|\| kept\.length \? null : \{ kind: "first" \}/.test(scan));
check("a restored document says its photo wasn't kept", /readNote: KEPT_NOTE/.test(scan) && /photo wasn't kept/.test(scan));
check("Save all leaves a photo-less document for a look", /if \(!look && !\(isShown \? shown\.pages : d\.pages\)\.length\) look = "photo wasn't kept";/.test(scan));
check("discarding drops the kept readings", /dropKeptReadings\(\);\s*router\.push\("\/"\);/.test(scan));
check("/scan guards leaving while anything is unsaved", /useLeaveGuard\(\s*unsaved > 0,/.test(scan));
const guard = src("lib/useLeaveGuard.ts");
check("the guard catches links, Back and unload", /addEventListener\("popstate", onPop\)/.test(guard) && /addEventListener\("beforeunload", beforeUnload\)/.test(guard) && /addEventListener\("click", onClick, true\)/.test(guard));
check("...and the header's Sign out", /=== "Sign out"/.test(guard));
check("...and removes all three", /removeEventListener\("popstate"/.test(guard) && /removeEventListener\("beforeunload"/.test(guard) && /removeEventListener\("click"/.test(guard));
check("/scan's storage read for the engine stays guarded", /function readEngine\(\): ScanEngine \{\s*try \{/.test(scan));

const passed = results.filter(Boolean).length;
console.log(JSON.stringify({ passed, total: results.length }));
process.exit(passed === results.length ? 0 : 1);
