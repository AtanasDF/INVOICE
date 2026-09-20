import puppeteer from "puppeteer-core";
import { startMockServer } from "./qr-mock-server.mjs";
import { makeDb, newId } from "./qr-mockdb.mjs";
const UID = "00000000-0000-4000-8000-000000000001";
const db = makeDb();
db.tables.clients.push({ id: newId(), user_id: UID, name: "Jewson Bristol", email: "orders@jewson.example", kind: "supplier", archived: false, is_company: true });
db.tables.quote_requests = []; db.tables.quote_request_suppliers = [];
const { server } = startMockServer(5566, db, {});
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const exp = Math.floor(Date.now() / 1000) + 86400;
const user = { id: UID, aud: "authenticated", role: "authenticated", email: "owner@example.com", email_confirmed_at: "2026-01-01T00:00:00Z", app_metadata: {}, user_metadata: {} };
const session = { access_token: `${b64({ alg: "HS256" })}.${b64({ sub: UID, exp })}.x`, refresh_token: "r", token_type: "bearer", expires_in: 86400, expires_at: exp, user };
const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, args: ["--no-first-run"] });
const page = await browser.newPage();
await page.setViewport({ width: 375, height: 900 });
await page.goto("http://localhost:3305/free-invoice", { waitUntil: "domcontentloaded" });
await page.evaluate((s) => localStorage.setItem("sb-localhost-auth-token", JSON.stringify(s)), session);
await page.goto("http://localhost:3305/" + (process.argv[2] ?? "quotes/requests/new"), { waitUntil: "networkidle0" });
await new Promise((r) => setTimeout(r, 1500));
console.log(await page.evaluate(() => {
  const out = [`scrollWidth ${document.documentElement.scrollWidth}`];
  for (const el of document.querySelectorAll("body *")) {
    const r = el.getBoundingClientRect();
    if (r.right > window.innerWidth + 1 && r.width > 0) out.push(`${el.tagName}.${(el.className?.baseVal ?? el.className ?? "").toString().slice(0, 80)} right=${Math.round(r.right)} w=${Math.round(r.width)} text=${(el.innerText ?? "").slice(0, 40).replace(/\n/g, " ")}`);
  }
  return out.slice(0, 15).join("\n");
}));
await browser.close(); server.close();
