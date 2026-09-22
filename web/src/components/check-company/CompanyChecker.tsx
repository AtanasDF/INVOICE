"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import CompanyReportView from "@/components/check-company/CompanyReportView";
import { asCompanyNumber, CH_SEARCH_URL, type CompanyHit, type CompanyReport, longDate } from "@/lib/companyReport";

const CARD = "rounded-xl border bg-white p-5 text-neutral-900 shadow-sm";
const PRIMARY = "rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50";
const SECONDARY = "rounded-lg border px-3 py-2 text-sm font-medium text-neutral-700";

const BUSY = "Too many checks from this connection in the last hour. Try again later, or look the company up at Companies House.";
// Said when the register itself can't be reached, rather than blaming the
// person who has just arrived on a shared link and checked nothing.
const UNAVAILABLE = "Companies House isn't answering just now. Try again in a minute, or look the company up at Companies House.";
const OFF = "Couldn't reach the register just now. Try again in a minute, or look the company up at Companies House.";

type Answer = { configured?: boolean; items?: CompanyHit[]; report?: CompanyReport; busy?: boolean; unavailable?: boolean; found?: boolean };

export default function CompanyChecker() {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<CompanyHit[] | null>(null);
  const [report, setReport] = useState<CompanyReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const top = useRef<HTMLDivElement>(null);

  const ask = useCallback(async (params: string): Promise<Answer | null> => {
    const res = await fetch(`/api/company-check${params}`).catch(() => null);
    if (!res) return null;
    const body = (await res.json().catch(() => null)) as Answer | null;
    if (body && body.configured === false) setConfigured(false);
    return body;
  }, []);

  const searchFor = useCallback(
    async (q: string) => {
      setLoading(true);
      setError(null);
      const body = await ask(`?q=${encodeURIComponent(q)}`);
      setLoading(false);
      if (!body) return setError(OFF);
      if (body.unavailable) return setError(UNAVAILABLE);
      if (body.busy) return setError(BUSY);
      if (!body.items) {
        if (body.configured !== false) setError(OFF);
        return;
      }
      setReport(null);
      setHits(body.items);
      if (body.items.length === 0) setError("Nothing on the register matches that. Check the spelling, or try the company number.");
    },
    [ask]
  );

  const load = useCallback(
    async (number: string, orSearch: string | null) => {
      setLoading(true);
      setError(null);
      const body = await ask(`?number=${encodeURIComponent(number)}`);
      setLoading(false);
      if (!body) return setError(OFF);
      if (body.unavailable) return setError(UNAVAILABLE);
      if (body.busy) return setError(BUSY);
      if (body.report) {
        setHits(null);
        setReport(body.report);
        history.replaceState(null, "", `/check-company?number=${body.report.number}`);
        top.current?.scrollIntoView({ block: "start" });
        return;
      }
      if (body.found === false) return orSearch ? void searchFor(orSearch) : setError("No company on the register has that number.");
      if (body.configured !== false) setError(OFF);
    },
    [ask, searchFor]
  );

  // One request on arrival: it says whether the lookup is on and, for a
  // shared /check-company?number= link, brings that report with it.
  useEffect(() => {
    let live = true;
    const number = new URLSearchParams(window.location.search).get("number");
    fetch(`/api/company-check${number ? `?number=${encodeURIComponent(number)}` : ""}`)
      .then((r) => r.json())
      .then((body: Answer) => {
        if (!live) return;
        setConfigured(body.configured !== false);
        if (!number) return;
        setQuery(number);
        if (body.report) setReport(body.report);
        else if (body.unavailable) setError(UNAVAILABLE);
        else if (body.busy) setError(BUSY);
        else if (body.found === false) setError("No company on the register has that number.");
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const q = query.replace(/\s+/g, " ").trim();
    if (!q || loading) return;
    const number = asCompanyNumber(q);
    if (number) load(number, q);
    else searchFor(q);
  }

  function startOver() {
    setReport(null);
    setHits(null);
    setError(null);
    history.replaceState(null, "", "/check-company");
  }

  const chSearch = `${CH_SEARCH_URL}?q=${encodeURIComponent(query.trim())}`;

  return (
    <div className="space-y-4" ref={top}>
      <div>
        <h1 className="text-2xl font-bold">Check a company</h1>
        <p className="mt-1 text-neutral-600">
          Look up a UK company on the Companies House register before you work for them: whether it exists, whether it is still
          trading, who runs it and whether it files on time. Free, no account needed.
        </p>
      </div>

      <form onSubmit={submit} className={CARD}>
        <label htmlFor="company-query" className="text-xs text-neutral-500">
          Company name or number
        </label>
        <div className="mt-1 flex flex-wrap gap-2">
          <input
            id="company-query"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Acme Building Ltd, or 01234567"
            autoComplete="off"
            className="min-w-[10rem] flex-1 rounded-lg border px-3 py-2 text-sm"
          />
          {configured === false ? (
            <a href={chSearch} target="_blank" rel="noopener noreferrer" className={PRIMARY}>
              Search at Companies House
            </a>
          ) : (
            <button type="submit" disabled={loading} className={PRIMARY}>
              {loading ? "Checking…" : "Check"}
            </button>
          )}
        </div>
        <p className="mt-2 text-xs text-neutral-500">
          Only limited companies are on the register. A sole trader won&apos;t be found here.
        </p>
      </form>

      {configured === false && (
        <div className={CARD} data-testid="not-configured">
          <h2 className="font-semibold">This check is coming soon</h2>
          <p className="mt-1 text-sm text-neutral-600">
            For now you can look the company up on the official site. It is free, and the facts are the same ones this page
            will show.
          </p>
          <a href={chSearch} target="_blank" rel="noopener noreferrer" className={`mt-3 inline-block ${SECONDARY}`}>
            Open the Companies House register
          </a>
        </div>
      )}

      {error && (
        <div className={CARD} data-testid="error">
          <p className="text-sm text-neutral-700">{error}</p>
          <a href={chSearch} target="_blank" rel="noopener noreferrer" className={`mt-3 inline-block ${SECONDARY}`}>
            Search at Companies House
          </a>
        </div>
      )}

      {hits && hits.length > 0 && (
        <div className={CARD} data-testid="hits">
          <h2 className="font-semibold">{hits.length === 1 ? "One match" : `${hits.length} matches`}</h2>
          <p className="mt-1 text-sm text-neutral-600">Pick the one you mean.</p>
          <ul className="mt-3 space-y-2">
            {hits.map((h) => (
              <li key={h.number}>
                <button type="button" onClick={() => load(h.number, null)} className="w-full rounded-lg border p-3 text-left hover:bg-neutral-50">
                  <p className="font-medium">{h.name}</p>
                  <p className="text-xs text-neutral-500">
                    {[`Company ${h.number}`, h.status.replace(/-/g, " "), h.incorporated && `since ${longDate(h.incorporated)}`].filter(Boolean).join(" · ")}
                  </p>
                  {h.address && <p className="mt-0.5 truncate text-xs text-neutral-500">{h.address}</p>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {report && <CompanyReportView report={report} onBack={startOver} />}
    </div>
  );
}
