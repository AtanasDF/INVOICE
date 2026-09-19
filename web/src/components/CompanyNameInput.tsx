"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { CompanyMatch } from "@/lib/companyLookup";
import { supabase } from "@/lib/supabaseClient";

// Until the server has a Companies House key the box is a plain input. One
// check per page load says whether lookup is on; a failed check is retried
// on the next mount rather than switching lookup off for the visit.
let status: Promise<boolean> | null = null;

export function useCompanyLookup(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let live = true;
    status ??= fetch("/api/company-search")
      .then((r) => r.json())
      .then((b: { configured?: boolean }) => b.configured === true)
      .catch(() => {
        status = null;
        return false;
      });
    status.then((v) => {
      if (live) setOn(v);
    });
    return () => {
      live = false;
    };
  }, []);
  return on;
}

const longDate = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
const oneLine = (a: string) => a.replace(/\n/g, ", ");

// A name field that offers matching companies from the Companies House
// register as you type. Picking one hands back its registered details and,
// when the address field is empty, the registered address to put in it (in
// the same call, so one state update carries both). With an address already
// there it is only offered: it is often an accountant's office, not where the
// business trades.
export default function CompanyNameInput({
  value,
  onChange,
  onPick,
  address,
  onAddress,
  className,
  placeholder,
  lookupPlaceholder,
  id,
  labelledBy,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  onPick: (company: CompanyMatch, fillAddress: string | null) => void;
  address?: string;
  onAddress?: (address: string) => void;
  className?: string;
  placeholder?: string;
  // Shown instead of placeholder once lookup is on.
  lookupPlaceholder?: string;
  id?: string;
  labelledBy?: string;
  disabled?: boolean;
}) {
  const listId = useId();
  const on = useCompanyLookup();
  const [query, setQuery] = useState<string | null>(null);
  const [items, setItems] = useState<CompanyMatch[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [searching, setSearching] = useState(false);
  const [offer, setOffer] = useState<string | null>(null);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (query === null || !on) return;
    const q = query.trim();
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      if (q.length < 3) {
        setItems([]);
        return;
      }
      setSearching(true);
      try {
        const { data } = await supabase.auth.getSession();
        const headers: Record<string, string> = data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {};
        const res = await fetch(`/api/company-search?q=${encodeURIComponent(q)}`, { signal: controller.signal, headers });
        const body = (await res.json()) as { items?: CompanyMatch[] };
        setItems(body.items ?? []);
        setActive(-1);
      } catch {
        if (!controller.signal.aborted) setItems([]);
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, on]);

  if (!on) {
    return (
      <input
        id={id}
        className={className}
        placeholder={placeholder}
        disabled={disabled}
        aria-labelledby={labelledBy}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  const shown = open && items.length > 0;

  function pick(c: CompanyMatch) {
    const empty = !address?.trim();
    onPick(c, empty && c.address ? c.address : null);
    setOpen(false);
    setItems([]);
    setQuery(null);
    setOffer(!empty && onAddress && c.address && address!.trim() !== c.address ? c.address : null);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!shown) return;
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

  return (
    <div className="relative">
      <input
        id={id}
        className={className}
        placeholder={lookupPlaceholder || placeholder}
        disabled={disabled}
        aria-labelledby={labelledBy}
        value={value}
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={shown}
        aria-controls={shown ? listId : undefined}
        aria-activedescendant={shown && active >= 0 ? `${listId}-${active}` : undefined}
        onChange={(e) => {
          onChange(e.target.value);
          setQuery(e.target.value);
          setOpen(true);
          setOffer(null);
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
        // Holding the mouse down anywhere in the list (its scrollbar too)
        // mustn't blur the input and close it.
        <div onMouseDown={(e) => e.preventDefault()} className="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-lg border bg-white text-neutral-900 shadow-lg">
          <ul id={listId} role="listbox" aria-label="Companies House matches" className="max-h-80 overflow-y-auto">
            {items.map((c, i) => (
              <li
                key={c.number}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                onClick={() => pick(c)}
                onMouseEnter={() => setActive(i)}
                className={`cursor-pointer border-b px-3 py-2 last:border-b-0 ${i === active ? "bg-neutral-100" : ""}`}
              >
                <p className="text-sm font-medium">{c.name}</p>
                <p className="text-xs text-neutral-500">
                  Company {c.number}
                  {c.incorporated ? ` · since ${longDate(c.incorporated)}` : ""}
                </p>
                {c.address && <p className="truncate text-xs text-neutral-500">{oneLine(c.address)}</p>}
              </li>
            ))}
          </ul>
          <p className="border-t bg-neutral-50 px-3 py-1.5 text-[11px] text-neutral-500">
            {searching ? "Searching…" : "From the Companies House register. Pick one to fill in its details."}
          </p>
        </div>
      )}
      {offer && onAddress && (
        <p className="mt-1 text-xs text-neutral-600">
          Registered office: {oneLine(offer)}.{" "}
          <button
            type="button"
            className="font-medium underline"
            onClick={() => {
              onAddress(offer);
              setOffer(null);
            }}
          >
            Use this address
          </button>
        </p>
      )}
    </div>
  );
}
