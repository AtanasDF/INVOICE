// A short note the first few times a screen is opened (Atanas, 2026-09-24:
// "a little explanation on every click at first for new users would be
// great"). It is easy to add a screen and forget one, and nobody notices,
// because the person who built it already knows what the screen does.
//
// Source-level: a Tip that has never been rendered is still a Tip missing.
import fs from "fs";
import path from "path";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };
const APP = "/Users/nasko/Desktop/INVOICE/web/src/app";

// Screens that rightly have no first-time note, each for a reason.
const NO_TIP = {
  "login": "signing in explains itself, and a tip is the last thing wanted on the way in",
  "reset-password": "one box and a button, reached from an email",
  "privacy": "a legal page, read once, by somebody who came looking for it",
  "terms": "a legal page, read once, by somebody who came looking for it",
  "security": "read once, by a researcher who came looking for it; the page IS the explanation",
  "how-to-invoice": "the whole page is the explanation; a note on top of it would be explaining the explaining",
  "offline": "shown when there is no signal; a note about how to use it would be cruel",
  "i/[token]": "a customer's copy of an invoice. They do not have the app and never will",
  "q/[token]": "a customer's copy of a quote. They do not have the app and never will",
  "r/[token]": "a supplier's own page for pricing a list. They do not have the app either",
  "free-invoice": "carries its own tips inside the builder rather than one at the top",
  "clients/new": "a form with labels on every box; a note would say what the labels say",
  "receipts/new": "a form with labels on every box; a note would only say what the labels say",
  "invoices/new": "the same, and the scan route into it has its own tip",
  "quotes/new": "a form with labels on every box, reached from the quotes list which explains it",
  "quotes/requests/new": "a form, reached from the requests list, which carries the explanation",
  "quotes/requests/[id]": "reached from the list, which explains the whole thing first",
  "check-company": "its tip lives in CompanyChecker, the component that IS the page",
};

const screens = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { if (entry.name !== "api") walk(full); continue; }
    if (entry.name !== "page.tsx") continue;
    screens.push(path.relative(APP, path.dirname(full)).replace(/\\/g, "/") || ".");
  }
})(APP);

check("there are screens to check, so this suite is looking at something", screens.length > 15, String(screens.length));

const missing = screens.filter((s) => {
  if (NO_TIP[s]) return false;
  return !/<Tip\b/.test(fs.readFileSync(path.join(APP, s === "." ? "" : s, "page.tsx"), "utf8"));
});
check("every screen says what it is for, the first few times", missing.length === 0, JSON.stringify(missing));

// The exceptions must keep earning their place: one for a screen that no
// longer exists is a free pass waiting for the next person.
const gone = Object.keys(NO_TIP).filter((s) => !screens.includes(s));
check("no exception is for a screen that has gone", gone.length === 0, JSON.stringify(gone));
const thin = Object.entries(NO_TIP).filter(([, why]) => why.length <= 30);
check("and every exception says why", thin.length === 0, JSON.stringify(thin));

// A tip nobody can dismiss for ever is a nag. Every one needs its own id,
// which is what remembers that it has been seen.
const ids = [];
for (const s of screens) {
  const text = fs.readFileSync(path.join(APP, s === "." ? "" : s, "page.tsx"), "utf8");
  for (const m of text.matchAll(/<Tip id="([^"]+)"/g)) ids.push(m[1]);
}
check("every tip has an id, so it can be put away", ids.every(Boolean) && ids.length > 0, String(ids.length));
check("and no two screens share one", new Set(ids).size === ids.length, JSON.stringify(ids.filter((id, i) => ids.indexOf(id) !== i)));

console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
