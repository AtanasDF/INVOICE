import { NextResponse } from "next/server";
import {
  AddressMatch,
  AddressSearchResult,
  AddressSource,
  OsmProperties,
  PafAddress,
  normalisePostcode,
  osmMatch,
  postcodeTown,
  pafLines,
  townCase,
} from "@/lib/addressLookup";
import { addressKey, allow, allowShared } from "@/lib/rateLimit";
import { isSignedIn } from "@/lib/serverAuth";

export const runtime = "nodejs";

const FIVE_MINUTES = 5 * 60 * 1000;
const PER_ADDRESS = 60;
// photon.komoot.io is a free public server that asks for moderate use, so
// every visitor together stays under OSM_TOTAL a five minutes.
const OSM_TOTAL = 300;
// Royal Mail lookups cost a credit each (a postcode's list, or a picked
// address); searching as you type is free.
const PAF_TOTAL = 150;
const CACHE_MS = 10 * 60 * 1000;
const cache = new Map<string, { at: number; result: AddressSearchResult }>();
const UA = { "User-Agent": "Invoicer (https://invoiceover.com)" };
const PAF = "https://api.ideal-postcodes.co.uk/v1";
// Houses around a postcode's centre, for the free lookup: a postcode is a
// street or two, so this reaches all of it in towns and most in villages.
const REVERSE_RADIUS_KM = 0.3;

type Photon = { features?: { properties?: OsmProperties }[] };

const json = (source: AddressSource, items: AddressMatch[], extra: Partial<AddressSearchResult> = {}, status = 200) =>
  NextResponse.json({ source, items, ...extra }, { status });

async function getJson<T>(url: string): Promise<{ status: number; body: T | null }> {
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(5000), cache: "no-store" });
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

// Free: postcodes.io to check a postcode and find where it is, and
// OpenStreetMap (through Photon) for the houses and streets.
async function searchOsm(q: string): Promise<AddressSearchResult> {
  const postcode = normalisePostcode(q);
  if (!postcode) {
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&countrycode=GB&layer=house&layer=street&limit=8&lang=en`;
    const { body } = await getJson<Photon>(url);
    const items = unique((body?.features ?? []).map((f, i) => osmMatch(f.properties ?? {}, `osm:${i}`)));
    return { source: "osm", items: items.slice(0, 6) };
  }
  const where = await getJson<{ result?: { latitude?: number; longitude?: number; admin_district?: string; bua?: string | null } }>(
    `https://api.postcodes.io/postcodes/${encodeURIComponent(postcode)}`
  );
  if (where.status === 404) return { source: "osm", items: [], badPostcode: true };
  const at = where.body?.result;
  if (!at?.latitude || !at.longitude) return { source: "osm", items: [] };
  const { body } = await getJson<Photon>(
    `https://photon.komoot.io/reverse?lat=${at.latitude}&lon=${at.longitude}&radius=${REVERSE_RADIUS_KM}&limit=50&lang=en`
  );
  const props = (body?.features ?? []).map((f) => f.properties ?? {});
  const town = townCase(postcodeTown(postcode, at.bua, props.map((p) => p.city ?? ""), at.admin_district));
  const here = props.filter((p) => p.postcode && normalisePostcode(p.postcode) === postcode);
  const houses = unique(here.map((p, i) => osmMatch(p, `osm:${i}`, town))).filter((m) => !m.partial).sort(byStreetAndNumber);
  const lines = [town, postcode].filter(Boolean);
  const justPostcode: AddressMatch = {
    id: `pc:${postcode}`,
    label: houses.length ? "Not listed? Use just the postcode" : `${postcode}${town ? `, ${town}` : ""}`,
    detail: "Fills in the town and postcode; add the house and street yourself",
    lines,
    partial: true,
  };
  return { source: "osm", items: [...houses.slice(0, 40), justPostcode] };
}

// Royal Mail's address file through Ideal Postcodes: every address in a
// postcode, and suggestions as you type that are fetched in full on a pick.
async function searchPaf(q: string, key: string): Promise<AddressSearchResult> {
  const postcode = normalisePostcode(q);
  if (postcode) {
    const { status, body } = await getJson<{ code?: number; result?: (PafAddress & { udprn?: number })[] }>(
      `${PAF}/postcodes/${encodeURIComponent(postcode.replace(" ", ""))}?api_key=${encodeURIComponent(key)}`
    );
    if (status === 404 || body?.code === 4040) return { source: "paf", items: [], badPostcode: true };
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
  const body = (await req.json().catch(() => ({}))) as { q?: unknown; pick?: unknown };
  const key = process.env.IDEAL_POSTCODES_API_KEY;
  const paf = !!key && (await isSignedIn(req.headers.get("authorization")));
  const source: AddressSource = paf ? "paf" : "osm";
  if (!allow(`address:ip:${addressKey(req.headers.get("x-forwarded-for"))}`, PER_ADDRESS, FIVE_MINUTES)) {
    return json(source, [], { busy: true }, 429);
  }

  if (typeof body.pick === "string") {
    const udprn = /^paf:(\d{1,12})$/.exec(body.pick)?.[1];
    if (!paf || !udprn) return json(source, [], {}, 400);
    if (!(await allowShared("address:paf", PAF_TOTAL, FIVE_MINUTES))) return json(source, [], { busy: true }, 429);
    try {
      const lines = await pickPaf(udprn, key!);
      return lines ? NextResponse.json({ lines }) : json(source, [], {}, 404);
    } catch {
      return json(source, [], { busy: true }, 503);
    }
  }

  const q = typeof body.q === "string" ? body.q.replace(/\s+/g, " ").trim().slice(0, 100) : "";
  if (q.length < 3) return json(source, []);
  const cacheKey = `${source}:${q.toLowerCase()}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_MS) return NextResponse.json(hit.result);
  if (!(await allowShared(`address:${source}`, paf ? PAF_TOTAL : OSM_TOTAL, FIVE_MINUTES))) {
    return json(source, [], { busy: true }, 429);
  }
  try {
    const result = paf ? await searchPaf(q, key!) : await searchOsm(q);
    if (cache.size > 500) cache.clear();
    cache.set(cacheKey, { at: Date.now(), result });
    return NextResponse.json(result);
  } catch (err) {
    console.error("address-search:", err instanceof Error ? err.message : err);
    return json(source, [], { busy: true }, 503);
  }
}
