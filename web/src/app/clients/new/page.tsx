"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ClientKind, clientsStore } from "@/lib/storage";
import { supabase } from "@/lib/supabaseClient";
import type { ScannedContact } from "@/lib/contactExtraction";
import CaptureButton from "@/components/CaptureButton";
import DocumentCapture, { CapturedFile } from "@/components/DocumentCapture";
import { CameraIcon } from "@/components/icons";
import CompanyNameInput from "@/components/CompanyNameInput";
import { RegisterNote, useRegisterCheck } from "@/components/RegisterBits";
import { useCompanyLookup } from "@/lib/companyConfigured";
import { rememberCompany } from "@/lib/companyRegister";
import type { CompanyMatch } from "@/lib/companyLookup";
import AddressFields from "@/components/AddressFields";
import UploadFilesButton from "@/components/UploadFilesButton";
import ClearFormButton from "@/components/ClearFormButton";
import { dropUploadMarker, takeUploads, uploadMarked } from "@/lib/scanHandoff";

async function readContacts(file: CapturedFile): Promise<ScannedContact[]> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Please sign in again.");
  const res = await fetch("/api/contact-scan", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ image: file.dataUrl }),
  });
  const body = (await res.json().catch(() => ({}))) as { contacts?: ScannedContact[]; error?: string };
  if (!res.ok || !body.contacts) throw new Error(body.error || `Couldn't read that (${res.status}).`);
  return body.contacts;
}

export default function NewClientPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const kind: ClientKind = searchParams.get("kind") === "supplier" ? "supplier" : "client";

  const [isCompany, setIsCompany] = useState(true);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [vatNumber, setVatNumber] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [defaultCurrency, setDefaultCurrency] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [phone, setPhone] = useState("");
  const [remindersEnabled, setRemindersEnabled] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // A file picked with "Upload a file" on the list is read instead of
  // opening the camera.
  const [capturing, setCapturing] = useState(() => searchParams.get("scan") === "1" && !uploadMarked());
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [found, setFound] = useState<ScannedContact[]>([]);
  const [picked, setPicked] = useState<number | null>(null);
  // The register entry this name came from, remembered against the saved
  // row so a later check asks for that exact company.
  const [company, setCompany] = useState<CompanyMatch | null>(null);
  const lookupOn = useCompanyLookup();
  const check = useRegisterCheck(isCompany ? name : "", isCompany && company?.name === name ? company.number : null, lookupOn);

  // What the last scan wrote into each field. A field still holding that
  // value belongs to the scan and follows the next pick (cleared when the
  // new contact lacks it); anything typed by hand is left alone unless the
  // new contact has a value for it.
  const scannedRef = useRef({ email: "", address: "", vatNumber: "", contactPerson: "", phone: "" });

  function fill(c: ScannedContact, i: number) {
    setPicked(i);
    setIsCompany(c.isCompany);
    setName(c.name);
    const prev = scannedRef.current;
    const next = { email: c.email ?? "", address: c.address ?? "", vatNumber: c.vatNumber ?? "", contactPerson: c.contactPerson ?? "", phone: c.phone ?? "" };
    const follow = (current: string, was: string, now: string) => (now || current === was ? now : current);
    setEmail((v) => follow(v, prev.email, next.email));
    setAddress((v) => follow(v, prev.address, next.address));
    setVatNumber((v) => follow(v, prev.vatNumber, next.vatNumber));
    setContactPerson((v) => follow(v, prev.contactPerson, next.contactPerson));
    setPhone((v) => follow(v, prev.phone, next.phone));
    scannedRef.current = next;
  }

  async function onScanned(file: CapturedFile) {
    setCapturing(false);
    setReading(true);
    setReadError(null);
    try {
      const contacts = await readContacts(file);
      if (!contacts.length) throw new Error("No names or companies found on that. Try a clearer photo, or type them in.");
      // A supplier is usually who sent the document; a client who it was sent to.
      const preferred = kind === "supplier" ? "issuer" : "recipient";
      const best = Math.max(0, contacts.findIndex((c) => c.role === preferred));
      setFound(contacts);
      fill(contacts[best], best);
    } catch (err) {
      setReadError(err instanceof Error ? err.message : "Couldn't read that.");
    } finally {
      setReading(false);
    }
  }

  const filled = !!(name || email || address || vatNumber || paymentTerms || defaultCurrency || contactPerson || phone || found.length || !isCompany || !remindersEnabled);

  function clearForm() {
    setIsCompany(true);
    setName("");
    setEmail("");
    setAddress("");
    setVatNumber("");
    setPaymentTerms("");
    setDefaultCurrency("");
    setContactPerson("");
    setPhone("");
    setRemindersEnabled(true);
    setError(null);
    setReadError(null);
    setFound([]);
    setPicked(null);
    setCompany(null);
    scannedRef.current = { email: "", address: "", vatNumber: "", contactPerson: "", phone: "" };
  }

  useEffect(() => {
    if (!uploadMarked()) return;
    const uploaded = takeUploads(window.location.pathname);
    dropUploadMarker();
    Promise.resolve().then(() => (uploaded ? onScanned(uploaded.files[0]) : setReadError("Your file didn't come through. Pick it again.")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function addClient(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setError(null);
    setSaving(true);
    try {
      const created = await clientsStore.add({
        name,
        isCompany,
        email,
        address,
        kind,
        vatNumber,
        paymentTerms,
        defaultCurrency,
        contactPerson,
        phone,
        remindersEnabled,
      });
      const known = company ?? check.company;
      if (known) rememberCompany(created.id, known);
      router.push(`/clients?tab=${kind}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save client.");
      setSaving(false);
    }
  }

  if (capturing) {
    return <DocumentCapture onCapture={onScanned} onClose={() => setCapturing(false)} />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">New {kind === "client" ? "client" : "supplier"}</h1>
        <p className="mt-1 text-neutral-600">
          Clients are who you invoice. Suppliers are who invoices or receipts come from.
        </p>
      </div>

      <div className="rounded-xl border bg-white p-5 text-neutral-900 shadow-sm">
        <CaptureButton
          onOpen={() => setCapturing(true)}
          onCapture={onScanned}
          disabled={reading}
          className="inline-flex items-center gap-2 rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
        >
          <CameraIcon className="h-5 w-5" />
          {reading ? "Reading…" : found.length ? "Scan again" : "Scan to fill in"}
        </CaptureButton>
        <UploadFilesButton multiple={false} className="mt-2" onFiles={(files) => onScanned(files[0])} disabled={reading} />
        <p className="mt-2 text-xs text-neutral-500">
          A business card, letterhead, invoice, email or any photo with their details. Names, addresses, emails and VAT numbers are picked out for you.
        </p>
        {readError && <p className="mt-2 text-sm text-red-600">{readError}</p>}
        {found.length > 1 && (
          <div className="mt-3">
            <p className="text-xs text-neutral-500">Found on the page — tap the one you want</p>
            <div className="mt-1 flex flex-wrap gap-2">
              {found.map((c, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => fill(c, i)}
                  className={`rounded-full px-3 py-1 text-xs font-medium ${picked === i ? "bg-neutral-900 text-white" : "border text-neutral-700"}`}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>
        )}
        {found.length > 0 && !reading && <p className="mt-2 text-sm text-neutral-600">Filled in from your scan — check the details below.</p>}
      </div>

      <form onSubmit={addClient} className="space-y-3 rounded-xl border bg-white p-5 text-neutral-900 shadow-sm">
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input type="radio" checked={isCompany} onChange={() => setIsCompany(true)} />
            Company
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" checked={!isCompany} onChange={() => setIsCompany(false)} />
            Individual
          </label>
        </div>
        {isCompany ? (
          <CompanyNameInput
            className="w-full rounded-lg border px-3 py-2"
            placeholder="Company name"
            lookupPlaceholder="Company name (type to search Companies House)"
            value={name}
            onChange={setName}
            address={address}
            onAddress={setAddress}
            onPick={(c, fillAddress) => {
              setName(c.name);
              setCompany(c);
              if (fillAddress) setAddress(fillAddress);
            }}
          />
        ) : (
          <input
            className="w-full rounded-lg border px-3 py-2"
            placeholder="Full name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        )}
        {isCompany && check.company && <p className="text-xs text-neutral-500">Company {check.company.number} on the Companies House register.</p>}
        {isCompany && <RegisterNote check={check} />}
        <input
          className="w-full rounded-lg border px-3 py-2"
          placeholder="Email (optional)"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <AddressFields address={address} onAddress={setAddress} label="Address (optional)" />
        <details className="rounded-lg border p-3" open>
          <summary className="cursor-pointer text-sm font-medium text-neutral-600">More details (optional)</summary>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <input className="rounded-lg border px-3 py-2 text-sm" placeholder="VAT number" value={vatNumber} onChange={(e) => setVatNumber(e.target.value)} />
            <input className="rounded-lg border px-3 py-2 text-sm" placeholder="Contact person" value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} />
            <input className="rounded-lg border px-3 py-2 text-sm" placeholder="Phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
            <input className="rounded-lg border px-3 py-2 text-sm" placeholder="Payment terms (e.g. 30 days)" value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} />
            <input className="rounded-lg border px-3 py-2 text-sm" placeholder="Default currency (e.g. GBP)" value={defaultCurrency} onChange={(e) => setDefaultCurrency(e.target.value)} />
          </div>
        </details>
        {kind === "client" && (
          <label className="flex items-center gap-2 text-sm text-neutral-700">
            <input type="checkbox" checked={remindersEnabled} onChange={(e) => setRemindersEnabled(e.target.checked)} />
            Send automatic payment reminders to this client
          </label>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex items-center justify-between gap-3">
          <button disabled={saving} className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            {saving ? "Saving…" : `Save ${kind}`}
          </button>
          <ClearFormButton onClear={clearForm} disabled={saving || reading || !filled} />
        </div>
      </form>
    </div>
  );
}
