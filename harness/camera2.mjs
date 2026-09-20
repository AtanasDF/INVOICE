// Headless Chrome, fresh profile, Chrome's own fake camera playing an MJPEG clip.
import puppeteer from "puppeteer-core";
const OUT = new URL(".", import.meta.url).pathname;
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const url = (p) => (process.env.BASE ?? "http://localhost:3000") + p;
export const shot = (page, name) => page.screenshot({ path: OUT + name + ".png" });
export async function launch(clip) {
  const browser = await puppeteer.launch({
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
    // Was keyed on the clip name, so every suite playing large.mjpeg shared
    // one profile directory and they knocked each other over when run
    // together. Keyed on the suite instead.
    userDataDir: OUT + "profile-" + ((process.argv[1] ?? "run").split("/").pop().replace(/\.mjs$/, "").replace(/\W/g, "") || "run") + "-" + clip.replace(/\W/g, ""),
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-video-capture=${OUT}${clip}`, "--no-first-run", "--autoplay-policy=no-user-gesture-required"],
  });
  const page = await browser.newPage();
  await page.emulate({
    viewport: { width: 375, height: 812, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  });
  page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
  return { browser, page };
}
export async function clickText(page, text) {
  const ok = await page.evaluate((t) => { const b = [...document.querySelectorAll("button,a,label")].find((x) => x.textContent.trim() === t); if (b) b.click(); return !!b; }, text);
  if (!ok) throw new Error("no button: " + text);
}
export const zoom = (page) => page.evaluate(() => document.querySelector("video")?.style.transform || "none");
export const hint = (page) => page.evaluate(() => [...document.querySelectorAll("div")].find((d) => d.className.includes("line-clamp-2"))?.textContent);
export async function openScanner(page, { auto = "off" } = {}) {
  await page.goto(url("/free-invoice"), { waitUntil: "networkidle0" });
  await page.evaluate((a) => { localStorage.clear(); localStorage.setItem("scanner-auto", a); }, auto);
  await page.reload({ waitUntil: "networkidle0" });
  await clickText(page, "Scan an existing invoice");
  await page.waitForFunction(() => document.querySelector("video")?.videoWidth > 2, { timeout: 15000 });
}
