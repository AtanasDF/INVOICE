// A browser for the logic suites that read a printed sheet: readSheet and
// the PDF's break points need layout, so they cannot run in Node. No app and
// no server of its own beyond this one -- the compiled lib in gen/ is served
// as it is, and the markup is the sheets' own shape with the few display
// rules innerText depends on stood in by hand.
//
// CHROME points it at another browser (a Linux cloud session has Chromium
// at /opt/pw-browsers/chromium, not Chrome at the macOS path).
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";
import { HARNESS } from "./repo.mjs";

const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const GEN = path.join(HARNESS, "gen");

const CSS = `
body { margin: 0; font: 14px/1.6 Helvetica, Arial, sans-serif; }
.sheet { width: 794px; padding: 0 53px; box-sizing: border-box; }
.flex { display: flex; } .grid { display: grid; } .contents { display: contents; } .block { display: block; }
.inline-block { display: inline-block; } .flex-wrap { flex-wrap: wrap; } .justify-between { justify-content: space-between; }
.grid-cols-2 { grid-template-columns: 1fr 1fr; } .grid-cols-auto { grid-template-columns: auto 1fr; }
.whitespace-pre-line { white-space: pre-line; } .uppercase { text-transform: uppercase; }
.wrap-anywhere { overflow-wrap: anywhere; } .min-w-0 { min-width: 0; } .text-right { text-align: right; }
.w-64 { width: 16rem; } .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0); }
`;

// lib files that also hold a hook (platform.ts, install.ts) import React,
// which nothing here renders: a stand-in is enough for the import to resolve.
const IMPORTS = JSON.stringify({ imports: { react: "data:text/javascript,export const useSyncExternalStore = () => undefined, useEffect = () => {}, useState = (v) => [v, () => {}];" } });

export async function sheetBrowser() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    if (url.pathname === "/") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      return res.end(`<!doctype html><html><head><meta charset="utf-8"><script type="importmap">${IMPORTS}</script><style>${CSS}</style></head><body></body></html>`);
    }
    const file = path.join(GEN, url.pathname.replace(/^\/gen\//, ""));
    if (!file.startsWith(GEN) || !fs.existsSync(file)) {
      res.writeHead(404);
      return res.end();
    }
    res.writeHead(200, { "content-type": "text/javascript" });
    res.end(fs.readFileSync(file));
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-first-run", "--no-default-browser-check", "--no-sandbox"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 1200 });
  await page.goto(`${base}/`);
  return {
    page,
    // Puts the markup in a fresh .sheet and returns what fn returns, given
    // the sheet and the named modules from gen/lib.
    async run(html, modules, fn, arg) {
      return page.evaluate(
        async (html, modules, src, arg) => {
          document.body.innerHTML = `<div class="sheet" id="sheet">${html}</div>`;
          const libs = {};
          for (const m of modules) Object.assign(libs, await import(`/gen/lib/${m}.js`));
          return new Function("return " + src)()(document.getElementById("sheet"), libs, arg);
        },
        html,
        modules,
        fn.toString(),
        arg
      );
    },
    async close() {
      await browser.close();
      server.close();
    },
  };
}
