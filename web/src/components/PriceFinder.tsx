"use client";

import { useState } from "react";
import { money } from "@/lib/money";
import { PriceKind, priceKindOf, searchPlaces, webSearch } from "@/lib/priceSearch";
import type { PriceGuide } from "@/lib/priceGuide";
import { supabase } from "@/lib/supabaseClient";
import { errorText } from "@/lib/errorText";

const SECONDARY = "rounded-lg border px-3 py-1.5 text-sm font-medium text-neutral-700 disabled:opacity-50";


// "Find it cheaper" for one line of a quote: the searches a trade would run,
// aimed at what the line says, plus a guide to what it usually costs so a
// price can be judged before anyone opens a shop. No live prices are read
// here -- the searches open in the browser.
export default function PriceFinder({ description, quantity, unit, priced, onClose }: {
  description: string;
  quantity?: number | null;
  unit?: string | null;
  // What a supplier has quoted per unit, ex VAT, when there is one.
  priced?: number | null;
  onClose: () => void;
}) {
  const [kind, setKind] = useState<PriceKind>(() => priceKindOf(description, unit ?? ""));
  const [want, setWant] = useState("");
  const [guide, setGuide] = useState<PriceGuide | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const places = searchPlaces(description, kind, want);

  async function ask() {
    setLoading(true);
    setError(null);
    try {
      const { data } = await supabase.auth.getSession();
      const res = await fetch("/api/price-guide", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {}) },
        body: JSON.stringify({ description, quantity, unit, kind, want, priced }),
      });
      const body = (await res.json().catch(() => ({}))) as { guide?: PriceGuide; error?: string };
      if (!res.ok || !body.guide) throw new Error(body.error || "Couldn't work out a price guide.");
      setGuide(body.guide);
    } catch (err) {
      setError(errorText(err, "Couldn't work out a price guide."));
    } finally {
      setLoading(false);
    }
  }

  const over = guide?.high != null && priced != null && priced > guide.high;
  const under = guide?.low != null && priced != null && priced < guide.low;

  return (
    <div className="space-y-3 rounded-lg border bg-neutral-50 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium">Find it cheaper</p>
          <p className="truncate text-xs text-neutral-500">{description}</p>
        </div>
        <button type="button" onClick={onClose} className="shrink-0 text-xs font-medium text-neutral-600">
          Close
        </button>
      </div>

      <div role="radiogroup" aria-label="A product or work" className="grid grid-cols-2 gap-1 rounded-lg bg-neutral-200/60 p-1">
        {(["product", "job"] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={kind === k}
            onClick={() => {
              setKind(k);
              setGuide(null);
            }}
            className={`rounded-md py-1.5 text-sm font-medium ${kind === k ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-600"}`}
          >
            {k === "product" ? "Something to buy" : "Work being done"}
          </button>
        ))}
      </div>

      <div>
        <label className="text-xs text-neutral-500" htmlFor="price-want">
          Anything specific? (a brand, a size, near you)
        </label>
        <input
          id="price-want"
          className="mt-1 w-full rounded-lg border px-3 py-2 text-base sm:text-sm"
          placeholder={kind === "job" ? "e.g. Bristol, two coats" : "e.g. Gyproc, 2400x1200, 50+"}
          value={want}
          onChange={(e) => setWant(e.target.value)}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {places.map((p) => (
          <a key={p.name} href={p.url} target="_blank" rel="noreferrer noopener" className={SECONDARY}>
            {p.name}
          </a>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={ask} disabled={loading} className="rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
          {loading ? "Working it out…" : guide ? "Ask again" : "What should this cost?"}
        </button>
        <span className="text-xs text-neutral-500">A guide from what things usually cost, not a live price.</span>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      {guide && (
        <div className="space-y-2 rounded-lg border bg-white p-3 text-sm">
          <p className="font-medium">{guide.what}</p>
          {guide.low != null || guide.high != null ? (
            <p className="text-neutral-700">
              Usually {guide.low != null && guide.high != null ? `${money(guide.low)} – ${money(guide.high)}` : money((guide.low ?? guide.high)!)}
              {guide.per ? (guide.kind === "job" && /^(each|job|unit)$/i.test(guide.per) ? " for the job" : ` per ${guide.per}`) : ""} ex VAT.
              {priced != null && (
                <span className={over ? " font-medium text-amber-700" : under ? " font-medium text-neutral-700" : " text-neutral-500"}>
                  {" "}
                  Quoted {money(priced)}
                  {over ? " — above the usual range." : under ? " — below the usual range." : " — in the usual range."}
                </span>
              )}
            </p>
          ) : (
            <p className="text-neutral-600">No usual price to give for this one — the searches above are the way to check it.</p>
          )}
          {guide.notes && <p className="text-neutral-600">{guide.notes}</p>}
          {guide.cheaper.length > 0 && (
            <div>
              <p className="text-xs font-medium text-neutral-500">Cheaper and does the same job</p>
              <ul className="mt-1 space-y-1">
                {guide.cheaper.map((c, i) => (
                  <li key={i} className="flex flex-wrap items-baseline gap-x-2">
                    <a href={webSearch(`${c.what} price UK`)} target="_blank" rel="noreferrer noopener" className="font-medium text-blue-600">
                      {c.what}
                    </a>
                    <span className="text-xs text-neutral-600">{c.why}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {guide.search.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {guide.search.map((s) => (
                <a key={s} href={webSearch(s)} target="_blank" rel="noreferrer noopener" className="rounded-full border bg-white px-3 py-1 text-xs font-medium text-neutral-700">
                  {s}
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
