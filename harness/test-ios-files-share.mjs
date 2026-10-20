// iPhone Safari: files, sharing, downloads and links (notes/ios-safari.md,
// findings 7-13, 17-19, 24 and 25; cloud brief 15).
//
// None of these can be seen in the harness's desktop Chrome: Safari refuses a
// clipboard write or a window.open that comes after an await, keeps only the
// first of several downloads, and gives a home-screen app no address bar. So
// the rules are run here with stand-ins for the browser, and the source is
// read so that each fix cannot quietly come back. Two halves:
//   1. lib/afterTap.ts and the sizes in lib/saveFile.ts and lib/fx.ts, run;
//   2. web/src and the service worker, read.
// The service worker itself is run by test-sw-behaviour.
import fs from "node:fs";
import path from "node:path";
import { REPO } from "./repo.mjs";

const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };
const SRC = `${REPO}/web/src`;
const read = (p) => fs.readFileSync(path.join(SRC, p), "utf8");
const tick = () => new Promise((r) => setTimeout(r, 0));

// ---------------------------------------------------------------------------
// 1. Run.

// A stand-in clipboard that records what was asked of it, and whether it was
// asked before the handler's first await -- which is all Safari cares about.
function clipboardStub({ refuseLate = true } = {}) {
  const log = [];
  let inTap = true;
  const clipboard = {
    writeText: (t) => { log.push(["writeText", t, inTap]); return inTap || !refuseLate ? Promise.resolve() : Promise.reject(new DOMException("no", "NotAllowedError")); },
    write: async (items) => {
      const sync = inTap;
      log.push(["write", null, sync]);
      if (!sync && refuseLate) throw new DOMException("no", "NotAllowedError");
      const blob = await items[0].items["text/plain"];
      log.push(["wrote", await blob.text(), sync]);
    },
  };
  return { clipboard, log, endTap: () => { inTap = false; } };
}
class ClipboardItemStub { constructor(items) { this.items = items; } }

function useStubs(stub, { clipboardItem = true } = {}) {
  Object.defineProperty(globalThis, "navigator", { value: { clipboard: stub.clipboard }, configurable: true, writable: true });
  globalThis.ClipboardItem = clipboardItem ? ClipboardItemStub : undefined;
}

const { copyText, openWhenReady } = await import("./gen/lib/afterTap.js");

{
  const s = clipboardStub();
  useStubs(s);
  const p = copyText("https://app.test/i/abc");
  s.endTap();
  check("a link already in hand is written inside the tap", (await p) === true && s.log[0][0] === "writeText" && s.log[0][2] === true, JSON.stringify(s.log));
}
{
  const s = clipboardStub();
  useStubs(s);
  let give;
  const url = new Promise((r) => { give = r; });
  const p = copyText(url);
  s.endTap();
  await tick();
  give("https://app.test/i/new");
  check("a link still being made goes to the clipboard inside the tap, as a promise", (await p) === true && s.log[0][0] === "write" && s.log[0][2] === true, JSON.stringify(s.log));
  check("...and what lands on the clipboard is the link", s.log.some(([k, t]) => k === "wrote" && t === "https://app.test/i/new"), JSON.stringify(s.log));
}
{
  const s = clipboardStub();
  useStubs(s);
  const url = Promise.reject(new Error("offline"));
  url.catch(() => {});
  const ok = await copyText(url);
  check("a link that couldn't be made copies nothing and says so", ok === false, String(ok));
}
{
  const s = clipboardStub({ refuseLate: false });
  useStubs(s, { clipboardItem: false });
  const ok = await copyText(Promise.resolve("https://app.test/q/x"));
  check("a browser without ClipboardItem writes the link once it is made", ok === true && s.log.some(([k, t]) => k === "writeText" && t === "https://app.test/q/x"), JSON.stringify(s.log));
}
{
  Object.defineProperty(globalThis, "navigator", { value: {}, configurable: true, writable: true });
  check("no clipboard at all is a plain false, not a crash", (await copyText("x")) === false);
}

function windowStub({ blocked = false } = {}) {
  const log = [];
  let inTap = true;
  const win = { opener: "the app", closed: false, location: { href: "" }, close() { this.closed = true; } };
  globalThis.window = {
    open: (...a) => { log.push(["open", inTap, ...a]); return blocked ? null : win; },
    location: { assign: (u) => log.push(["assign", u]) },
  };
  return { log, win, endTap: () => { inTap = false; } };
}
{
  const w = windowStub();
  const p = openWhenReady(new Promise((r) => setTimeout(() => r("https://storage.test/doc.pdf"), 5)));
  w.endTap();
  const ok = await p;
  check("the supplier's document opens a window inside the tap", w.log[0]?.[0] === "open" && w.log[0][1] === true, JSON.stringify(w.log));
  check("...that can't reach back into the app", w.win.opener === null);
  check("...and goes to the document once it is signed", ok === true && w.win.location.href === "https://storage.test/doc.pdf", w.win.location.href);
}
{
  const w = windowStub();
  const ok = await openWhenReady(Promise.resolve(null));
  check("no document closes the window it opened, and says so", ok === false && w.win.closed, JSON.stringify({ ok, closed: w.win.closed }));
}
{
  const w = windowStub();
  const failed = await openWhenReady(Promise.reject(new Error("offline"))).then(() => "resolved", () => "rejected");
  check("...as does a signing that failed", failed === "rejected" && w.win.closed);
}
{
  const w = windowStub({ blocked: true });
  const ok = await openWhenReady(Promise.resolve("https://storage.test/doc.pdf"));
  check("a window blocked anyway opens the document here instead of doing nothing", ok === true && w.log.some(([k, u]) => k === "assign" && u === "https://storage.test/doc.pdf"), JSON.stringify(w.log));
}

delete globalThis.window;
const { sheetPixelRatio } = await import("./gen/lib/saveFile.js");
const A4 = [794, 1123];
check("an ordinary sheet is still drawn at twice its size", sheetPixelRatio(A4[0], A4[1]) === 2);
const long = sheetPixelRatio(A4[0], A4[1] * 6);
check("a six-page sheet is drawn small enough for Safari's canvas", (A4[0] * long) * (A4[1] * 6 * long) <= 16_777_216 && long > 1, String(long));
check("...and nothing is ever drawn larger than twice", sheetPixelRatio(10, 10) === 2);

const { readRate, rateProblem } = await import("./gen/lib/fx.js");
const { receiptGbp } = await import("./gen/lib/receiptAmounts.js");
check("an exchange rate typed with a comma is read as a decimal", readRate("1,17") === 1.17 && readRate("0,8573") === 0.8573, `${readRate("1,17")} ${readRate("0,8573")}`);
check("...and one with a point is unchanged", readRate("1.17") === 1.17 && readRate(" 0.85 ") === 0.85);
check("...so it is not refused", rateProblem("EUR", "1,17") === null, String(rateProblem("EUR", "1,17")));
check("...and converts the receipt the same as a point would", receiptGbp("100", "20", "EUR", "0,85").fxRate === receiptGbp("100", "20", "EUR", "0.85").fxRate);
check("a real nonsense rate is still refused", rateProblem("EUR", "abc") !== null && rateProblem("EUR", "1,2,3") !== null);

// ---------------------------------------------------------------------------
// 2. Read.

const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.tsx?$/.test(e.name)) files.push(p);
  }
})(SRC);
const rel = (p) => path.relative(SRC, p);
const where = (re, except = []) => files.filter((f) => !except.includes(rel(f)) && re.test(fs.readFileSync(f, "utf8"))).map(rel);

// #8: copying after an await.
for (const p of ["app/invoices/[id]/page.tsx", "app/quotes/[id]/page.tsx", "app/quotes/requests/[id]/page.tsx"]) {
  const s = read(p);
  check(`${p}: Copy link goes through copyText, not a write after the network`, /copyText\(/.test(s) && !/clipboard\.writeText/.test(s));
}
{
  const s = read("app/invoices/[id]/page.tsx");
  const fn = s.slice(s.indexOf("async function copyLink"), s.indexOf("async function saveDetails"));
  check("the invoice's Copy link starts copying before its first await", fn.indexOf("copyText(") > -1 && fn.indexOf("copyText(") < fn.search(/\bawait\s/), fn.slice(0, 300));
  check("...and a link already made is written straight away", /link \? invoiceLinkUrl\(link\.token\) : ensureLink\(\)/.test(fn));
}
{
  const s = read("app/quotes/[id]/page.tsx");
  const fn = s.slice(s.indexOf("async function copyLink"), s.indexOf("async function linkForText"));
  check("the quote's Copy link starts copying before its first await", fn.indexOf("copyText(") > -1 && fn.indexOf("copyText(") < fn.search(/\bawait\s/), fn.slice(0, 300));
  check("...and a draft is still marked sent first", /q\.status !== "draft" \? quoteLinkUrl\(link\.token\) : ensureLink\(true\)/.test(fn));
}
{
  const s = read("app/quotes/requests/[id]/page.tsx");
  const fn = s.slice(s.indexOf("const copyLink"), s.indexOf("const record"));
  check("a request's link is copied before it is marked sent", fn.indexOf("copyText(") > -1 && fn.indexOf("copyText(") < fn.search(/\bawait\s/), fn);
}

// #13: window.open after an await.
check("window.open is only ever called by openWhenReady", where(/window\.open\(/).join() === "lib/afterTap.ts", where(/window\.open\(/).join());
for (const p of ["app/quotes/requests/[id]/page.tsx", "components/quoteRequest/AnswerEntry.tsx"]) {
  check(`${p}: their document opens through openWhenReady`, /openWhenReady\(/.test(read(p)));
}

// #9, #10: downloads.
check("a download link is made in saveFile.ts and nowhere else", where(/\.download = /).join() === "lib/saveFile.ts", where(/\.download = /).join());
check("CSV and JSON exports go through saveText", /saveText\(/.test(read("lib/exportCsv.ts")) && /saveText\(/.test(read("lib/exportJson.ts")) && !/revokeObjectURL/.test(read("lib/exportCsv.ts") + read("lib/exportJson.ts")));
{
  const s = read("lib/saveFile.ts");
  const ms = Number(s.match(/revokeObjectURL\(url\), ([\d_]+)\)/)?.[1]?.replace(/_/g, ""));
  check("a download's address is kept long enough to answer Safari's question", ms >= 40_000, String(ms));
  check("the home-screen app on an iPhone saves through the share sheet", /isIOS\(\) && isStandalone\(\)/.test(s) && /navigator\.share\(\{ files: \[file\] \}\)/.test(s));
  check("...and a sheet that couldn't open falls back to the download", /AbortError"\) downloadLink\(/.test(s));
  check("several files are not started in one tick", /saveBlobs/.test(s) && /setTimeout\(\(\) => downloadLink\(f\.name, f\.blob\), i \* \d+\)/.test(s));
}
check("Save all on /convert uses saveBlobs", /saveBlobs\(made\)/.test(read("app/convert/page.tsx")) && !/made\.forEach\(\(m\) => saveBlob/.test(read("app/convert/page.tsx")));
check("an invoice PDF is saved through saveBlob, not jsPDF's own save", /save: \(filename\) => saveBlob\(filename, blob\)/.test(read("lib/invoicePdf.ts")) && !/pdf\.save\(filename\)\s*\}/.test(read("lib/invoicePdf.ts")));
check("long sheets are drawn under Safari's canvas limit", /pixelRatio: sheetPixelRatio\(/.test(read("lib/invoicePdf.ts")) && /pixelRatio: sheetPixelRatio\(/.test(read("lib/saveFile.ts")) && !/pixelRatio: 2\b/.test(read("lib/invoicePdf.ts") + read("lib/saveFile.ts")));

// #7: push instructions in a Safari tab.
{
  const s = read("app/settings/page.tsx");
  const card = s.slice(s.indexOf("<h2 className=\"font-semibold\">Notifications</h2>"));
  check("Settings asks 'iPhone, not from the Home Screen' before 'no push'", card.indexOf("isIosNotStandalone()") > -1 && card.indexOf("isIosNotStandalone()") < card.indexOf("!pushSupported()"));
  const push = read("lib/push.ts");
  check("...and knows an iPad as well as an iPhone", /isIOS\(\) && !isStandalone\(\)/.test(push) && !/iphone\|ipad\|ipod/i.test(push));
}

// #11: the photo box.
{
  const s = read("app/receipts/new/page.tsx");
  check("the receipt photo box offers Photo Library and Files, not only the camera", !/capture=/.test(s));
  check("...and picking the same photo again still works", /e\.target\.value = ""/.test(s.slice(s.indexOf("function onFile"), s.indexOf("function onDrop"))));
}

// #12: Share on "Just the file".
{
  const s = read("components/scan/JustTheFile.tsx");
  check("Just the file makes the PDF as the panel opens", /function openPanel\(\) \{\s*setOpen\(true\);\s*make\(\)/.test(s) && /onClick=\{openPanel\}/.test(s));
  check("...shares a file already made without waiting", /made \?\? \(await make\(\)\)/.test(s));
  check("...and a refused sheet says so rather than nothing", /!== "AbortError"\) setError\(/.test(s));
}

// #17, #18: Safari's seven days, and the app apart from Safari.
check("the iPhone install steps say Safari clears it after 7 days", /7 days/.test(read("components/GetTheApp.tsx")));
{
  const s = read("components/SignInCard.tsx");
  check("in the home-screen app the code screen says to type the code, not tap the link", /homeScreenApp \?/.test(s) && /Don&apos;t tap the\s+button in the email/.test(s));
  check("...and a password reset says the link opens in Safari", /It opens in Safari, not in this app/.test(s));
}

// #19: the owner's own opens.
for (const p of ["app/api/invoice-links/seen/route.ts", "app/api/quote-links/seen/route.ts"]) {
  check(`${p}: the first-open push allows that it may have been the owner`, /or you did, somewhere you aren't signed in/.test(read(p)));
}

// #25: the smaller items in this brief's part of the app.
{
  const s = read("lib/convert.ts");
  check("/convert turns a photo the way the camera held it", /createImageBitmap\(file, \{ imageOrientation: "from-image" \}\)/.test(s));
  check("...refuses a picture that came out as a different kind", /blob\.type !== type\) throw/.test(s));
  check("...and offers WEBP only where it can be written", /canEncodeWebp\(\)/.test(read("app/convert/page.tsx")));
}
check("the invite share treats a closed sheet as no failure", /!== "AbortError"\) setState\("failed"\)/.test(read("components/InviteCard.tsx")));
check("sharing a PDF on an iPhone warns that WhatsApp may drop the link", /WhatsApp often sends the PDF without the message/.test(read("components/SendInvoicePanel.tsx")));
check("the customer email on the client edit form isn't offered the owner's own", !/autoComplete="email"/.test(read("app/clients/page.tsx")));
for (const p of ["components/VatNumberInput.tsx", "components/CompanyNumberInput.tsx"]) {
  const s = read(p);
  check(`${p}: capitals, no autocorrect`, /autoCapitalize="characters"/.test(s) && /autoCorrect="off"/.test(s) && /spellCheck=\{false\}/.test(s));
}
check("the invoice prefix box: capitals, no autocorrect", /id="invoice-prefix" autoCapitalize="characters" autoCorrect="off" spellCheck=\{false\}/.test(read("app/settings/page.tsx")));
check("the Min total filter reads '1,200' as twelve hundred", /amountOrNull\(filterMinTotal\)/.test(read("app/invoices/page.tsx")) && !/parseFloat\(filterMinTotal\)/.test(read("app/invoices/page.tsx")));
check("a month box gets the iPhone date-box fix", /input\[type="date"\],\s*input\[type="month"\]\s*\{/.test(read("app/globals.css")));

console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
process.exit(results.every(Boolean) ? 0 : 1);
