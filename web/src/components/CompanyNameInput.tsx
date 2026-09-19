"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { CompanyMatch } from "@/lib/companyLookup";

// Until the server has a Companies House key the box is a plain input. One
// check per page load says whether lookup is on.
let status: Promise<boolean> | null = null;

export function useCompanyLookup(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let live = true;
    status ??= fetch("/api/company-search")
      .then((r) => r.json())
      .then((b: { configured?: boolean }) => b.configured === true)
      .catch(() => false);
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

// A name field that offers matching companies from the Companies House
// register as you type; picking one hands back its registered details.
export default function CompanyNameInput({
  value,
  onChange,
  onPick,
  className,
  placeholder,
  lookupPlaceholder,
  id,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  onPick: (company: CompanyMatch) => void;
  className?: string;
  placeholder?: string;
  // Shown instead of placeholder once lookup is on.
  lookupPlaceholder?: string;
  id?: string;
  disabled?: boolean;
}) {
  const listId = useId();
  const on = useCompanyLookup();
  const [query, setQuery] = useState<string | null>(null);
  const [items, setItems] = useState<CompanyMatch[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [searching, setSearching] = useState(false);
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
        const res = await fetch(`/api/company-search?q=${encodeURIComponent(q)}`, { signal: controller.signal });
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

  const shown = open && items.length > 0;

  function pick(c: CompanyMatch) {
    onPick(c);
    setOpen(false);
    setItems([]);
    setQuery(null);
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
        placeholder={(on && lookupPlaceholder) || placeholder}
        disabled={disabled}
        value={value}
        autoComplete={on ? "off" : "organization"}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={shown}
        aria-controls={listId}
        aria-activedescendant={shown && active >= 0 ? `${listId}-${active}` : undefined}
        onChange={(e) => {
          onChange(e.target.value);
          setQuery(e.target.value);
          setOpen(true);
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
        <div className="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-lg border bg-white text-neutral-900 shadow-lg">
          <ul id={listId} role="listbox" aria-label="Companies House matches" className="max-h-80 overflow-y-auto">
            {items.map((c, i) => (
              <li
                key={c.number}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(c)}
                onMouseEnter={() => setActive(i)}
                className={`cursor-pointer border-b px-3 py-2 last:border-b-0 ${i === active ? "bg-neutral-100" : ""}`}
              >
                <p className="text-sm font-medium">{c.name}</p>
                <p className="text-xs text-neutral-500">
                  Company {c.number}
                  {c.incorporated ? ` · since ${longDate(c.incorporated)}` : ""}
                </p>
                {c.address && <p className="truncate text-xs text-neutral-500">{c.address.replace(/\n/g, ", ")}</p>}
              </li>
            ))}
          </ul>
          <p className="border-t bg-neutral-50 px-3 py-1.5 text-[11px] text-neutral-500">
            {searching ? "Searching…" : "From the Companies House register. Pick one to fill in its details."}
          </p>
        </div>
      )}
    </div>
  );
}
