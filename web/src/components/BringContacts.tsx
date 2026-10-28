"use client";

import { useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { clientsStore, type Client } from "@/lib/storage";
import { parseCsv } from "@/lib/convert";
import { downscaleImageDataUrl } from "@/lib/imageDownscale";
import { loadFailed, saveFailed } from "@/lib/errorText";
import { fileWay, fromRows, fromScanned, fromVcf, settle, toClient, type ImportedContact, type ImportKind } from "@/lib/contactImport";

const readAs = (file: File, how: "text" | "url") =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    if (how === "text") r.readAsText(file);
    else r.readAsDataURL(file);
  });

// Each photo is a paid read and counts against the day's scans.
const MOST_PHOTOS = 20;

type Row = ImportedContact & { tick: boolean };

export default function BringContacts({ contacts, ownName, onAdded }: { contacts: Client[]; ownName: string; onAdded: (added: Client[]) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const busy = useRef(false);
  const [state, setState] = useState<"idle" | "reading" | "saving">("idle");
  const [progress, setProgress] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState("");

  async function scan(file: File, token: string): Promise<ImportedContact[]> {
    const raw = await readAs(file, "url");
    const image = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf") ? raw : await downscaleImageDataUrl(raw, 2000, 0.85);
    const res = await fetch("/api/contact-scan", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ image, engine: "gemini" }),
    });
    const body = (await res.json().catch(() => ({}))) as { contacts?: Parameters<typeof fromScanned>[0]; error?: string };
    if (!res.ok || !body.contacts) throw new Error(body.error || "That one couldn't be read.");
    return fromScanned(body.contacts, ownName);
  }

  async function read(files: File[]) {
    if (busy.current || !files.length) return;
    busy.current = true;
    setState("reading");
    setError(null);
    setDone("");
    const found: ImportedContact[] = [];
    const said: string[] = [];
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const photos = files.filter((f) => fileWay(f) === "scan");
      if (photos.length > MOST_PHOTOS) said.push(`Only the first ${MOST_PHOTOS} photos and PDFs were read. Add the rest in a second go.`);
      let readSoFar = 0;
      for (const file of files) {
        const way = fileWay(file);
        if (way === "rows") {
          const got = fromRows(parseCsv(await readAs(file, "text")));
          if (!got.length) said.push(`${file.name}: no column of names was found in it.`);
          found.push(...got);
        } else if (way === "xlsx") {
          // Loaded only when a spreadsheet is picked: Home is where this box
          // lives, and Home should not carry an unzipper for everybody.
          const { NOT_EXCEL, readXlsx } = await import("@/lib/xlsx");
          try {
            const got = fromRows(readXlsx(new Uint8Array(await file.arrayBuffer())));
            if (!got.length) said.push(`${file.name}: no column of names was found on its first sheet.`);
            found.push(...got);
          } catch {
            said.push(`${file.name}: ${NOT_EXCEL}`);
          }
        } else if (way === "vcard") {
          found.push(...fromVcf(await readAs(file, "text")));
        } else if (way === "excel") {
          said.push(`${file.name}: save it as CSV first (in Numbers or Excel: File, then Export To or Save As, then CSV), and choose that.`);
        } else if (way === "scan") {
          if (readSoFar >= MOST_PHOTOS || !session) continue;
          readSoFar++;
          setProgress(`Reading ${readSoFar} of ${Math.min(photos.length, MOST_PHOTOS)}…`);
          try {
            found.push(...(await scan(file, session.access_token)));
          } catch (err) {
            said.push(`${file.name}: ${loadFailed(err, "that file")}`);
          }
        } else {
          said.push(`${file.name}: that kind of file can't be read for contacts.`);
        }
      }
      const { fresh, already } = settle(found, contacts.filter((c) => !c.archived));
      if (already) said.push(`${already} ${already === 1 ? "is" : "are"} already in your list, so ${already === 1 ? "it was" : "they were"} left out.`);
      if (!fresh.length) {
        setError(found.length ? "Everyone in there is already in your list." : "No customers or suppliers were found in that. Try another file.");
      } else {
        setRows(fresh.map((c) => ({ ...c, tick: true })));
      }
      setNotes(said);
    } catch (err) {
      setError(loadFailed(err, "those files"));
    } finally {
      busy.current = false;
      setState("idle");
      setProgress("");
      if (input.current) input.current.value = "";
    }
  }

  async function save() {
    if (!rows || busy.current) return;
    busy.current = true;
    setState("saving");
    setError(null);
    const added: Client[] = [];
    try {
      for (const r of rows.filter((x) => x.tick)) {
        added.push(await clientsStore.add(toClient(r)));
      }
      const customers = added.filter((c) => c.kind === "client").length;
      const suppliers = added.length - customers;
      setDone(
        `Added ${[customers && `${customers} ${customers === 1 ? "customer" : "customers"}`, suppliers && `${suppliers} ${suppliers === 1 ? "supplier" : "suppliers"}`].filter(Boolean).join(" and ") || "nobody"}. They're in Customers, ready to pick on an invoice.`
      );
      setRows(null);
      setNotes([]);
    } catch (err) {
      // Whoever was saved stays saved; say how far it got.
      setError(`${added.length ? `${added.length} added, then it stopped. ` : ""}${saveFailed(err, "They couldn't be saved.")}`);
      setRows((rs) => rs && rs.filter((r) => !added.some((a) => a.name === r.name && a.kind === r.kind)));
    } finally {
      busy.current = false;
      setState("idle");
      if (added.length) onAdded(added);
    }
  }

  const set = (i: number, patch: Partial<Row>) => setRows((rs) => rs && rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const ticked = rows?.filter((r) => r.tick).length ?? 0;

  return (
    <div className="space-y-3 rounded-xl bg-neutral-50 p-4">
      {!rows && (
        <>
          <p className="text-sm font-medium">Bring your customers and suppliers in</p>
          <p className="text-sm text-neutral-600">
            A spreadsheet from your old app, contacts shared from your phone, or photos and PDFs of old invoices and bills. You see the list before anything is added.
          </p>
          <label aria-disabled={state !== "idle"} className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition active:scale-95 motion-reduce:transition-none">
            {state === "reading" ? progress || "Reading…" : "Choose files"}
            <input
              ref={input}
              type="file"
              multiple
              accept=".csv,.tsv,.txt,.vcf,.xlsx,.xls,.numbers,.ods,text/csv,text/vcard,text/x-vcard,image/*,application/pdf"
              disabled={state !== "idle"}
              className="sr-only"
              onChange={(e) => void read([...(e.target.files ?? [])])}
            />
          </label>
        </>
      )}

      {rows && (
        <div className="space-y-3">
          <p className="text-sm font-medium">
            Found {rows.length}. Untick anyone you don&apos;t want, and say who is a customer and who is a supplier.
          </p>
          {rows.length > 5 && (
            <div className="flex gap-4 text-sm">
              <button type="button" className="font-medium underline" onClick={() => setRows((rs) => rs && rs.map((r) => ({ ...r, tick: true })))}>Tick all</button>
              <button type="button" className="font-medium underline" onClick={() => setRows((rs) => rs && rs.map((r) => ({ ...r, tick: false })))}>Untick all</button>
            </div>
          )}
          <ul className="max-h-96 space-y-2 overflow-y-auto">
            {rows.map((r, i) => (
              <li key={`${r.kind}:${r.name}:${i}`} className="flex items-start gap-3 rounded-lg bg-white p-3 shadow-sm">
                <input type="checkbox" aria-label={`Add ${r.name}`} className="mt-1 h-4 w-4 shrink-0" checked={r.tick} onChange={(e) => set(i, { tick: e.target.checked })} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium wrap-anywhere">{r.name}</span>
                  <span className="block text-xs text-neutral-500 wrap-anywhere">
                    {[r.contactPerson, r.email, r.phone, r.address.split("\n").pop()].filter(Boolean).join(" · ") || "Name only"}
                  </span>
                </span>
                <select
                  aria-label={`${r.name} is a`}
                  value={r.kind}
                  onChange={(e) => set(i, { kind: e.target.value as ImportKind })}
                  className="shrink-0 rounded-lg border bg-white px-2 py-1 text-sm"
                >
                  <option value="client">Customer</option>
                  <option value="supplier">Supplier</option>
                </select>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void save()} disabled={state !== "idle" || !ticked} className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition active:scale-95 disabled:opacity-50 motion-reduce:transition-none">
              {state === "saving" ? "Adding…" : `Add ${ticked}`}
            </button>
            <button type="button" onClick={() => { setRows(null); setNotes([]); }} className="rounded-lg border px-4 py-2 text-sm font-medium text-neutral-700">
              Not now
            </button>
          </div>
        </div>
      )}

      {notes.length > 0 && (
        <ul className="space-y-1 text-sm text-neutral-600">
          {notes.map((n) => <li key={n}>{n}</li>)}
        </ul>
      )}
      <p role="status" className="text-sm text-neutral-800 empty:hidden">{done}</p>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    </div>
  );
}
