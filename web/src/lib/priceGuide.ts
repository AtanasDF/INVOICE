import { extractStructured, type ScanEngine } from "@/lib/extractors";
import { money } from "@/lib/money";
import type { PriceKind } from "@/lib/priceSearch";

// What something usually costs in the UK, as a guide before looking. The
// model has no live prices, so this is a range to judge a quote against and
// a list of what to search for instead -- never presented as a real offer.

export type PriceGuide = {
  kind: PriceKind;
  what: string;
  low: number | null;
  high: number | null;
  per: string | null;
  vat: "ex" | "inc" | null;
  notes: string | null;
  cheaper: { what: string; why: string }[];
  search: string[];
};

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    what: { type: "string", description: "The item or work, in a few words, as a buyer would search for it." },
    low: { type: ["number", "null"], description: "Usual lowest UK price per unit, ex VAT, or null if it can't be said." },
    high: { type: ["number", "null"], description: "Usual highest UK price per unit, ex VAT, or null." },
    per: { type: ["string", "null"], description: "What the price is per: 'sheet', 'each', 'm²', 'day', 'hour'." },
    notes: { type: ["string", "null"], description: "One line on what moves the price (quality, brand, quantity, region). Null if nothing useful." },
    cheaper: {
      type: "array",
      description: "Up to 3 alternatives that do the same job for less, each with a short reason. Empty when there's no honest alternative.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: { what: { type: "string" }, why: { type: "string" } },
        required: ["what", "why"],
      },
    },
    search: {
      type: "array",
      description: "Up to 3 search phrases that would find it cheaper, each a plain phrase with no site names.",
      items: { type: "string" },
    },
  },
  required: ["what", "low", "high", "per", "notes", "cheaper", "search"],
};

const PROMPT =
  "You price building and trade work in the UK. Give the usual price range for what is described, EXCLUDING VAT, as a guide " +
  "for someone checking a supplier's quote. Prices are in pounds. Use the quantity only to judge whether trade discount applies; " +
  "the range is per unit. If it's work rather than a product, price it the way that trade is normally priced (a day rate, per m², " +
  "per point) and say so in `per`. Name genuinely cheaper alternatives only where they really do the same job (own-brand, a smaller " +
  "pack size, a different material) -- never suggest something unsafe or not to standard, and say why each is cheaper. Leave low and " +
  "high null rather than guessing at something you don't know. You have no live prices, so never name a shop's current price.\n\n";

export async function priceGuide(
  input: { description: string; quantity?: number | null; unit?: string | null; kind: PriceKind; want?: string | null; priced?: number | null },
  engine: ScanEngine = "gemini"
): Promise<PriceGuide> {
  const said = [
    `Item: ${input.description}`,
    input.quantity ? `Quantity: ${input.quantity}${input.unit ? ` ${input.unit}` : ""}` : "",
    input.priced ? `A supplier has quoted ${money(input.priced)} per unit, ex VAT.` : "",
    input.want ? `What's wanted: ${input.want}` : "",
    `This is ${input.kind === "job" ? "work being done" : "a product being bought"}.`,
  ]
    .filter(Boolean)
    .join("\n");
  const out = await extractStructured<Omit<PriceGuide, "kind">>({
    engine,
    name: "record_price_guide",
    description: "Records the usual UK price range for an item or a piece of work, and cheaper alternatives.",
    schema: SCHEMA,
    prompt: PROMPT + said,
    pages: [],
    maxTokens: 2000,
    effort: "low",
  });
  return {
    kind: input.kind,
    what: out.what || input.description,
    low: typeof out.low === "number" && out.low >= 0 ? out.low : null,
    high: typeof out.high === "number" && out.high >= 0 ? out.high : null,
    per: out.per || null,
    vat: "ex",
    notes: out.notes || null,
    cheaper: (out.cheaper ?? []).filter((c) => c.what?.trim()).slice(0, 3),
    search: (out.search ?? []).filter((s) => s?.trim()).slice(0, 3),
  };
}
