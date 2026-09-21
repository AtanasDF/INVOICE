import { launch, openScanner, sleep } from "./camera3.mjs";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };
// Nothing here used to stop OpenCV loading, so "no OpenCV" was only ever
// true on a server missing the vendor file -- and when that was fixed it
// was fixed for one of the two launches. The scanner loads it as a
// <script>; pointing that at a path that isn't there is what a failed
// download looks like to the page.
const blockOpenCV = (page) => page.evaluateOnNewDocument(() => {
  const src = Object.getOwnPropertyDescriptor(HTMLScriptElement.prototype, "src");
  Object.defineProperty(HTMLScriptElement.prototype, "src", {
    get() { return src.get.call(this); },
    set(v) { src.set.call(this, /opencv/.test(String(v)) ? "/vendor/opencv-not-here.js" : v); },
  });
});
try {
  {
    const { browser, page } = await launch("dark-nocv2.mjpeg");
    await blockOpenCV(page);
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
    await blockOpenCV(page);
    await openScanner(page, { auto: "off" });
    await sleep(2500);
    const text = await page.evaluate(() => document.body.innerText);
    check("no OpenCV, no torch: edge detection says unavailable", text.includes("Edge detection unavailable"));
    check("no OpenCV, no torch: 'It's dark here' hint", text.includes("It's dark here"));
    await browser.close();
  }
} catch (e) { console.log("ERROR", e.message); }
finally { console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length })); }
