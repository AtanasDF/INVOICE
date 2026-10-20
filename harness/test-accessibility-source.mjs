// What the accessibility audit of 2026-10-20 fixed, pinned in the source so it
// stays fixed (notes/audit-accessibility.md).
//
// The browser suites (test-labels, test-keyboard-only, test-form-errors) see
// only the pages they visit, in the state they seed. Each failure below sat on
// a screen or in a state none of them reached: an upload button a keyboard
// could not reach, a camera that said nothing, an Escape that pulled focus out
// of a search box, a quote error tied to a <div>. These read the code, so a
// new screen that repeats the pattern fails here wherever it is.
import fs from "node:fs";
import path from "node:path";
import { REPO } from "./repo.mjs";

const APP = `${REPO}/web/src`;
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };
const code = (rel) => fs.readFileSync(`${APP}/${rel}`, "utf8");

const SKIP = new Set(["node_modules", ".next", "vendor"]);
const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return SKIP.has(e.name) ? [] : walk(p);
    return /\.tsx$/.test(e.name) ? [p] : [];
  });
const files = walk(APP).map((f) => [path.relative(APP, f), fs.readFileSync(f, "utf8")]);
const lineOf = (src, i) => src.slice(0, i).split("\n").length;

// Every JSX opening tag of a kind, with where it is. Good enough for the
// attributes on one element: a `>` inside an attribute's braces is skipped.
function tags(src, name) {
  const out = [];
  const re = new RegExp(`<${name}\\b`, "g");
  let m;
  while ((m = re.exec(src))) {
    let depth = 0;
    let quote = null;
    let j = m.index + 1;
    for (; j < src.length; j++) {
      const ch = src[j];
      if (quote) {
        if (ch === quote && src[j - 1] !== "\\") quote = null;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === "`") quote = ch;
      else if (ch === "{") depth++;
      else if (ch === "}") depth--;
      else if (ch === ">" && depth === 0) break;
    }
    out.push({ at: m.index, tag: src.slice(m.index, j + 1) });
  }
  return out;
}

// 1. A file picker that is a label round a display:none input cannot take focus.
{
  const bad = [];
  for (const [rel, src] of files) {
    for (const { at, tag } of tags(src, "input")) {
      if (!/type="file"/.test(tag) || !/className="hidden"/.test(tag)) continue;
      // Clicked from a real button through its ref: the button is what a keyboard reaches.
      if (/\bref=\{/.test(tag)) continue;
      bad.push(`${rel}:${lineOf(src, at)}`);
    }
  }
  check("no file picker is a display:none input that only its label can open", bad.length === 0, bad.join(", "));
}

// 2. A toggle that shows its choice only by a dark fill says nothing to a screen reader.
{
  const bad = [];
  for (const [rel, src] of files) {
    for (const { at, tag } of tags(src, "button")) {
      if (!/\? "[^"]*bg-neutral-900 text-white[^"]*" :/.test(tag)) continue;
      if (/aria-(pressed|checked|selected|current|expanded)=/.test(tag)) continue;
      // Not a choice: the fill marks the PDF as made, and the words change with it.
      if (rel === "components/SendInvoicePanel.tsx" && /pdf\.shareState === "ready"/.test(tag)) continue;
      bad.push(`${rel}:${lineOf(src, at)}`);
    }
  }
  check("every button that shows it is chosen by a dark fill also says so (aria-pressed)", bad.length === 0, bad.join(", "));
}

// 3. Decorative icons and arrows are not read aloud.
{
  const icons = code("components/icons.tsx");
  const svgs = icons.match(/<svg\b[^>]*>/g) ?? [];
  check(`every icon in icons.tsx is aria-hidden (${svgs.length})`, svgs.length > 5 && svgs.every((s) => /aria-hidden="true"/.test(s)), svgs.filter((s) => !/aria-hidden="true"/.test(s)).join(" | "));
  const arrows = [];
  for (const [rel, src] of files) {
    for (const m of src.matchAll(/>← |\s&rarr;\s*</g)) arrows.push(`${rel}:${lineOf(src, m.index)}`);
  }
  check("no back link or onward link has its arrow read out", arrows.length === 0, arrows.join(", "));
}

// 4. Modals keep the keyboard inside, and give it back.
for (const rel of ["components/AddAnything.tsx", "app/files/page.tsx", "components/DocumentCapture.tsx"]) {
  check(`${rel}: its modal traps focus and returns it`, /useFocusTrap\(/.test(code(rel)));
}
{
  const trap = code("lib/useFocusTrap.ts");
  check("the trap reads its element afresh on every key, so a swapped screen never holds Tab against nothing", /const box = ref\.current;\s*if \(e\.key !== "Tab" \|\| !box\?\.isConnected\) return;/.test(trap));
  check("the trap gives focus back to what opened it", /opener\?\.isConnected\) opener\.focus\(\)/.test(trap));
}

// 5. The header menus answer only their own Escape.
check("a closed header menu does not take focus on Escape", /if \(e\.key !== "Escape" \|\| !box\.current\?\.open\) return;/.test(code("app/AppShell.tsx")));

// 6. A skip link, a target for it, and the language the app is written in.
{
  const shell = code("app/AppShell.tsx");
  check("there is a skip link to the page", /<a href="#main"[^>]*>\s*Skip to the page/.test(shell));
  check("...and main is what it lands on", /<main id="main" ref=\{main\} tabIndex=\{-1\}/.test(shell));
  check("the page says it is British English", /<html lang="en-GB">/.test(code("app/layout.tsx")));
}

// 7. The camera, for somebody who cannot see the viewfinder.
{
  const cam = code("components/DocumentCapture.tsx");
  check("the camera is a named dialog, on both of its screens", (cam.match(/role="dialog" aria-modal="true" aria-label="Camera"/g) ?? []).length === 2);
  check("the camera says what the viewfinder shows, in a region that is always there", /<p role="status" className="sr-only">\{spoken\}<\/p>/.test(cam));
  check("...including whether a page is in view, the shot, and the count", /"No page in view yet\."/.test(cam) && /"Taking the photo\."/.test(cam) && /\$\{shots\.length\} scanned/.test(cam));
  check("the camera's failure screens are alerts", ["timeout", "denied", "stalled", "unsupported"].every((s) => new RegExp(`status === "${s}" && \\(\\s*<div role="alert"`).test(cam)));
  check("Escape is Back on the camera, and not while the review sheet is up", /if \(reviewing\) return;\s*const onKey = \(e: KeyboardEvent\) => \{\s*if \(e\.key === "Escape"\) closeRef\.current\(\);/.test(cam));
  const review = code("components/scan/BatchReview.tsx");
  check("the review sheet's Escape keeps scanning, and its Remove names the scan", /if \(e\.key === "Escape"\) onKeepScanning\(\)/.test(review) && /aria-label=\{`Remove scan \$\{i \+ 1\}`\}/.test(review));
}

// 8. Lists that are not listboxes, and one that is.
{
  const addr = code("components/AddressFields.tsx");
  check("the address results are a list of buttons, not a listbox (option makes a button presentational)", !/role="(listbox|option)"/.test(addr));
  check("...and what the search found is said, since it runs by itself", /<p role="status" className="sr-only">\{searching \? "Searching…"/.test(addr));
  const roller = code("components/DateRoller.tsx");
  check("the date roller says which option the arrows moved to", /aria-activedescendant=/.test(roller) && /tabIndex=\{-1\}\s*role="option"/.test(roller));
}

// 9. A field error is tied to the box it is about, and a box is never tied to an id that is not there.
{
  const missing = [];
  for (const [rel, src] of files) {
    for (const m of src.matchAll(/aria-describedby=\{[^}]*?\? "([\w-]+)" : undefined\}/g)) {
      if (!new RegExp(`id="${m[1]}"`).test(src)) missing.push(`${rel}:${lineOf(src, m.index)} ${m[1]}`);
    }
  }
  check("every literal aria-describedby points at an id in the same file", missing.length === 0, missing.join(", "));
  const quote = code("components/quote/QuoteForm.tsx");
  check("the quote form's errors are tied to their boxes, not to a <div> round the customer picker", !/<div aria-invalid/.test(quote) && /error === NO_NUMBER \? "quote-error"/.test(quote));
  for (const [rel, id] of [["app/invoices/[id]/page.tsx", "pay-error"], ["app/invoices/[id]/page.tsx", "cn-error"], ["app/reset-password/page.tsx", "reset-error"], ["components/SignInCard.tsx", "forgot-error"], ["app/scan/page.tsx", "scan-save-error"], ["app/settings/page.tsx", "settings-error"], ["app/feedback/page.tsx", "feedback-error"], ["components/check-company/CompanyChecker.tsx", "company-error"]]) {
    check(`${rel}: an error box with id ${id} that a field points at`, new RegExp(`id="${id}" role="alert"`).test(code(rel)) && new RegExp(`"${id}" : undefined`).test(code(rel)));
  }
  check("the VAT number box is marked wrong when its check digits fail", /aria-invalid=\{bad \|\| undefined\}/.test(code("components/VatNumberInput.tsx")));
  check("an empty feedback message is refused out loud, not ignored", /if \(!message\.trim\(\)\) return setError\(NO_MESSAGE\)/.test(code("app/feedback/page.tsx")));
}

// 10. A polite message arrives in a region that was already there.
{
  const late = [];
  for (const [rel, src] of files) {
    for (const m of src.matchAll(/\{(\w+) && <p role="status"/g)) late.push(`${rel}:${lineOf(src, m.index)}`);
  }
  check("no one-line status message is mounted together with its words", late.length === 0, late.join(", "));
  const paid = code("components/PaidCelebration.tsx");
  check("Paid is said by a status region that is always mounted", /const live = <p role="status" className="sr-only">\{said\}<\/p>;\s*if \(!paid\) return live;/.test(paid));
  for (const rel of ["app/invoices/[id]/page.tsx", "app/quotes/[id]/page.tsx"]) {
    check(`${rel}: Copy link says it copied, since the button disables and loses focus`, /<span role="status" className="sr-only">\{linkCopied \? "Link copied\." : ""\}<\/span>/.test(code(rel)));
  }
}

console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
