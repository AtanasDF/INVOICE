// Torch: button when the camera has one, on by itself in low light, and a
// hand-picked setting that low light leaves alone.
import { launch, openScanner, sleep, shot } from "./camera3.mjs";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

async function withTorch(page) {
  await page.evaluateOnNewDocument(() => {
    window.__torch = [];
    const caps = MediaStreamTrack.prototype.getCapabilities;
    MediaStreamTrack.prototype.getCapabilities = function () { return { ...(caps ? caps.call(this) : {}), torch: true, zoom: { min: 1, max: 5, step: 0.1 } }; };
    const settings = MediaStreamTrack.prototype.getSettings;
    MediaStreamTrack.prototype.getSettings = function () { return { ...settings.call(this), zoom: 1 }; };
    const apply = MediaStreamTrack.prototype.applyConstraints;
    MediaStreamTrack.prototype.applyConstraints = function (c) {
      const sets = c?.advanced ?? [];
      window.__torch.push(sets.map((s) => ("torch" in s ? s.torch : undefined)).filter((t) => t !== undefined));
      if (sets.some((s) => s.torch === true)) (window.__events ??= []).push("torch");
      return apply.call(this, { advanced: sets.map(({ torch, zoom, ...rest }) => rest) }).catch(() => {});
    };
  });
}
const torchButton = (page) => page.evaluate(() => { const b = document.querySelector('button[aria-label="Torch"]'); return b ? b.getAttribute("aria-pressed") : null; });
const pillText = (page) => page.evaluate(() => document.body.innerText);
const lastTorch = (page) => page.evaluate(() => { const all = window.__torch.flat(); return all.length ? all[all.length - 1] : null; });

try {
  // Dark room, camera with a torch
  {
    const { browser, page } = await launch("dark-room.mjpeg");
    await withTorch(page);
    await openScanner(page, { auto: "off" });
    await sleep(600);
    check("dark: torch button shown, off at first", (await torchButton(page)) === "false", String(await torchButton(page)));
    await sleep(2500);
    check("dark: torch comes on by itself", (await torchButton(page)) === "true" && (await lastTorch(page)) === true, JSON.stringify(await page.evaluate(() => window.__torch)));
    check("dark: no 'too dark' hint when there's a torch", !(await pillText(page)).includes("It's dark here"));
    await shot(page, "torch-on");
    await page.click('button[aria-label="Torch"]');
    await sleep(300);
    check("tap turns it off", (await torchButton(page)) === "false" && (await lastTorch(page)) === false);
    await sleep(2500);
    check("switched off by hand: low light leaves it off", (await torchButton(page)) === "false" && (await lastTorch(page)) === false, JSON.stringify(await page.evaluate(() => window.__torch)));
    await page.click('button[aria-label="Torch"]');
    await sleep(300);
    check("tap turns it back on", (await torchButton(page)) === "true" && (await lastTorch(page)) === true);
    const zoom = await page.$('input[aria-label="Zoom"]');
    if (zoom) {
      await page.evaluate(() => { const z = document.querySelector('input[aria-label="Zoom"]'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set; set.call(z, String(Number(z.max))); z.dispatchEvent(new Event("input", { bubbles: true })); z.dispatchEvent(new Event("change", { bubbles: true })); });
      await sleep(300);
      check("a zoom change restates the torch", (await lastTorch(page)) === true, JSON.stringify(await page.evaluate(() => window.__torch.slice(-2))));
    } else console.log("(no hardware zoom in the fake camera: zoom restatement not checked)");
    await browser.close();
  }
  // Bright scene, camera with a torch: button, but it stays off
  {
    const { browser, page } = await launch("torch-bright.mjpeg");
    await withTorch(page);
    await openScanner(page, { auto: "off" });
    await sleep(3000);
    check("bright: button shown, stays off", (await torchButton(page)) === "false" && (await lastTorch(page)) !== true, JSON.stringify(await page.evaluate(() => window.__torch)));
    await browser.close();
  }
  // Dim room with a page it can find, auto-capture on: the torch comes on first
  {
    const { browser, page, posted } = await launch("dim-room.mjpeg");
    await withTorch(page);
    await page.evaluateOnNewDocument(() => {
      const f = window.fetch;
      window.fetch = function (u, ...rest) { if (String(u).includes("/api/invoice-template")) (window.__events ??= []).push("capture"); return f.call(this, u, ...rest); };
    });
    await openScanner(page, { auto: "on" });
    for (let i = 0; i < 40 && !posted.length; i++) await sleep(250);
    const ev = await page.evaluate(() => window.__events ?? []).catch(() => null);
    console.log("events", JSON.stringify(ev), "posted", posted.length);
    check("dim: a photo is taken", posted.length === 1);
    check("dim: the torch came on before the photo", Array.isArray(ev) && ev.indexOf("torch") !== -1 && ev.indexOf("torch") < ev.indexOf("capture"), JSON.stringify(ev));
    await browser.close();
  }
  // Dark room, camera without a torch: no button, a hint instead
  {
    const { browser, page } = await launch("dark-room.mjpeg");
    await openScanner(page, { auto: "off" });
    await sleep(3000);
    check("no torch: no button", (await torchButton(page)) === null);
    check("no torch: 'It's dark here' hint", (await pillText(page)).includes("It's dark here — more light helps"));
    await shot(page, "torch-none-dark");
    await browser.close();
  }
} catch (e) { console.log("ERROR", e.message); }
finally { console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length })); }
