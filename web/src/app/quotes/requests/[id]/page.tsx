"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Compare from "@/components/quoteRequest/Compare";
import OrderLists from "@/components/quoteRequest/OrderLists";
import AnswerEntry from "@/components/quoteRequest/AnswerEntry";
import RequestForm, { MAX_SUPPLIERS } from "@/components/quoteRequest/RequestForm";
import { longDate } from "@/components/invoice/InvoiceDocument";
import { shortDate, when } from "@/components/quoteRequest/dates";
import { Client, businessProfileStore, clientsStore } from "@/lib/storage";
import {
  ANSWER_BADGES,
  ANSWER_LABELS,
  Answer,
  QuoteRequest,
  RequestInput,
  RequestSupplier,
  answerKey,
  offerOf,
  quoteDocumentUrl,
  quoteRequestsStore,
  requestLinkUrl,
  requestSuppliersStore,
} from "@/lib/quoteRequests";
import { Picks, compare, formatPence, planFor, quantityText, supplierTotal } from "@/lib/quoteCompare";
import { todayIso } from "@/lib/freeInvoiceDraft";
import { errorText } from "@/lib/errorText";

const PRIMARY = "rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50";
const SECONDARY = "rounded-lg border px-3 py-1.5 text-sm font-medium text-neutral-700 disabled:opacity-50";
const CARD = "rounded-xl border bg-white p-5 text-neutral-900 shadow-sm";
const NO_ANSWER: Answer = { status: "waiting", prices: {}, delivery: null, vatIncluded: false, validUntil: null, note: "" };

async function fetchAll(id: string) {
  const [request, rows, clients, profile] = await Promise.all([quoteRequestsStore.get(id), requestSuppliersStore.forRequest(id), clientsStore.all(), businessProfileStore.get()]);
  return { request, rows, clients, from: profile.businessName };
}

function answerLine(row: RequestSupplier): string {
  if (row.status === "waiting") return row.sentAt ? `Sent ${when(row.sentAt)}. Waiting for their prices.` : "Not sent yet.";
  const at = when(row.respondedAt!);
  if (row.status === "declined") {
    const why = row.note ? `: ${row.note}` : ".";
    return row.source === "online" ? `Said they can't quote (${at})${why}` : `Marked by you as can't quote (${at})${why}`;
  }
  if (row.source === "online") return `Priced online${row.responderName ? ` by ${row.responderName}` : ""}, ${at}.`;
  return row.source === "scan" ? `Read from their quote, ${at}.` : `Typed in by you, ${at}.`;
}

export default function QuoteRequestPage() {
  const { id } = useParams<{ id: string }>();
  const [request, setRequest] = useState<QuoteRequest | null>(null);
  const [rows, setRows] = useState<RequestSupplier[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [from, setFrom] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const genRef = useRef(0);
  const [entry, setEntry] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  // Shown as well as copied: the clipboard can be refused.
  const [shownLink, setShownLink] = useState<string | null>(null);
  const today = todayIso();

  const apply = (d: Awaited<ReturnType<typeof fetchAll>>) => {
    setRequest(d.request);
    setRows(d.rows);
    setClients(d.clients);
    setFrom(d.from);
  };

  const load = useCallback(() => {
    const gen = genRef.current;
    return fetchAll(id).then((d) => {
      if (gen === genRef.current) apply(d);
    });
  }, [id]);

  useEffect(() => {
    fetchAll(id)
      .then((d) => {
        apply(d);
        if (new URLSearchParams(window.location.search).get("suppliers") === "failed") setError("The request was saved, but the suppliers couldn't be added. Add them below.");
      })
      .catch((err) => setError(errorText(err, "Could not load the request.")))
      .finally(() => setLoading(false));
  }, [id]);

  // Answers arrive while the page is in the background: coming back to it
  // shows them.
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible" && !busyRef.current) load().catch(() => {});
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [load]);

  async function run(action: () => Promise<void>, done?: string) {
    setBusy(true);
    busyRef.current = true;
    genRef.current++;
    setError(null);
    setNotice(null);
    let ok = false;
    try {
      await action();
      ok = true;
    } catch (err) {
      setError(errorText(err, "Something went wrong."));
    }
    await load().catch(() => {});
    busyRef.current = false;
    setBusy(false);
    if (ok && done) setNotice(done);
  }

  const clientOf = useCallback((supplierId: string) => clients.find((c) => c.id === supplierId), [clients]);
  const nameOf = useCallback((row: RequestSupplier) => clientOf(row.supplierId)?.name ?? "Supplier", [clientOf]);
  const replied = useMemo(() => rows.filter((r) => r.status === "replied"), [rows]);
  const offers = useMemo(() => replied.map((r) => offerOf(r, nameOf(r))), [replied, nameOf]);
  const comparison = useMemo(() => compare(offers, request?.items ?? [], today), [offers, request, today]);

  if (loading) return <p className="text-sm text-neutral-500">Loading…</p>;
  if (!request) {
    return (
      <div className="space-y-2">
        {error && <p className="text-sm text-red-600">{error}</p>}
        <p className="text-sm text-neutral-600">Request not found.</p>
        <Link href="/quotes/requests" className="text-sm font-medium text-neutral-900 underline">Back to quotes from suppliers</Link>
      </div>
    );
  }

  const r = request;
  const open = r.status === "open";
  const picks: Picks = r.choice ?? comparison.recommended?.picks ?? {};
  const plan = planFor(offers, r.items, picks);
  const editable = open && rows.every((x) => !x.sentAt && x.status === "waiting");
  const available = clients.filter((c) => c.kind === "supplier" && !c.archived && !rows.some((x) => x.supplierId === c.id));

  if (entry) {
    const row = rows.find((x) => x.id === entry);
    if (row) {
      return (
        <AnswerEntry
          request={r}
          row={row}
          supplierName={nameOf(row)}
          onCancel={() => setEntry(null)}
          onSaved={async () => {
            await load().catch(() => {});
            setEntry(null);
            setNotice(`${nameOf(row)}'s prices are saved.`);
          }}
        />
      );
    }
  }

  if (editing) {
    return (
      <div className="space-y-6">
        <div>
          <button onClick={() => setEditing(false)} className="text-sm text-neutral-500">← Back to the request</button>
          <h1 className="mt-1 text-2xl font-bold">Edit the list</h1>
        </div>
        <RequestForm
          initial={{ title: r.title, items: r.items, notes: r.notes, neededBy: r.neededBy, siteAddress: r.siteAddress }}
          suppliers={null}
          saveLabel="Save changes"
          onSave={async (value: RequestInput) => {
            await quoteRequestsStore.update(r.id, value);
            await load();
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      </div>
    );
  }

  const savePicks = (next: Picks | null) =>
    run(async () => {
      setRequest((prev) => prev && { ...prev, choice: next });
      await quoteRequestsStore.saveChoice(r.id, next);
    });

  const send = (row: RequestSupplier, to: string) =>
    run(async () => {
      await requestSuppliersStore.send(row.id, to);
    }, `Request emailed to ${nameOf(row)} (${to}).`);

  const copyLink = (row: RequestSupplier) =>
    run(async () => {
      if (!row.sentAt) await requestSuppliersStore.markSent(row.id);
      await navigator.clipboard.writeText(requestLinkUrl(row.token)).catch(() => {});
      setShownLink(row.id);
      setCopied(row.id);
      setTimeout(() => setCopied((c) => (c === row.id ? null : c)), 2000);
    });

  const record = (row: RequestSupplier, answer: Answer, message: string, done: string) => {
    if (window.confirm(message)) run(() => requestSuppliersStore.record(row, answer, "manual", answer.status === "declined" ? row.documentPath : null), done);
  };

  const openDocument = (row: RequestSupplier) =>
    run(async () => {
      const url = row.documentPath ? await quoteDocumentUrl(row.documentPath) : null;
      if (!url) throw new Error("Their document couldn't be opened. Try again.");
      window.open(url, "_blank", "noopener");
    });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Link href="/quotes/requests" className="text-sm text-neutral-500">← Quotes from suppliers</Link>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold">{r.title}</h1>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${open ? "bg-neutral-100 text-neutral-800" : "bg-neutral-200 text-neutral-600"}`}>{open ? "Open" : "Closed"}</span>
          </div>
          <p className="mt-1 text-neutral-600">
            {r.items.length} {r.items.length === 1 ? "item" : "items"} · asked {shortDate(r.createdAt)}
            {r.neededBy ? ` · needed by ${shortDate(r.neededBy)}` : ""}
          </p>
        </div>
        {editable && <button onClick={() => setEditing(true)} disabled={busy} className={SECONDARY}>Edit</button>}
      </div>

      {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
      {notice && <p className="text-sm text-neutral-700" role="status">{notice}</p>}

      <section className={CARD} aria-labelledby="list-heading">
        <h2 id="list-heading" className="font-semibold">What you asked for</h2>
        <ul className="mt-2 divide-y text-sm">
          {r.items.map((item) => (
            <li key={item.id} className="flex justify-between gap-3 py-2">
              <span className="min-w-0">
                {item.description}
                {item.note && <span className="block text-xs text-neutral-500">{item.note}</span>}
              </span>
              <span className="shrink-0 text-neutral-600">{quantityText(item)}</span>
            </li>
          ))}
        </ul>
        {(r.neededBy || r.siteAddress || r.notes) && (
          <dl className="mt-3 space-y-1 border-t pt-3 text-sm">
            {r.neededBy && <div className="flex gap-2"><dt className="w-24 shrink-0 text-neutral-500">Needed by</dt><dd>{longDate(r.neededBy)}</dd></div>}
            {r.siteAddress && <div className="flex gap-2"><dt className="w-24 shrink-0 text-neutral-500">Deliver to</dt><dd className="whitespace-pre-line">{r.siteAddress}</dd></div>}
            {r.notes && <div className="flex gap-2"><dt className="w-24 shrink-0 text-neutral-500">Notes</dt><dd className="whitespace-pre-wrap">{r.notes}</dd></div>}
          </dl>
        )}
      </section>

      <section className={CARD} aria-labelledby="suppliers-heading">
        <h2 id="suppliers-heading" className="font-semibold">Suppliers</h2>
        {!rows.length && <p className="mt-1 text-sm text-neutral-600">No suppliers on this request yet.</p>}
        <div className="mt-3 space-y-3">
          {rows.map((row) => {
            const client = clientOf(row.supplierId);
            const email = client?.email?.trim() ?? "";
            const key = answerKey(row);
            const t = row.status === "replied" ? supplierTotal(offerOf(row, ""), r.items) : null;
            return (
              <div key={row.id} className="rounded-lg border p-3" data-testid="supplier-row">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{nameOf(row)}</p>
                    <p className="truncate text-xs text-neutral-500">{email || "No email saved"}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ANSWER_BADGES[key]}`}>{ANSWER_LABELS[key]}</span>
                    {t && (
                      <p className="mt-1 text-sm font-semibold">
                        {formatPence(t.ex)} <span className="text-xs font-normal text-neutral-500">ex VAT</span>
                      </p>
                    )}
                    {t && t.priced < r.items.length && <p className="text-xs text-neutral-500">{t.priced} of {r.items.length} lines</p>}
                  </div>
                </div>
                <p className="mt-1 text-sm text-neutral-600">{answerLine(row)}</p>
                {row.status === "waiting" && !email && open && (
                  <p className="mt-1 text-xs text-neutral-500">
                    Add their email in <Link href="/clients?tab=supplier" className="underline">Clients &amp; suppliers</Link> to send it, or copy the link and text it to them.
                  </p>
                )}
                {open && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {row.status === "waiting" && email && (
                      <button onClick={() => send(row, email)} disabled={busy} className={row.sentAt ? SECONDARY : PRIMARY}>
                        {row.sentAt ? "Send again" : "Email request"}
                      </button>
                    )}
                    {row.status === "waiting" && (
                      <button onClick={() => copyLink(row)} disabled={busy} className={SECONDARY}>
                        {copied === row.id ? "Copied" : "Copy link"}
                      </button>
                    )}
                    <button onClick={() => setEntry(row.id)} disabled={busy} className={SECONDARY}>
                      {row.status === "replied" ? "Change prices" : "Enter prices"}
                    </button>
                    {row.status === "waiting" && (
                      <button
                        onClick={() => record(row, { ...NO_ANSWER, status: "declined" }, `Mark ${nameOf(row)} as can't quote? Their link stops taking prices.`, `${nameOf(row)} marked as can't quote.`)}
                        disabled={busy}
                        className={SECONDARY}
                      >
                        Can&apos;t quote
                      </button>
                    )}
                  </div>
                )}
                {shownLink === row.id && row.status === "waiting" && (
                  <input
                    readOnly
                    aria-label={`${nameOf(row)}'s link`}
                    value={requestLinkUrl(row.token)}
                    onFocus={(e) => e.target.select()}
                    className="mt-2 w-full rounded-lg border bg-neutral-50 px-3 py-2 text-xs text-neutral-700"
                  />
                )}
                {(row.documentPath || open) && (
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                    {row.documentPath && (
                      <button onClick={() => openDocument(row)} disabled={busy} className="font-medium text-neutral-700 underline">Their quote document</button>
                    )}
                    {open && row.status === "waiting" && (
                      <>
                        <a href={`${requestLinkUrl(row.token)}#o`} target="_blank" rel="noopener" className="font-medium text-neutral-700 underline">See their page</a>
                        <button
                          onClick={() => {
                            if (window.confirm(`Stop ${nameOf(row)}'s link? It stops working at once; send or copy the new one.`)) run(() => requestSuppliersStore.replaceToken(row.id), "Old link stopped. Send or copy the new one.");
                          }}
                          disabled={busy}
                          className="font-medium text-neutral-500 underline"
                        >
                          Stop this link
                        </button>
                      </>
                    )}
                    {open && row.status !== "waiting" && (
                      <button
                        onClick={() =>
                          record(row, NO_ANSWER, `Ask ${nameOf(row)} again? Their link opens for new prices; this answer is kept in the request's history.`, `${nameOf(row)} can answer again from their link.`)
                        }
                        disabled={busy}
                        className="font-medium text-neutral-500 underline"
                      >
                        Ask them again
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {open && rows.length < MAX_SUPPLIERS && (
          <div className="mt-4 border-t pt-4">
            {available.length ? (
              <div className="flex gap-2">
                <select aria-label="Add a supplier" className="min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm" value={adding} onChange={(e) => setAdding(e.target.value)}>
                  <option value="">Add a supplier…</option>
                  {available.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <button
                  onClick={() => run(async () => { await requestSuppliersStore.add(r.id, [adding]); setAdding(""); })}
                  disabled={busy || !adding}
                  className={SECONDARY}
                >
                  Add
                </button>
              </div>
            ) : (
              <Link href="/clients/new?kind=supplier" className="text-sm font-medium text-neutral-700 underline">Add a new supplier</Link>
            )}
          </div>
        )}
      </section>

      <Compare
        items={r.items}
        offers={offers}
        comparison={comparison}
        picks={picks}
        own={!!r.choice}
        today={today}
        waiting={rows.filter((x) => x.status === "waiting").map(nameOf)}
        declined={rows.filter((x) => x.status === "declined").map(nameOf)}
        busy={busy}
        onPick={(itemId, offerId) => savePicks({ ...plan.picks, [itemId]: offerId })}
        onUse={(p) => savePicks(p.picks)}
        onFollow={() => savePicks(null)}
      />

      {offers.length > 0 && <OrderLists plan={plan} request={r} from={from} emailOf={(offerId) => clientOf(rows.find((x) => x.id === offerId)?.supplierId ?? "")?.email?.trim() ?? ""} />}

      <div className="flex flex-wrap gap-2">
        {open ? (
          <button
            onClick={() => {
              if (window.confirm("Close this request? Suppliers' links stop taking prices. You can reopen it.")) run(() => quoteRequestsStore.setStatus(r.id, "closed"), "Request closed.");
            }}
            disabled={busy}
            className={SECONDARY}
          >
            Close request
          </button>
        ) : (
          <button onClick={() => run(() => quoteRequestsStore.setStatus(r.id, "open"), "Request reopened.")} disabled={busy} className={SECONDARY}>
            Reopen request
          </button>
        )}
      </div>
    </div>
  );
}
