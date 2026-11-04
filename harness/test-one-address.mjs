// The app's own address lives in one place, src/lib/siteUrl.ts, read from
// NEXT_PUBLIC_SITE_URL with today's address as the default. Moving to
// invoiceover.com (notes/domain-move.md) is then one variable, and an address
// written into some other file is a line nobody remembers on the day.
//
// Not covered here, on purpose, and listed in the move's checklist instead:
// public/.well-known/security.txt (a static file, which cannot read a
// variable) and worker/wrangler.toml's APP_INGEST_URL (the Worker's own
// setting, live only after `wrangler deploy` on the Mac).
import fs from "fs";
import path from "path";
import { REPO } from "./repo.mjs";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

const files = [];
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== "node_modules") walk(p); }
    else if (/\.(ts|tsx|mjs|js)$/.test(e.name)) files.push(p);
  }
};
walk(`${REPO}/web/src`);
walk(`${REPO}/worker/src`);
check("there are files to look at", files.length > 100, String(files.length));

const home = `${REPO}/web/src/lib/siteUrl.ts`;
const strip = (s) => s.replace(/(^|[^:])\/\/[^\n]*/gm, "$1").replace(/\/\*[\s\S]*?\*\//g, "");
// A web address on our own domain or on Vercel's, not a mailbox: the sending
// addresses (invoices@invoiceover.com and friends) are Resend's domain and
// already final.
const OWN = /https?:\/\/(?:[\w-]+\.)*(?:invoiceover\.com|vercel\.app)/;
const written = files.filter((f) => f !== home && OWN.test(strip(fs.readFileSync(f, "utf8"))));
check("no file but siteUrl.ts writes the app's own address", written.length === 0, written.map((f) => path.relative(REPO, f)).join(", "));

const site = fs.readFileSync(home, "utf8");
check("siteUrl.ts reads NEXT_PUBLIC_SITE_URL, today's address the default", /process\.env\.NEXT_PUBLIC_SITE_URL \?\? "https:\/\/invoice-omega-rust\.vercel\.app"/.test(site));
const pushers = ["web/src/lib/ownerPush.ts", "web/src/app/api/notifications/check/route.ts", "web/src/app/api/invoice-links/seen/route.ts"];
check("every push names the site from it", pushers.every((f) => /setVapidDetails\(SITE_URL,/.test(fs.readFileSync(`${REPO}/${f}`, "utf8"))), pushers.join(", "));

console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
