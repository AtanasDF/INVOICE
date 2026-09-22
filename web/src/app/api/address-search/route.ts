import { NextResponse } from "next/server";
import {
  AddressMatch,
  AddressSearchResult,
  AddressSource,
  OsmProperties,
  PafAddress,
  matchedWords,
  matchesTypedWords,
  normalisePostcode,
  osmMatch,
  postcodeAsTyped,
  postcodeTown,
  pafLines,
  townCase,
  typedParts,
} from "@/lib/addressLookup";
import { addressKey, allow, allowShared } from "@/lib/rateLimit";
import { SITE_NAME } from "@/lib/siteName";
import { signedInUser } from "@/lib/serverAuth";

export const runtime = "nodejs";
// A map search can take a few seconds on its own (below), plus the postcode
// lookups after it; a cold start on top must not be cut off.
export const maxDuration = 30;

const FIVE_MINUTES = 5 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;
const PER_ADDRESS = 60;
// photon.komoot.io is a free public server that asks for moderate use, so
// everyone together stays under 300 a five minutes, split so the anonymous
// Free page can't use up what account holders need.
const OSM_ANON = 180;
const OSM_SIGNED_IN = 120;
// Royal Mail lookups cost a credit each (a postcode's list, or a picked
// address), so each account gets a few a five minutes and a day, and all of
// them together a backstop; past any of those it's the free lookup again.
// Suggestions as you type are free but still limited.
const PAF_PER_USER = 20;
const PAF_PER_USER_DAY = 100;
const PAF_CHARGED_TOTAL = 150;
const PAF_CHARGED_DAY = 400;
const PAF_FREE_TOTAL = 300;
const CACHE_MS = 10 * 60 * 1000;
const cache = new Map<string, { at: number; result: AddressSearchResult }>();
const UA = { "User-Agent": `${SITE_NAME} (https://invoiceover.com)` };
// The live services, unless the harness points these at its stand-ins
// (test-address-stubbed), as COMPANIES_HOUSE_API_BASE does for the register.
const POSTCODES = process.env.POSTCODES_API_BASE ?? "https://api.postcodes.io";
const PHOTON = process.env.PHOTON_API_BASE ?? "https://photon.komoot.io";
const PAF = process.env.IDEAL_POSTCODES_API_BASE ?? "https://api.ideal-postcodes.co.uk/v1";
// A key refused for itself (bad key, no credit, its own limit) isn't asked
// again for ten minutes: every search would otherwise pay a failed call
// before the free one.
const PAF_REST_MS = 10 * 60 * 1000;
let pafRestUntil = 0;
// Houses around a postcode's centre, for the free lookup: a postcode is a
// street or two, so this reaches all of it in towns and most in villages.
const REVERSE_RADIUS_KM = 0.3;

type Photon = { features?: { properties?: OsmProperties; geometry?: { coordinates?: number[] } }[] };

const json = (source: AddressSource, items: AddressMatch[], extra: Partial<AddressSearchResult> = {}, status = 200) =>
  NextResponse.json({ source, items, ...extra }, { status });

// A failed answer (rate limited, down) throws, so it reaches the route's
// "not answering" reply instead of being cached as "no matches". A 404 is
// an answer: the postcode doesn't exist.
// OpenStreetMap's search (Photon, a free public server) takes about two
// seconds a query from the UK, measured 2026-09-22, and more at busy times:
// five seconds cut off the first live street search after a deploy.
const MAP_MS = 8000;

async function getJson<T>(url: string, ms = 5000): Promise<{ status: number; body: T | null }> {
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(ms), cache: "no-store" });
  if (!res.ok && res.status !== 404) throw Object.assign(new Error(`${new URL(url).host} answered ${res.status}`), { status: res.status });
  return { status: res.status, body: (await res.json().catch(() => null)) as T | null };
}

const HOUSE_NUMBER = /^\d+[a-z]?(?:-\d+[a-z]?)?\s+/i;
const byStreetAndNumber = (a: AddressMatch, b: AddressMatch) =>
  a.label.replace(HOUSE_NUMBER, "").localeCompare(b.label.replace(HOUSE_NUMBER, "")) ||
  (parseInt(a.label, 10) || 0) - (parseInt(b.label, 10) || 0) ||
  a.label.localeCompare(b.label);

function unique(items: (AddressMatch | null)[]): AddressMatch[] {
  const seen = new Set<string>();
  return items.filter((m): m is AddressMatch => {
    if (!m) return false;
    const key = m.lines?.join("|").toLowerCase() ?? m.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// The post town for each postcode (postcodes.io's built-up area), in one
// call: OpenStreetMap often gives the council instead ("Kirklees" for
// Huddersfield). Where there's no built-up area, OpenStreetMap's own town
// stands.
async function townsFor(postcodes: (string | null)[]): Promise<Map<string, string>> {
  const unique = [...new Set(postcodes.filter((p): p is string => !!p))];
  const towns = new Map<string, string>();
  if (!unique.length) return towns;
  try {
    const res = await fetch(`${POSTCODES}/postcodes`, {
      method: "POST",
      headers: { ...UA, "Content-Type": "application/json" },
      body: JSON.stringify({ postcodes: unique }),
      signal: AbortSignal.timeout(4000),
      cache: "no-store",
    });
    const body = (await res.json().catch(() => null)) as { result?: { query: string; result: { bua?: string | null } | null }[] } | null;
    for (const r of body?.result ?? []) {
      const pc = normalisePostcode(r.query);
      // Only a built-up area beats OpenStreetMap's town; with none (all of
      // Scotland and Northern Ireland, rural England and Wales) postcodes.io
      // only has the council, which is worse.
      if (pc && r.result?.bua) towns.set(pc, townCase(postcodeTown(pc, r.result.bua, [], null)));
    }
  } catch {
    // OpenStreetMap's towns will do.
  }
  return towns;
}

// The nearest postcode to each place, in one call: a street OpenStreetMap
// files no postcode under still ends with one (Atanas, 2026-09-22: "if you
// add the address, it should give you the postcode"). Null where none is
// within 200 metres, or the lookup fails.
async function nearestPostcodes(points: { lon: number; lat: number }[]): Promise<(string | null)[]> {
  if (!points.length) return [];
  try {
    const res = await fetch(`${POSTCODES}/postcodes`, {
      method: "POST",
      headers: { ...UA, "Content-Type": "application/json" },
      body: JSON.stringify({ geolocations: points.map((p) => ({ longitude: p.lon, latitude: p.lat, radius: 200, limit: 1 })) }),
      signal: AbortSignal.timeout(4000),
      cache: "no-store",
    });
    const body = (await res.json().catch(() => null)) as { result?: { result: { postcode?: string }[] | null }[] } | null;
    return points.map((_, i) => normalisePostcode(body?.result?.[i]?.result?.[0]?.postcode ?? ""));
  } catch {
    return points.map(() => null);
  }
}

// Free: postcodes.io to check a postcode and find where it is, and
// OpenStreetMap (through Photon) for the houses and streets.
async function searchOsm(q: string): Promise<AddressSearchResult> {
  const postcode = normalisePostcode(q);
  if (!postcode) {
    const url = `${PHOTON}/api/?q=${encodeURIComponent(q)}&countrycode=GB&layer=house&layer=street&limit=8&lang=en`;
    const { body } = await getJson<Photon>(url, MAP_MS);
    const houseNumber = /^(\d+[a-z]?(?:-\d+[a-z]?)?)\s+\S/i.exec(q)?.[1];
    const typed = typedParts(q);
    const words = [...typed.must, ...typed.may];
    const all = (body?.features ?? []).map((f) => {
      const [lon, lat] = f.geometry?.coordinates ?? [];
      return { ...(f.properties ?? {}), at: typeof lon === "number" && typeof lat === "number" ? { lon, lat } : null, guessed: false };
    });
    const towns = await townsFor(all.map((p) => (p.postcode ? normalisePostcode(p.postcode) : null)));
    const withTown = all.map((p) => {
      const pc = p.postcode ? normalisePostcode(p.postcode) : null;
      return { ...p, town: pc ? towns.get(pc) : undefined };
    });
    const features = withTown
      .map((p, i) => ({ p, i, n: matchedWords(p, words) }))
      .filter(({ p }) => matchesTypedWords(p, typed))
      .sort((a, b) => b.n - a.n || a.i - b.i);
    // What's offered without a postcode gets the nearest one, and its town.
    const missing = features.filter(({ p }) => !p.postcode && p.at);
    const found = await nearestPostcodes(missing.map(({ p }) => p.at!));
    const foundTowns = await townsFor(found);
    missing.forEach(({ p }, k) => {
      const pc = found[k];
      if (pc) Object.assign(p, { postcode: pc, town: foundTowns.get(pc) ?? p.town, guessed: true });
    });
    const items = unique(
      features.map(({ p, i }) => {
        const m = osmMatch(p, `osm:${i}`, { houseNumber, town: p.town });
        return m && p.guessed && !m.detail.includes("check it") ? { ...m, detail: `${m.detail} · check it's your postcode` } : m;
      })
    );
    return { source: "osm", items: items.slice(0, 6) };
  }
  const where = await getJson<{ result?: { latitude?: number; longitude?: number; admin_district?: string; bua?: string | null } }>(
    `${POSTCODES}/postcodes/${encodeURIComponent(postcode)}`
  );
  if (where.status === 404) return { source: "osm", items: [postcodeAsTyped(postcode)], badPostcode: true };
  const at = where.body?.result;
  if (!at?.latitude || !at.longitude) return { source: "osm", items: [] };
  const { body } = await getJson<Photon>(
    `${PHOTON}/reverse?lat=${at.latitude}&lon=${at.longitude}&radius=${REVERSE_RADIUS_KM}&limit=50&lang=en`,
    MAP_MS
  );
  const props = (body?.features ?? []).map((f) => f.properties ?? {});
  const town = townCase(postcodeTown(postcode, at.bua, props.map((p) => p.city ?? ""), at.admin_district));
  const here = props.filter((p) => p.postcode && normalisePostcode(p.postcode) === postcode);
  const houses = unique(here.map((p, i) => osmMatch(p, `osm:${i}`, { town }))).filter((m) => m.lines && m.lines.length > 2).sort(byStreetAndNumber);
  const lines = [town, postcode].filter(Boolean);
  // No houses in the free data (Atanas's own postcode, 2026-09-22): the
  // streets around it, nearest first, so a pick leaves only the number to
  // type. The reverse lookup answers nearest first. Without a town a
  // street's name would be read back as one, so none are offered then.
  const streets = houses.length || !town
    ? []
    : [...new Map(props.filter((p) => p.osm_key === "highway" && p.type === "street" && p.name?.trim()).map((p) => [p.name!.trim().toLowerCase(), p.name!.trim()])).values()]
        .slice(0, 8)
        .map((name, i): AddressMatch => ({ id: `street:${i}`, label: name, detail: `${town ? `${town} ` : ""}${postcode} · pick your street, then add the number`, lines: [name, ...lines], street: true }));
  const justPostcode: AddressMatch = {
    id: `pc:${postcode}`,
    label: houses.length || streets.length ? "Not listed? Use just the postcode" : `${postcode}${town ? `, ${town}` : ""}`,
    detail: "Fills in the town and postcode; add the house and street yourself",
    lines,
    partial: true,
  };
  return { source: "osm", items: [...houses.slice(0, 40), ...streets, justPostcode], ...(houses.length ? {} : { noHouses: true }) };
}

// Royal Mail's address file through Ideal Postcodes: every address in a
// postcode, and suggestions as you type that are fetched in full on a pick.
async function searchPaf(q: string, key: string): Promise<AddressSearchResult> {
  const postcode = normalisePostcode(q);
  if (postcode) {
    const { status, body } = await getJson<{ code?: number; result?: (PafAddress & { udprn?: number })[] }>(
      `${PAF}/postcodes/${encodeURIComponent(postcode.replace(" ", ""))}?api_key=${encodeURIComponent(key)}`
    );
    if (status === 404 || body?.code === 4040) return { source: "paf", items: [postcodeAsTyped(postcode)], badPostcode: true };
    if (status !== 200) throw new Error(`Ideal Postcodes answered ${status}`);
    const items = (body?.result ?? []).map((a): AddressMatch => {
      const lines = pafLines(a);
      return { id: `paf:${a.udprn}`, label: lines.slice(0, Math.max(1, lines.length - 2)).join(", "), detail: lines.slice(-2).join(" "), lines };
    });
    return { source: "paf", items };
  }
  const { status, body } = await getJson<{ result?: { hits?: { suggestion?: string; udprn?: number }[] } }>(
    `${PAF}/autocomplete/addresses?q=${encodeURIComponent(q)}&api_key=${encodeURIComponent(key)}`
  );
  if (status !== 200) throw new Error(`Ideal Postcodes answered ${status}`);
  const items = (body?.result?.hits ?? [])
    .filter((h) => h.udprn && h.suggestion)
    .slice(0, 8)
    .map((h): AddressMatch => {
      const parts = h.suggestion!.split(", ");
      return { id: `paf:${h.udprn}`, label: parts.slice(0, -2).join(", ") || parts[0], detail: parts.slice(-2).join(" ") };
    });
  return { source: "paf", items };
}

// Ideal Postcodes refuses a key for itself with 401 (bad key) or 402 (no
// credit, or the key's own daily limit); logged once, then rested.
function restIfRefused(err: unknown): boolean {
  const status = (err as { status?: number } | null)?.status;
  if (status !== 401 && status !== 402) return false;
  if (Date.now() >= pafRestUntil) console.error(`address-search: Ideal Postcodes refused the key (${status}); free lookup for ten minutes`);
  pafRestUntil = Date.now() + PAF_REST_MS;
  return true;
}

async function pickPaf(udprn: string, key: string): Promise<string[] | null> {
  const { status, body } = await getJson<{ result?: PafAddress }>(`${PAF}/udprn/${encodeURIComponent(udprn)}?api_key=${encodeURIComponent(key)}`);
  if (status !== 200 || !body?.result) return null;
  return pafLines(body.result);
}

// Public, for every address field including the Free invoice page's. UK
// only. Signed-in users get Royal Mail's full address file when
// IDEAL_POSTCODES_API_KEY is set (it costs per lookup, so never for the
// anonymous page); everyone else the free OpenStreetMap lookup. POST keeps
// what people type out of request logs.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { q?: unknown; pick?: unknown; free?: unknown; where?: unknown };
  if (!allow(`address:ip:${addressKey(req.headers.get("x-forwarded-for"))}`, PER_ADDRESS, FIVE_MINUTES)) {
    return json("osm", [], { busy: true }, 429);
  }
  const key = process.env.IDEAL_POSTCODES_API_KEY;
  const userId = await signedInUser(req.headers.get("authorization"));
  const charged = async () =>
    !!userId &&
    (await allowShared(`address:paf:user:${userId}`, PAF_PER_USER, FIVE_MINUTES)) &&
    (await allowShared(`address:paf:user-day:${userId}`, PAF_PER_USER_DAY, DAY)) &&
    (await allowShared("address:paf:charged", PAF_CHARGED_TOTAL, FIVE_MINUTES)) &&
    (await allowShared("address:paf:charged-day", PAF_CHARGED_DAY, DAY));

  if (typeof body.pick === "string") {
    const udprn = /^paf:(\d{1,12})$/.exec(body.pick)?.[1];
    if (!key || !userId || !udprn) return json("paf", [], {}, 400);
    // Refused or failed, the box searches again with the free lookup.
    if (Date.now() < pafRestUntil || !(await charged())) return NextResponse.json({ fallback: true }, { status: 429 });
    try {
      const lines = await pickPaf(udprn, key);
      return lines ? NextResponse.json({ lines }) : NextResponse.json({ fallback: true }, { status: 404 });
    } catch (err) {
      restIfRefused(err);
      return NextResponse.json({ fallback: true }, { status: 503 });
    }
  }

  const q = typeof body.q === "string" ? body.q.replace(/\s+/g, " ").trim().slice(0, 100) : "";
  if (q.length < 3) return json(key && userId ? "paf" : "osm", []);

  // Where a postcode is, for working out how far a trip was. Free, and the
  // same postcodes.io lookup the address search already makes.
  if (body.where === true) {
    const postcode = normalisePostcode(q);
    if (!postcode) return NextResponse.json({ error: "Not a postcode." }, { status: 400 });
    const { body: found } = await getJson<{ result?: { latitude?: number; longitude?: number } }>(
      `${POSTCODES}/postcodes/${encodeURIComponent(postcode)}`
    );
    const at = found?.result;
    if (!at?.latitude || !at.longitude) return NextResponse.json({ error: "Postcode not found." }, { status: 404 });
    return NextResponse.json({ at: { lat: at.latitude, lon: at.longitude } });
  }
  const wanted = !!key && !!userId && body.free !== true;
  let paf = wanted && Date.now() >= pafRestUntil;
  const cached = (source: AddressSource) => {
    const hit = cache.get(`${source}:${q.toLowerCase()}`);
    return hit && Date.now() - hit.at < CACHE_MS ? hit.result : null;
  };
  const fromPaf = paf ? cached("paf") : null;
  if (fromPaf) return NextResponse.json(fromPaf);
  if (paf) paf = normalisePostcode(q) ? await charged() : await allowShared("address:paf:free", PAF_FREE_TOTAL, FIVE_MINUTES);
  const source: AddressSource = paf ? "paf" : "osm";
  // Someone who'd have had Royal Mail's list is told why this one is free.
  const mark = (r: AddressSearchResult): AddressSearchResult => (wanted && r.source === "osm" ? { ...r, fallback: true } : r);
  const fromOsm = paf ? null : cached("osm");
  if (fromOsm) return NextResponse.json(mark(fromOsm));
  if (!paf && !(await allowShared(userId ? "address:osm:signed-in" : "address:osm:anon", userId ? OSM_SIGNED_IN : OSM_ANON, FIVE_MINUTES))) {
    return json(source, [], { busy: true }, 429);
  }
  try {
    const result = paf ? await searchPaf(q, key!).catch((err) => {
      // Out of credit or down: the free lookup is better than nothing.
      if (!restIfRefused(err)) console.error("address-search: Royal Mail lookup failed,", err instanceof Error ? err.message : err);
      return cached("osm") ?? searchOsm(q);
    }) : await searchOsm(q);
    if (cache.size > 500) cache.clear();
    cache.set(`${result.source}:${q.toLowerCase()}`, { at: Date.now(), result });
    return NextResponse.json(mark(result));
  } catch (err) {
    console.error("address-search:", err instanceof Error ? err.message : err);
    return json(source, [], { busy: true }, 503);
  }
}
