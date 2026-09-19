"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AddressMatch, AddressSearchResult, mergeAddress } from "@/lib/addressLookup";
import { supabase } from "@/lib/supabaseClient";

async function authHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const { data } = await supabase.auth.getSession();
  if (data.session) headers.Authorization = `Bearer ${data.session.access_token}`;
  return headers;
}

// A search box that sits above an address field: a UK postcode lists the
// addresses in it, a house number and street finds matching ones, and
// picking one fills the field. Typing straight into the field still works.
export default function AddressFinder({ address, onAddress, labelledBy }: { address: string; onAddress: (next: string) => void; labelledBy?: string }) {
  const listId = useId();
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<AddressSearchResult | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const q = query.trim();
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      if (q.length < 3) {
        setResult(null);
        return;
      }
      setSearching(true);
      try {
        const res = await fetch("/api/address-search", { method: "POST", headers: await authHeaders(), body: JSON.stringify({ q }), signal: controller.signal });
        setResult((await res.json()) as AddressSearchResult);
        setActive(-1);
      } catch {
        if (!controller.signal.aborted) setResult({ source: "osm", items: [], busy: true });
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 350);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const items = result?.items ?? [];
  const shown = open && query.trim().length >= 3 && (searching || result !== null);

  async function pick(m: AddressMatch) {
    setOpen(false);
    setError(null);
    if (m.lines) {
      onAddress(mergeAddress(address, m));
      setQuery("");
      setResult(null);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch("/api/address-search", { method: "POST", headers: await authHeaders(), body: JSON.stringify({ pick: m.id }) });
      const body = (await res.json()) as { lines?: string[] };
      if (!res.ok || !body.lines?.length) throw new Error();
      onAddress(body.lines.join("\n"));
      setQuery("");
      setResult(null);
    } catch {
      setError("Couldn't fetch that address. Try again, or type it in below.");
    } finally {
      setSearching(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!shown || !items.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (a + 1) % items.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (a <= 0 ? items.length - 1 : a - 1));
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      pick(items[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const note = searching
    ? "Searching…"
    : result?.busy
      ? "Address search isn't answering just now. Type the address in below."
      : result?.badPostcode
        ? "That postcode doesn't exist. Check it, or type the address in below."
        : !items.length
          ? "No matches. Try the postcode, or type the address in below."
          : result?.source === "paf"
            ? "Royal Mail addresses. Pick one to fill it in."
            : "Pick one to fill it in. Addresses © OpenStreetMap contributors.";

  return (
    <div className="relative">
      <svg aria-hidden viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-neutral-400">
        <circle cx="8.5" cy="8.5" r="5.5" />
        <path strokeLinecap="round" d="M13 13l4 4" />
      </svg>
      <input
        type="search"
        enterKeyHint="search"
        autoComplete="off"
        className="w-full rounded-lg border py-2 pl-9 pr-3 text-sm"
        placeholder="Find address: postcode, or number and street"
        aria-label={labelledBy ? undefined : "Find a UK address"}
        aria-labelledby={labelledBy}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={shown}
        aria-controls={shown ? listId : undefined}
        aria-activedescendant={shown && active >= 0 ? `${listId}-${active}` : undefined}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setError(null);
        }}
        onFocus={() => {
          if (blurTimer.current) clearTimeout(blurTimer.current);
          setOpen(true);
        }}
        onBlur={() => {
          blurTimer.current = setTimeout(() => setOpen(false), 150);
        }}
        onKeyDown={onKeyDown}
      />
      {shown && (
        // Holding the mouse down anywhere in the list mustn't blur the input
        // and close it.
        <div onMouseDown={(e) => e.preventDefault()} className="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-lg border bg-white text-neutral-900 shadow-lg">
          {items.length > 0 && (
            <ul id={listId} role="listbox" aria-label="Addresses" className="max-h-72 overflow-y-auto">
              {items.map((m, i) => (
                <li
                  key={m.id}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === active}
                  onClick={() => pick(m)}
                  onMouseEnter={() => setActive(i)}
                  className={`cursor-pointer border-b px-3 py-2 last:border-b-0 ${i === active ? "bg-neutral-100" : ""}`}
                >
                  <p className={`text-sm ${m.partial ? "text-neutral-700" : "font-medium"}`}>{m.label}</p>
                  {m.detail && <p className="text-xs text-neutral-500">{m.detail}</p>}
                </li>
              ))}
            </ul>
          )}
          <p className="border-t bg-neutral-50 px-3 py-1.5 text-[11px] text-neutral-500">{note}</p>
        </div>
      )}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
