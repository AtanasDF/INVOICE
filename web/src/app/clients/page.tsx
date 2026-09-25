"use client";

import Link from "next/link";
import { money } from "@/lib/money";
import { DuplicatePair, duplicatePairs, pairKey, readIgnoredDuplicates, writeIgnoredDuplicates } from "@/lib/duplicateContacts";
import { loadFailed, saveFailed } from "@/lib/errorText";

import { useEffect, useMemo, useState, useRef } from "react";
import ScanOrAdd from "@/components/ScanOrAdd";
import { useSearchParams } from "next/navigation";
import { Client, ClientKind, CreditNote, Invoice, VatCheck, businessProfileStore, clientsStore, creditNotesStore, invoicesStore, vatChecksStore } from "@/lib/storage";
import { downloadCsv } from "@/lib/exportCsv";
import { displayInvoiceNumber, invoiceStatusBadgeClass, invoiceStatusLabel, isOverdue } from "@/lib/invoiceStatus";
import Tip from "@/components/Tip";
import CompanyNameInput from "@/components/CompanyNameInput";
import AddressFields from "@/components/AddressFields";
import TextCustomer from "@/components/TextCustomer";
import { phoneLinks } from "@/lib/customerText";
import { creditOffDue, invoiceCharge } from "@/lib/cis";
import { invoiceVat } from "@/lib/invoiceBalance";
import { todayISO } from "@/lib/today";
import { shortDate } from "@/lib/dates";
import VatNumberInput, { VerifiedCheck } from "@/components/VatNumberInput";
import { keepVatCheck } from "@/lib/keepVatCheck";
import KeptVatChecks from "@/components/KeptVatChecks";

// What this customer was actually billed: gross, incl. VAT, less any CIS
// the contractor keeps back -- the "Amount due" figure on the invoice
// itself, and what the invoices list, the invoice page, the statement and
// the emailed copy all show.
//
// It used to be the raw line-item subtotal, so a £1,000 + £200 VAT invoice
// read £1,000 here and £1,200 everywhere else, and a CIS invoice read the
// full total instead of what the contractor pays. Under this customer's
// own name, beside a "Paid" badge, that is the one place the number has to
// agree with the document they were sent.
function invoiceTotal(inv: Invoice, vatRegistered: boolean, credited: number) {
  const charge = invoiceCharge(inv, invoiceVat(inv, vatRegistered));
  return Math.max(0, Math.round((charge.due - creditOffDue(charge, credited)) * 100) / 100);
}

type ClientDraft = {
  name: string;
  isCompany: boolean;
  email: string;
  address: string;
  vatNumber: string;
  paymentTerms: string;
  defaultCurrency: string;
  contactPerson: string;
  phone: string;
  // Editing a contact onto a different company is the natural way to fix a
  // wrong one, and it used to change the name and address while leaving
  // company_number pointing at the old company -- so the check kept
  // reporting on a business he has nothing to do with, under the right
  // name. The number follows the pick, and is cleared when the name stops
  // being that company.
  companyNumber: string;
  remindersEnabled: boolean;
  endUserDeclared: boolean;
};

function draftFor(c: Client): ClientDraft {
  return {
    name: c.name,
    isCompany: c.isCompany,
    email: c.email,
    address: c.address,
    vatNumber: c.vatNumber,
    paymentTerms: c.paymentTerms,
    defaultCurrency: c.defaultCurrency,
    contactPerson: c.contactPerson,
    phone: c.phone,
    companyNumber: c.companyNumber ?? "",
    remindersEnabled: c.remindersEnabled,
    endUserDeclared: c.endUserDeclared,
  };
}

export default function ClientsPage() {
  const searchParams = useSearchParams();
  const [clients, setClients] = useState<Client[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<ClientKind>(searchParams.get("tab") === "supplier" ? "supplier" : "client");
  const [expandedClientId, setExpandedClientId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ClientDraft | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [textingId, setTextingId] = useState<string | null>(null);
  const [businessName, setBusinessName] = useState("");
  // Our own VAT number, so a supplier's check comes back with HMRC's
  // reference for having made it.
  const [myVatNumber, setMyVatNumber] = useState("");
  const vatCheck = useRef<VerifiedCheck | null>(null);
  // Kept references, newest first, keyed by the number they were about.
  const [vatChecks, setVatChecks] = useState<VatCheck[]>([]);
  const [vatRegistered, setVatRegistered] = useState(false);
  const [creditNotes, setCreditNotes] = useState<CreditNote[]>([]);
  const [merging, setMerging] = useState<string | null>(null);
  // A ref, not the `disabled` state: React applies `disabled` on the render
  // AFTER the first press, and both handlers close over the same state, so two
  // presses in one tick both go through -- and this one runs the merge a second time.
  const mergingPair = useRef(false);
  const [merged, setMerged] = useState<string | null>(null);
  // Pairs put aside stay aside on this device.
  const [ignored, setIgnored] = useState<string[]>(() => readIgnoredDuplicates());

  useEffect(() => {
    Promise.all([clientsStore.all(), invoicesStore.all(), creditNotesStore.all()])
      .then(([c, inv, cn]) => {
        setClients(c);
        setInvoices(inv);
        setCreditNotes(cn);
      })
      .catch((err) => setError(loadFailed(err, "your contacts")))
      .finally(() => setLoading(false));
    // On its own, not in the Promise.all above: failing to read an
    // evidence log nobody asked for must not turn into "Couldn't load your
    // contacts".
    vatChecksStore.all().then(setVatChecks, () => {});
    businessProfileStore.get().then((p) => {
      setBusinessName(p.businessName);
      setVatRegistered(p.vatRegistered);
      setMyVatNumber(p.vatNumber ?? "");
    }, () => {});
  }, []);

  function creditedOn(invoiceId: string) {
    return creditNotes.filter((c) => c.invoiceId === invoiceId).reduce((s, c) => s + c.amount, 0);
  }

  function invoicesForClient(clientId: string) {
    return invoices
      .filter((inv) => inv.clientId === clientId)
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }

  const visibleClients = useMemo(
    () => clients.filter((c) => c.kind === tab && (showArchived || !c.archived)),
    [clients, tab, showArchived]
  );
  const archivedCount = clients.filter((c) => c.kind === tab && c.archived).length;
  const duplicates = useMemo(
    () => duplicatePairs(clients).filter((p) => p.keep.kind === tab && !ignored.includes(pairKey(p))),
    [clients, tab, ignored]
  );

  // Everything of the duplicate's moves to the one being kept; the duplicate
  // is archived, never deleted.
  async function merge(pair: DuplicatePair) {
    const counts = [
      [invoicesForClient(pair.duplicate.id).length, "invoice"],
    ] as const;
    const what = counts.filter(([n]) => n > 0).map(([n, word]) => `${n} ${word}${n === 1 ? "" : "s"}`).join(", ");
    if (!window.confirm(`Move everything from "${pair.duplicate.name}"${what ? ` (${what})` : ""} to "${pair.keep.name}" and archive the duplicate?`)) return;
    if (mergingPair.current) return;
    mergingPair.current = true;
    setMerging(pair.duplicate.id);
    setError(null);
    try {
      const { moved, left } = await clientsStore.mergeInto(pair.duplicate.id, pair.keep.id);
      const [c, inv] = await Promise.all([clientsStore.all(), invoicesStore.all()]);
      setClients(c);
      setInvoices(inv);
      const total = Object.values(moved).reduce((a, b) => a + b, 0);
      setMerged(
        `Merged into ${pair.keep.name}${total ? `: ${total} record${total === 1 ? "" : "s"} moved` : ""}.${left.length ? ` Some rows stayed with the old record (${left.join(", ")}).` : ""}`
      );
    } catch (err) {
      setError(saveFailed(err, "Couldn't merge those two."));
    } finally {
      mergingPair.current = false;
      setMerging(null);
    }
  }

  function ignore(pair: DuplicatePair) {
    const next = [...ignored, pairKey(pair)];
    setIgnored(next);
    writeIgnoredDuplicates(next);
  }

  function startEdit(c: Client) {
    setEditingId(c.id);
    setDraft(draftFor(c));
    setError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setDraft(null);
  }

  async function saveEdit(id: string) {
    if (!draft) return;
    setError(null);
    setBusyId(id);
    try {
      await clientsStore.update(id, draft);
      const kept = await keepVatCheck(vatCheck.current, id, draft.vatNumber);
      if (kept) setVatChecks((prev) => [kept, ...prev]);
      setClients((prev) => prev.map((c) => (c.id === id ? { ...c, ...draft } : c)));
      setEditingId(null);
      setDraft(null);
    } catch (err) {
      setError(saveFailed(err, "Couldn't save changes."));
    } finally {
      setBusyId(null);
    }
  }

  async function removeClient(c: Client) {
    if (!window.confirm(`Remove ${c.name}? Archive instead if they have any history with you — removing can't be undone.`)) return;
    const id = c.id;
    setError(null);
    try {
      await clientsStore.remove(id);
      setClients((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      setError(saveFailed(err, `Couldn't remove this ${tab === "client" ? "customer" : "supplier"}.`));
    }
  }

  // The escape hatch Remove can't be, once it has any real history --
  // hides it from client/supplier pickers on new records without
  // touching anything it's already linked to.
  async function toggleArchived(c: Client) {
    setError(null);
    const next = !c.archived;
    setClients((prev) => prev.map((x) => (x.id === c.id ? { ...x, archived: next } : x)));
    try {
      await (next ? clientsStore.archive(c.id) : clientsStore.unarchive(c.id));
    } catch (err) {
      setClients((prev) => prev.map((x) => (x.id === c.id ? { ...x, archived: !next } : x)));
      setError(saveFailed(err, "Couldn't update."));
    }
  }

  function exportClients() {
    downloadCsv(
      `${tab === "client" ? "customer" : "supplier"}s-${todayISO()}.csv`,
      visibleClients.map((c) => ({
        name: c.name,
        type: c.isCompany ? "Company" : "Individual",
        email: c.email,
        address: c.address,
        vat_number: c.vatNumber,
        payment_terms: c.paymentTerms,
        default_currency: c.defaultCurrency,
        contact_person: c.contactPerson,
      }))
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Customers &amp; suppliers</h1>
          <p className="mt-1 text-neutral-600">
            Customers are who you invoice. Suppliers are who invoices or receipts come from.
          </p>
        </div>
        <div className="flex flex-wrap items-start gap-2">
          {visibleClients.length > 0 && (
            <button onClick={exportClients} className="rounded-lg border px-3 py-1.5 text-sm font-medium text-neutral-700">
              Download for a spreadsheet
            </button>
          )}
          <ScanOrAdd scanHref={`/clients/new?kind=${tab}&scan=1`} scanLabel={`Scan a ${tab === "client" ? "customer" : "supplier"}`} addHref={`/clients/new?kind=${tab}`} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex w-fit max-w-full flex-wrap rounded-lg border text-sm">
          <button
            onClick={() => setTab("client")}
            className={`px-4 py-1.5 ${tab === "client" ? "bg-neutral-900 text-white" : "text-neutral-600"}`}
          >
            Customers
          </button>
          <button
            onClick={() => setTab("supplier")}
            className={`px-4 py-1.5 ${tab === "supplier" ? "bg-neutral-900 text-white" : "text-neutral-600"}`}
          >
            Suppliers
          </button>
        </div>
      </div>

      <Tip id="clients-scan">
        Tip: photograph a business card, letterhead or invoice and the name, address, email and VAT number are filled in
        for you.
      </Tip>

      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {/* A merge repoints invoices, receipts and quotes and archives one of
          the two records. Saying so in a plain <p> told a screen reader
          nothing at all about the largest change on this page. */}
      {merged && <p role="status" className="rounded-lg bg-neutral-50 p-3 text-sm text-neutral-700">{merged}</p>}
      {duplicates.map((pair) => (
        <div key={pairKey(pair)} className="rounded-xl border bg-white p-4 text-neutral-900 shadow-sm">
          <p className="text-sm">
            <strong>{pair.keep.name}</strong> and <strong>{pair.duplicate.name}</strong> look like the same {tab}: {pair.why}.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => merge(pair)}
              disabled={merging === pair.duplicate.id}
              className="rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {merging === pair.duplicate.id ? "Merging…" : `Merge into ${pair.keep.name}`}
            </button>
            <button type="button" onClick={() => ignore(pair)} className="rounded-lg border px-3 py-1.5 text-sm font-medium text-neutral-700">
              They&apos;re different
            </button>
          </div>
        </div>
      ))}

      {loading ? (
        <p className="text-sm text-neutral-500">Loading…</p>
      ) : (
        <div className="space-y-3">
          {visibleClients.length === 0 && archivedCount === 0 && !error && (
            <p className="text-sm text-neutral-500">
              No {tab === "client" ? "customer" : "supplier"}s yet. Scan a business card, letter or invoice to add one, or add one by hand.
            </p>
          )}
          {visibleClients.map((c) => {
            // A supplier can be invoiced too (a quote to them turned into an
            // invoice), and then needs the same reminder switch and history.
            const clientInvoices = invoicesForClient(c.id);
            const billed = tab === "client" || clientInvoices.length > 0;
            const expanded = expandedClientId === c.id;
            const editing = editingId === c.id;
            return (
              <div key={c.id} className="rounded-xl border bg-white text-neutral-900 shadow-sm">
                {editing && draft ? (
                  <div className="space-y-3 p-4">
                    <div className="flex gap-4 text-sm">
                      <label className="flex items-center gap-2">
                        <input type="radio" checked={draft.isCompany} onChange={() => setDraft({ ...draft, isCompany: true })} />
                        Company
                      </label>
                      <label className="flex items-center gap-2">
                        <input type="radio" checked={!draft.isCompany} onChange={() => setDraft({ ...draft, isCompany: false, companyNumber: "" })} />
                        Individual
                      </label>
                    </div>
                    {draft.isCompany ? (
                      <CompanyNameInput
                        className="w-full rounded-lg border px-3 py-2 text-sm"
                        placeholder="Company name"
                        lookupPlaceholder="Company name (type to search Companies House)"
                        value={draft.name}
                        onChange={(name) => setDraft({ ...draft, name, companyNumber: name === draft.name ? draft.companyNumber : "" })}
                        address={draft.address}
                        onAddress={(address) => setDraft({ ...draft, address })}
                        onPick={(c, fillAddress) => setDraft({ ...draft, name: c.name, companyNumber: c.number, address: fillAddress ?? draft.address })}
                      />
                    ) : (
                      <input aria-label="Full name"
                        className="w-full rounded-lg border px-3 py-2 text-sm"
                        placeholder="Full name"
                        value={draft.name}
                        onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                      />
                    )}
                    <input aria-label="Email"
                      type="email"
                      autoComplete="email"
                      className="w-full rounded-lg border px-3 py-2 text-sm"
                      placeholder="Email"
                      value={draft.email}
                      onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                    />
                    <AddressFields address={draft.address} onAddress={(address) => setDraft({ ...draft, address })} />
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <VatNumberInput id="edit-vat" mine={myVatNumber} onChecked={(c) => (vatCheck.current = c)} label="VAT number" className="w-full rounded-lg border px-3 py-2 text-sm" value={draft.vatNumber} onChange={(v) => setDraft({ ...draft, vatNumber: v })} business={draft.name} />
                        <KeptVatChecks checks={vatChecks} number={draft.vatNumber} />
                      </div>
                      <input aria-label="Contact person" className="rounded-lg border px-3 py-2 text-sm" placeholder="Contact person" value={draft.contactPerson} onChange={(e) => setDraft({ ...draft, contactPerson: e.target.value })} />
                      <input aria-label="Phone" className="rounded-lg border px-3 py-2 text-sm" placeholder="Phone" type="tel" value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} />
                      <input aria-label="Payment terms" className="rounded-lg border px-3 py-2 text-sm" placeholder="Payment terms" value={draft.paymentTerms} onChange={(e) => setDraft({ ...draft, paymentTerms: e.target.value })} />
                      <input aria-label="Default currency" className="rounded-lg border px-3 py-2 text-sm" placeholder="Default currency" value={draft.defaultCurrency} onChange={(e) => setDraft({ ...draft, defaultCurrency: e.target.value })} />
                    </div>
                    {billed && (
                      <label className="flex items-center gap-2 text-sm text-neutral-700">
                        <input
                          type="checkbox"
                          checked={draft.remindersEnabled}
                          onChange={(e) => setDraft({ ...draft, remindersEnabled: e.target.checked })}
                        />
                        Send automatic payment reminders for invoices to them
                      </label>
                    )}
                    {/* Their statement, not our guess. Only for a business:
                        a private customer cannot be VAT registered, so the
                        reverse charge cannot reach them. */}
                    {c.kind === "client" && c.isCompany && (
                      <label className="flex items-start gap-2 text-sm text-neutral-700">
                        <input
                          type="checkbox"
                          className="mt-1 shrink-0"
                          checked={draft.endUserDeclared}
                          onChange={(e) => setDraft({ ...draft, endUserDeclared: e.target.checked })}
                        />
                        <span className="wrap-anywhere">
                          They have told me in writing that they are an end user
                          <span className="block text-xs text-neutral-500">
                            For CIS work, this is what means you charge them VAT as normal instead of the reverse charge.
                          </span>
                        </span>
                      </label>
                    )}
                    <div className="flex gap-3">
                      <button
                        onClick={() => saveEdit(c.id)}
                        disabled={busyId === c.id}
                        className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                      >
                        {busyId === c.id ? "Saving…" : "Save"}
                      </button>
                      <button onClick={cancelEdit} className="rounded-lg border px-4 py-2 text-sm font-medium text-neutral-700">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 p-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 wrap-anywhere font-medium">
                        {c.name}
                        {c.archived && (
                          <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-500">Archived</span>
                        )}
                      </div>
                      <div className="text-sm text-neutral-500">
                        {c.isCompany ? "Company" : "Individual"}{c.email ? ` · ${c.email}` : ""}{c.phone ? ` · ${c.phone}` : ""}{c.vatNumber ? ` · VAT ${c.vatNumber}` : ""}
                        {billed && !c.remindersEnabled && " · Reminders off"}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      {phoneLinks(c.phone) && (
                        <button onClick={() => setTextingId(textingId === c.id ? null : c.id)} className="text-sm font-medium text-neutral-700 underline">
                          {textingId === c.id ? "Close" : "Send a text"}
                        </button>
                      )}
                      {clientInvoices.length > 0 && (
                        <Link href={`/clients/${c.id}/statement`} className="text-sm font-medium text-neutral-700 underline">
                          Statement
                        </Link>
                      )}
                      {clientInvoices.length > 0 && (
                        <button
                          onClick={() => setExpandedClientId(expanded ? null : c.id)}
                          className="text-sm font-medium text-neutral-700 underline"
                        >
                          {expanded ? "Hide" : "Payment history"}
                        </button>
                      )}
                      {clientInvoices.length > 0 && (
                        <Link href={`/invoices?client=${c.id}`} className="text-sm font-medium text-neutral-700 underline">
                          All invoices
                        </Link>
                      )}
                      <button onClick={() => startEdit(c)} className="text-sm font-medium text-neutral-700 underline">
                        Edit
                      </button>
                      <button onClick={() => toggleArchived(c)} className="text-sm font-medium text-neutral-600">
                        {c.archived ? "Unarchive" : "Archive"}
                      </button>
                      <button onClick={() => removeClient(c)} className="text-sm text-neutral-600 underline">
                        Remove
                      </button>
                    </div>
                  </div>
                )}
                {textingId === c.id && !editing && (
                  <div className="border-t p-4">
                    <TextCustomer client={c} from={businessName} presets={["onMyWay", "late", "arrived"]} />
                  </div>
                )}
                {expanded && !editing && (
                  <div className="space-y-2 border-t p-4">
                    {clientInvoices.map((inv) => {
                      const overdue = isOverdue(inv.status, inv.dueDate);
                      return (
                        <div key={inv.id} className="flex items-center justify-between text-sm">
                          <span>{displayInvoiceNumber(inv)} · {shortDate(inv.date)} · {money(invoiceTotal(inv, vatRegistered, creditedOn(inv.id)))}</span>
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${invoiceStatusBadgeClass(inv.status, overdue)}`}>
                            {invoiceStatusLabel(inv.status, overdue)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
          {archivedCount > 0 && (
            <button type="button" onClick={() => setShowArchived((v) => !v)} className="text-sm font-medium text-neutral-500">
              {showArchived ? "Hide archived" : `${archivedCount} archived`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
