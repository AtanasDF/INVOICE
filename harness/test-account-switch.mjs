// A borrowed phone handed over the last person's bank details.
//
// Sign-out cleared the session and nothing else. Every key holding somebody's
// own work was a fixed string with no account in it, so the next person to
// sign in on the same device opened /free-invoice and found the previous
// one's business name, customer, lines, sort code, account number and
// SIGNATURE -- enough to issue an invoice as them, into their bank account.
// Their receipt photograph was waiting on /scan too: sign-out reloads the
// same tab, and sessionStorage survives that.
//
// Found by a cloud session reading the code (notes/audit-offline.md) and
// reproduced here against the source before any of it was believed.
//
// This pins three things: that a DIFFERENT account wipes the previous one's
// work, that the SAME account signing back in keeps it, and -- the one that
// matters for the future -- that every fixed storage key in the app is
// classified as either personal or device. A new personal key that nobody
// adds to the list is the same bug again, silently.
import fs from "node:fs";
import path from "node:path";
import { REPO } from "./repo.mjs";
import {
  DEVICE_KEYS,
  LAST_ACCOUNT_KEY,
  PERSONAL_LOCAL_KEYS,
  PERSONAL_SESSION_KEYS,
  accountBoot,
  accountToRemember,
  keysToClear,
} from "./gen/lib/accountSwitch.js";

const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

const A = "11111111-1111-1111-1111-111111111111";
const B = "22222222-2222-2222-2222-222222222222";

// --- the decision itself ---
const other = keysToClear(A, B);
check("a different account clears the previous one's work", other.local.length > 0 && other.session.length > 0);
check("...including the free-invoice draft", other.local.includes("free-invoice-draft"));
check("...and the signature", other.local.includes("free-invoice-signature"));
check("...and the receipt photograph waiting mid-scan", other.session.includes("scan-handoff-capture"));

const same = keysToClear(A, A);
check("the same account signing back in keeps its work", same.local.length === 0 && same.session.length === 0,
  "signing out and back in as yourself would lose a half-typed invoice");

const out = keysToClear(A, null);
check("signing out alone clears nothing", out.local.length === 0 && out.session.length === 0,
  "clearing at sign-out costs somebody their draft every time they sign out on purpose");

const fresh = keysToClear(null, A);
check("a device that has never been signed in to is cleared on first sign-in", fresh.local.length > 0,
  "this is what removes the keys left by the version that had this bug");

// --- what is remembered ---
check("signing out leaves the last account recorded", accountToRemember(A, null) === A,
  "forgetting who it was would make the next sign-in look like a fresh device and wipe their work");
check("a new account becomes the one remembered", accountToRemember(A, B) === B);
check("the marker is not itself one of the keys that get cleared",
  !PERSONAL_LOCAL_KEYS.includes(LAST_ACCOUNT_KEY),
  "clearing it would wipe the next account's work too");

// --- device preferences are left alone ---
for (const k of ["theme", "scanner-mode", "camera-allowed"]) {
  check(`a colleague borrowing the phone does not reset "${k}"`, !other.local.includes(k),
    "CLAUDE.md: the theme is per device, not per account");
}

// --- the drift check: every fixed key in the app must be classified ---
const LIB = path.join(REPO, "web/src/lib");
const known = new Set([...PERSONAL_LOCAL_KEYS, ...PERSONAL_SESSION_KEYS, ...DEVICE_KEYS, LAST_ACCOUNT_KEY]);
const unclassified = [];
for (const f of fs.readdirSync(LIB).filter((f) => f.endsWith(".ts"))) {
  if (f === "accountSwitch.ts") continue;
  const src = fs.readFileSync(path.join(LIB, f), "utf8");
  // A fixed storage key is a const whose value is a plain string and which is
  // handed to localStorage/sessionStorage somewhere in the same file.
  for (const m of src.matchAll(/^const ([A-Z_]+) = "([^"]+)";/gm)) {
    const [, name, value] = m;
    if (!new RegExp(`(local|session)Storage\\.(get|set|remove)Item\\(${name}\\b`).test(src)) continue;
    if (!known.has(value)) unclassified.push(`${f}: "${value}"`);
  }
}
check("every fixed storage key in src/lib is classified personal or device",
  unclassified.length === 0,
  `unclassified, so a new one could hold somebody's work and never be cleared: ${unclassified.join(", ")}`);

// --- it is actually wired in, before anything renders ---
const auth = fs.readFileSync(path.join(REPO, "web/src/lib/authContext.tsx"), "utf8");
check("the clear runs on the session the app starts with", /getSession\(\)\.then[\s\S]{0,120}forgetOtherAccount\(/.test(auth));
check("...and on every later sign-in", /onAuthStateChange\([\s\S]{0,160}forgetOtherAccount\(/.test(auth));
check("...before the session is published to the app",
  auth.indexOf("forgetOtherAccount(data.session") < auth.indexOf("setSession(data.session)"),
  "a page could render and read the previous person's draft first");

// --- and the engine default that was missed on 15/10 ---
const free = fs.readFileSync(path.join(REPO, "web/src/components/free-invoice/FreeInvoiceBuilder.tsx"), "utf8");
check("the Free page scans with Gemini, like everything else since 15/10",
  // Gemini unless /scan?engine=claude chose Claude on this device, as on /scan.
  /useState<ScanEngine>\(chosenEngine === "claude" \? "claude" : "gemini"\)/.test(free),
  "CLAUDE.md says Gemini is the default everywhere; this was the fourth place and was missed");

// --- the boot script: the decision must be made before anything can write ---
const boot = accountBoot("sb-test-auth-token");
check("the boot script carries the real auth key, not a template", boot.includes("sb-test-auth-token") && !boot.includes("JSON.stringify"),
  "an un-interpolated template compiles fine and does nothing at all");
check("...and names every personal key", PERSONAL_LOCAL_KEYS.every((k) => boot.includes(k)) && PERSONAL_SESSION_KEYS.every((k) => boot.includes(k)));
check("...and can read a base64 session as well as plain JSON", boot.includes("base64-") && boot.includes("atob"));
check("...and never throws, whatever storage does", /^try\{/.test(boot) && /catch\(e\)\{\}$/.test(boot));
const layout = fs.readFileSync(path.join(REPO, "web/src/app/layout.tsx"), "utf8");
check("it runs in <head>, before any page code", /accountBoot\(AUTH_STORAGE_KEY\)/.test(layout) && layout.indexOf("accountBoot") < layout.indexOf("<body"),
  "after the body starts, a page can already have written something the clear then destroys");

console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
