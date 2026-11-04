"use client";

import { useEffect, useMemo, useState } from "react";
import { invoicesStore, quotesStore } from "@/lib/storage";
import { buildPriceList, learnPrices, type LearnedPrice, type PriceEdit } from "@/lib/priceList";
import { priceListStore } from "@/lib/priceListStore";

// The price list for a form: what the invoices and quotes say, with his
// changes on top. A form must never fail to open because the price list
// did, so every failure here is an empty list, never an error.
export function usePriceList() {
  const [learned, setLearned] = useState<LearnedPrice[]>([]);
  const [edits, setEdits] = useState<PriceEdit[]>([]);
  useEffect(() => {
    let live = true;
    Promise.all([invoicesStore.all().catch(() => []), quotesStore.all().catch(() => []), priceListStore.get().catch(() => ({ edits: [] }))]).then(
      ([inv, quotes, saved]) => {
        if (!live) return;
        setLearned(learnPrices(inv, quotes));
        setEdits(saved.edits);
      }
    );
    return () => {
      live = false;
    };
  }, []);
  return useMemo(() => buildPriceList(learned, edits), [learned, edits]);
}
