// One name for the app (item 26): the tab, the header, the sign-in line,
// the home-screen label and the manifest all say what src/lib/siteName.ts
// says, and no older spelling is left in the app, its static files or the
// sign-in emails waiting to be pasted into Supabase.
import fs from "node:fs";
import path from "node:path";
import { makeDb, launchSignedIn, sleep, bodyText } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const WEB = "/Users/nasko/Desktop/INVOICE/web";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

const NAME = fs.readFileSync(`${WEB}/src/lib/siteName.ts`, "utf8").match(/SITE_NAME = "([^"]+)"/)?.[1];
check("the name is set in one place", !!NAME, String(NAME));
const OLD = /\bInvoicer\b|Invoice & Expenses|"short_name": "Invoice"/;
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const p = path.join(dir, e.name);
  if (e.isDirectory()) return e.name === "vendor" || e.name === "node_modules" ? [] : walk(p);
  return /\.(tsx?|js|json|html|css)$/.test(e.name) && !/ \d+\./.test(e.name) ? [p] : [];
});
const files = [...walk(`${WEB}/src`), ...walk(`${WEB}/public`), ...walk(`${WEB}/supabase/email-templates`)];
const stale = files.filter((f) => OLD.test(fs.readFileSync(f, "utf8"))).map((f) => f.slice(WEB.length + 1));
check(`no older spelling in ${files.length} app, static and email files`, files.length > 100 && stale.length === 0, JSON.stringify(stale));
const manifest = JSON.parse(fs.readFileSync(`${WEB}/public/manifest.json`, "utf8"));
check("the manifest's name and short name are the name", manifest.name === NAME && manifest.short_name === NAME, JSON.stringify([manifest.name, manifest.short_name]));
const sw = fs.readFileSync(`${WEB}/public/sw.js`, "utf8");
check("a notification with no title of its own is headed with the name", (sw.match(new RegExp(`"${NAME}"`, "g")) ?? []).length === 2);
const templates = fs.readdirSync(`${WEB}/supabase/email-templates`).filter((f) => f.endsWith(".html"));
check("every sign-in email names it", templates.length === 4 && templates.every((f) => fs.readFileSync(`${WEB}/supabase/email-templates/${f}`, "utf8").includes(NAME)), JSON.stringify(templates));

const db = makeDb();
const { browser, page } = await launchSignedIn(db, { base: BASE, profile: "profile-site-name" });
try {
  await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
  await sleep(600);
  const head = await page.evaluate(() => ({
    title: document.title,
    brand: document.querySelector("header a[href='/']")?.textContent.trim(),
    apple: document.querySelector("meta[name='apple-mobile-web-app-title']")?.content,
    manifest: document.querySelector("link[rel='manifest']")?.getAttribute("href"),
  }));
  check("the tab says the name", head.title === NAME, head.title);
  check("so does the header", head.brand === NAME, head.brand);
  check("and the home-screen label", head.apple === NAME, head.apple);
  const served = await page.evaluate(async (href) => (await fetch(href)).json(), head.manifest ?? "/manifest.json");
  check("the manifest the page links to carries it", served.name === NAME, JSON.stringify(served.name));
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
  await sleep(500);
  check("the sign-in page opens with it", (await bodyText(page)).includes(`${NAME} — invoices, receipts, and expenses in one place.`));
  await page.goto(`${BASE}/copy`, { waitUntil: "networkidle0" });
  check("no page shows an older spelling", !OLD.test(await bodyText(page)));
} catch (e) {
  console.log("ERROR", e.message);
  results.push(false);
} finally {
  await browser.close();
  console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
}
