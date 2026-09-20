"use client";

import { useState, useSyncExternalStore } from "react";
import { ageText, chargeCount, type CompanyReport, count, longDate, reportText, searchLinks } from "@/lib/companyReport";

const CARD = "rounded-xl border bg-white p-5 text-neutral-900 shadow-sm";
const SECONDARY = "rounded-lg border px-3 py-2 text-sm font-medium text-neutral-700";
const LABEL = "text-xs text-neutral-500";
const BADGE = "rounded-full px-2 py-0.5 text-xs font-medium";
const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function Card({ title, note, children, testid }: { title: string; note?: string; children: React.ReactNode; testid?: string }) {
  return (
    <section className={CARD} data-testid={testid}>
      <h2 className="font-semibold">{title}</h2>
      {note && <p className="mt-1 text-sm text-neutral-600">{note}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

const Fact = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <p className={LABEL}>{label}</p>
    <p className="text-sm">{children}</p>
  </div>
);

function Filed({ title, f }: { title: string; f: NonNullable<CompanyReport["accounts"]> }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium">{title}</p>
        {f.overdue && <span className={`${BADGE} shrink-0 bg-amber-100 text-amber-800`}>Overdue{f.overdueBy ? ` by ${f.overdueBy}` : ""}</span>}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-3">
        {f.lastMadeUpTo && <Fact label="Last filed, made up to">{longDate(f.lastMadeUpTo)}{f.lastType ? ` · ${f.lastType}` : ""}</Fact>}
        {f.nextMadeUpTo && <Fact label="Next covers up to">{longDate(f.nextMadeUpTo)}</Fact>}
        {f.nextDue && <Fact label="Next due">{longDate(f.nextDue)}</Fact>}
      </div>
    </div>
  );
}

export default function CompanyReportView({ report: r, onBack }: { report: CompanyReport; onBack: () => void }) {
  const canShare = useSyncExternalStore(
    () => () => {},
    () => typeof navigator.share === "function",
    () => false
  );
  const [copied, setCopied] = useState(false);
  const text = reportText(r);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="space-y-4" data-testid="report">
      <section className={CARD}>
        <h2 className="text-xl font-semibold">{r.name}</h2>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {r.status && <span className={`${BADGE} bg-neutral-100 text-neutral-800`}>{r.status}</span>}
          {r.statusDetail && <span className={`${BADGE} bg-neutral-100 text-neutral-800`}>{r.statusDetail}</span>}
          {r.type && <span className={`${BADGE} bg-neutral-100 text-neutral-800`}>{r.type}</span>}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Fact label="Company number">{r.number}</Fact>
          {r.incorporated && (
            <Fact label={r.incorporatedLabel}>
              {longDate(r.incorporated)}
              {r.ageMonths !== null && <span className="text-neutral-500"> · {ageText(r.ageMonths)} old</span>}
            </Fact>
          )}
          {r.dissolved && <Fact label="Dissolved">{longDate(r.dissolved)}</Fact>}
          {r.jurisdiction && <Fact label="Registered in">{r.jurisdiction}</Fact>}
        </div>
      </section>

      {r.summary.length > 0 && (
        <Card title="What this means" testid="summary">
          <ul className="space-y-1 text-sm">
            {r.summary.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </Card>
      )}

      {r.address.length > 0 && (
        <Card title="Registered office" testid="address">
          <p className="whitespace-pre-line text-sm">{r.address.join("\n")}</p>
          {r.addressNotes.map((n, i) => (
            <p key={i} className="mt-2 text-sm text-neutral-600">
              {n}
            </p>
          ))}
        </Card>
      )}

      {r.sic.length > 0 && (
        <Card title="What it says it does" note="The trades this company registered itself under." testid="sic">
          <ul className="space-y-1 text-sm">
            {r.sic.map((s) => (
              <li key={s.code}>
                {s.description ?? "No description held for this code"} <span className="text-neutral-500">· SIC {s.code}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {r.previousNames.length > 0 && (
        <Card title="Previous names" testid="previous-names">
          <ul className="space-y-1 text-sm">
            {r.previousNames.map((p, i) => (
              <li key={i}>
                {p.name}
                {p.from && p.to && <span className="text-neutral-500"> · {longDate(p.from)} to {longDate(p.to)}</span>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {(r.accounts || r.confirmation) && (
        <Card title="Filings" testid="filings">
          <div className="space-y-3">
            {r.accounts && <Filed title="Accounts" f={r.accounts} />}
            {r.confirmation && <Filed title="Confirmation statement" f={r.confirmation} />}
          </div>
        </Card>
      )}

      {r.officers && (
        <Card
          title="Officers"
          note={`${sentence(count(r.officers.active, "current officer"))} · ${count(r.officers.resigned, "resignation")} on record`}
          testid="officers"
        >
          <ul className="space-y-2 text-sm">
            {r.officers.current.map((o, i) => (
              <li key={i} className="rounded-lg border p-3">
                <p className="font-medium">{o.name}</p>
                <p className={LABEL}>
                  {[o.role, o.corporate && "corporate officer", o.appointed && `appointed ${longDate(o.appointed)}`, o.occupation, o.nationality].filter(Boolean).join(" · ")}
                </p>
                {o.disqualified && <p className="mt-1 text-sm text-neutral-700">Companies House records a disqualification for this officer.</p>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {r.control && (
        <Card title="Who owns and controls it" note="People with significant control, as filed at Companies House." testid="control">
          <ul className="space-y-2 text-sm">
            {r.control.list.map((c, i) => (
              <li key={i} className="rounded-lg border p-3">
                <p className="font-medium">{c.name}</p>
                <p className={LABEL}>{[c.kind, c.notified && `notified ${longDate(c.notified)}`, c.ceased && `ceased ${longDate(c.ceased)}`].filter(Boolean).join(" · ")}</p>
                {c.natures.map((n, j) => (
                  <p key={j} className="mt-1 text-sm text-neutral-600">
                    {n}
                  </p>
                ))}
              </li>
            ))}
            {r.control.statements.map((s, i) => (
              <li key={`s${i}`} className="text-neutral-600">
                {s}
              </li>
            ))}
            {r.control.superSecure && <li className="text-neutral-600">Some details are protected from disclosure.</li>}
          </ul>
        </Card>
      )}

      {r.charges && (
        <Card
          title="Charges"
          note={`${sentence(chargeCount(r.charges))}. A charge means something the company owns is security for borrowing.`}
          testid="charges"
        >
          <ul className="space-y-2 text-sm">
            {r.charges.list.map((c, i) => (
              <li key={i} className="rounded-lg border p-3">
                <p className="font-medium">{c.classification ?? "Charge"}</p>
                <p className={LABEL}>{[c.status, c.created && `created ${longDate(c.created)}`, c.satisfied && `satisfied ${longDate(c.satisfied)}`].filter(Boolean).join(" · ")}</p>
                {c.entitled.length > 0 && <p className="mt-1 text-sm text-neutral-600">To {c.entitled.join(", ")}</p>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {r.insolvency && (
        <Card title="Insolvency history" testid="insolvency">
          <ul className="space-y-2 text-sm">
            {r.insolvency.cases.map((c, i) => (
              <li key={i} className="rounded-lg border p-3">
                <p className="font-medium">{c.type}</p>
                {c.dates.map((d, j) => (
                  <p key={j} className={LABEL}>
                    {d.label}: {longDate(d.date)}
                  </p>
                ))}
                {c.practitioners.length > 0 && <p className="mt-1 text-sm text-neutral-600">Practitioner: {c.practitioners.join(", ")}</p>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card
        title="Website and social media"
        note="Companies House holds none of these, so these are searches, not checks. Look at what comes back yourself."
        testid="search-links"
      >
        {r.website && (
          <p className="mb-3 text-sm">
            <span className={LABEL}>On the register: </span>
            <a href={r.website} target="_blank" rel="noopener noreferrer nofollow" className="font-medium underline">
              {r.website}
            </a>
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {searchLinks(r.name).map((l) => (
            <a key={l.label} href={l.url} target="_blank" rel="noopener noreferrer nofollow" className={SECONDARY}>
              {l.label} <span className="font-normal text-neutral-500">{l.note}</span>
            </a>
          ))}
        </div>
      </Card>

      <section className={CARD}>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={copy} className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white">
            {copied ? "Copied" : "Copy the report"}
          </button>
          {canShare && (
            <button type="button" onClick={() => navigator.share({ title: `${r.name} — Companies House`, text }).catch(() => {})} className={SECONDARY}>
              Share
            </button>
          )}
          <a href={r.registerUrl} target="_blank" rel="noopener noreferrer" className={SECONDARY}>
            View on Companies House
          </a>
          <button type="button" onClick={onBack} className={SECONDARY}>
            Check another
          </button>
        </div>
        {r.missing.length > 0 && <p className="mt-3 text-sm text-neutral-600">Couldn&apos;t load {r.missing.join(", ")} this time, so nothing above says anything about them.</p>}
        <p className="mt-3 text-xs text-neutral-500">
          From the public Companies House register, read {longDate(r.checkedAt)}. Everything here is what the register holds, not an opinion about the company.
        </p>
      </section>
    </div>
  );
}
