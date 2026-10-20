"use client";

import Link from "next/link";
import { amountOrNull, money } from "@/lib/money";
import { useEffect, useState, useRef } from "react";
import { Receipt, receiptsStore } from "@/lib/storage";
import {
  MILEAGE_CATEGORY,
  MILEAGE_VENDOR,
  RATES,
  VEHICLES,
  Vehicle,
  claimFor,
  milesSoFar,
  roadEstimate,
  taxYearLabel,
  taxYearStart,
  tripOf,
} from "@/lib/mileage";
import { normalisePostcode } from "@/lib/addressLookup";
import { supabase } from "@/lib/supabaseClient";
import { errorText, loadFailed, saveFailed } from "@/lib/errorText";
import { todayISO } from "@/lib/today";
import { shortDate } from "@/lib/dates";
import Tip from "@/components/Tip";

const INPUT = "w-full rounded-lg border px-3 py-2 text-base sm:text-sm";

const todayIso = () => todayISO();

// Business miles at HMRC's rates. Each trip is saved as an ordinary expense,
// so it shows in the expense totals and the tax estimate like any other.
// Named so the miles box can carry the refusal itself; see
// harness/test-error-on-the-field.mjs.
const NO_MILES = "How many miles was it?";

const NEED_POSTCODES = "Put a postcode at each end and I'll work out roughly how far it is.";

export default function MileagePage() {
  const [receipts, setReceipts] = useState<Receipt[] | null>(null);
  const [date, setDate] = useState(todayIso);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [miles, setMiles] = useState("");
  const [vehicle, setVehicle] = useState<Vehicle>("car");
  const [purpose, setPurpose] = useState("");
  const [saving, setSaving] = useState(false);
  // A ref, not the `disabled` state: React applies `disabled` on the render
  // AFTER the first press, and both handlers close over the same state, so two
  // presses in one tick both go through -- and this one claims the same trip twice.
  const savingTrip = useRef(false);
  // The form empties itself and the trip joins the list below, which is
  // plain enough to look at and silent to a screen reader.
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Apart from the form's error, which Save clears. While the trips haven't
  // loaded the miles already claimed are unknown, and pricing at 0 put every
  // mile at 45p for somebody already past 10,000.
  const [loadError, setLoadError] = useState<string | null>(null);
  const [measuring, setMeasuring] = useState(false);
  const [measured, setMeasured] = useState<string | null>(null);

  useEffect(() => {
    receiptsStore
      .all()
      .then(setReceipts)
      .catch((err) => setLoadError(loadFailed(err, "your trips")));
  }, []);

  const trips = (receipts ?? []).filter((r) => tripOf(r));
  const year = taxYearStart(date);
  const thisYear = trips.filter((r) => taxYearStart(r.date) === year);
  const yearMiles = thisYear.reduce((sum, r) => sum + (tripOf(r)?.miles ?? 0), 0);
  const yearClaimed = thisYear.reduce((sum, r) => sum + r.amount, 0);
  const already = receipts ? milesSoFar(receipts, date, vehicle) : 0;
  // "-5" passed the old `!milesNum` check and saved a negative expense, and
  // "1,200" read as 1 mile. Nothing below zero is a trip.
  const milesNum = Math.max(0, amountOrNull(miles) ?? 0);
  const claim = claimFor(milesNum, vehicle, already);
  const left = Math.max(0, RATES[vehicle].threshold - already);

  // Two postcodes give a straight line; the suggestion adds the usual road
  // detour, and it's only a suggestion -- the miles stay his to set.
  async function measure() {
    const a = normalisePostcode(from);
    const b = normalisePostcode(to);
    if (!a || !b) {
      setMeasured(NEED_POSTCODES);
      return;
    }
    setMeasuring(true);
    setMeasured(null);
    try {
      const { data } = await supabase.auth.getSession();
      const headers = { "Content-Type": "application/json", ...(data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {}) };
      const at = await Promise.all(
        [a, b].map(async (pc) => {
          // Every throw in this block has to be our own sentence, because
          // errorText shows it as written: offline, fetch throws "Load failed".
          const res = await fetch("/api/address-search", { method: "POST", headers, body: JSON.stringify({ q: pc, where: true }) }).catch(() => {
            throw new Error("Couldn't reach the postcode lookup. Check your connection, or type the miles in.");
          });
          if (!res.ok) throw new Error("Couldn't work that out just now. Type the miles in.");
          const body = (await res.json().catch(() => ({}))) as { at?: { lat: number; lon: number } };
          return body.at ?? null;
        })
      );
      if (!at[0] || !at[1]) throw new Error("Couldn't find one of those postcodes.");
      const estimate = roadEstimate(at[0], at[1]);
      setMiles(String(estimate));
      setMeasured(`About ${estimate} miles each way by road. Change it if you went another way.`);
    } catch (err) {
      setMeasured(errorText(err, "Couldn't work that out. Type the miles in."));
    } finally {
      setMeasuring(false);
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!milesNum) return setError(NO_MILES);
    if (savingTrip.current) return;
    savingTrip.current = true;
    setSaving(true);
    setError(null);
    setSaved(null);
    try {
      let priced = claim;
      if (!receipts) {
        let fresh: Receipt[];
        try {
          fresh = await receiptsStore.all();
        } catch (err) {
          console.error("mileage: trips", err);
          setError("Couldn't load this tax year's trips, so the rate can't be worked out yet. Check your connection and try again.");
          return;
        }
        setReceipts(fresh);
        setLoadError(null);
        priced = claimFor(milesNum, vehicle, milesSoFar(fresh, date, vehicle));
      }
      const saved = await receiptsStore.add({
        clientId: "",
        date,
        vendor: MILEAGE_VENDOR,
        category: MILEAGE_CATEGORY,
        amount: priced.amount,
        vatAmount: 0,
        originalAmount: null,
        originalVatAmount: null,
        originalCurrency: null,
        fxRate: null,
        imageDataUrl: null,
        notes: [purpose, `${milesNum} miles${from || to ? `, ${[from, to].filter(Boolean).join(" to ")}` : ""}`].filter(Boolean).join(" — "),
        starred: false,
        needsReview: false,
        warrantyMonths: null,
        tags: [],
        lineItems: [],
        documentType: "other",
        invoiceNumber: null,
        dueDate: null,
        paid: true,
        details: { mileage: { miles: milesNum, from, to, vehicle, rate: milesNum ? Math.round((priced.amount / milesNum) * 1000) / 1000 : RATES[vehicle].first, purpose } },
        creditOfReceiptId: null,
      });
      setReceipts((prev) => [saved, ...(prev ?? [])]);
      setSaved(`${milesNum} miles saved as an expense, ${money(priced.amount)}.`);
      setMiles("");
      setPurpose("");
      setMeasured(null);
    } catch (err) {
      setError(saveFailed(err, "Couldn't save that trip."));
    } finally {
      savingTrip.current = false;
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/expenses" className="text-sm text-neutral-500"><span aria-hidden="true">←</span> Expenses</Link>
        <h1 className="mt-1 text-2xl font-bold">Mileage</h1>
        <p className="mt-1 text-neutral-600">
          Business miles at HMRC&apos;s rates: {RATES.car.first * 100}p a mile for the first {RATES.car.threshold.toLocaleString()} in the tax year, then{" "}
          {RATES.car.after * 100}p. Each trip is saved as an expense.
        </p>
      </div>
      <Tip id="mileage-how">How it works: add a trip and it is saved as an expense at HMRC&apos;s rate. No receipt needed.</Tip>

      <form onSubmit={save} className="space-y-3 rounded-xl border bg-white p-5 text-neutral-900 shadow-sm">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-neutral-500" htmlFor="m-date">Date</label>
            <input id="m-date" type="date" className={INPUT} value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-neutral-500" htmlFor="m-vehicle">Vehicle</label>
            <select id="m-vehicle" className={INPUT} value={vehicle} onChange={(e) => setVehicle(e.target.value as Vehicle)}>
              {VEHICLES.map((v) => (
                <option key={v.id} value={v.id}>{v.label}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-neutral-500" htmlFor="m-from">From</label>
            <input id="m-from" aria-invalid={(measured === NEED_POSTCODES && !normalisePostcode(from)) || undefined} aria-describedby={measured === NEED_POSTCODES && !normalisePostcode(from) ? "m-measured" : undefined} className={INPUT} placeholder="Postcode or place" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-neutral-500" htmlFor="m-to">To</label>
            <input id="m-to" aria-invalid={(measured === NEED_POSTCODES && !normalisePostcode(to)) || undefined} aria-describedby={measured === NEED_POSTCODES && !normalisePostcode(to) ? "m-measured" : undefined} className={INPUT} placeholder="Postcode or place" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-28">
            <label className="text-xs text-neutral-500" htmlFor="m-miles">Miles</label>
            <input
              id="m-miles"
              aria-invalid={error === NO_MILES || undefined}
              aria-describedby={error === NO_MILES ? "m-error" : undefined}
              className={INPUT}
              inputMode="decimal"
              placeholder="0"
              value={miles}
              onChange={(e) => setMiles(e.target.value)}
            />
          </div>
          <button type="button" onClick={measure} disabled={measuring} className="rounded-lg border px-3 py-2 text-sm font-medium text-neutral-700 disabled:opacity-50">
            {measuring ? "Working it out…" : "Work it out"}
          </button>
          <button
            type="button"
            onClick={() => setMiles(String(Math.round(milesNum * 2 * 10) / 10))}
            disabled={!milesNum}
            className="rounded-lg border px-3 py-2 text-sm font-medium text-neutral-700 disabled:opacity-40"
          >
            There and back
          </button>
        </div>
        {/* Always there: "Work it out" disables while it works, and the answer also rewrites Miles. */}
        <p id="m-measured" role="status" className={measured ? "text-xs text-neutral-500" : "sr-only"}>{measured ?? ""}</p>
        <div>
          <label className="text-xs text-neutral-500" htmlFor="m-purpose">What for (optional)</label>
          <input id="m-purpose" className={INPUT} placeholder="e.g. Site visit, collecting materials" value={purpose} onChange={(e) => setPurpose(e.target.value)} />
        </div>
        {milesNum > 0 && receipts && (
          <p className="text-sm text-neutral-700">
            {milesNum} miles × {claim.crosses ? `${claim.atFirst} at ${claim.first * 100}p and ${claim.atAfter} at ${claim.after * 100}p` : `${claim.first === claim.after || !claim.atAfter ? claim.first * 100 : claim.after * 100}p`} ={" "}
            <span className="font-semibold">{money(claim.amount)}</span>
            {RATES[vehicle].threshold !== Infinity && (
              <span className="block text-xs text-neutral-500">
                {already.toLocaleString()} miles claimed this tax year ({taxYearLabel(year)}); {left.toLocaleString()} left at the higher rate.
              </span>
            )}
          </p>
        )}
        {error && <p id="m-error" role="alert" className="text-sm text-red-600">{error}</p>}
        {/* Always mounted, so what goes into it is read out; one that arrives with its words often is not. */}
        <div role="status">
          {saved && (
            <p className="rounded-lg bg-neutral-50 p-3 text-sm text-neutral-700">
              {saved} <Link href="/expenses" className="font-medium underline">See your expenses</Link>
            </p>
          )}
        </div>
        <button disabled={saving} className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          {saving ? "Saving…" : "Save the trip"}
        </button>
      </form>

      <div className="rounded-xl border bg-white p-5 text-neutral-900 shadow-sm">
        <h2 className="font-semibold">This tax year ({taxYearLabel(year)})</h2>
        {receipts === null ? (
          loadError ? <p role="alert" className="mt-1 text-sm text-red-600">{loadError}</p> : <p className="mt-1 text-sm text-neutral-500">Loading…</p>
        ) : thisYear.length === 0 ? (
          <p className="mt-1 text-sm text-neutral-600">No trips yet. Add one above and it goes in with your expenses.</p>
        ) : (
          <>
            <p className="mt-1 text-sm text-neutral-700">
              {yearMiles.toLocaleString()} miles, <span className="font-semibold">{money(yearClaimed)}</span> claimed.
            </p>
            <ul className="mt-3 divide-y text-sm">
              {thisYear.slice(0, 20).map((r) => {
                const t = tripOf(r)!;
                return (
                  <li key={r.id} className="flex items-baseline justify-between gap-3 py-2">
                    <span className="min-w-0">
                      <span className="block truncate">{[t.from, t.to].filter(Boolean).join(" → ") || t.purpose || "Trip"}</span>
                      <span className="block text-xs text-neutral-500">
                        {shortDate(r.date)} · {t.miles} miles{t.purpose && [t.from, t.to].filter(Boolean).length ? ` · ${t.purpose}` : ""}
                      </span>
                    </span>
                    <span className="shrink-0 font-medium">{money(r.amount)}</span>
                  </li>
                );
              })}
            </ul>
            {thisYear.length > 20 && <p className="mt-2 text-xs text-neutral-500">Showing the last 20. All of them are in Expenses.</p>}
          </>
        )}
      </div>
    </div>
  );
}
