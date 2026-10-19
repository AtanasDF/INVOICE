// The service worker, run rather than read. test-offline-rules checks sw.js by
// pattern, which is how "the cache is versioned, and old versions are
// deleted" passed for a month while the version never moved and nothing was
// ever deleted (notes/audit-offline.md 2a). This runs the file itself in a
// sandbox with a stand-in Cache Storage and fetch, and asks it two things:
//
// - one bar: a navigation whose connection is accepted and never answered
//   must still end on the offline page, not a blank tab for ever (audit 5);
// - the cache of app files stops growing at its limit, oldest out first, and
//   never throws away the vendor files (OpenCV is 13 MB) to make room.
import fs from "node:fs";
import vm from "node:vm";
import { REPO } from "./repo.mjs";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const source = fs.readFileSync(`${REPO}/web/public/sw.js`, "utf8");
const timeout = Number(source.match(/NAVIGATE_TIMEOUT_MS = (\d+)/)?.[1]);
const max = Number(source.match(/MAX_STATIC = (\d+)/)?.[1]);
check("a navigation has a time limit, and a sane one", timeout >= 5000 && timeout <= 20000, String(timeout));
check("the app-file cache has a limit", max >= 100 && max <= 1000, String(max));

function boot({ fetch }) {
  const stores = new Map();
  const open = async (name) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const m = stores.get(name);
    return {
      put: async (req, res) => { m.delete(req.url); m.set(req.url, res); },
      match: async (req) => m.get(typeof req === "string" ? new URL(req, "https://app.test").href : req.url),
      keys: async () => [...m.keys()].map((url) => ({ url })),
      delete: async (req) => m.delete(req.url),
      addAll: async (urls) => { for (const u of urls) m.set(new URL(u, "https://app.test").href, { ok: true, body: u }); },
    };
  };
  const caches = {
    open,
    keys: async () => [...stores.keys()],
    delete: async (n) => stores.delete(n),
    match: async (req) => { for (const n of stores.keys()) { const hit = await (await open(n)).match(req); if (hit) return hit; } },
  };
  const listeners = {};
  const self = {
    location: { origin: "https://app.test" },
    addEventListener: (t, fn) => { listeners[t] = fn; },
    skipWaiting: async () => {},
    clients: { claim: async () => {} },
    registration: {},
    navigator: {},
  };
  // Shrunk so the suite takes a second, not ten.
  const code = source.replace(/NAVIGATE_TIMEOUT_MS = \d+/, "NAVIGATE_TIMEOUT_MS = 200");
  vm.runInNewContext(code, { self, caches, fetch, URL, Promise, setTimeout, clearTimeout, Response: { error: () => ({ error: true }) }, console });
  const dispatch = async (type, extra = {}) => {
    let responded = null;
    const waits = [];
    listeners[type]({ ...extra, waitUntil: (p) => waits.push(p), respondWith: (p) => { responded = p; } });
    await Promise.all(waits);
    return responded;
  };
  return { stores, caches, dispatch };
}

// ── One bar ──
{
  const sw = boot({ fetch: () => new Promise(() => {}) });
  await sw.dispatch("install");
  await sw.dispatch("activate");
  const req = { method: "GET", url: "https://app.test/receipts/new", mode: "navigate" };
  const started = Date.now();
  const res = await Promise.race([sw.dispatch("fetch", { request: req }).then((p) => p), sleep(3000).then(() => "hung")]);
  const answer = res === "hung" ? "hung" : await Promise.race([res, sleep(3000).then(() => "hung")]);
  check("a page that is never answered ends on the offline page", answer?.body === "/offline", JSON.stringify(answer));
  check("...after the time limit, not straight away", Date.now() - started >= 180, String(Date.now() - started));
}

// ── A page that answers is not cut short or replaced ──
{
  const sw = boot({ fetch: () => sleep(50).then(() => ({ ok: true, body: "the real page" })) });
  await sw.dispatch("install");
  const res = await sw.dispatch("fetch", { request: { method: "GET", url: "https://app.test/vat", mode: "navigate" } });
  check("a page that answers in time is the page itself", (await res)?.body === "the real page");
}

// ── An old cache name is cleared on activate ──
{
  const sw = boot({ fetch: async () => ({ ok: true }) });
  await (await sw.caches.open("invoiceover-v1")).put({ url: "https://app.test/_next/static/old.js" }, { ok: true });
  await sw.dispatch("install");
  await sw.dispatch("activate");
  check("the old v1 cache, which held every deploy since September, is deleted", !sw.stores.has("invoiceover-v1"), JSON.stringify([...sw.stores.keys()]));
}

// ── The cache stops growing ──
{
  const sw = boot({ fetch: async (req) => ({ ok: true, body: req.url, clone() { return this; } }) });
  await sw.dispatch("install");
  await sw.dispatch("activate");
  const name = [...sw.stores.keys()][0];
  const get = async (path) => { const p = await sw.dispatch("fetch", { request: { method: "GET", url: `https://app.test${path}`, mode: "no-cors" } }); await p; await sleep(0); };
  await get("/vendor/opencv-5.0.0.js");
  for (let i = 0; i < max + 40; i++) await get(`/_next/static/chunks/c${i}.js`);
  await sleep(50);
  const keys = [...sw.stores.get(name).keys()];
  const statics = keys.filter((k) => k.includes("/_next/static/"));
  check("the app files kept stop at the limit", statics.length === max, `${statics.length} of ${max}`);
  check("...and it is the oldest that went", !keys.includes("https://app.test/_next/static/chunks/c0.js") && keys.includes(`https://app.test/_next/static/chunks/c${max + 39}.js`));
  check("...never the vendor files, or the offline page", keys.includes("https://app.test/vendor/opencv-5.0.0.js") && keys.includes("https://app.test/offline"), JSON.stringify(keys.filter((k) => !k.includes("/_next/"))));
}

console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
