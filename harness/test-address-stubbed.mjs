// The address finder off the internet (items 42b and 82 on Atanas's list):
// its own dev server, with postcodes.io, OpenStreetMap (through Photon) and
// Royal Mail's file (through Ideal Postcodes) answered by a stand-in shaped
// like their real replies. His two asks, 2026-09-22: a postcode lists its
// addresses by itself, and an address typed ends with its postcode.
// test-address-fields still runs against the live services; this one runs
// anywhere, and is the only way to try the paid path without a paid key.
import http from "node:http";
import { spawn } from "node:child_process";
import puppeteer from "puppeteer-core";
import { startMockServer } from "./mock-server.mjs";
import { fakeSession, makeDb, UID } from "./mockdb.mjs";
import { REPO } from "./repo.mjs";

const WEB = `${REPO}/web`;
const PORT = 3313;
const MOCK = 3562;
const STUB = 3563;
const KEY = "harness-paf-key";
const base = `http://localhost:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

// ---- The stand-in services -------------------------------------------------
const PLACES = {
  "SE18 1HU": { latitude: 51.48605, longitude: 0.07441, admin_district: "Greenwich", bua: "Greenwich" },
  "SE18 1HS": { latitude: 51.48655, longitude: 0.07302, admin_district: "Greenwich", bua: "Greenwich" },
  "SE18 1HL": { latitude: 51.48531, longitude: 0.07597, admin_district: "Greenwich", bua: "Greenwich" },
  "SW1A 2AA": { latitude: 51.50354, longitude: -0.127695, admin_district: "Westminster", bua: "City of Westminster" },
  "M1 1AE": { latitude: 53.48071, longitude: -2.23743, admin_district: "Manchester", bua: "Manchester (Manchester)" },
};
const feature = (lon, lat, properties) => ({ type: "Feature", geometry: { type: "Point", coordinates: [lon, lat] }, properties: { countrycode: "GB", ...properties } });
const street = (name, extra = {}) => ({ osm_key: "highway", osm_value: "residential", type: "street", name, city: "London", district: "Plumstead", county: "Greater London", ...extra });
const house = (housenumber, streetName, postcode, city = "London") => ({ osm_key: "place", osm_value: "house", type: "house", housenumber, street: streetName, postcode, city });
// Around SE18 1HU the free data has streets and houses, none of them with
// that postcode (as on the night Atanas tried his own): nearest first.
const REVERSE = {
  "SE18 1HU": [
    feature(0.0739, 51.4862, street("Benares Road", { postcode: "SE18 1HS" })),
    feature(0.0738, 51.4863, house("2", "Benares Road", "SE18 1HS")),
    feature(0.0745, 51.4859, { osm_key: "highway", osm_value: "bus_stop", type: "house", name: "Benares Road (Stop K)", city: "London" }),
    feature(0.0751, 51.4857, street("St. Nicholas Road", { postcode: "SE18 1HH" })),
    feature(0.0736, 51.4866, street("Benares Road", { postcode: "SE18 1HS" })),
    feature(0.0759, 51.4853, street("Amar Court")),
    feature(0.0760, 51.4852, house("4", "Amar Court", "SE18 1HL")),
  ],
  "SW1A 2AA": [
    feature(-0.1277, 51.5035, house("10", "Downing Street", "SW1A 2AA")),
    feature(-0.1279, 51.5036, house("11", "Downing Street", "SW1A 2AB")),
    feature(-0.1275, 51.5034, house("12", "Downing Street", "SW1A 2AA")),
  ],
  "M1 1AE": [feature(-2.2374, 53.4807, house("20", "Mosley Street", "M1 1AE", "Manchester City Council"))],
};
const SEARCH = {
  "149 benares road": [
    feature(0.0739, 51.4862, street("Benares Road", { postcode: "SE18 1HS" })),
    feature(-3.4960, 50.5480, { osm_key: "amenity", osm_value: "school", type: "house", name: "Teignmouth Community School", street: "Exeter Road", city: "Teignmouth", county: "Devon", postcode: "TQ14 9HZ" }),
    feature(-0.9390, 51.0180, { osm_key: "amenity", osm_value: "school", type: "house", name: "Bedales School", street: "Church Road", city: "Steep", county: "Hampshire", postcode: "GU32 2DG" }),
    feature(-0.2020, 51.4900, street("North End Road", { postcode: "W14 9NS", district: "West Kensington" })),
  ],
  // A street the free data files with no postcode: the nearest is looked up.
  "2 amar court": [feature(0.0759, 51.4853, street("Amar Court"))],
  // A house the free data has no postcode for: the nearest, to be checked.
  "4 amar court": [feature(0.0760, 51.4852, { osm_key: "place", osm_value: "house", type: "house", housenumber: "4", street: "Amar Court", city: "London" })],
  "10 downing street": [feature(-0.1277, 51.5035, house("10", "Downing Street", "SW1A 2AA"))],
};
SEARCH["149 benares road, london"] = SEARCH["149 benares road"];
const NEAREST = [{ postcode: "SE18 1HL", lon: 0.0759, lat: 51.4853 }];
const PAF_LIST = {
  SE181HU: [
    { line_1: "149 Benares Road", line_2: "", line_3: "", post_town: "LONDON", postcode: "SE18 1HU", udprn: 11111149 },
    { line_1: "Flat 1", line_2: "151 Benares Road", line_3: "", post_town: "LONDON", postcode: "SE18 1HU", udprn: 11111151 },
  ],
};
const stub = { paf: "ok", log: [], photonFails: 0 };
const send = (res, status, body) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
const stubServer = http.createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    const u = new URL(req.url, `http://127.0.0.1:${STUB}`);
    stub.log.push(`${req.method} ${u.pathname}${u.search}${raw ? " " + raw : ""}`);
    const pc = (s) => decodeURIComponent(s).toUpperCase().replace(/\s+/g, " ").trim();
    if (u.pathname.startsWith("/pc/postcodes/") && req.method === "GET") {
      const code = pc(u.pathname.slice("/pc/postcodes/".length));
      return PLACES[code] ? send(res, 200, { status: 200, result: { postcode: code, ...PLACES[code] } }) : send(res, 404, { status: 404, error: "Postcode not found" });
    }
    if (u.pathname === "/pc/postcodes" && req.method === "POST") {
      const body = JSON.parse(raw || "{}");
      if (body.postcodes) return send(res, 200, { status: 200, result: body.postcodes.map((q) => ({ query: q, result: PLACES[pc(q)] ? { postcode: pc(q), ...PLACES[pc(q)] } : null })) });
      if (body.geolocations) {
        return send(res, 200, {
          status: 200,
          result: body.geolocations.map((g) => {
            const near = NEAREST.filter((n) => Math.abs(n.lon - g.longitude) < 0.002 && Math.abs(n.lat - g.latitude) < 0.002);
            return { query: g, result: near.length ? near.map((n) => ({ postcode: n.postcode, distance: 12 })) : null };
          }),
        });
      }
      return send(res, 400, { status: 400, error: "bad bulk" });
    }
    // The free map failing, as it did on the first live search after a
    // deploy: a bad gateway for the next photonFails calls.
    if (u.pathname.startsWith("/photon/") && stub.photonFails > 0) {
      stub.photonFails--;
      return send(res, 502, { message: "bad gateway" });
    }
    if (u.pathname === "/photon/reverse") {
      const lat = Number(u.searchParams.get("lat")), lon = Number(u.searchParams.get("lon"));
      const at = Object.entries(PLACES).find(([, p]) => Math.abs(p.latitude - lat) < 1e-6 && Math.abs(p.longitude - lon) < 1e-6)?.[0];
      return send(res, 200, { type: "FeatureCollection", features: REVERSE[at] ?? [] });
    }
    if (u.pathname === "/photon/api/") {
      return send(res, 200, { type: "FeatureCollection", features: SEARCH[(u.searchParams.get("q") ?? "").toLowerCase()] ?? [] });
    }
    if (u.pathname.startsWith("/ideal/v1/")) {
      if (u.searchParams.get("api_key") !== KEY) return send(res, 401, { code: 4010, message: "Invalid key" });
      if (stub.paf === "no-balance") return send(res, 402, { code: 4020, message: "Insufficient balance" });
      if (stub.paf === "down") return send(res, 503, { code: 5030, message: "down" });
      const rest = u.pathname.slice("/ideal/v1/".length);
      if (rest.startsWith("postcodes/")) {
        const list = PAF_LIST[decodeURIComponent(rest.slice("postcodes/".length)).toUpperCase()];
        return list ? send(res, 200, { code: 2000, result: list }) : send(res, 404, { code: 4040, message: "Postcode not found" });
      }
      if (rest === "autocomplete/addresses") {
        const q = (u.searchParams.get("q") ?? "").toLowerCase();
        return send(res, 200, { code: 2000, result: { hits: q.includes("benares") ? [{ suggestion: "149 Benares Road, London, SE18 1HU", udprn: 11111149 }] : [] } });
      }
      if (rest.startsWith("udprn/")) {
        const id = Number(rest.slice("udprn/".length));
        const a = PAF_LIST.SE181HU.find((x) => x.udprn === id);
        return a ? send(res, 200, { code: 2000, result: a }) : send(res, 404, { code: 4044, message: "No address" });
      }
    }
    send(res, 404, { error: "stand-in has no answer for " + u.pathname });
  });
});
stubServer.listen(STUB);

const db = makeDb();
Object.assign(db.tables, { receipts: [], recurring_invoices: [], quote_requests: [], quote_request_suppliers: [] });
db.tables.business_profile.push({ user_id: UID, business_name: "Nasko Plastering", account_kind: "limited", vat_registered: false, invoice_prefix: "INV-", invoice_next_number: 1 });
const { server: mock } = startMockServer(MOCK, db);
const app = spawn("npx", ["next", "dev", "--webpack", "-p", String(PORT)], {
  cwd: WEB,
  env: {
    ...process.env,
    NEXT_PUBLIC_SUPABASE_URL: `http://localhost:${MOCK}`,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "fake-anon-key",
    SUPABASE_SERVICE_ROLE_KEY: "fake-service-role-key",
    POSTCODES_API_BASE: `http://127.0.0.1:${STUB}/pc`,
    PHOTON_API_BASE: `http://127.0.0.1:${STUB}/photon`,
    IDEAL_POSTCODES_API_BASE: `http://127.0.0.1:${STUB}/ideal/v1`,
    IDEAL_POSTCODES_API_KEY: KEY,
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let serverLog = "";
app.stdout.on("data", (d) => (serverLog += d));
app.stderr.on("data", (d) => (serverLog += d));

const search = (body, signedIn = false) =>
  fetch(`${base}/api/address-search`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": `10.0.0.${signedIn ? 2 : 1}`, ...(signedIn ? { authorization: "Bearer harness-token" } : {}) },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120000),
  }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
const idealCalls = () => stub.log.filter((l) => l.includes("/ideal/v1/")).length;

let browser;
try {
  for (let i = 0; i < 240; i++) {
    const r = await search({ q: "ab" }).catch(() => null);
    if (r && r.status === 200) break;
    await sleep(1000);
  }

  // ---- The free lookup, as a stranger on the Free page gets it ----------
  let r = await search({ q: "sw1a2aa" });
  const labels = (res) => (res.body?.items ?? []).map((m) => m.label);
  check("a postcode lists the houses that carry it, in street and number order", JSON.stringify(labels(r)) === JSON.stringify(["10 Downing Street", "12 Downing Street", "Not listed? Use just the postcode"]), JSON.stringify(labels(r)));
  check("...each with its whole address", JSON.stringify(r.body.items[0].lines) === JSON.stringify(["10 Downing Street", "London", "SW1A 2AA"]), JSON.stringify(r.body.items[0]));

  r = await search({ q: "SE18 1HU" });
  check("a postcode with no houses in the free data offers its streets, nearest first, each once", JSON.stringify(labels(r)) === JSON.stringify(["Benares Road", "St. Nicholas Road", "Amar Court", "Not listed? Use just the postcode"]) && r.body.noHouses === true, JSON.stringify(r.body).slice(0, 300));
  check("...a street goes in with the typed postcode and town", JSON.stringify(r.body.items[0].lines) === JSON.stringify(["Benares Road", "London", "SE18 1HU"]) && r.body.items[0].street === true, JSON.stringify(r.body.items[0]));
  check("...no bus stop among them, and no house from the next postcode", !labels(r).some((l) => /Stop K|^2 Benares/.test(l)), JSON.stringify(labels(r)));

  r = await search({ q: "M1 1AE" });
  check("outside London the town is the built-up area, not the council", r.body.items[0]?.lines?.join("|") === "20 Mosley Street|Manchester|M1 1AE", JSON.stringify(r.body.items[0]));

  r = await search({ q: "149 Benares Road, London" });
  check("a number and street finds only that street: no schools in Devon or Hampshire, no other road", JSON.stringify(labels(r)) === JSON.stringify(["149 Benares Road"]), JSON.stringify(labels(r)));
  check("...and it ends with the street's postcode, asking to check it", JSON.stringify(r.body.items[0]?.lines) === JSON.stringify(["149 Benares Road", "London", "SE18 1HS"]) && /check it's your postcode/.test(r.body.items[0]?.detail ?? ""), JSON.stringify(r.body.items[0]));

  const before = stub.log.length;
  r = await search({ q: "2 Amar Court" });
  check("a street the free data files without a postcode gets the nearest one", JSON.stringify(r.body.items[0]?.lines) === JSON.stringify(["2 Amar Court", "London", "SE18 1HL"]), JSON.stringify(r.body.items[0]));
  check("...found in one call for every such place", stub.log.slice(before).filter((l) => l.startsWith("POST /pc/postcodes") && l.includes("geolocations")).length === 1, JSON.stringify(stub.log.slice(before)));

  r = await search({ q: "4 Amar Court" });
  check("so does a house filed without one, also asking to check it", JSON.stringify(r.body.items[0]?.lines) === JSON.stringify(["4 Amar Court", "London", "SE18 1HL"]) && /check it's your postcode/.test(r.body.items[0]?.detail ?? ""), JSON.stringify(r.body.items[0]));

  r = await search({ q: "ZZ99 9ZZ" });
  check("a postcode that doesn't exist says so and can be kept as typed", r.body.badPostcode === true && labels(r)[0] === "Use ZZ99 9ZZ as typed", JSON.stringify(r.body));
  r = await search({ q: "SE18 1HU", where: true });
  check("a postcode's position for a mileage trip", r.status === 200 && r.body.at?.lat === PLACES["SE18 1HU"].latitude, JSON.stringify(r.body));
  check("no stranger's search ever reached the paid service", idealCalls() === 0, String(idealCalls()));

  // ---- Royal Mail's list, signed in, with a key --------------------------
  r = await search({ q: "SE18 1HU" }, true);
  check("signed in, a postcode lists Royal Mail's addresses", r.body.source === "paf" && JSON.stringify(labels(r)) === JSON.stringify(["149 Benares Road", "Flat 1, 151 Benares Road"]), JSON.stringify(r.body).slice(0, 300));
  r = await search({ q: "149 Benares" }, true);
  check("a number and street gives suggestions, fetched in full only on a pick", r.body.source === "paf" && r.body.items[0]?.id === "paf:11111149" && !r.body.items[0]?.lines, JSON.stringify(r.body));
  r = await search({ pick: "paf:11111149" }, true);
  check("the pick fetches the whole address, postcode included", JSON.stringify(r.body.lines) === JSON.stringify(["149 Benares Road", "London", "SE18 1HU"]), JSON.stringify(r.body));
  r = await search({ q: "ZZ99 9ZZ" }, true);
  check("Royal Mail's own not-found is the same kept-as-typed offer", r.body.badPostcode === true, JSON.stringify(r.body));

  // ---- The browser ---------------------------------------------------------
  browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, args: ["--no-first-run"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 375, height: 900 });
  page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
  const asked = [];
  page.on("request", (req) => { if (req.url().endsWith("/api/address-search") && req.method() === "POST") asked.push(JSON.parse(req.postData() || "{}")); });
  // Every page needs an account since 2026-09-22; the session goes in
  // before each load, and a suite's localStorage.clear() puts it back.
  await page.evaluateOnNewDocument((key, session) => {
    localStorage.setItem(key, JSON.stringify(session));
    const clear = localStorage.clear.bind(localStorage);
    localStorage.clear = () => {
      clear();
      localStorage.setItem(key, JSON.stringify(session));
    };
  }, "sb-localhost-auth-token", fakeSession());
  await page.goto(`${base}/clients/new`, { waitUntil: "networkidle0", timeout: 180000 });
  await page.waitForFunction(() => !!document.querySelector('input[aria-label="Postcode"]'), { timeout: 60000 }).catch(() => {});
  const input = async (label) => (await page.$$(`input[aria-label="${label}"]`))[0];
  const setBox = (label, value) =>
    page.evaluate((l, v) => {
      const el = [...document.querySelectorAll(`input[aria-label="${l}"]`)][0];
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, v);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }, label, value);
  const block = () =>
    page.evaluate(() => {
      const b = document.querySelector('input[aria-label="Postcode"]').closest(".space-y-2");
      const v = (l) => b.querySelector(`input[aria-label="${l}"]`).value;
      return {
        line1: v("House number and street"),
        town: v("Town or city"),
        postcode: v("Postcode"),
        options: [...b.querySelectorAll('[role="option"]')].map((o) => o.querySelector("span").textContent),
        note: [...b.querySelectorAll("p.text-xs")].map((p) => p.textContent).join(" | "),
      };
    });
  const waitOptions = (ms = 8000) =>
    page
      .waitForFunction(() => document.querySelector('input[aria-label="Postcode"]').closest(".space-y-2").querySelectorAll('[role="option"]').length > 0, { timeout: ms })
      .then(() => true, () => false);
  const pick = (label) =>
    page.evaluate((label) => {
      const b = document.querySelector('input[aria-label="Postcode"]').closest(".space-y-2");
      const o = [...b.querySelectorAll('[role="option"] button')].find((x) => x.querySelector("span").textContent === label);
      o?.click();
      return !!o;
    }, label);
  const clearAddress = async () => {
    for (const l of ["House number and street", "Flat, building or area", "Town or city", "Postcode"]) await setBox(l, "");
    await sleep(900);
  };

  // Royal Mail's own list first: this server has a key, and a signed-in
  // person is who it is for.
  await (await input("Postcode")).type("SE18 1HU", { delay: 60 });
  await waitOptions();
  let f = await block();
  check("signed in with a key, the postcode lists Royal Mail's addresses", JSON.stringify(f.options) === JSON.stringify(["149 Benares Road", "Flat 1, 151 Benares Road"]) && /Royal Mail addresses/.test(f.note), JSON.stringify(f));
  check("picked one of them", await pick("Flat 1, 151 Benares Road"));
  await sleep(300);
  f = await block();
  check("...and it fills every box", f.line1 === "Flat 1" && f.town === "London" && f.postcode === "SE18 1HU", JSON.stringify(f));

  // ---- The key refused: the free lookups answer from here on --------------
  stub.paf = "no-balance";
  const was = idealCalls();
  r = await search({ q: "M1 1AE" }, true);
  check("out of credit: the free list instead, marked as such", r.body.source === "osm" && r.body.fallback === true && r.body.items[0]?.lines?.at(-1) === "M1 1AE", JSON.stringify(r.body).slice(0, 200));
  r = await search({ q: "SE18 1HS" }, true);
  check("...and the key is rested: the next search doesn't ask Royal Mail at all", idealCalls() === was + 1 && r.body.fallback === true, `${was} -> ${idealCalls()}`);
  check("...logged once, in words", (serverLog.match(/Ideal Postcodes refused the key \(402\)/g) ?? []).length === 1, serverLog.split("\n").filter((l) => /address-search/.test(l)).join(" / ").slice(0, 300));

  await page.reload({ waitUntil: "networkidle0" });
  await page.waitForFunction(() => !!document.querySelector('input[aria-label="Postcode"]'), { timeout: 60000 }).catch(() => {});
  asked.length = 0;
  await (await input("Postcode")).type("SW1A 2AA", { delay: 60 });
  const listed = await waitOptions();
  f = await block();
  check("his first ask: a postcode typed lists its addresses with no button pressed", listed && f.options.includes("10 Downing Street"), JSON.stringify(f));
  check("...after one search for the whole postcode, not one per letter", asked.length === 1 && asked[0].q === "SW1A 2AA", JSON.stringify(asked));
  check("...and the box says why this list is the free one", /^Royal Mail's list isn't available just now, so this is the free one\./.test(f.note), f.note);
  check("picked 10 Downing Street", await pick("10 Downing Street"));
  await sleep(300);
  f = await block();
  check("...it fills the street, town and postcode and closes the list", f.line1 === "10 Downing Street" && f.town === "London" && f.postcode === "SW1A 2AA" && f.options.length === 0, JSON.stringify(f));
  asked.length = 0;
  await (await input("Flat, building or area")).type("Rear entrance", { delay: 30 });
  await sleep(1500);
  check("typing elsewhere in an address already settled searches nothing", asked.length === 0 && (await block()).options.length === 0, JSON.stringify(asked));

  await clearAddress();
  asked.length = 0;
  await (await input("House number and street")).type("149 Benares Road", { delay: 50 });
  await (await input("Town or city")).type("London", { delay: 50 });
  const found = await waitOptions();
  f = await block();
  check("his second ask: a number and street typed finds the street by itself", found && JSON.stringify(f.options) === JSON.stringify(["149 Benares Road"]), JSON.stringify(f));
  check("...searching once the typing stopped, not on every letter", asked.length >= 1 && asked.length <= 2 && asked.at(-1).q === "149 Benares Road, London", JSON.stringify(asked));
  await pick("149 Benares Road");
  await sleep(300);
  f = await block();
  check("...and the pick ends with the postcode in its box", f.line1 === "149 Benares Road" && f.town === "London" && f.postcode === "SE18 1HS", JSON.stringify(f));

  // His own postcode: no houses in the free data, so his street is offered.
  await clearAddress();
  await setBox("House number and street", "149");
  await sleep(900);
  asked.length = 0;
  await (await input("Postcode")).type("se18 1hu", { delay: 60 });
  await waitOptions();
  f = await block();
  check("a postcode with no houses lists the streets there", JSON.stringify(f.options) === JSON.stringify(["Benares Road", "St. Nicholas Road", "Amar Court", "Not listed? Use just the postcode"]), JSON.stringify(f));
  check("...and says what to do in plain words", /No houses are listed for SE18 1HU in the free directory\. Pick your street, then add your house number\./.test(f.note), f.note);
  await pick("Benares Road");
  await sleep(300);
  f = await block();
  check("picking the street keeps the number typed and the postcode", f.line1 === "149 Benares Road" && f.town === "London" && f.postcode === "SE18 1HU", JSON.stringify(f));

  // The map fails once: the box asks again by itself and the list comes.
  stub.photonFails = 1;
  await clearAddress();
  asked.length = 0;
  await (await input("Postcode")).type("SE18 1HL", { delay: 60 });
  const retried = await waitOptions(14000);
  f = await block();
  check("a search the map fails once is asked again by itself, and answers", retried && asked.filter((a) => a.q === "SE18 1HL").length === 2 && !/isn't answering/.test(f.note), JSON.stringify({ f, asked }));
  check("fits 375px", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
} catch (e) {
  console.log("ERROR", e.message);
  results.push(false);
} finally {
  await browser?.close();
  app.kill();
  mock.close();
  stubServer.close();
  console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
  process.exit(0);
}
