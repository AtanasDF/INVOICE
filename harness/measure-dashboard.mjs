// How much JavaScript each screen actually costs, measured rather than guessed.
//
// Not a suite and not in run-all.sh: it reports numbers, it does not assert
// them. Next 16's build output no longer prints a per-route size, so the only
// honest way to answer "why is the dashboard heavy" is to load it and count
// what crosses the wire.
//
//   BASE=http://localhost:3210 node measure-dashboard.mjs
//
// $BASE must be a production build served by `next start` -- a dev server
// serves unminified modules and every number here would be fiction.
import { makeDb, launchSignedIn, signIn, sleep } from "./mockdb.mjs";

const BASE = process.env.BASE ?? "http://localhost:3000";
const PAGES = process.argv.slice(2).length ? process.argv.slice(2) : ["/", "/invoices", "/receipts", "/scan", "/free-invoice", "/copy", "/convert", "/settings"];

const db = makeDb();
db.tables.business_profile.push({ user_id: "x", business_name: "Harness Ltd", vat_registered: false, invoice_prefix: "INV-", invoice_next_number: 1 });

const { browser, page } = await launchSignedIn(db, { base: BASE, width: 390, profile: "profile-measure" });
await page.setCacheEnabled(false);

// The cache is disabled for the whole run, not cleared between pages: a
// clear-then-navigate still served from the memory cache, and every page after
// the first read as 0 KB, which looked like an answer and was not.
const seen = new Map();
page.on("response", async (res) => {
  const url = res.url();
  if (!/\.js(\?|$)/.test(url)) return;
  try {
    const len = Number(res.headers()["content-length"] ?? 0) || (await res.buffer().then((b) => b.length).catch(() => 0));
    seen.set(url, len);
  } catch {
    // a response that went away before it could be read is not worth failing over
  }
});

const rows = [];
try {
  await signIn(page, BASE);
  for (const path of PAGES) {
    seen.clear();
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle0" }).catch(() => {});
    await sleep(1200);
    const total = [...seen.values()].reduce((a, b) => a + b, 0);
    const biggest = [...seen.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([u, n]) => `${u.split("/").pop().slice(0, 34)} ${Math.round(n / 1024)}KB`);
    rows.push({ path, files: seen.size, kb: Math.round(total / 1024), biggest });
  }
} finally {
  await browser.close();
}

rows.sort((a, b) => b.kb - a.kb);
console.log("\n| page | JS files | total KB | the three biggest |");
console.log("|---|---|---|---|");
for (const r of rows) console.log(`| ${r.path} | ${r.files} | ${r.kb} | ${r.biggest.join(", ")} |`);
