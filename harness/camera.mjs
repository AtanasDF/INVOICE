// Headless Chrome, fresh profile, fake camera drawn from a canvas the test controls.
import puppeteer from "puppeteer-core";
import { installFakeSession } from "./fake-session.mjs";

const BASE = process.env.BASE ?? "http://localhost:3000";
const OUT = new URL(".", import.meta.url).pathname;

export async function launch() {
  const browser = await puppeteer.launch({
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
    userDataDir: OUT + "profile",
    args: ["--use-fake-ui-for-media-stream", "--no-first-run", "--no-default-browser-check", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--autoplay-policy=no-user-gesture-required"],
  });
  const page = await browser.newPage();
  await page.emulate({
    viewport: { width: 375, height: 812, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  });
  page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
  await installFakeSession(page);
  page.on("console", (m) => { if (m.type() === "error") console.log("CONSOLE", m.text().slice(0, 200)); });
  await page.evaluateOnNewDocument(() => {
    const c = document.createElement("canvas");
    c.width = 720;
    c.height = 1280;
    const ctx = c.getContext("2d");
    window.__scene = { show: false, x: 0, y: 0, w: 0, h: 0, label: "INVOICE 30", img: null };
    const draw = () => {
      ctx.fillStyle = "#2b2520";
      ctx.fillRect(0, 0, 720, 1280);
      const p = window.__scene;
      if (p.show) {
        if (p.img) ctx.drawImage(p.img, p.x, p.y, p.w, p.h);
        else {
          ctx.fillStyle = "#fafafa";
          ctx.fillRect(p.x, p.y, p.w, p.h);
          ctx.fillStyle = "#222";
          const s = p.w / 260;
          ctx.font = `bold ${Math.round(18 * s)}px sans-serif`;
          ctx.fillText(p.label, p.x + 16 * s, p.y + 34 * s);
          ctx.font = `${Math.round(11 * s)}px sans-serif`;
          for (let i = 0; i < 14; i++) ctx.fillText(`Line ${i + 1} ..... £${i * 7 + 3}.00`, p.x + 16 * s, p.y + (62 + i * 18) * s);
        }
      }
    };
    const stream = c.captureStream(0);
    const track = stream.getVideoTracks()[0];
    setInterval(() => { draw(); track.requestFrame(); }, 33);
    draw();
    navigator.mediaDevices.getUserMedia = async () => stream;
    const oq = navigator.permissions.query.bind(navigator.permissions);
    navigator.permissions.query = async (d) => (d && d.name === "camera" ? { state: "granted" } : oq(d));
  });
  return { browser, page };
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const url = (p) => BASE + p;
export const shot = (page, name) => page.screenshot({ path: OUT + name + ".png" });
export async function clickText(page, text) {
  const ok = await page.evaluate((t) => {
    const b = [...document.querySelectorAll("button,a,label")].find((x) => x.textContent.trim() === t);
    if (b) b.click();
    return !!b;
  }, text);
  if (!ok) throw new Error("no button: " + text);
}
export const scene = (page, s) => page.evaluate((s) => Object.assign(window.__scene, s), s);
export const zoom = (page) => page.evaluate(() => document.querySelector("video")?.style.transform || "none");
