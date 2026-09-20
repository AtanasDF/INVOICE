"use client";

import { Fragment, useEffect, useId, useMemo, useRef, useState } from "react";
import { type CompanyMatch, registerNote } from "@/lib/companyLookup";
import { Client, ClientKind, clientsStore } from "@/lib/storage";
import { useCompanyLookup } from "@/lib/companyConfigured";
import { normaliseSupplierName } from "@/lib/supplierMatch";
import { rememberCompany, recallCompany, searchRegister } from "@/lib/companyRegister";
import { CompanyRow, type RegisterCheck, RegisterNote, oneLine, useRegisterCheck } from "@/components/RegisterBits";

export type Usage = Record<string, { count: number; last: string }>;

const MOST_USED = 5;

function order(contacts: Client[], usage: Usage): { used: Client[]; rest: Client[] } {
  const used = contacts
    .filter((c) => (usage[c.id]?.count ?? 0) > 0)
    .sort((a, b) => usage[b.id].count - usage[a.id].count || (usage[b.id].last > usage[a.id].last ? 1 : -1) || a.name.localeCompare(b.name))
    .slice(0, MOST_USED);
  const top = new Set(used.map((c) => c.id));
  return { used, rest: contacts.filter((c) => !top.has(c.id)).sort((a, b) => a.name.localeCompare(b.name)) };
}

function matchesTyped(c: Client, q: string): boolean {
  return `${c.name} ${c.contactPerson ?? ""}`.toLowerCase().includes(q);
}

// One field for "who is this", wherever a customer or supplier is named.
// Typing filters the contacts already saved and, with a Companies House
// key, searches the register; the arrow on the right is a real <select>,
// so a phone opens its own picker and the saved contacts come out most
// used first. A company from the register is only ever saved by tapping
// Add, never by typing its name.
export default function ContactField({
  kind,
  contacts,
  selectedId,
  onSelect,
  onCreated,
  usage = {},
  text,
  onText,
  label,
  placeholder,
  emptyOption,
  listLabel,
  onCheck,
  checkTyped = false,
  recheck,
  id,
  inputClassName = "w-full rounded-lg border px-3 py-2 pr-10",
}: {
  kind: ClientKind;
  contacts: Client[];
  selectedId: string;
  onSelect: (c: Client | null) => void;
  onCreated: (c: Client) => void;
  usage?: Usage;
  text: string;
  onText: (value: string) => void;
  label?: string;
  placeholder?: string;
  emptyOption?: string;
  listLabel?: string;
  // The register's answer about the name in the field, for a form that
  // fills its own gaps from it.
  onCheck?: (check: RegisterCheck) => void;
  // Check a name typed in but not picked, for a form whose text is the
  // name on a document rather than a search box.
  checkTyped?: boolean;
  // Bumped when the form behind the field is filled in again, so the
  // answer is asked for once more and anything it fed in comes back.
  recheck?: number;
  id?: string;
  inputClassName?: string;
}) {
  const listId = useId();
  const on = useCompanyLookup();
  const word = kind === "client" ? "client" : "supplier";
  const selected = contacts.find((c) => c.id === selectedId) ?? null;
  const shown = selected ? selected.name : text;

  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<CompanyMatch[]>([]);
  const [searching, setSearching] = useState(false);
  const [active, setActive] = useState(-1);
  const [pending, setPending] = useState<CompanyMatch | null>(null);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const query = selected ? "" : text.trim();
  const { used, rest } = useMemo(() => order(contacts, usage), [contacts, usage]);
  const filtered = useMemo(() => {
    if (!query) return [];
    const q = query.toLowerCase();
    return [...used, ...rest].filter((c) => matchesTyped(c, q));
  }, [query, used, rest]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      if (!on || !open || query.length < 3) {
        setItems([]);
        return;
      }
      setSearching(true);
      try {
        setItems(await searchRegister(query, { signal: controller.signal }));
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
  }, [query, on, open]);

  // A company already saved under this name doesn't need adding again.
  const saved = useMemo(() => new Set(contacts.map((c) => normaliseSupplierName(c.name))), [contacts]);
  const register = items.filter((c) => !saved.has(normaliseSupplierName(c.name)));
  const numberHint = recallCompany(selectedId)?.number ?? null;
  const checked = selected ? selected.name : checkTyped ? text : "";
  const check = useRegisterCheck(checked, numberHint, on && !!checked.trim(), onCheck, recheck);

  const rows = [...filtered.map((c) => ({ contact: c, company: null as CompanyMatch | null })), ...register.map((c) => ({ contact: null as Client | null, company: c }))];
  const listOpen = open && !!query && (rows.length > 0 || searching);

  function choose(row: { contact: Client | null; company: CompanyMatch | null }) {
    setOpen(false);
    setActive(-1);
    if (row.contact) {
      onSelect(row.contact);
      setPending(null);
      return;
    }
    setPending(row.company);
    setAddError(null);
  }

  async function add() {
    if (!pending) return;
    setAdding(true);
    setAddError(null);
    try {
      const created = await clientsStore.add({
        name: pending.name,
        isCompany: true,
        email: "",
        address: pending.address,
        kind,
        vatNumber: "",
        paymentTerms: "",
        defaultCurrency: "",
        contactPerson: "",
        phone: "",
        remindersEnabled: true,
      });
      rememberCompany(created.id, pending);
      onCreated(created);
      onSelect(created);
      setPending(null);
    } catch (err) {
      setAddError(err instanceof Error ? err.message : `Could not add the ${word}.`);
    } finally {
      setAdding(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!listOpen) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (a + 1) % rows.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (a <= 0 ? rows.length - 1 : a - 1));
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      choose(rows[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const heading = "border-b bg-neutral-50 px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-neutral-500";
  const options = (list: Client[]) => list.map((c) => <option key={c.id} value={c.id}>{c.name}</option>);

  return (
    <div>
      {label && <label className="text-xs text-neutral-500" htmlFor={id}>{label}</label>}
      <div className="relative">
        <input
          id={id}
          className={inputClassName}
          placeholder={placeholder}
          value={shown}
          autoComplete="off"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={listOpen}
          aria-controls={listOpen ? listId : undefined}
          aria-activedescendant={listOpen && active >= 0 ? `${listId}-${active}` : undefined}
          onChange={(e) => {
            if (selected) onSelect(null);
            onText(e.target.value);
            setOpen(true);
            setPending(null);
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
        <span aria-hidden className="pointer-events-none absolute inset-y-0 right-0 flex w-9 items-center justify-center text-neutral-500">▾</span>
        <select
          aria-label={listLabel ?? `Your saved ${word}s`}
          className="absolute inset-y-0 right-0 w-9 cursor-pointer opacity-0"
          value={selectedId}
          onChange={(e) => {
            onSelect(contacts.find((c) => c.id === e.target.value) ?? null);
            setPending(null);
            setOpen(false);
          }}
        >
          <option value="">{emptyOption ?? `Pick a saved ${word}…`}</option>
          {used.length > 0 ? (
            <>
              <optgroup label="Most used">{options(used)}</optgroup>
              {rest.length > 0 && <optgroup label="A–Z">{options(rest)}</optgroup>}
            </>
          ) : (
            options(rest)
          )}
        </select>
        {listOpen && (
          // Holding the mouse down anywhere in the list (its scrollbar too)
          // mustn't blur the input and close it.
          <div onMouseDown={(e) => e.preventDefault()} className="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-lg border bg-white text-neutral-900 shadow-lg">
            <ul id={listId} role="listbox" aria-label={`${word === "client" ? "Clients" : "Suppliers"} and Companies House matches`} className="max-h-80 overflow-y-auto">
              {filtered.length > 0 && <li role="presentation" className={heading}>Your {word}s</li>}
              {rows.map((row, i) => (
                <Fragment key={row.contact ? row.contact.id : `ch-${row.company!.number}`}>
                  {!row.contact && i === filtered.length && <li role="presentation" className={heading}>On the register</li>}
                  <li
                    id={`${listId}-${i}`}
                    role="option"
                    aria-selected={i === active}
                    onClick={() => choose(row)}
                    onMouseEnter={() => setActive(i)}
                    className={`cursor-pointer border-b px-3 py-2 last:border-b-0 ${i === active ? "bg-neutral-100" : ""}`}
                  >
                    {row.contact ? (
                      <>
                        <p className="text-sm font-medium">{row.contact.name}</p>
                        {row.contact.contactPerson && <p className="text-xs text-neutral-500">{row.contact.contactPerson}</p>}
                      </>
                    ) : (
                      <CompanyRow c={row.company!} />
                    )}
                  </li>
                </Fragment>
              ))}
              {on && searching && <li role="presentation" className="px-3 py-2 text-xs text-neutral-500">Searching Companies House…</li>}
              {on && !searching && !register.length && query.length >= 3 && (
                <li role="presentation" className="px-3 py-2 text-xs text-neutral-500">Nothing more on the Companies House register.</li>
              )}
            </ul>
          </div>
        )}
      </div>

      {pending && (
        <div className="mt-2 rounded-lg border bg-neutral-50 p-3">
          <p className="text-sm font-medium">{pending.name}</p>
          <p className="text-xs text-neutral-500">Company {pending.number}</p>
          {pending.address && <p className="text-xs text-neutral-500">{oneLine(pending.address)}</p>}
          {registerNote(pending.status) && <p className="mt-1 text-xs text-neutral-700">{registerNote(pending.status)}</p>}
          {addError && <p className="mt-1 text-sm text-red-600">{addError}</p>}
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" onClick={add} disabled={adding} className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
              {adding ? "Adding…" : `Add as ${word}`}
            </button>
            <button type="button" onClick={() => setPending(null)} className="rounded-lg border px-4 py-2 text-sm font-medium text-neutral-700">
              Not now
            </button>
          </div>
        </div>
      )}
      {!pending && check.company && <p className="mt-1 text-xs text-neutral-500">Company {check.company.number} on the Companies House register.</p>}
      {!pending && <RegisterNote check={check} />}
    </div>
  );
}
