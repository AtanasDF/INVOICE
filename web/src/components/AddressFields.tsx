"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AddressMatch, AddressSearchResult, joinAddress, normalisePostcode, partsFromLines, splitAddress } from "@/lib/addressLookup";
import { supabase } from "@/lib/supabaseClient";

async function authHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const { data } = await supabase.auth.getSession();
  if (data.session) headers.Authorization = `Bearer ${data.session.access_token}`;
  return headers;
}

const INPUT = "w-full rounded-lg border px-3 py-2 text-base sm:text-sm";

// A UK address in its own fields, with one Find that searches by whatever is
// filled in: a postcode lists the addresses in it, a number and street finds
// matching ones. Picking one fills the fields it knows and leaves the rest
// alone, so nothing typed is ever wiped.
export default function AddressFields({ address, onAddress, label = "Address", streetPlaceholder = "House number and street" }: {
  address: string;
  onAddress: (next: string) => void;
  label?: string;
  streetPlaceholder?: string;
}) {
  const id = useId();
  // The fields hold their own state: reading them back out of one string on
  // every keystroke moved half-typed text between fields ("12" reads as a
  // town until the street is there). Text arriving from outside (a scan, a
  // Companies House pick) is read in when it isn't what we just sent out.
  const [parts, setParts] = useState(() => splitAddress(address));
  const [sent, setSent] = useState(address);
  if (address !== sent) {
    setSent(address);
    setParts(splitAddress(address));
  }
  const [result, setResult] = useState<(AddressSearchResult & { q: string; free?: boolean }) | null>(null);
  const [searching, setSearching] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  const onAddressRef = useRef(onAddress);
  const addressRef = useRef(address);
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

  const query = (parts.postcode.trim() || [parts.line1, parts.town].map((p) => p.trim()).filter(Boolean).join(", ")).trim();
  const items = result?.items ?? [];

  function set(patch: Partial<typeof parts>) {
    const next = { ...parts, ...patch };
    setParts(next);
    const text = joinAddress(next);
    setSent(text);
    onAddress(text);
  }

  // Only what the pick actually carries is written, so a postcode-only pick
  // keeps the house and street already typed.
  function fill(lines: string[]) {
    const found = partsFromLines(lines);
    const next = {
      line1: found.line1 || parts.line1,
      line2: found.line2 || parts.line2,
      town: found.town || parts.town,
      postcode: found.postcode || parts.postcode,
    };
    setParts(next);
    const text = joinAddress(next);
    setSent(text);
    onAddressRef.current(text);
    setResult(null);
    setError(null);
  }

  async function find() {
    if (query.length < 3 || searching) return;
    setSearching(true);
    setError(null);
    try {
      const res = await fetch("/api/address-search", { method: "POST", headers: await authHeaders(), body: JSON.stringify({ q: query }) });
      if (!mounted.current) return;
      setResult({ ...((await res.json()) as AddressSearchResult), q: query });
    } catch {
      if (mounted.current) setResult({ source: "osm", items: [], busy: true, q: query });
    } finally {
      if (mounted.current) setSearching(false);
    }
  }

  async function pick(m: AddressMatch) {
    if (m.lines) {
      fill(m.lines);
      return;
    }
    if (fetching) return;
    setFetching(true);
    try {
      const res = await fetch("/api/address-search", { method: "POST", headers: await authHeaders(), body: JSON.stringify({ pick: m.id }) });
      const body = (await res.json().catch(() => ({}))) as { lines?: string[]; fallback?: boolean };
      if (!mounted.current) return;
      if (res.ok && body.lines?.length) {
        fill(body.lines);
        return;
      }
      if (!body.fallback) throw new Error();
      // Royal Mail lookups used up for now: the same search, free.
      const again = await fetch("/api/address-search", { method: "POST", headers: await authHeaders(), body: JSON.stringify({ q: query, free: true }) });
      if (!mounted.current) return;
      setResult({ ...((await again.json()) as AddressSearchResult), q: query, free: true });
    } catch {
      if (mounted.current) setError("Couldn't fetch that address. Pick it again, or type it in.");
    } finally {
      if (mounted.current) setFetching(false);
    }
  }

  function onEnter(e: React.KeyboardEvent<HTMLInputElement>) {
    // The iPhone's blue key searches instead of submitting the form around it.
    if (e.key !== "Enter") return;
    e.preventDefault();
    find();
  }

  const note = searching
    ? "Searching…"
    : result?.busy
      ? "Address search isn't answering just now. Type the address in yourself."
      : result?.badPostcode
        ? "We couldn't find that postcode. Check it, or keep it as typed if it's new."
        : !items.length
          ? "No matches. Try the postcode on its own, or type the address in yourself."
          : result?.source === "paf"
            ? "Royal Mail addresses. Tap one to fill it in."
            : items.length === 1 && items[0].partial
              ? `No houses are listed for ${normalisePostcode(result?.q ?? "") ?? result?.q} in the free directory. Tap it to fill in the town and postcode, then type your house number and street. Addresses © OpenStreetMap contributors.`
              : `${result?.free ? "Free address search for now. " : ""}Tap one to fill it in. Addresses © OpenStreetMap contributors.`;

  return (
    <div className="space-y-2">
      <span className="text-xs text-neutral-500">{label}</span>
      <input id={`${id}-line1`} className={INPUT} autoComplete="address-line1" placeholder={streetPlaceholder} aria-label={streetPlaceholder} value={parts.line1} onChange={(e) => set({ line1: e.target.value })} onKeyDown={onEnter} />
      <input id={`${id}-line2`} className={INPUT} autoComplete="address-line2" placeholder="Flat, building or area (optional)" aria-label="Flat, building or area" value={parts.line2} onChange={(e) => set({ line2: e.target.value })} onKeyDown={onEnter} />
      <div className="grid grid-cols-2 gap-2">
        <input id={`${id}-town`} className={INPUT} autoComplete="address-level2" placeholder="Town or city" aria-label="Town or city" value={parts.town} onChange={(e) => set({ town: e.target.value })} onKeyDown={onEnter} />
        <input
          id={`${id}-postcode`}
          className={`${INPUT} uppercase`}
          autoComplete="postal-code"
          autoCapitalize="characters"
          spellCheck={false}
          enterKeyHint="search"
          placeholder="Postcode"
          aria-label="Postcode"
          value={parts.postcode}
          onChange={(e) => set({ postcode: e.target.value })}
          onBlur={() => {
            const tidy = normalisePostcode(parts.postcode);
            if (tidy && tidy !== parts.postcode) set({ postcode: tidy });
          }}
          onKeyDown={onEnter}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={find}
          disabled={query.length < 3 || searching || fetching}
          className="rounded-lg border px-3 py-1.5 text-sm font-medium text-neutral-700 disabled:opacity-40"
        >
          {searching ? "Looking…" : "Find address"}
        </button>
        <span className="text-xs text-neutral-500">
          {parts.postcode.trim() ? "Lists the addresses at that postcode." : "Fill in a postcode, or a number and street, and tap Find."}
        </span>
      </div>
      {result && (
        <div className="overflow-hidden rounded-lg border bg-white text-neutral-900">
          {items.length > 0 && (
            <ul role="listbox" aria-label="Addresses found" className="max-h-72 overflow-y-auto">
              {items.map((m) => (
                <li key={m.id} role="option" aria-selected={false}>
                  <button type="button" onClick={() => pick(m)} className="w-full border-b px-3 py-2.5 text-left last:border-b-0 hover:bg-neutral-50">
                    <span className={`block text-sm ${m.partial ? "text-neutral-700" : "font-medium"}`}>{m.label}</span>
                    {m.detail && <span className="block text-xs text-neutral-500">{m.detail}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex items-center justify-between gap-2 border-t bg-neutral-50 px-3 py-1.5">
            <p className="text-[11px] text-neutral-500">{note}</p>
            <button type="button" onClick={() => setResult(null)} className="shrink-0 text-[11px] font-medium text-neutral-600">
              Close
            </button>
          </div>
        </div>
      )}
      {fetching && <p className="text-xs text-neutral-500">Fetching the address…</p>}
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
