// Searching for a better price on something on a quote. The app can't buy
// anything or read live prices, so it prepares the searches: the same words
// the line already has, aimed at the places a UK trade actually buys from,
// opened in the browser. A job line searches for people who do that work.

export type PriceKind = "product" | "job";

export type SearchPlace = { name: string; url: string };

const MERCHANTS: { name: string; url: (q: string) => string }[] = [
  { name: "Screwfix", url: (q) => `https://www.screwfix.com/search?search=${q}` },
  { name: "Toolstation", url: (q) => `https://www.toolstation.com/search?q=${q}` },
  { name: "Travis Perkins", url: (q) => `https://www.travisperkins.co.uk/search?q=${q}` },
  { name: "Jewson", url: (q) => `https://www.jewson.co.uk/search?q=${q}` },
  { name: "Wickes", url: (q) => `https://www.wickes.co.uk/search?text=${q}` },
  { name: "B&Q", url: (q) => `https://www.diy.com/search?term=${q}` },
];

const TRADES: { name: string; url: (q: string) => string }[] = [
  { name: "Checkatrade", url: (q) => `https://www.checkatrade.com/search?what=${q}` },
  { name: "MyBuilder", url: (q) => `https://www.mybuilder.com/search?q=${q}` },
  { name: "Rated People", url: (q) => `https://www.ratedpeople.com/search?q=${q}` },
];

// Words that describe the thing, without the quantity noise a line carries.
export function searchWords(description: string, extra = ""): string {
  const words = `${description} ${extra}`
    .replace(/[^\p{L}\p{N}\s.&+-]/gu, " ")
    .replace(/\b(?:each|per|pack|box|no|nr|qty|x)\b/gi, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 12);
  return words.join(" ");
}

export function shoppingSearch(words: string): string {
  return `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(words)}`;
}

export function webSearch(words: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(words)}`;
}

// Where to look, in the order a trade would: a price comparison first, then
// the merchants (or the trade sites for a job).
export function searchPlaces(description: string, kind: PriceKind, extra = "", near = ""): SearchPlace[] {
  const words = searchWords(description, extra);
  const q = encodeURIComponent(words);
  if (kind === "job") {
    const withPlace = searchWords(description, `${extra} ${near}`);
    return [
      { name: "Search the web", url: webSearch(`${withPlace} price cost UK`) },
      ...TRADES.map((t) => ({ name: t.name, url: t.url(encodeURIComponent(searchWords(description, extra))) })),
    ];
  }
  return [{ name: "Compare prices", url: shoppingSearch(words) }, ...MERCHANTS.map((m) => ({ name: m.name, url: m.url(q) }))];
}

// A line reads as a job when it's about doing work rather than buying a
// thing: no unit that counts items, and words like "fit", "labour", "day".
const JOB_WORDS = /\b(labour|labor|fit|fitting|install|installation|day rate|days?|hours?|supply and fit|remove|removal|repair|service|clean|skim|plaster|paint|decorat|render|screed|lay|dig|hire)\b/i;

export function priceKindOf(description: string, unit = ""): PriceKind {
  if (/\b(each|sheet|bag|box|pack|roll|length|metre|meter|m2|m²|litre|kg|tonne|tub|tin|pair|set)\b/i.test(unit)) return "product";
  return JOB_WORDS.test(description) ? "job" : "product";
}
