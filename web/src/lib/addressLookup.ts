// UK address lookup: shared by the /api/address-search route and the
// AddressFinder box. An address is its lines, top to bottom, as they go in
// an address field.

export type AddressMatch = {
  id: string;
  label: string;
  detail: string;
  // The whole address. Absent on a Royal Mail suggestion, which is fetched
  // by id when picked (that fetch is the one that's charged for).
  lines?: string[];
  // Only a postcode's town and postcode: it goes in under the house and
  // street already typed instead of replacing them.
  partial?: boolean;
};

export type AddressSource = "paf" | "osm";

export type AddressSearchResult = { source: AddressSource; items: AddressMatch[]; badPostcode?: boolean; busy?: boolean };

// When a postcode isn't in the lists (a new build can take months to
// appear, or it's mistyped), it can still go in as typed.
export function postcodeAsTyped(postcode: string): AddressMatch {
  return { id: `pc:${postcode}`, label: `Use ${postcode} as typed`, detail: "If it's new it may not be listed yet; add the town yourself", lines: [postcode], partial: true };
}

const POSTCODE = /^([A-Z]{1,2}\d[A-Z\d]?) ?(\d[A-Z]{2})$/;

// "sw1a2aa" -> "SW1A 2AA"; anything that isn't a whole UK postcode -> null.
export function normalisePostcode(value: string): string | null {
  const m = POSTCODE.exec(value.toUpperCase().replace(/\s+/g, " ").trim());
  return m ? `${m[1]} ${m[2]}` : null;
}

// A postcode at the end of an address part ("Leeds LS1 4AP", "LS1 4AP").
const ENDS_WITH_POSTCODE = /(^|\s)[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}$/;
const SMALL_WORDS = new Set(["upon", "on", "in", "by", "super", "under", "le", "la", "de", "the", "cum", "next", "and", "of", "en"]);

// Royal Mail writes post towns in capitals; an invoice reads better with
// "Newcastle upon Tyne", "Stoke-on-Trent", "Bishop's Stortford".
export function townCase(value: string): string {
  if (value !== value.toUpperCase()) return value;
  let first = true;
  return value.toLowerCase().replace(/[a-z][a-z']*/g, (word) => {
    const keep = !first && SMALL_WORDS.has(word);
    first = false;
    return keep ? word : word[0].toUpperCase() + word.slice(1);
  });
}

// A postcode-only pick keeps the house and street already typed, as they
// were typed, and replaces the old postcode, anything after it, and the old
// town: the words with the postcode ("Leeds LS1 4AP"), or the part or line
// just before a postcode standing alone, when it has no digits and isn't
// all that's left (so "12 High Street, LS1 4AP" and "Rose Cottage, LS1 4AP"
// keep their first line). Scans store an address on one line with commas,
// so the postcode's line is taken apart by commas. With no old postcode to
// go by, nothing typed is dropped.
export function mergeAddress(existing: string, match: AddressMatch): string {
  const lines = match.lines ?? [];
  if (!match.partial) return lines.join("\n");
  const all = existing
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const partsOf = (l: string) => l.split(",").map((p) => p.trim()).filter(Boolean);
  const bare = (p: string) => p.replace(/[.;]+$/, "").toUpperCase();
  const isPostcode = (p: string) => ENDS_WITH_POSTCODE.test(bare(p));
  const noDigits = (p: string) => !/\d/.test(p);
  let kept = all;
  const at = all.findLastIndex((l) => partsOf(l).some(isPostcode));
  if (at >= 0) {
    const parts = partsOf(all[at]);
    const pc = parts.findLastIndex(isPostcode);
    const rest = parts.slice(0, pc);
    let before = all.slice(0, at);
    const townWithPostcode = bare(parts[pc]).replace(ENDS_WITH_POSTCODE, "").trim() !== "";
    if (!townWithPostcode) {
      if (rest.length) {
        if (noDigits(rest[rest.length - 1]) && (rest.length > 1 || before.length)) rest.pop();
      } else if (before.length > 1 && noDigits(before[before.length - 1])) {
        before = before.slice(0, -1);
      }
    }
    kept = rest.length ? [...before, rest.join(", ")] : before;
  }
  const incoming = new Set(lines.map((l) => l.toLowerCase()));
  return [...kept.filter((l) => !incoming.has(l.toLowerCase())), ...lines].join("\n");
}

export type AddressParts = { line1: string; line2: string; town: string; postcode: string };

const POSTCODE_LINE = /^[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}$/i;

// An address as the fields show it. Stored text is one part per line, but
// older records (and scans) put it all on one line with commas, so both read
// back the same way.
export function splitAddress(text: string): AddressParts {
  const rows = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const parts = (rows.length === 1 ? rows[0].split(",") : rows).map((l) => l.trim()).filter(Boolean);
  const empty = { line1: "", line2: "", town: "", postcode: "" };
  if (!parts.length) return empty;
  let postcode = "";
  const last = parts[parts.length - 1];
  if (POSTCODE_LINE.test(last)) {
    postcode = normalisePostcode(last) ?? last.toUpperCase();
    parts.pop();
  } else if (ENDS_WITH_POSTCODE.test(last.toUpperCase())) {
    // "Bristol BS1 4DJ" on one line: the town keeps the rest of it.
    const at = last.toUpperCase().search(ENDS_WITH_POSTCODE);
    postcode = normalisePostcode(last.slice(at)) ?? last.slice(at).trim().toUpperCase();
    parts[parts.length - 1] = last.slice(0, at).trim();
    if (!parts[parts.length - 1]) parts.pop();
  }
  if (!parts.length) return { ...empty, postcode };
  // One part on its own is a town ("London") unless it has a number in it,
  // which makes it a street ("12 Mill Lane").
  if (parts.length === 1) return /\d/.test(parts[0]) ? { ...empty, line1: parts[0], postcode } : { ...empty, town: parts[0], postcode };
  const town = parts.pop()!;
  return { line1: parts[0] ?? "", line2: parts.slice(1).join(", "), town, postcode };
}

export function joinAddress(p: AddressParts): string {
  return [p.line1, p.line2, p.town, p.postcode].map((l) => l.trim()).filter(Boolean).join("\n");
}

// A picked address's lines as fields: the postcode last, the town before it.
export function partsFromLines(lines: string[]): AddressParts {
  return splitAddress(lines.join("\n"));
}

export type PafAddress = {
  line_1?: string;
  line_2?: string;
  line_3?: string;
  post_town?: string;
  postcode?: string;
  udprn?: number;
};

export function pafLines(a: PafAddress): string[] {
  return [a.line_1, a.line_2, a.line_3, a.post_town ? townCase(a.post_town) : "", a.postcode].map((l) => (l ?? "").trim()).filter(Boolean);
}

export type OsmProperties = {
  osm_key?: string;
  osm_value?: string;
  type?: string;
  name?: string;
  housenumber?: string;
  street?: string;
  city?: string;
  locality?: string;
  district?: string;
  county?: string;
  postcode?: string;
  countrycode?: string;
};

// Only places people have addresses at: houses and buildings, shops,
// offices, workshops -- not the statues, bus stops and paths OpenStreetMap
// also puts a postcode on.
const OSM_KINDS = new Set(["building", "place", "shop", "office", "craft", "amenity", "healthcare", "industrial", "man_made", "club"]);

// Every London postal district's post town is London, whatever borough the
// open data names.
const LONDON = /^(EC|WC|E|N|NW|SE|SW|W)\d/;
// Council areas OpenStreetMap and the ONS data sometimes give for the town.
const council = (name: string) => /(shire|\bDistrict|\bBorough|\bCouncil)$/i.test(name) || /^(City of |County |Royal Borough )/i.test(name);

// The town for an address line from what the open data has: London by
// postcode, else the built-up area postcodes.io gives ("Leeds (Leeds)" ->
// "Leeds"), else what the neighbours in OpenStreetMap say, else the
// council ("City of Edinburgh" -> "Edinburgh").
export function postcodeTown(postcode: string, builtUpArea: string | null | undefined, neighbours: string[], district: string | null | undefined): string {
  if (LONDON.test(postcode)) return "London";
  const bua = builtUpArea?.replace(/\s*\(.*\)\s*$/, "").trim();
  if (bua) return bua;
  const counts = new Map<string, number>();
  for (const n of neighbours) if (n && !council(n)) counts.set(n, (counts.get(n) ?? 0) + 1);
  const common = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
  return common ?? (district ?? "").replace(/^(City of |Royal Borough of )/i, "").replace(/ (District|Borough)$/i, "").trim();
}

// OpenStreetMap sometimes puts the council ("Huntingdonshire") where the
// town goes and the town ("St Ives") under district.
function osmTown(p: OsmProperties): string {
  const city = p.city?.trim() ?? "";
  if (city && !council(city)) return city;
  return (p.district || p.locality || city || p.county || "").trim();
}

// A street is offered as the house number typed (if any) and the street
// and town, without a postcode: OpenStreetMap's is for one stretch of it.
export function osmMatch(p: OsmProperties, id: string, { town: townOverride, houseNumber }: { town?: string; houseNumber?: string } = {}): AddressMatch | null {
  if (p.countrycode && p.countrycode.toUpperCase() !== "GB") return null;
  const street = p.street?.trim();
  const number = p.housenumber?.trim();
  const isStreet = p.osm_key === "highway" && p.type === "street";
  if (!isStreet && !OSM_KINDS.has(p.osm_key ?? "")) return null;
  const postcode = p.postcode ? normalisePostcode(p.postcode) : null;
  const town = townOverride || (postcode && LONDON.test(postcode) ? "London" : osmTown(p));
  if (isStreet) {
    const name = (p.name || street || "").trim();
    if (!name || !town) return null;
    const first = houseNumber ? `${houseNumber} ${name}` : name;
    const area = postcode?.split(" ")[0];
    return { id, label: first, detail: `${town}${area ? ` ${area}` : ""} · add the postcode`, lines: [first, town] };
  }
  const first = number && street ? `${number} ${street}` : number ? "" : street ?? "";
  if (!number && !p.name) return null;
  const name = p.name && p.name !== first ? p.name.trim() : "";
  const lines = [name, first, town, postcode ?? ""].filter(Boolean);
  if (lines.length < 2) return null;
  return { id, label: [name, first].filter(Boolean).join(", "), detail: [town, postcode].filter(Boolean).join(" "), lines };
}
