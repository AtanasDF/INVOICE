"use client";

import { useId, useState } from "react";
import AddressFields from "@/components/AddressFields";
import CompanyNameInput from "@/components/CompanyNameInput";
import { INPUT } from "@/components/free-invoice/fields";
import { Client, clientsStore } from "@/lib/storage";
import { errorText } from "@/lib/errorText";

const SECONDARY = "rounded-lg border px-3 py-1.5 text-sm font-medium text-neutral-700 disabled:opacity-50";
// Past this many, a search box goes above the list.
const SEARCH_FROM = 7;

const byName = (a: Client, b: Client) => a.name.localeCompare(b.name, "en-GB", { sensitivity: "base" });

// "Company · VAT GB123…", "Private customer", and whether they're one of the
// account's suppliers.
export function customerKind(c: Client): string {
  const kind = c.isCompany ? `Company${c.vatNumber ? ` · VAT ${c.vatNumber}` : ""}` : "Private customer";
  return c.kind === "supplier" ? `${kind} · one of your suppliers` : kind;
}

export function customerContact(c: Client): string {
  return [c.isCompany && c.contactPerson ? `Attn: ${c.contactPerson}` : "", c.email, c.phone].filter(Boolean).join(" · ");
}

export type NewCustomerStart = { name: string; email: string; address: string; isCompany?: boolean };

// Who a quote is for: anyone in Customers & suppliers, customers first, or
// someone new added on the spot. An archived one stays shown only while it's
// the one picked. Whether a new customer is being added is held by the form,
// so it can't be saved over one half typed in.
export default function CustomerPicker({ people, value, onChange, onAdded, adding, onAdding }: {
  people: Client[];
  value: string;
  onChange: (id: string) => void;
  onAdded: (c: Client) => void;
  adding: NewCustomerStart | null;
  onAdding: (start: NewCustomerStart | null) => void;
}) {
  const shown = people.filter((c) => !c.archived || c.id === value);
  const picked = shown.find((c) => c.id === value) ?? null;
  const [browsing, setBrowsing] = useState(false);
  const [query, setQuery] = useState("");
  const labelId = useId();

  const q = query.trim().toLowerCase();
  const found = q ? shown.filter((c) => [c.name, c.contactPerson, c.email].some((f) => f.toLowerCase().includes(q))) : shown;
  const groups = [
    { label: "Customers", people: found.filter((c) => c.kind === "client").sort(byName) },
    { label: "Suppliers", people: found.filter((c) => c.kind === "supplier").sort(byName) },
  ].filter((g) => g.people.length);

  function pick(id: string) {
    onChange(id);
    setBrowsing(false);
    setQuery("");
  }

  if (adding) {
    return (
      <NewCustomer
        start={adding}
        existing={shown}
        onCancel={shown.length ? () => onAdding(null) : undefined}
        onSaved={(c) => {
          onAdded(c);
          pick(c.id);
          onAdding(null);
        }}
      />
    );
  }

  if (picked && !browsing) {
    const contact = customerContact(picked);
    return (
      <div>
        <p className="text-xs text-neutral-500">For</p>
        <div className="mt-1 flex items-start justify-between gap-3 rounded-lg border p-3">
          <div className="min-w-0">
            <p className="font-medium">{picked.name}</p>
            <p className="text-sm text-neutral-600">{customerKind(picked)}</p>
            {contact && <p className="wrap-anywhere text-sm text-neutral-500">{contact}</p>}
          </div>
          <button type="button" onClick={() => setBrowsing(true)} className={`shrink-0 ${SECONDARY}`}>
            Change
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p id={labelId} className="text-xs text-neutral-500">Who it&apos;s for</p>
      {shown.length >= SEARCH_FROM && (
        <input
          type="search"
          className={INPUT}
          placeholder="Search customers and suppliers"
          aria-label="Search customers and suppliers"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      )}
      {groups.length > 0 ? (
        <div role="radiogroup" aria-labelledby={labelId} className="max-h-80 overflow-y-auto rounded-lg border">
          {groups.map((g) => (
            <div key={g.label}>
              <p className="sticky top-0 border-b bg-neutral-50 px-3 py-1 text-xs font-medium text-neutral-500">{g.label}</p>
              {g.people.map((c) => {
                const sub = (c.isCompany && c.contactPerson) || c.email || c.address.split("\n")[0];
                return (
                  <button
                    key={c.id}
                    type="button"
                    role="radio"
                    aria-checked={c.id === value}
                    onClick={() => pick(c.id)}
                    className={`flex w-full items-center justify-between gap-3 border-b px-3 py-2.5 text-left last:border-b-0 ${c.id === value ? "bg-neutral-100" : ""}`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{c.name}</span>
                      {sub && <span className="block truncate text-xs text-neutral-500">{sub}</span>}
                    </span>
                    <span className="shrink-0 text-xs text-neutral-500">{c.isCompany ? "Company" : "Private"}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      ) : (
        <p className="rounded-lg border px-3 py-2.5 text-sm text-neutral-600">No one matches &ldquo;{query.trim()}&rdquo;.</p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => onAdding({ name: groups.length ? "" : query.trim(), email: "", address: "" })} className={SECONDARY}>
          + New customer
        </button>
        {picked && (
          <button type="button" onClick={() => pick(picked.id)} className={SECONDARY}>
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

// A new customer, company or private person, saved straight to Customers.
function NewCustomer({ start, existing, onSaved, onCancel }: {
  start: NewCustomerStart;
  existing: Client[];
  onSaved: (c: Client) => void;
  onCancel?: () => void;
}) {
  const [isCompany, setIsCompany] = useState<boolean | null>(start.isCompany ?? null);
  const [name, setName] = useState(start.name);
  const [contactPerson, setContactPerson] = useState("");
  const [email, setEmail] = useState(start.email);
  const [phone, setPhone] = useState("");
  const [vatNumber, setVatNumber] = useState("");
  const [address, setAddress] = useState(start.address);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = useId();

  async function save() {
    const trimmed = name.trim();
    if (!trimmed) return setError(isCompany ? "Add the company's name." : "Add their name.");
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError("That email address doesn't look right.");
    const same = existing.find((c) => c.name.trim().toLowerCase() === trimmed.toLowerCase());
    if (same && !window.confirm(`You already have ${same.name} in your list. Add another one with the same name?`)) return;
    setSaving(true);
    setError(null);
    try {
      onSaved(
        await clientsStore.add({
          name: trimmed,
          isCompany: !!isCompany,
          email: email.trim(),
          address: address.trim(),
          kind: "client",
          vatNumber: isCompany ? vatNumber.trim() : "",
          paymentTerms: "",
          defaultCurrency: "",
          contactPerson: isCompany ? contactPerson.trim() : "",
          phone: phone.trim(),
          companyNumber: "",
          remindersEnabled: true,
        })
      );
    } catch (err) {
      setError(errorText(err, "Could not add the customer."));
      setSaving(false);
    }
  }

  const choice = (company: boolean, label: string) => (
    <button
      type="button"
      role="radio"
      aria-checked={isCompany === company}
      onClick={() => setIsCompany(company)}
      className={`rounded-md py-2 text-sm font-medium ${isCompany === company ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-600"}`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div>
        <p className="font-medium">New customer</p>
        <p className="text-sm text-neutral-600">Saved to your customers, so it&apos;s there next time.</p>
      </div>
      <div role="radiogroup" aria-label="Company or private person" className="grid grid-cols-2 gap-1 rounded-lg bg-neutral-100 p-1">
        {choice(true, "Company")}
        {choice(false, "Private person")}
      </div>
      {isCompany !== null && (
        <>
          <div>
            <label className="text-xs text-neutral-500" htmlFor={`${id}-name-input`}>{isCompany ? "Company name" : "Full name"}</label>
            {isCompany ? (
              <CompanyNameInput
                id={`${id}-name-input`}
                className={INPUT}
                placeholder="e.g. Acme Kitchens Ltd"
                lookupPlaceholder="Type to search Companies House"
                value={name}
                onChange={setName}
                address={address}
                onAddress={setAddress}
                onPick={(c, fillAddress) => {
                  setName(c.name);
                  if (fillAddress) setAddress(fillAddress);
                }}
              />
            ) : (
              <input id={`${id}-name-input`} className={INPUT} autoComplete="off" placeholder="e.g. Jane Smith" value={name} onChange={(e) => setName(e.target.value)} />
            )}
          </div>
          {isCompany && (
            <div>
              <label className="text-xs text-neutral-500" htmlFor={`${id}-contact`}>Contact name (optional)</label>
              <input id={`${id}-contact`} className={INPUT} autoComplete="off" placeholder="Who you deal with there" value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} />
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs text-neutral-500" htmlFor={`${id}-email`}>Email</label>
              <input id={`${id}-email`} type="email" inputMode="email" autoComplete="off" className={INPUT} placeholder="To email the quote" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-neutral-500" htmlFor={`${id}-phone`}>Mobile</label>
              <input id={`${id}-phone`} type="tel" autoComplete="off" className={INPUT} placeholder="To text or WhatsApp it" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>
          {isCompany && (
            <div>
              <label className="text-xs text-neutral-500" htmlFor={`${id}-vat`}>VAT number (optional)</label>
              <input id={`${id}-vat`} className={INPUT} autoComplete="off" placeholder="GB123456789" value={vatNumber} onChange={(e) => setVatNumber(e.target.value)} />
            </div>
          )}
          <AddressFields
            address={address}
            onAddress={setAddress}
            label="Address"
            streetPlaceholder={isCompany ? "House number and street" : "Number and street, or where the work is"}
          />
        </>
      )}
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <div className="flex flex-wrap gap-2">
        {isCompany !== null && (
          <button type="button" onClick={save} disabled={saving} className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            {saving ? "Adding…" : "Add customer"}
          </button>
        )}
        {onCancel && (
          <button type="button" onClick={onCancel} disabled={saving} className="rounded-lg border px-4 py-2 text-sm font-medium text-neutral-700 disabled:opacity-50">
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
