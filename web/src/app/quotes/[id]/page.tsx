"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import QuoteDocument, { money, quoteTotal } from "@/components/quote/QuoteDocument";
import QuoteForm, { QuoteFormValue } from "@/components/quote/QuoteForm";
import QuoteSendCard from "@/components/quote/QuoteSendCard";
import { customerContact, customerKind } from "@/components/quote/CustomerPicker";
import { longDate } from "@/components/invoice/InvoiceDocument";
import { greetingName } from "@/lib/customerText";
import { BusinessProfile, Client, Invoice, Quote, QuoteLink, QuoteStatus, businessProfileStore, clientsStore, creditNotesStore, invoicesStore, quoteLinkUrl, quoteLinksStore, quotesStore } from "@/lib/storage";
import { computeInvoiceTotals } from "@/lib/vat";
import { invoiceVat } from "@/lib/invoiceBalance";
import { addDays, todayIso } from "@/lib/freeInvoiceDraft";
import { draftPlaceholderNumber } from "@/lib/invoiceNumber";
import { quoteStatusBadgeClass, quoteStatusLabel, shortDate, termsLength } from "@/lib/quoteStatus";
import { errorText, loadFailed } from "@/lib/errorText";
import { depositDeductions, depositGross, depositLines, depositTag } from "@/lib/quoteDeposit";

type Open = Exclude<QuoteStatus, "invoiced">;

const SECONDARY = "rounded-lg border px-4 py-2 text-sm font-medium text-neutral-700 disabled:opacity-50";
const PRIMARY = "rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50";

async function fetchQuote(id: string) {
  const [quote, clients, profile] = await Promise.all([quotesStore.get(id), clientsStore.all(), businessProfileStore.get()]);
  let orphan: Invoice | null | undefined;
  if (quote?.status === "invoiced" && !quote.invoiceId) {
    orphan = (await invoicesStore.all()).find((inv) => inv.tags.includes(`from ${quote.number}`)) ?? null;
    if (orphan) await quotesStore.linkInvoice(quote.id, orphan.id).catch(() => {});
  }
  // The deposit invoice, or for a deposit claimed but never linked, the one
  // made from it found by its tag (null if there is none).
  let depositInvoice: Invoice | null = null;
  let depositOrphan: Invoice | null | undefined;
  if (quote?.depositInvoiceId) depositInvoice = await invoicesStore.get(quote.depositInvoiceId);
  else if (quote?.depositClaimed) {
    depositOrphan = (await invoicesStore.all()).find((inv) => inv.tags.includes(depositTag(quote.number))) ?? null;
    if (depositOrphan) {
      await quotesStore.linkDeposit(quote.id, depositOrphan.id).catch(() => {});
      depositInvoice = depositOrphan;
    }
  }
  const link = quote ? await quoteLinksStore.forQuote(quote.id).catch(() => null) : null;
  return { quote, clients, profile, orphan, depositInvoice, depositOrphan, link };
}

export default function QuotePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  // An invoiced quote whose link wasn't saved: the invoice made from it,
  // found by its "from Q-..." tag, if there is one.
  const [orphan, setOrphan] = useState<Invoice | null | undefined>(undefined);
  const [depositInvoice, setDepositInvoice] = useState<Invoice | null>(null);
  const [depositOrphan, setDepositOrphan] = useState<Invoice | null | undefined>(undefined);
  const [link, setLink] = useState<QuoteLink | null>(null);
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  // Bumped by every write, so a refresh that started before it can't put
  // the older row back when it lands.
  const genRef = useRef(0);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    const gen = genRef.current;
    return fetchQuote(id).then((d) => {
      if (gen !== genRef.current) return;
      setQuote(d.quote);
    setClients(d.clients);
    setProfile(d.profile);
      setOrphan(d.orphan);
      setDepositInvoice(d.depositInvoice);
      setDepositOrphan(d.depositOrphan);
      setLink(d.link);
    });
  }, [id]);

  useEffect(() => {
    fetchQuote(id)
      .then((d) => {
        setQuote(d.quote);
        setClients(d.clients);
        setProfile(d.profile);
        setOrphan(d.orphan);
        setDepositInvoice(d.depositInvoice);
        setDepositOrphan(d.depositOrphan);
        setLink(d.link);
      })
      .catch((err) => setError(loadFailed(err, "this quote")))
      .finally(() => setLoading(false));
  }, [id]);

  // Coming back to the tab picks up changes made on another device, so an
  // old copy isn't sent or invoiced.
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

  async function run(action: () => Promise<void>) {
    setBusy(true);
    busyRef.current = true;
    genRef.current++;
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(errorText(err, "Something went wrong."));
      await load().catch(() => {});
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  if (loading) return <p className="text-sm text-neutral-500">Loading…</p>;
  if (!quote) {
    return (
      <div className="space-y-2">
        {error && <p className="text-sm text-red-600">{error}</p>}
        <p className="text-sm text-neutral-600">Quote not found.</p>
        <Link href="/quotes" className="text-sm font-medium text-blue-600">Back to quotes</Link>
      </div>
    );
  }

  const q = quote;
  const client = clients.find((c) => c.id === q.clientId) ?? null;
  // A sent quote keeps the VAT setting it was priced under (migration-033),
  // so the owner sees exactly what the customer sees on the link. A draft,
  // and every quote from before that column, follows the setting.
  const vatRegistered = q.vatRegistered ?? profile?.vatRegistered ?? false;
  // The document, the PDF and the summary must all say the same thing: the
  // page used to total the quote from the snapshot while the sheet below it
  // still used today's setting, so one said £4,000 and the other £4,800.
  const docProfile = profile ? { ...profile, vatRegistered } : profile;
  const today = todayIso();
  const total = quoteTotal(q, vatRegistered);
  const invoiceId = q.invoiceId ?? orphan?.id ?? null;
  const depositAmount = depositGross(q, vatRegistered);
  // A deposit still to invoice: asked for, quote accepted, none made yet.
  const depositDue = q.status === "accepted" && depositAmount && !q.depositClaimed && !depositInvoice ? depositAmount : null;
  const openDeposit = depositInvoice && depositInvoice.status !== "paid" && depositInvoice.status !== "draft" ? depositInvoice : null;

  const setStatus = (status: Open) => {
    // A deposit invoice outlives the deal: its reminders keep going until
    // it's paid or credited, so say so before backing out of the quote.
    if ((status === "declined" || status === "sent") && q.status === "accepted" && openDeposit && !window.confirm(`The deposit invoice ${openDeposit.number} is still open, and its payment reminders will keep going until it's paid or credited. Carry on? You can add a credit note on the invoice's page.`)) return;
    if (status === "declined" && q.status === "sent" && openDeposit && !window.confirm(`The deposit invoice ${openDeposit.number} is still open. Mark the quote declined anyway?`)) return;
    return runStatus(status);
  };
  const runStatus = (status: Open) =>
    run(async () => {
      await quotesStore.setStatus(q.id, status, q.status);
      setQuote({ ...q, status });
    });

  async function saveEdit(v: QuoteFormValue) {
    genRef.current++;
    await quotesStore.updateDraft(q.id, { ...v, validUntil: v.validUntil || null });
    setQuote({ ...q, ...v, validUntil: v.validUntil || null });
    setEditing(false);
  }

  // Claim the quote, make the draft invoice from the claimed row, then link
  // it. The claim stops a second tap or tab making a second invoice. If the
  // invoice seems not to have been made, look for it before releasing the
  // claim: a lost reply can hide an invoice that was. With a deposit already
  // invoiced, the final invoice takes it off.
  const toInvoice = () =>
    run(async () => {
      const before = q.status as Open;
      const claimed = await quotesStore.claimForInvoice(q.id, before);
      if (!claimed) throw new Error("This quote has changed since the page loaded (already invoiced, or answered online). Reload to see it.");
      const tag = `from ${claimed.number}`;
      let deposit: Invoice | null = null;
      let credited = 0;
      try {
        if (claimed.depositClaimed && !claimed.depositInvoiceId)
          throw new Error("The deposit invoice can't be found: it may still be being made, or it was removed. Reload the page to see which.");
        deposit = claimed.depositInvoiceId ? await invoicesStore.get(claimed.depositInvoiceId) : null;
        if (deposit?.status === "draft") throw new Error("The deposit invoice is still a draft. Send it first, so the final invoice can take it off.");
        if (deposit) {
          credited = (await creditNotesStore.forInvoice(deposit.id)).reduce((sum, c) => sum + c.amount, 0);
          const depositTotal = computeInvoiceTotals(deposit.items, invoiceVat(deposit, vatRegistered)).total - credited;
          if (depositTotal > computeInvoiceTotals(claimed.items, vatRegistered).total + 0.005)
            throw new Error("The deposit invoice is for more than the whole quote, so the balance would be negative. Check the deposit invoice.");
        }
      } catch (err) {
        await quotesStore.releaseClaim(q.id, before).catch(() => {});
        throw err;
      }
      const terms = (await clientsStore.all()).find((c) => c.id === claimed.clientId)?.paymentTerms ?? "";
      let invoice: Invoice;
      try {
        const date = todayIso();
        invoice = await invoicesStore.add({
          clientId: claimed.clientId,
          date,
          number: draftPlaceholderNumber(),
          items: [...claimed.items, ...(deposit ? depositDeductions(deposit, credited, invoiceVat(deposit, vatRegistered)) : [])],
          notes: claimed.notes,
          dueDate: addDays(date, termsLength(terms) ?? 30),
          paymentTerms: terms,
          status: "draft",
          tags: [tag],
        });
      } catch (err) {
        // If even the lookup fails, the claim stays: the page's recovery
        // finds or releases it later, rather than risk a second invoice.
        const made = (await invoicesStore.all()).find((inv) => inv.tags.includes(tag));
        if (!made) {
          await quotesStore.releaseClaim(q.id, before).catch(() => {});
          throw err;
        }
        invoice = made;
      }
      const linked = await quotesStore.linkInvoice(q.id, invoice.id).catch(() => true);
      if (!linked) throw new Error("Another invoice was linked to this quote at the same time (another tab?). A second draft invoice was made: check Invoices and keep one.");
      router.push(`/invoices/${invoice.id}`);
    });

  // The deposit goes out as its own invoice, due in 7 days: it books the
  // work. Claimed and recovered the same way as the final invoice.
  const toDepositInvoice = () =>
    run(async () => {
      const claimed = await quotesStore.claimDeposit(q.id);
      if (!claimed) throw new Error("The deposit has already been invoiced, or the quote isn't accepted.");
      const tag = depositTag(claimed.number);
      let invoice: Invoice;
      try {
        const date = todayIso();
        invoice = await invoicesStore.add({
          clientId: claimed.clientId,
          date,
          number: draftPlaceholderNumber(),
          items: depositLines(claimed, vatRegistered),
          notes: `Deposit to book the work quoted in ${claimed.number}. The balance will be invoiced when the work is done.`,
          dueDate: addDays(date, 7),
          paymentTerms: "7 days",
          status: "draft",
          tags: [tag],
        });
      } catch (err) {
        const made = (await invoicesStore.all()).find((inv) => inv.tags.includes(tag));
        if (!made) {
          await quotesStore.releaseDeposit(q.id).catch(() => {});
          throw err;
        }
        invoice = made;
      }
      const linked = await quotesStore.linkDeposit(q.id, invoice.id).catch(() => true);
      if (!linked) throw new Error("Another deposit invoice was linked to this quote at the same time (another tab?). A second draft was made: check Invoices and keep one.");
      router.push(`/invoices/${invoice.id}`);
    });

  // A quote can only be answered once it's sent, so sharing its link marks
  // a draft as sent. Copying it or putting it in a text does that first;
  // emailing leaves it to a send that worked (onSent), so a failed email
  // doesn't lock the draft.
  async function ensureLink(markSent = false): Promise<string> {
    if (markSent && q.status === "draft" && (await quotesStore.markSent(q.id))) setQuote((prev) => (prev && prev.status === "draft" ? { ...prev, status: "sent" } : prev));
    const made = await quoteLinksStore.ensure(q.id);
    setLink(made);
    return quoteLinkUrl(made.token);
  }

  async function copyLink() {
    if (q.status === "draft" && !window.confirm("Sharing the link sends the quote: it's marked as sent and can't be edited after. Carry on?")) return;
    setLinkBusy(true);
    setError(null);
    try {
      await navigator.clipboard.writeText(await ensureLink(true)).catch(() => {});
      setLinkCopied(true);
    } catch (err) {
      setError(errorText(err, "Couldn't make the link."));
    } finally {
      setLinkBusy(false);
    }
  }

  // Putting the link in a text or WhatsApp shares it, so it sends a draft
  // just as copying it does.
  async function linkForText(): Promise<string> {
    if (q.status === "draft" && !window.confirm("Adding the link sends the quote: it's marked as sent and can't be edited after. Carry on?")) return "";
    return ensureLink(true);
  }

  async function replaceLink() {
    if (!window.confirm("The current link will stop working straight away, for anyone who has it. Make a new one?")) return;
    setLinkBusy(true);
    setError(null);
    try {
      setLink(await quoteLinksStore.replace(q.id));
      setLinkCopied(false);
    } catch (err) {
      setError(errorText(err, "Couldn't replace the link."));
    } finally {
      setLinkBusy(false);
    }
  }

  const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });

  if (editing) {
    return (
      <div className="space-y-6">
        <div>
          <button onClick={() => setEditing(false)} className="text-sm text-neutral-500">← Back to the quote</button>
          <h1 className="mt-1 text-2xl font-bold">Edit quote {q.number}</h1>
        </div>
        <QuoteForm
          initial={{ clientId: q.clientId, number: q.number, date: q.date, validUntil: q.validUntil ?? "", items: q.items, notes: q.notes, deposit: q.deposit }}
          clients={clients}
          vatRegistered={vatRegistered}
          saveLabel="Save changes"
          onSave={saveEdit}
          onCancel={() => setEditing(false)}
          onClientAdded={(c) => {
            // A refresh started before the add would drop the new customer.
            genRef.current++;
            setClients((prev) => [...prev.filter((p) => p.id !== c.id), c]);
          }}
        />
      </div>
    );
  }

  const sending = q.status === "draft" || q.status === "sent" || q.status === "accepted";
  const answeredOnline = link?.response && (link.response === "declined" ? q.status === "declined" : q.status === "accepted" || q.status === "invoiced") ? link : null;
  const contact = client ? customerContact(client) : "";
  const validUntil = q.validUntil ? longDate(q.validUntil) : "";
  const url = link ? quoteLinkUrl(link.token) : "";

  const linkSection = (
    <>
      {link ? (
        <>
          <p className="mt-1 text-sm text-neutral-600">
            {link.viewCount > 0
              ? `Opened ${link.viewCount === 1 ? "once" : `${link.viewCount} times`}: first ${when(link.firstViewedAt!)}${link.viewCount > 1 ? `, last ${when(link.lastViewedAt!)}` : ""}.`
              : "Not opened yet."}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input readOnly aria-label="Quote link" value={url} className="min-w-0 flex-1 rounded-lg border bg-neutral-50 px-3 py-2 text-xs text-neutral-700" onFocus={(e) => e.target.select()} />
            <button onClick={copyLink} disabled={linkBusy} className="rounded-lg border px-3 py-2 text-sm font-medium text-neutral-700 disabled:opacity-50">
              {linkCopied ? "Copied" : "Copy link"}
            </button>
            <a href={`${url}#o`} target="_blank" rel="noopener" className="rounded-lg border px-3 py-2 text-sm font-medium text-neutral-700">
              Open
            </a>
          </div>
          <button onClick={replaceLink} disabled={linkBusy} className="mt-2 text-xs font-medium text-neutral-500 underline disabled:opacity-50">
            Stop this link and make a new one
          </button>
        </>
      ) : (
        <>
          <p className="mt-1 text-sm text-neutral-600">
            A private link where your customer can see the quote and accept or decline it. You&apos;ll see when they open it and get a notification when they answer. Emails include it, and a text or WhatsApp can.
          </p>
          <button onClick={copyLink} disabled={linkBusy} className="mt-2 rounded-lg border px-3 py-2 text-sm font-medium text-neutral-700 disabled:opacity-50">
            {linkBusy ? "Making the link…" : "Make and copy the link"}
          </button>
        </>
      )}
    </>
  );

  return (
    <div className="space-y-6">
      <div className="print:hidden">
        <Link href="/quotes" className="text-sm text-neutral-500">← Quotes</Link>
        <div className="mt-1 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold">Quote {q.number}</h1>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${quoteStatusBadgeClass(q, today)}`}>{quoteStatusLabel(q, today)}</span>
            </div>
            <p className="mt-1 text-neutral-600">Dated {longDate(q.date)}</p>
          </div>
          <div className="flex shrink-0 gap-2">
            {q.status === "draft" && (
              <button onClick={() => setEditing(true)} disabled={busy} className={SECONDARY}>Edit</button>
            )}
            {!sending && <button onClick={() => window.print()} className={SECONDARY}>Print</button>}
          </div>
        </div>
      </div>

      {error && <p className="text-sm text-red-600 print:hidden">{error}</p>}

      <div className="rounded-xl border bg-white p-5 text-neutral-900 shadow-sm print:hidden">
        <p className="text-xs text-neutral-500">For</p>
        <p className="font-medium">{client?.name ?? "No client"}</p>
        {client && <p className="text-sm text-neutral-600">{customerKind(client)}</p>}
        {contact && <p className="break-words text-sm text-neutral-500">{contact}</p>}
        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t pt-4 sm:grid-cols-3">
          <div className="col-span-2 sm:col-span-1">
            <dt className="text-xs text-neutral-500">Total{vatRegistered ? " incl. VAT" : ""}</dt>
            <dd className="text-2xl font-bold">{money(total)}</dd>
          </div>
          <div>
            <dt className="text-xs text-neutral-500">Deposit</dt>
            <dd className="font-semibold">
              {depositAmount ? money(depositAmount) : "None"}
              {depositAmount && q.deposit?.kind === "percent" ? <span className="font-normal text-neutral-500"> ({q.deposit.value}%)</span> : null}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-neutral-500">Valid until</dt>
            <dd className="font-semibold">{q.validUntil ? shortDate(q.validUntil) : "No end date"}</dd>
          </div>
        </dl>
      </div>

      <div className="rounded-xl border bg-white p-5 text-neutral-900 shadow-sm print:hidden">
        {answeredOnline && (
          <p className={`mb-2 text-sm font-medium ${answeredOnline.response === "accepted" ? "text-green-800" : "text-neutral-700"}`}>
            {answeredOnline.response === "accepted" ? "Accepted" : "Declined"} online{answeredOnline.responderName ? ` by ${answeredOnline.responderName}` : ""}
            {answeredOnline.respondedAt ? `, ${when(answeredOnline.respondedAt)}` : ""}.
          </p>
        )}
        {q.status === "invoiced" ? (
          invoiceId ? (
            <p className="text-sm text-neutral-700">
              Turned into an invoice.{" "}
              <Link href={`/invoices/${invoiceId}`} className="font-medium text-blue-600">Open the invoice</Link>
            </p>
          ) : (
            <div className="space-y-3 text-sm text-neutral-700">
              <p>This quote was being turned into an invoice, but no invoice from it can be found.</p>
              <button
                onClick={() => {
                  if (window.confirm("Only do this if no invoice is being made from this quote in another tab or on another device. Put it back?"))
                    run(async () => { await quotesStore.releaseClaim(q.id, "accepted"); await load(); });
                }}
                disabled={busy}
                className={SECONDARY}
              >
                Put it back to accepted
              </button>
            </div>
          )
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-neutral-700">
              {q.status === "draft" && "Not sent yet. Send it below, or mark it sent if you gave it to them another way."}
              {q.status === "sent" && "Waiting on the customer. When they say yes, mark it accepted."}
              {q.status === "accepted" &&
                (depositDue
                  ? `Accepted. Invoice the ${money(depositDue)} deposit to book the work, or turn the whole quote into an invoice.`
                  : depositInvoice
                    ? "Accepted, deposit invoiced. Invoice the balance when the work is done."
                    : "Accepted. Turn it into an invoice when you're ready to bill.")}
              {q.status === "declined" &&
                (openDeposit
                  ? `Declined. The deposit invoice ${openDeposit.number} is still open and will keep being chased: credit it on its page if it won't be paid.`
                  : "Declined. Reopen it if they change their mind.")}
            </p>
            <div className="flex flex-wrap gap-2">
              {depositDue && (
                <button onClick={toDepositInvoice} disabled={busy} className={`${PRIMARY} w-full sm:w-auto`}>
                  {busy ? "Working…" : "Invoice the deposit"}
                </button>
              )}
              {q.status === "sent" && <button onClick={() => setStatus("accepted")} disabled={busy} className={`${PRIMARY} w-full sm:w-auto`}>Accepted</button>}
              {q.status === "accepted" && (
                <button onClick={toInvoice} disabled={busy} className={depositDue ? SECONDARY : `${PRIMARY} w-full sm:w-auto`}>
                  {busy ? "Working…" : depositInvoice ? "Invoice the balance" : "Turn into invoice"}
                </button>
              )}
              {q.status === "draft" && <button onClick={() => setStatus("sent")} disabled={busy} className={SECONDARY}>Mark as sent</button>}
              {q.status === "draft" && <button onClick={() => setStatus("accepted")} disabled={busy} className={SECONDARY}>Accepted</button>}
              {(q.status === "draft" || q.status === "sent") && <button onClick={() => setStatus("declined")} disabled={busy} className={SECONDARY}>Declined</button>}
              {(q.status === "draft" || q.status === "sent") && (
                <button onClick={toInvoice} disabled={busy} className={SECONDARY}>
                  {busy ? "Working…" : depositInvoice ? "Invoice the balance" : "Turn into invoice"}
                </button>
              )}
              {q.status === "accepted" && <button onClick={() => setStatus("sent")} disabled={busy} className={SECONDARY}>Not accepted after all</button>}
              {q.status === "declined" && <button onClick={() => setStatus("sent")} disabled={busy} className={SECONDARY}>Reopen</button>}
            </div>
          </div>
        )}
        {depositInvoice && (
          <p className="mt-3 border-t pt-3 text-sm text-neutral-700">
            Deposit invoiced ({depositInvoice.status === "draft" ? "draft, not sent yet" : depositInvoice.status}).{" "}
            <Link href={`/invoices/${depositInvoice.id}`} className="font-medium text-blue-600">Open the deposit invoice</Link>
          </p>
        )}
        {q.depositClaimed && !depositInvoice && depositOrphan === null && (
          <div className="mt-3 space-y-2 border-t pt-3 text-sm text-neutral-700">
            <p>The deposit invoice can&apos;t be found: it was removed, or it&apos;s still being made in another tab. Clear it to make it again or to invoice the whole quote without it.</p>
            <button
              onClick={() => {
                if (window.confirm("Only do this if no deposit invoice is being made in another tab or on another device. Clear it?"))
                  run(async () => { await quotesStore.releaseDeposit(q.id); await load(); });
              }}
              disabled={busy}
              className={SECONDARY}
            >
              Let me invoice the deposit again
            </button>
          </div>
        )}
      </div>

      {/* Payment options (taking the deposit or the total from the customer's
          link) belong beside sending, once there's a payment provider. */}
      {sending ? (
        <QuoteSendCard
          sheet={<QuoteDocument quote={q} client={client} profile={docProfile} />}
          pdfKey={JSON.stringify([q.number, q.date, q.validUntil, q.items, q.notes, q.deposit, client, profile])}
          quoteId={q.id}
          // A draft's link shows nothing to the customer, so it isn't put in
          // shared text until the quote has gone (the email makes its own).
          viewUrl={q.status === "draft" ? "" : url}
          ensureViewUrl={() => ensureLink()}
          fields={{
            issuerName: profile?.businessName ?? "",
            issuerEmail: "",
            customerName: client ? greetingName(client.name, client.isCompany, client.contactPerson) || client.name : "",
            customerEmail: client?.email ?? "",
            number: q.number,
            total: money(total),
            dueDate: validUntil,
            bank: [],
          }}
          onSent={() => {
            quotesStore
              .markSent(q.id)
              .then((changed) => {
                if (changed) setQuote((prev) => (prev && prev.status === "draft" ? { ...prev, status: "sent" } : prev));
              })
              .catch((err) => setError(errorText(err, "Sent, but the quote couldn't be marked as sent.")));
          }}
          client={client}
          textLink={q.status === "draft" ? "" : url}
          makeTextLink={linkForText}
          summary={{ total: money(total), validUntil }}
        >
          <div className="mt-5 border-t pt-4">
            <h3 className="text-sm font-semibold">View and accept online</h3>
            {linkSection}
          </div>
        </QuoteSendCard>
      ) : (
        link && (
          <div className="rounded-xl border bg-white p-5 text-neutral-900 shadow-sm print:hidden">
            <h2 className="font-semibold">View and accept online</h2>
            {linkSection}
          </div>
        )
      )}

      <div className="overflow-x-auto rounded-xl border bg-white p-4 text-neutral-900 shadow-sm sm:p-6 print:overflow-visible print:rounded-none print:border-0 print:p-0 print:shadow-none">
        <QuoteDocument quote={q} client={client} profile={docProfile} />
      </div>
    </div>
  );
}
