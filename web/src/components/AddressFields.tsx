"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AddressMatch, AddressParts, AddressSearchResult, joinAddress, looksLikeStreet, normalisePostcode, partsFromLines, splitAddress } from "@/lib/addressLookup";
import { supabase } from "@/lib/supabaseClient";

async function authHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const { data } = await supabase.auth.getSession();
  if (data.session) headers.Authorization = `Bearer ${data.session.access_token}`;
  return headers;
}

const INPUT = "w-full rounded-lg border px-3 py-2 text-base sm:text-sm";
// A postcode is searched tidied, so "se18 1hu" typed and tidied on leaving
// the box is one search, not two.
const queryOf = (p: AddressParts) => (normalisePostcode(p.postcode) ?? p.postcode.trim()) || [p.line1, p.town].map((s) => s.trim()).filter(Boolean).join(", ");
// Atanas, 2026-09-22: a postcode should list its addresses, and an address
// give its postcode, without anyone having to find a button. A whole
// postcode searches by itself after a short pause or on leaving the box; a
// number and street after a slightly longer one. Find stays for a retry.
const POSTCODE_PAUSE_MS = 700;
const STREET_PAUSE_MS = 900;
const autoReady = (p: AddressParts) => (p.postcode.trim() ? !!normalisePostcode(p.postcode) : looksLikeStreet(p.line1));

// A UK address in its own fields, searched by whatever is filled in: a
// postcode lists the addresses in it, a number and street finds matching
// ones with their postcode. Picking one fills the fields it knows and leaves
// the rest alone, so nothing typed is ever wiped.
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
  // The query the fields are settled on: the last searched, picked or
  // loaded one. Typing searches only a query that isn't, so a record opened
  // for a one-line change doesn't pop up its postcode's list.
  const [settled, setSettled] = useState(() => queryOf(splitAddress(address)));
  if (address !== sent) {
    setSent(address);
    setParts(splitAddress(address));
    setSettled(queryOf(splitAddress(address)));
  }
  const [result, setResult] = useState<(AddressSearchResult & { q: string; free?: boolean }) | null>(null);
  const [searching, setSearching] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The query whose answer the list is waiting for: a slower, older answer
  // is dropped.
  const asked = useRef<string | null>(null);
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
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const query = queryOf(parts);
  const items = result?.items ?? [];

  // Only typing searches by itself: a pick, a scan or a saved record filling
  // the fields never opens the list.
  function set(patch: Partial<typeof parts>) {
    const next = { ...parts, ...patch };
    setParts(next);
    const text = joinAddress(next);
    setSent(text);
    onAddress(text);
    if (timer.current) clearTimeout(timer.current);
    const q = queryOf(next);
    if (q === settled) return;
    if (autoReady(next)) timer.current = setTimeout(() => void find(q), next.postcode.trim() ? POSTCODE_PAUSE_MS : STREET_PAUSE_MS);
    // Not searchable yet (half a postcode, say): typing it whole again
    // searches again.
    else if (settled) setSettled("");
  }

  // Only what the pick actually carries is written, so a postcode-only pick
  // keeps the house and street already typed. A street picked near a
  // postcode keeps the house number typed, or the whole line if it already
  // names that street.
  function fill(lines: string[], street = false) {
    const found = partsFromLines(lines);
    const typed = parts.line1.trim();
    const number = /^(\d+[a-z]?(?:-\d+[a-z]?)?)\b/i.exec(typed)?.[1];
    const line1 = !street || !typed ? found.line1 || parts.line1 : typed.toLowerCase().includes(found.line1.toLowerCase()) ? typed : number ? `${number} ${found.line1}` : found.line1;
    const next = {
      line1,
      line2: found.line2 || parts.line2,
      town: found.town || parts.town,
      postcode: found.postcode || parts.postcode,
    };
    setParts(next);
    setSettled(queryOf(next));
    const text = joinAddress(next);
    setSent(text);
    onAddressRef.current(text);
    setResult(null);
    setError(null);
  }

  async function find(q = query) {
    if (q.length < 3) return;
    if (timer.current) clearTimeout(timer.current);
    setSettled(q);
    asked.current = q;
    setSearching(true);
    setError(null);
    try {
      const res = await fetch("/api/address-search", { method: "POST", headers: await authHeaders(), body: JSON.stringify({ q }) });
      const body = (await res.json()) as AddressSearchResult;
      if (!mounted.current || asked.current !== q) return;
      setResult({ ...body, q });
    } catch {
      if (mounted.current && asked.current === q) setResult({ source: "osm", items: [], busy: true, q });
    } finally {
      if (mounted.current && asked.current === q) setSearching(false);
    }
  }

  async function pick(m: AddressMatch) {
    if (m.lines) {
      fill(m.lines, m.street);
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

  const typedPostcode = normalisePostcode(result?.q ?? "") ?? result?.q;
  const lead = result?.fallback || result?.free ? "Royal Mail's list isn't available just now, so this is the free one. " : "";
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
            : result?.noHouses && items.some((m) => m.street)
              ? `${lead}No houses are listed for ${typedPostcode} in the free directory. Pick your street, then add your house number. Addresses © OpenStreetMap contributors.`
              : items.length === 1 && items[0].partial
                ? `${lead}No houses are listed for ${typedPostcode} in the free directory. Tap it to fill in the town and postcode, then type your house number and street. Addresses © OpenStreetMap contributors.`
                : `${lead}Tap one to fill it in. Addresses © OpenStreetMap contributors.`;

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
            if (!tidy) return;
            if (tidy !== parts.postcode) set({ postcode: tidy });
            if (tidy !== settled) void find(tidy);
          }}
          onKeyDown={onEnter}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void find()}
          disabled={query.length < 3 || searching || fetching}
          className="rounded-lg border px-3 py-1.5 text-sm font-medium text-neutral-700 disabled:opacity-40"
        >
          {searching ? "Looking…" : "Find address"}
        </button>
        <span className="text-xs text-neutral-500">
          {parts.postcode.trim() ? "Lists the addresses at that postcode." : "A postcode lists its addresses; a number and street finds its postcode."}
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
            <p className="text-xs text-neutral-600">{note}</p>
            <button type="button" onClick={() => setResult(null)} className="shrink-0 text-xs font-medium text-neutral-700">
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
