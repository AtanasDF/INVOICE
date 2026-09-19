"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BusinessProfile, Client, Invoice, InvoiceItem, businessProfileStore, clientsStore, invoicesStore } from "@/lib/storage";
import { supabase } from "@/lib/supabaseClient";
import { VAT_RATES, VAT_RATE_KINDS, VAT_RATE_LABELS, VatRateKind, computeInvoiceTotals } from "@/lib/vat";
import { draftPlaceholderNumber } from "@/lib/invoiceNumber";
import { NumberInput } from "@/components/free-invoice/fields";
import { FreeInvoiceDraft, clearFreeInvoiceDraft, readFreeInvoiceDraft, termsDays, todayIso } from "@/lib/freeInvoiceDraft";
import { CameraIcon } from "@/components/icons";
import CaptureButton from "@/components/CaptureButton";
import DocumentCapture, { CapturedFile } from "@/components/DocumentCapture";
import type { InvoiceTemplate } from "@/lib/invoiceTemplate";
import { matchSupplier, normaliseSupplierName } from "@/lib/supplierMatch";
import type { TypedVat } from "@/lib/invoiceFromText";
import { looksLikeCompany } from "@/lib/reminderTemplates";
import { CisSummary, CisToggle, LineKind } from "@/components/invoice/CisFields";
import { withKinds } from "@/lib/cis";
import UploadFilesButton from "@/components/UploadFilesButton";
import { dropUploadMarker, takeUploads, uploadMarked } from "@/lib/scanHandoff";

function addDays(dateStr: string, days: number): string {
  // UTC methods throughout -- see the comment on the equivalent helper in
  // expenses/page.tsx for why: mixing UTC parsing with local getDate/setDate
  // before a toISOString round-trip is a real off-by-one-day bug depending
  // on the viewer's timezone offset, confirmed to break in either direction.
  const d = new Date(dateStr);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

type ScanLineItem = { description: string; quantity: number; unitPrice: number };
type ScanApiResult = {
  date: string | null;
  lineItems: ScanLineItem[];
  notes: string | null;
};

// "30 days from receipt" is 30 days; only terms with no number and a word
// like "receipt" mean due at once.
function termsLengthOf(terms: string): number | null {
  const m = /(\d+)\s*days?/i.exec(terms);
  if (m) return Number(m[1]);
  return /receipt|immediate/i.test(terms) ? 0 : null;
}

// Printed terms win over the printed date gap, which catches invoices that
// only show a due date.
function copiedTermsDays(t: InvoiceTemplate): number | null {
  const printed = t.paymentTerms ? termsLengthOf(t.paymentTerms) : null;
  if (printed !== null) return printed;
  if (!t.date || !t.dueDate) return null;
  const gap = (Date.parse(t.dueDate) - Date.parse(t.date)) / 86_400_000;
  return Number.isFinite(gap) && gap >= 0 ? Math.round(gap) : null;
}

// archivedId: an archived client of the same name, offered back rather
// than duplicated.
type ScannedCustomer = { name: string; email: string; address: string; archivedId?: string };
type Lists = { clients: Client[]; pastInvoices: Invoice[]; vatRegistered: boolean };

const BLANK_ITEM: InvoiceItem = { description: "", quantity: 1, unitPrice: 0, vatRate: "standard" };

function importedDueDate(draft: FreeInvoiceDraft, date: string): { dueDate: string; manual: boolean } {
  const days = termsDays(draft.paymentTerms);
  if (days !== null) return { dueDate: addDays(date, days), manual: false };
  const derived = addDays(date, 30);
  const dueDate = draft.dueDate || derived;
  return { dueDate, manual: dueDate !== derived };
}

export default function NewInvoicePage() {
  const router = useRouter();
  const [clients, setClients] = useState<Client[]>([]);
  const [pastInvoices, setPastInvoices] = useState<Invoice[]>([]);
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [clientId, setClientId] = useState("");
  // The free-invoice draft is read once, on mount: the form is empty then by
  // construction, and the gate never server-renders this page, so lazy
  // initialisers are safe and avoid a setState-in-effect cascade.
  // "Scan an invoice" on the list opens straight into the camera to copy an
  // invoice sent before; the in-page button reads a source document instead.
  // A copy starts from the scan, so a free-invoice draft isn't imported
  // under it (and stays where it is for the Free page).
  // A file handed over by "Upload a file" is a copy too, whatever the
  // address says yet.
  const [copyMode] = useState(() => new URLSearchParams(window.location.search).get("scan") === "1" || uploadMarked());
  const [draft] = useState(() => (copyMode ? null : readFreeInvoiceDraft()));
  const [date, setDate] = useState(() => draft?.date || todayIso());
  const [dueDate, setDueDate] = useState(() => (draft ? importedDueDate(draft, date).dueDate : addDays(date, 30)));
  const [dueDateManual, setDueDateManual] = useState(() => !!draft && importedDueDate(draft, date).manual);
  // A typed fill lands seconds after the tap; it applies to the date as it
  // is then, not as it was when the button was pressed.
  const latestRef = useRef({ date, dueDateManual });
  useEffect(() => {
    latestRef.current = { date, dueDateManual };
  }, [date, dueDateManual]);
  const [paymentTerms, setPaymentTerms] = useState<string>(draft?.paymentTerms ?? "");
  const [items, setItems] = useState<InvoiceItem[]>(() =>
    draft?.lines.length
      ? draft.lines.map(({ description, quantity, unitPrice, vatRate, kind }) => ({
          description,
          quantity,
          unitPrice,
          vatRate: draft.vatRegistered ? (draft.reverseCharge ? "reverse_charge" : vatRate) : "standard",
          // The Free page takes CIS off labour lines only.
          kind: kind === "labour" ? ("labour" as const) : ("materials" as const),
        }))
      : [{ ...BLANK_ITEM }]
  );
  const [cisRate, setCisRateState] = useState<number | null>(() => (draft?.cis.enabled ? draft.cis.rate : null));
  // Once CIS is set by hand, picking a client or copying an invoice leaves it.
  const cisTouchedRef = useRef(!!draft?.cis.enabled);
  // CIS a scanned invoice showed: picking the customer afterwards keeps it
  // unless their own history says otherwise.
  const cisFromScanRef = useRef(false);
  function setCisRate(rate: number | null) {
    cisTouchedRef.current = true;
    cisFromScanRef.current = false;
    setCisRateState(rate);
  }
  // A client's CIS rate is the one on the last invoice made out to them.
  function clientCisRate(forClientId: string, invoices: Invoice[] = pastInvoices): number | null {
    let best: Invoice | null = null;
    for (const inv of invoices) if (inv.clientId === forClientId && inv.status !== "draft" && (!best || inv.date > best.date)) best = inv;
    return best?.cisRate ?? null;
  }
  const [notes, setNotes] = useState<string>(draft?.notes ?? "");
  const [tagsInput, setTagsInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A file picked with "Upload a file" on the list is copied instead of
  // opening the camera.
  const [capture, setCapture] = useState<"copy" | "attach" | null>(() => (copyMode && !uploadMarked() ? "copy" : null));
  const [copied, setCopied] = useState<{ currency: string | null } | null>(null);
  const [typed, setTyped] = useState("");
  const [typing, setTyping] = useState(false);
  const [typedNote, setTypedNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [newCustomer, setNewCustomer] = useState<ScannedCustomer | null>(null);
  const [addingClient, setAddingClient] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [imported, setImported] = useState(!!draft);
  const [addClientError, setAddClientError] = useState<string | null>(null);
  // A copy is applied against the loaded lists, not the render the photo
  // was taken in: with ?scan=1 the camera can beat the load, and matching
  // against an empty client list would offer to add an existing client.
  const listsRef = useRef<Promise<Lists> | null>(null);
  const copiedNotesRef = useRef("");
  // Days from the invoice date to the due date, when copied terms set it.
  const [termsLength, setTermsLength] = useState<number | null>(() => (draft?.paymentTerms ? termsLengthOf(draft.paymentTerms) : null));

  useEffect(() => {
    const load = Promise.all([clientsStore.all(), invoicesStore.all(), businessProfileStore.get()]).then(([c, inv, biz]) => {
      setClients(c);
      setPastInvoices(inv);
      setProfile(biz);
      return { clients: c, pastInvoices: inv, vatRegistered: biz.vatRegistered };
    });
    listsRef.current = load;
  }, []);

  function discardImport() {
    clearFreeInvoiceDraft();
    setItems([{ ...BLANK_ITEM }]);
    cisTouchedRef.current = false;
    cisFromScanRef.current = false;
    setCisRateState(clientCisRate(clientId));
    setNotes("");
    setPaymentTerms("");
    setDueDate(addDays(date, 30));
    setDueDateManual(false);
    setImported(false);
  }

  const billableClients = clients.filter((c) => c.kind === "client" && !c.archived);

  const suggestedItems = useMemo(() => {
    if (!clientId) return [];
    const byDescription = new Map<string, { unitPrice: number; vatRate: VatRateKind; count: number; lastDate: string }>();
    for (const inv of pastInvoices) {
      if (inv.clientId !== clientId) continue;
      for (const item of inv.items) {
        // A deduction (a deposit taken off) isn't something to bill again.
        if (!item.description.trim() || item.quantity < 0) continue;
        const existing = byDescription.get(item.description);
        if (!existing || inv.date > existing.lastDate) {
          byDescription.set(item.description, {
            unitPrice: item.unitPrice,
            vatRate: item.vatRate,
            count: (existing?.count ?? 0) + 1,
            lastDate: inv.date,
          });
        } else {
          existing.count += 1;
        }
      }
    }
    return Array.from(byDescription.entries())
      .map(([description, v]) => ({ description, unitPrice: v.unitPrice, vatRate: v.vatRate, count: v.count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  }, [clientId, pastInvoices]);

  // The VAT rate this client's most recent invoice used for a line with
  // this exact description -- scoped to (client, item), not the item
  // globally, since the same description could mean something differently
  // vat-treated for a different client. Falls back to standard-rated,
  // since most things are.
  function learnedVatRate(forClientId: string, description: string): VatRateKind {
    return pastVatRate(forClientId, description) ?? "standard";
  }

  function pastVatRate(forClientId: string, description: string, invoices: Invoice[] = pastInvoices): VatRateKind | null {
    if (!forClientId || !description.trim()) return null;
    let best: { vatRate: VatRateKind; date: string } | null = null;
    for (const inv of invoices) {
      if (inv.clientId !== forClientId) continue;
      for (const item of inv.items) {
        if (item.description !== description) continue;
        if (!best || inv.date > best.date) best = { vatRate: item.vatRate, date: inv.date };
      }
    }
    return best?.vatRate ?? null;
  }

  function onClientChange(id: string) {
    setClientId(id);
    if (!cisTouchedRef.current) {
      const known = clientCisRate(id);
      setCisRateState((current) => known ?? (cisFromScanRef.current ? current : null));
    }
    const client = clients.find((c) => c.id === id);
    if (client?.paymentTerms && !paymentTerms) applyTerms(client.paymentTerms);
  }

  // Terms that name a number of days set the due date, unless the due date
  // has been typed by hand.
  function applyTerms(text: string) {
    setPaymentTerms(text);
    const days = termsLengthOf(text);
    setTermsLength(days);
    if (days !== null && !dueDateManual) setDueDate(addDays(date, days));
  }

  function addSuggestedItem(description: string, unitPrice: number, vatRate: VatRateKind) {
    setItems((prev) => {
      const emptyIdx = prev.findIndex((it) => !it.description.trim());
      if (emptyIdx >= 0) {
        return prev.map((it, i) => (i === emptyIdx ? { description, quantity: 1, unitPrice, vatRate } : it));
      }
      return [...prev, { description, quantity: 1, unitPrice, vatRate }];
    });
  }

  function onDateChange(value: string) {
    setDate(value);
    if (!dueDateManual) setDueDate(addDays(value, termsLength ?? 30));
  }

  function updateItem(idx: number, patch: Partial<InvoiceItem>) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  // Fires once the description field loses focus rather than on every
  // keystroke, so a manually-typed description gets the learned rate
  // applied once it's actually complete, not on some half-typed prefix.
  // Only applies when the line's rate is still at the "standard" default
  // -- a rate already hand-picked from the dropdown is never silently
  // overridden.
  function onDescriptionBlur(idx: number) {
    setItems((prev) =>
      prev.map((it, i) => {
        if (i !== idx || it.vatRate !== "standard" || !it.description.trim()) return it;
        return { ...it, vatRate: learnedVatRate(clientId, it.description) };
      })
    );
  }

  function addLine() {
    setItems((prev) => [...prev, { ...BLANK_ITEM }]);
  }

  function removeLine(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  async function onDocumentCaptured(file: CapturedFile) {
    setCapture(null);
    setScanning(true);
    setScanError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Please sign in again.");
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ image: file.dataUrl }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Scan failed.");
      const result = body.result as ScanApiResult;

      if (result.date) onDateChange(result.date);
      if (result.notes) setNotes((prev) => prev || result.notes || "");
      if (result.lineItems?.length) {
        setItems(
          result.lineItems.map((li) => ({
            description: li.description,
            quantity: li.quantity,
            unitPrice: li.unitPrice,
            vatRate: learnedVatRate(clientId, li.description),
          }))
        );
      }
    } catch (err) {
      setScanError(err instanceof Error ? err.message : "Scan failed.");
    } finally {
      setScanning(false);
    }
  }

  async function onInvoiceCopied(file: CapturedFile) {
    setCapture(null);
    setScanning(true);
    setScanError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Please sign in again.");
      const res = await fetch("/api/invoice-template", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ images: [file.dataUrl], engine: "claude" }),
      });
      const body = (await res.json().catch(() => ({}))) as { template?: InvoiceTemplate; error?: string };
      if (!res.ok || !body.template) throw new Error(body.error || "Couldn't read the invoice.");
      const lists = await (listsRef.current ?? Promise.resolve(fallbackLists()));
      applyCopy(body.template, lists);
    } catch (err) {
      setScanError(err instanceof Error ? err.message : "Couldn't read the invoice.");
    } finally {
      setScanning(false);
    }
  }

  // Everything a copy fills is replaced on every scan, so "Scan again" can't
  // leave the previous customer, terms or lines behind; notes typed by hand
  // are kept.
  async function fillFromText() {
    setTyping(true);
    setTypedNote(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Please sign in again.");
      const res = await fetch("/api/invoice-from-text", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ text: typed }),
      });
      const body = (await res.json().catch(() => ({}))) as { template?: InvoiceTemplate; vat?: TypedVat; error?: string };
      if (!res.ok || !body.template) throw new Error(body.error || "Couldn't turn that into an invoice.");
      const lists = await (listsRef.current ?? Promise.resolve(fallbackLists()));
      const vat = body.vat ?? null;
      applyCopy(body.template, lists, { vat });
      const warnings = [
        body.template.currency && `The amounts were in ${body.template.currency}; this account invoices in £, so check them.`,
        vat === "included" && !lists.vatRegistered && "You're not VAT registered, so the prices were kept as typed.",
        vat === "plus" && !lists.vatRegistered && "You're not VAT registered, so no VAT is added (turn it on in Settings if you are).",
      ].filter(Boolean);
      setTypedNote({ ok: true, text: ["Filled in from what you typed. Check it before saving.", ...warnings].join(" ") });
    } catch (err) {
      setTypedNote({ ok: false, text: err instanceof Error ? err.message : "Couldn't turn that into an invoice." });
    } finally {
      setTyping(false);
    }
  }

  function fallbackLists(): Lists {
    return { clients, pastInvoices, vatRegistered: profile?.vatRegistered ?? false };
  }

  // A scan shows whether VAT was charged, so its lines follow that; typed
  // text says so only sometimes: said VAT wins over the learned rate, and
  // unsaid VAT falls back to the page's usual default (standard), never to
  // zero. Inc-VAT prices come back to net once the rate is known.
  function lineVatRate(t: InvoiceTemplate, typed: { vat: TypedVat } | undefined, clientId: string, description: string, invoices: Invoice[]): VatRateKind {
    if (typed?.vat === "none") return "zero";
    if (typed?.vat === "plus" || typed?.vat === "included") return "standard";
    const learned = pastVatRate(clientId, description, invoices);
    if (learned) return learned;
    return typed || t.showsVat ? "standard" : "zero";
  }

  // A scan copies a whole invoice, so it starts clean: customer, lines,
  // today's date, terms. Typed text changes only what it says: without a
  // customer it keeps the one already picked, and it keeps the date and
  // terms unless it names terms.
  function applyCopy(t: InvoiceTemplate, lists: Lists, typed?: { vat: TypedVat }) {
    const name = t.customer.name?.trim() ?? "";
    const billable = lists.clients.filter((c) => c.kind === "client" && !c.archived);
    const match = name ? matchSupplier(name, billable) : null;
    // Only the same name is offered back: a fuzzy match could unarchive
    // someone else.
    const archived =
      name && !match ? lists.clients.find((c) => c.kind === "client" && c.archived && normaliseSupplierName(c.name) === normaliseSupplierName(name)) : null;
    const keepClient = !!typed && !name;
    const forClientId = keepClient ? clientId : (match?.id ?? "");
    if (!keepClient) {
      setClientId(forClientId);
      setNewCustomer(
        !match && name
          ? { name: archived?.name ?? name, email: t.customer.email ?? "", address: t.customer.address ?? "", archivedId: archived?.id }
          : null
      );
      setAddClientError(null);
    }

    // A copied CIS invoice stays CIS, at the rate that customer was last
    // invoiced at.
    if (!cisTouchedRef.current) {
      const known = clientCisRate(forClientId, lists.pastInvoices);
      cisFromScanRef.current = !typed && t.cis;
      setCisRateState(cisFromScanRef.current ? (known ?? 20) : known);
    }

    const replaceLines = !typed || t.lineItems.length > 0;
    if (replaceLines) setItems(
      t.lineItems.length
        ? t.lineItems.map((li) => {
            const vatRate = lineVatRate(t, typed, forClientId, li.description, lists.pastInvoices);
            // Model output isn't strictly typed: a missing or text price must
            // not reach the form as NaN.
            const price = Number(li.unitPrice);
            const said = Number.isFinite(price) ? price : 0;
            const quantity = Number(li.quantity);
            const net = typed?.vat === "included" && lists.vatRegistered ? said / (1 + VAT_RATES[vatRate]) : said;
            return {
              description: String(li.description ?? ""),
              // Negative is a real discount or deposit line; only 0 or junk is 1.
              quantity: Number.isFinite(quantity) && quantity !== 0 ? quantity : 1,
              // Four places keep a printed £0.045 and make an inc-VAT price
              // multiply back to the gross that was said.
              unitPrice: Math.round(net * 10000) / 10000,
              vatRate,
              kind: li.kind === "labour" ? ("labour" as const) : ("materials" as const),
            };
          })
        : [{ ...BLANK_ITEM }]
    );

    const days = copiedTermsDays(t);
    const clientDays = match?.paymentTerms ? termsLengthOf(match.paymentTerms) : null;
    if (typed) {
      const length = days ?? (match ? clientDays : null);
      if (length !== null) {
        setPaymentTerms(days !== null ? (days === 0 ? "Upon receipt" : `${days} days`) : (match?.paymentTerms ?? ""));
        setTermsLength(length);
        if (!latestRef.current.dueDateManual) setDueDate(addDays(latestRef.current.date, length));
      }
    } else {
      // A new invoice: dated today whatever the scan says, due by the copied
      // terms (or the client's own), which a later date change keeps following.
      const today = todayIso();
      setDate(today);
      const length = days ?? clientDays;
      setPaymentTerms(days !== null ? (days === 0 ? "Upon receipt" : `${days} days`) : (match?.paymentTerms ?? ""));
      setTermsLength(length);
      setDueDate(addDays(today, length ?? 30));
      setDueDateManual(false);
    }

    // Typed text that says nothing about notes leaves them, and an import
    // whose lines were kept stays an import.
    if (!typed || t.notes) {
      const copiedNotes = t.notes ?? "";
      const previousCopy = copiedNotesRef.current;
      copiedNotesRef.current = copiedNotes;
      // Notes from an imported free invoice go with the rest of the import.
      const replaceImport = imported && replaceLines;
      setNotes((prev) => (replaceImport || !prev.trim() || prev === previousCopy ? copiedNotes : prev));
    }
    // What's filled in now replaces the import; the Free page keeps its draft.
    if (replaceLines) setImported(false);
    setCopied({ currency: t.currency && t.currency !== "GBP" ? t.currency : null });
  }

  async function addScannedClient() {
    if (!newCustomer) return;
    setAddingClient(true);
    setAddClientError(null);
    try {
      if (newCustomer.archivedId) {
        const id = newCustomer.archivedId;
        await clientsStore.unarchive(id);
        setClients((prev) => prev.map((c) => (c.id === id ? { ...c, archived: false } : c)));
        onClientChange(id);
        setNewCustomer(null);
        return;
      }
      const c = await clientsStore.add({
        name: newCustomer.name,
        isCompany: looksLikeCompany(newCustomer.name),
        email: newCustomer.email,
        address: newCustomer.address,
        kind: "client",
        vatNumber: "",
        paymentTerms: "",
        defaultCurrency: "",
        contactPerson: "",
        phone: "",
        remindersEnabled: true,
      });
      setClients((prev) => [...prev, c]);
      setClientId(c.id);
      setNewCustomer(null);
    } catch (err) {
      setAddClientError(err instanceof Error ? err.message : "Could not add the client.");
    } finally {
      setAddingClient(false);
    }
  }

  const totals = computeInvoiceTotals(items, profile?.vatRegistered ?? false);

  async function save() {
    setError(null);
    setSaving(true);
    try {
      // No real invoice number yet -- that's assigned when this is
      // marked sent, not now. See draftPlaceholderNumber for why.
      const inv = await invoicesStore.add({
        clientId,
        date,
        number: draftPlaceholderNumber(),
        items: withKinds(items, cisRate),
        cisRate,
        notes,
        dueDate: dueDate || null,
        paymentTerms,
        status: "draft",
        tags: tagsInput.split(",").map((t) => t.trim()).filter(Boolean),
      });
      if (imported) clearFreeInvoiceDraft();
      router.push(`/invoices/${inv.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save invoice.");
      setSaving(false);
    }
  }


  useEffect(() => {
    if (!uploadMarked()) return;
    const uploaded = takeUploads(window.location.pathname);
    dropUploadMarker();
    Promise.resolve().then(() => (uploaded ? onInvoiceCopied(uploaded.files[0]) : setScanError("Your file didn't come through. Pick it again.")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="space-y-6">
      {capture && (
        <DocumentCapture
          onCapture={capture === "copy" ? onInvoiceCopied : onDocumentCaptured}
          onClose={() => setCapture(null)}
        />
      )}

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">New invoice</h1>
        <CaptureButton
          onOpen={() => setCapture("attach")}
          onCapture={onDocumentCaptured}
          disabled={scanning}
          className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium text-neutral-700 disabled:opacity-50"
        >
          {scanning ? "Reading document…" : (<><CameraIcon /> Scan or attach a document</>)}
        </CaptureButton>
      </div>
      {copyMode ? (
        <div className="-mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-neutral-600">
          <span>
            {copied
              ? "Copied from your scan: customer, lines and terms. Dated today — check everything before saving."
              : "Scan an invoice you've sent before to copy it."}
            {copied?.currency && ` Amounts were in ${copied.currency}; this account invoices in £, so check them.`}
          </span>
          <CaptureButton
            onOpen={() => setCapture("copy")}
            onCapture={onInvoiceCopied}
            disabled={scanning}
            className="font-medium underline disabled:opacity-50"
          >
            {scanning ? "Reading invoice…" : copied ? "Scan again" : "Scan an invoice"}
          </CaptureButton>
          <UploadFilesButton multiple={false} onFiles={(files) => onInvoiceCopied(files[0])} disabled={scanning} buttonClassName="inline-flex items-center gap-1 font-medium underline" />
        </div>
      ) : (
        <p className="text-xs text-neutral-500 -mt-4">
          Scanning fills in the date, line items, and notes from a source document (a timesheet, delivery note,
          etc.) — the client is always your own choice below, never guessed.
        </p>
      )}
      {scanError && <p className="text-sm text-red-600">{scanError}</p>}
      {!copyMode && (
        <div className="rounded-xl border bg-white p-5 text-neutral-900 shadow-sm">
          <label className="text-xs text-neutral-500" htmlFor="describe-invoice">
            Or describe it and it&apos;s filled in for you
          </label>
          <textarea
            id="describe-invoice"
            rows={2}
            className="mt-1 w-full rounded-lg border px-3 py-2"
            placeholder="e.g. Smith Ltd, 3 days plastering at £250 a day plus VAT, 14 days"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
          />
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={fillFromText}
              disabled={typing || !typed.trim()}
              className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {typing ? "Filling in…" : "Fill in the invoice"}
            </button>
            <span className="text-xs text-neutral-500">On a phone you can tap the microphone on the keyboard and say it.</span>
          </div>
          {typedNote && <p className={`mt-2 text-sm ${typedNote.ok ? "text-neutral-600" : "text-red-600"}`}>{typedNote.text}</p>}
        </div>
      )}
      {imported && draft && (
        <p className="text-sm text-blue-600">
          Imported from your free invoice.
          {draft.currencySymbol !== "£" &&
            ` Amounts were entered in ${draft.currencySymbol}; this account invoices in £, so check them before saving.`}
          {draft.number &&
            ` It was numbered ${draft.number} there; here it gets your account's next number when you mark it sent, so if ${draft.number} has already gone to the customer, don't send this one again.`}
          {profile && draft.vatRegistered !== profile.vatRegistered &&
            (profile.vatRegistered
              ? " It had no VAT there, but this account is VAT registered, so 20% has been added to every line: check before saving."
              : " It had VAT there, but this account isn't VAT registered, so no VAT is charged here: check before saving.")}{" "}
          <button type="button" onClick={discardImport} className="font-medium underline">Discard import</button>
        </p>
      )}

      <div className="space-y-3 rounded-xl border bg-white p-5 text-neutral-900 shadow-sm">
        {newCustomer && !clientId && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-neutral-50 px-3 py-2 text-sm">
            <span>
              {newCustomer.archivedId
                ? `${newCustomer.name} is an archived client`
                : `${newCustomer.name} isn't one of your clients yet`}
              {addClientError && <span className="block text-red-600">{addClientError}</span>}
            </span>
            <button
              type="button"
              onClick={addScannedClient}
              disabled={addingClient}
              className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {addingClient ? "Adding…" : newCustomer.archivedId ? "Unarchive and use" : "Add as new client"}
            </button>
          </div>
        )}
        <select className="w-full rounded-lg border px-3 py-2" value={clientId} onChange={(e) => onClientChange(e.target.value)}>
          <option value="">Select a client or company</option>
          {billableClients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>

        {suggestedItems.length > 0 && (
          <div>
            <p className="text-xs text-neutral-500">Used before for this client — tap to add a line:</p>
            <div className="mt-1 flex flex-wrap gap-2">
              {suggestedItems.map((s) => (
                <button
                  key={s.description}
                  type="button"
                  onClick={() => addSuggestedItem(s.description, s.unitPrice, s.vatRate)}
                  className="rounded-full border px-3 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
                >
                  + {s.description} (£{s.unitPrice.toFixed(2)})
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-neutral-500">Invoice date</label>
            <input type="date" className="w-full rounded-lg border px-3 py-2" value={date} onChange={(e) => onDateChange(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-neutral-500">Due date</label>
            <input
              type="date"
              className="w-full rounded-lg border px-3 py-2"
              value={dueDate}
              onChange={(e) => {
                setDueDate(e.target.value);
                setDueDateManual(true);
              }}
            />
          </div>
        </div>
        <input
          className="w-full rounded-lg border px-3 py-2"
          value={paymentTerms}
          onChange={(e) => {
            applyTerms(e.target.value);
          }}
          placeholder="Payment terms (e.g. 30 days)"
        />

        <CisToggle rate={cisRate} onChange={setCisRate} />

        <div className="space-y-2">
          <div className="hidden grid-cols-12 gap-2 px-1 text-xs font-medium text-neutral-500 sm:grid">
            <span className={profile?.vatRegistered ? "col-span-4" : "col-span-6"}>Description</span>
            <span className="col-span-2 text-right">Qty</span>
            <span className="col-span-3 text-right">Unit price</span>
            {profile?.vatRegistered && <span className="col-span-2">VAT</span>}
          </div>
          {items.map((it, idx) => (
            <div key={idx} className="grid grid-cols-12 gap-2 border-b pb-3 sm:border-0 sm:pb-0">
              <input
                className={`col-span-12 ${profile?.vatRegistered ? "sm:col-span-4" : "sm:col-span-6"} rounded-lg border px-3 py-2`}
                placeholder="Description (e.g. Monthly work, 12-30 June)"
                value={it.description}
                onChange={(e) => updateItem(idx, { description: e.target.value })}
                onBlur={() => onDescriptionBlur(idx)}
              />
              <NumberInput
                className={`${profile?.vatRegistered ? "col-span-3" : "col-span-4"} rounded-lg border px-3 py-2 text-right sm:col-span-2`}
                placeholder="Qty"
                aria-label="Quantity"
                value={it.quantity}
                onChange={(quantity) => updateItem(idx, { quantity })}
              />
              <NumberInput
                className={`${profile?.vatRegistered ? "col-span-4" : "col-span-7"} rounded-lg border px-3 py-2 text-right sm:col-span-3`}
                placeholder="Unit price"
                aria-label="Unit price"
                value={it.unitPrice}
                onChange={(unitPrice) => updateItem(idx, { unitPrice })}
              />
              {profile?.vatRegistered && (
                <select
                  aria-label="VAT rate"
                  className="col-span-4 rounded-lg border px-1 py-2 text-xs sm:col-span-2"
                  value={it.vatRate}
                  onChange={(e) => updateItem(idx, { vatRate: e.target.value as VatRateKind })}
                >
                  {VAT_RATE_KINDS.map((k) => <option key={k} value={k}>{VAT_RATE_LABELS[k]}</option>)}
                </select>
              )}
              <button onClick={() => removeLine(idx)} aria-label={`Remove line ${idx + 1}`} className="col-span-1 text-sm text-red-600">✕</button>
              {cisRate !== null && <LineKind item={it} onChange={(kind) => updateItem(idx, { kind })} />}
            </div>
          ))}
          <button onClick={addLine} className="text-sm font-medium text-blue-600">+ Add line</button>
        </div>

        <textarea className="w-full rounded-lg border px-3 py-2" placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
        <input
          className="w-full rounded-lg border px-3 py-2"
          placeholder="Tags, comma separated (optional, e.g. Site A, Q3 job)"
          value={tagsInput}
          onChange={(e) => setTagsInput(e.target.value)}
        />

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="space-y-1 border-t pt-3 text-sm">
          {profile?.vatRegistered && (
            <>
              <div className="flex justify-end text-neutral-600">
                <span>Subtotal: £{totals.subtotal.toFixed(2)}</span>
              </div>
              {totals.vatByRate.map((v) => (
                <div key={v.kind} className="flex justify-end text-neutral-600">
                  <span>{VAT_RATE_LABELS[v.kind]}: £{v.vat.toFixed(2)}</span>
                </div>
              ))}
            </>
          )}
          <div className="flex items-center justify-between pt-1">
            <div className="text-lg font-bold">Total: £{totals.total.toFixed(2)}</div>
            <button onClick={save} disabled={saving} className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
              {saving ? "Saving…" : "Save draft"}
            </button>
          </div>
          <CisSummary items={items} rate={cisRate} total={totals.total} />
          <p className="text-right text-xs text-neutral-500">
            Saves as a draft — fully editable until you mark it sent, which is what assigns its invoice number, locks the rest in, and starts the due-date clock.
          </p>
        </div>
      </div>
    </div>
  );
}
