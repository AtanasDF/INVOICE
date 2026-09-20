import { launch, openScanner, sleep } from "./camera3.mjs";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };
try {
  {
    const { browser, page } = await launch("dark-nocv2.mjpeg");
    await page.evaluateOnNewDocument(() => {
      window.__torch = [];
      const caps = MediaStreamTrack.prototype.getCapabilities;
      MediaStreamTrack.prototype.getCapabilities = function () { return { ...(caps ? caps.call(this) : {}), torch: true }; };
      const apply = MediaStreamTrack.prototype.applyConstraints;
      MediaStreamTrack.prototype.applyConstraints = function (c) { const sets = c?.advanced ?? []; window.__torch.push(...sets.filter((s) => "torch" in s).map((s) => s.torch)); return apply.call(this, { advanced: sets.map(({ torch, ...r }) => r) }).catch(() => {}); };
    });
    await openScanner(page, { auto: "off" });
    await sleep(2500);
    const t = await page.evaluate(() => ({ text: document.body.innerText, torch: window.__torch, pressed: document.querySelector('button[aria-label="Torch"]')?.getAttribute("aria-pressed") }));
    check("no OpenCV: edge detection says unavailable", t.text.includes("Edge detection unavailable"));
    check("no OpenCV: torch still comes on in the dark", t.pressed === "true" && t.torch.includes(true), JSON.stringify(t.torch));
    await browser.close();
  }
  {
    const { browser, page } = await launch("dark-room.mjpeg");
    await openScanner(page, { auto: "off" });
    await sleep(2500);
    check("no OpenCV, no torch: 'It's dark here' hint", (await page.evaluate(() => document.body.innerText)).includes("It's dark here"));
    await browser.close();
  }
} catch (e) { console.log("ERROR", e.message); }
finally { console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length })); }
