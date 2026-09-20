// camera2 plus: the template read is held (never sent to the AI), the posted
// image kept for checks, and an optional fake ImageCapture.
import { launch as launch2, sleep, url, clickText, zoom, hint, shot } from "./camera2.mjs";
export { sleep, url, clickText, zoom, hint, shot };
export async function launch(clip, { still } = {}) {
  const { browser, page } = await launch2(clip);
  const posted = [];
  await page.setRequestInterception(true);
  page.on("request", (r) => {
    if (r.url().includes("/api/invoice-template")) { try { posted.push(JSON.parse(r.postData()).images); } catch { posted.push(null); } return; }
    r.continue();
  });
  if (still) await page.evaluateOnNewDocument((mode) => {
    window.__stills = 0;
    window.ImageCapture = class {
      constructor(track) { this.track = track; }
      async getPhotoCapabilities() { return { imageWidth: { min: 160, max: 4000 }, imageHeight: { min: 120, max: 3000 } }; }
      async takePhoto(settings) {
        window.__stills++; window.__stillSettings = settings;
        if (mode === "hang") return new Promise(() => {});
        const v = document.querySelector("video");
        const s = 2, w = v.videoWidth * s, h = v.videoHeight * s;
        const c = document.createElement("canvas");
        const ctx = c.getContext("2d");
        if (mode === "noise") { c.width = h; c.height = w; const d = ctx.createImageData(h, w); for (let i = 0; i < d.data.length; i++) d.data[i] = (i % 4 === 3) ? 255 : Math.random() * 255; ctx.putImageData(d, 0, 0); }
        else if (mode === "sideways") { c.width = h; c.height = w; ctx.translate(h, 0); ctx.rotate(Math.PI / 2); ctx.drawImage(v, 0, 0, w, h); }
        else if (mode === "moved") { c.width = w; c.height = h; ctx.fillStyle = "#2b2520"; ctx.fillRect(0, 0, w, h); ctx.drawImage(v, w * 0.14, 0, w, h); }
        else if (mode === "nudged") { c.width = w; c.height = h; ctx.fillStyle = "#2b2520"; ctx.fillRect(0, 0, w, h); ctx.drawImage(v, w * 0.02, 0, w, h); }
        else if (mode === "blurred") { c.width = w; c.height = h; ctx.filter = "blur(9px)"; ctx.drawImage(v, 0, 0, w, h); }
        else { c.width = w; c.height = h; ctx.drawImage(v, 0, 0, w, h); }
        return new Promise((res) => c.toBlob(res, "image/jpeg", 0.9));
      }
    };
  }, still);
  return { browser, page, posted };
}
export async function openScanner(page, { auto = "off", zoomOn = "on" } = {}) {
  await page.goto(url("/free-invoice"), { waitUntil: "networkidle0" });
  await page.evaluate((a, z) => { localStorage.clear(); localStorage.setItem("scanner-auto", a); localStorage.setItem("scanner-auto-zoom", z); for (const t of ["scanner-auto", "free-invoice-scan", "scanner-auto-zoom", "scanner-stack", "camera-allow"]) localStorage.setItem("tip:" + t, "3"); }, auto, zoomOn);
  await page.reload({ waitUntil: "networkidle0" });
  await clickText(page, "Scan an existing invoice");
  await page.waitForFunction(() => document.querySelector("video")?.videoWidth > 2, { timeout: 20000 });
}
// Decoded size and a few pixel stats of a posted data URL, measured in the page.
export const measure = (page, dataUrl) => page.evaluate(async (u) => {
  const img = new Image(); img.src = u; await img.decode();
  const c = document.createElement("canvas"); c.width = img.naturalWidth; c.height = img.naturalHeight;
  const ctx = c.getContext("2d"); ctx.drawImage(img, 0, 0);
  const dark = (x0, y0, x1, y1) => { const d = ctx.getImageData(x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0)).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] < 110) n++; return n / (d.length / 4); };
  const W = c.width, H = c.height;
  return { w: W, h: H, topLeft: dark(0, 0, W / 2, H * 0.08), topRight: dark(W / 2, 0, W, H * 0.08), bottomLeft: dark(0, H * 0.92, W / 2, H), meanDark: dark(0, 0, W, H) };
}, dataUrl);
