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
  // Each answer remembers what it was for, so Enter can't pick from the
  // list for what was typed a moment ago.
  const [result, setResult] = useState<(AddressSearchResult & { q: string; free?: boolean }) | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // A Royal Mail pick is fetched after the tap: by then the form may have
  // changed or gone, so it goes through the latest callback, if still here.
  const onAddressRef = useRef(onAddress);
  const addressRef = useRef(address);
  const mounted = useRef(true);
  useEffect(() => {
    onAddressRef.current = onAddress;
    addressRef.current = address;
  });
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

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
        setResult({ ...((await res.json()) as AddressSearchResult), q });
        setActive(-1);
      } catch {
        if (!controller.signal.aborted) setResult({ source: "osm", items: [], busy: true, q });
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
    if (fetching) return;
    setFetching(true);
    try {
      const res = await fetch("/api/address-search", { method: "POST", headers: await authHeaders(), body: JSON.stringify({ pick: m.id }) });
      const body = (await res.json().catch(() => ({}))) as { lines?: string[]; fallback?: boolean };
      if (!mounted.current) return;
      if (res.ok && body.lines?.length) {
        onAddressRef.current(mergeAddress(addressRef.current, { ...m, lines: body.lines }));
        setQuery("");
        setResult(null);
        return;
      }
      if (!body.fallback) throw new Error();
      // Royal Mail lookups used up for now: the same search, free.
      const q = query.trim();
      const again = await fetch("/api/address-search", { method: "POST", headers: await authHeaders(), body: JSON.stringify({ q, free: true }) });
      if (!mounted.current) return;
      setResult({ ...((await again.json()) as AddressSearchResult), q, free: true });
      setActive(-1);
      setOpen(true);
    } catch {
      if (mounted.current) setError("Couldn't fetch that address. Pick it again, or type it in below.");
    } finally {
      if (mounted.current) setFetching(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    // What's typed here is never form data: Enter (the iPhone's Search key)
    // picks the highlighted or only match, or shows the list -- it mustn't
    // submit the form around it.
    if (e.key === "Enter") {
      e.preventDefault();
      const current = !searching && result?.q === query.trim();
      if (current && shown && active >= 0 && items[active]) pick(items[active]);
      else if (current && items.length === 1) pick(items[0]);
      else setOpen(true);
      return;
    }
    if (!shown || !items.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (a + 1) % items.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (a <= 0 ? items.length - 1 : a - 1));
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const note = searching
    ? "Searching…"
    : result?.busy
      ? "Address search isn't answering just now. Type the address in below."
      : result?.badPostcode
        ? "We couldn't find that postcode. Check it, or use it as typed if it's new."
        : !items.length
          ? "No matches. Try the postcode, or type the address in below."
          : result?.source === "paf"
            ? "Royal Mail addresses. Pick one to fill it in."
            : `${result?.free ? "Free address search for now. " : ""}Pick one to fill it in. Addresses © OpenStreetMap contributors.`;

  return (
    <div className="relative">
      <div className="relative">
        <svg aria-hidden viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400">
          <circle cx="8.5" cy="8.5" r="5.5" />
          <path strokeLinecap="round" d="M13 13l4 4" />
        </svg>
        <input
          type="search"
          enterKeyHint="search"
          autoComplete="off"
          className="w-full rounded-lg border py-2 pl-9 pr-3 text-base sm:text-sm"
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
            setActive(-1);
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
      </div>
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
      {fetching && <p className="mt-1 text-xs text-neutral-500">Fetching the address…</p>}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
