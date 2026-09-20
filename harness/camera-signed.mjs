// Fake camera (MJPEG clip) + the mocked signed-in database, for /scan.
import puppeteer from "puppeteer-core";
import { handle, UID } from "./mockdb.mjs";
const OUT = new URL(".", import.meta.url).pathname;
const SUPA = "https://wecfwjxzyzzrcwbwnwpo.supabase.co";
const user = () => ({ id: UID, aud: "authenticated", role: "authenticated", email: "harness@example.com", email_confirmed_at: "2026-01-01T00:00:00Z", app_metadata: { provider: "email" }, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" });
export function session() {
  const exp = Math.floor(Date.now() / 1000) + 86400;
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return { access_token: `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: UID, exp, role: "authenticated", aud: "authenticated" })}.fake`, refresh_token: "fake-refresh", token_type: "bearer", expires_in: 86400, expires_at: exp, user: user() };
}
export async function launchCameraSignedIn(db, clip, base) {
  const browser = await puppeteer.launch({
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
    userDataDir: OUT + "profile-camsigned-" + clip.replace(/\W/g, ""),
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-video-capture=${OUT}${clip}`, "--no-first-run", "--autoplay-policy=no-user-gesture-required"],
  });
  const page = await browser.newPage();
  await page.emulate({ viewport: { width: 375, height: 812, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1" });
  page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
  await page.setRequestInterception(true);
  const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "*" };
  page.on("request", (req) => {
    const u = new URL(req.url());
    if (u.origin === SUPA) {
      if (req.method() === "OPTIONS") return req.respond({ status: 204, headers: cors, body: "" });
      if (u.pathname.startsWith("/rest/v1/")) {
        let body = null; try { body = req.postData() ? JSON.parse(req.postData()) : null; } catch {}
        const r = handle(db, req.method(), u.pathname, u.search, req.headers(), body);
        return req.respond({ status: r.status, headers: { ...cors, "content-type": "application/json" }, body: r.json === null ? "" : JSON.stringify(r.json) });
      }
      if (u.pathname.startsWith("/auth/v1/user")) return req.respond({ status: 200, headers: { ...cors, "content-type": "application/json" }, body: JSON.stringify(user()) });
      if (u.pathname.startsWith("/auth/v1/token")) return req.respond({ status: 200, headers: { ...cors, "content-type": "application/json" }, body: JSON.stringify(session()) });
      return req.respond({ status: 404, headers: cors, body: "" });
    }
    if (u.pathname.startsWith("/api/scan")) { db.scans = (db.scans ?? 0) + 1; return; } // held: never read by the AI
    if (u.origin !== base && !u.protocol.startsWith("data") && !u.protocol.startsWith("blob")) return req.abort();
    req.continue();
  });
  await page.goto(base + "/free-invoice", { waitUntil: "domcontentloaded" });
  await page.evaluate((s) => { localStorage.clear(); localStorage.setItem("sb-wecfwjxzyzzrcwbwnwpo-auth-token", JSON.stringify(s)); }, session());
  return { browser, page };
}
