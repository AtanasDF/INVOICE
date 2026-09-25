"use client";

import { useEffect, useRef, useState } from "react";
import { checkVatNumberFormat, formatVatNumber } from "@/lib/vatNumber";

// A VAT number box that checks what it can.
//
// The check digits are in the number itself, so a typo is caught on the
// device with nothing asked of anybody -- that part always works. Whether
// the number is REAL, and whose it is, only HMRC knows; that half appears
// when the server has HMRC credentials, and is silent when it doesn't.
//
// It never refuses a save. A number that fails the sum is said to be
// probably mistyped, under the box, and the person decides: the paperwork
// in their hand is a better authority than this is.

type Lookup =
  | { for: string; kind: "checking" }
  | { for: string; kind: "off" }
  | { for: string; kind: "registered"; name: string; address: string; consultationNumber?: string; checkedOn?: string | null }
  | { for: string; kind: "unknown" }
  | { for: string; kind: "unavailable" };

export type VerifiedCheck = {
  vatNumber: string;
  name: string;
  address: string;
  consultationNumber: string;
  checkedAt: string;
};

const bare = (s: string) => s.replace(/[^a-z0-9]/gi, "").toLowerCase();

export default function VatNumberInput({
  value,
  onChange,
  id,
  className,
  placeholder,
  label,
  business,
  disabled,
  hint,
  mine,
  onChecked,
}: {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  className?: string;
  placeholder?: string;
  label?: string;
  // The name typed alongside, so a number registered to somebody else can
  // be pointed out rather than merely confirmed.
  business?: string;
  disabled?: boolean;
  // What the line under the box says while there is nothing to report.
  hint?: string;
  // The account's OWN VAT number. Given both, HMRC returns a reference
  // proving this supplier was checked on this date -- the evidence HMRC
  // asks for if they ever query the VAT reclaimed against them.
  mine?: string;
  // Handed a verified check the moment HMRC answers, so the page can keep
  // it when the contact is saved. Only fired for a check that carries a
  // consultation number: without one there is nothing to prove.
  onChecked?: (check: VerifiedCheck) => void;
}) {
  const format = checkVatNumberFormat(value);
  const number = format.kind === "ok" ? format.normalised : "";
  const [lookup, setLookup] = useState<Lookup | null>(null);
  // Telling somebody their number is wrong after three digits is noise, so
  // a refusal waits until they have stopped typing.
  const [settled, setSettled] = useState("");

  // Merely opening a form that already holds a number must not ask HMRC
  // for a reference. A consultation lookup is never cached, so a panel
  // opened three times made three calls against a 30-an-hour limit and
  // issued three references nobody kept. Only a number somebody has
  // actually typed is worth a reference.
  const [touched, setTouched] = useState(false);

  const businessRef = useRef(business);
  const onCheckedRef = useRef(onChecked);
  useEffect(() => {
    businessRef.current = business;
    onCheckedRef.current = onChecked;
  });

  useEffect(() => {
    if (format.kind !== "wrong") return;
    const t = setTimeout(() => setSettled(value), 700);
    return () => clearTimeout(t);
  }, [value, format.kind]);

  useEffect(() => {
    if (!number) return;
    const controller = new AbortController();
    const t = setTimeout(async () => {
      setLookup({ for: number, kind: "checking" });
      try {
        const ours = touched && mine?.trim() ? `&mine=${encodeURIComponent(mine.trim())}` : "";
        const res = await fetch(`/api/vat-check?number=${encodeURIComponent(number)}${ours}`, { signal: controller.signal });
        const body = (await res.json()) as { configured?: boolean; registered?: boolean; name?: string; address?: string; consultationNumber?: string; checkedOn?: string | null };
        if (controller.signal.aborted) return;
        if (!body.configured) setLookup({ for: number, kind: "off" });
        else if (res.status === 429 || res.status === 503) setLookup({ for: number, kind: "unavailable" });
        else if (body.registered === false) setLookup({ for: number, kind: "unknown" });
        else if (body.registered && body.name) {
          setLookup({ for: number, kind: "registered", name: body.name, address: body.address ?? "", consultationNumber: body.consultationNumber, checkedOn: body.checkedOn });
          if (body.consultationNumber)
            onCheckedRef.current?.({
              vatNumber: number,
              name: body.name,
              address: body.address ?? "",
              consultationNumber: body.consultationNumber,
              checkedAt: body.checkedOn ?? new Date().toISOString(),
            });
        }
        else setLookup({ for: number, kind: "off" });
      } catch {
        if (!controller.signal.aborted) setLookup({ for: number, kind: "unavailable" });
      }
    }, 600);
    return () => {
      controller.abort();
      clearTimeout(t);
    };
  }, [number, mine, touched]);

  const answer = lookup && lookup.for === number ? lookup : null;
  const said =
    format.kind === "wrong" ? (settled === value ? format.reason : "")
    : format.kind === "department" ? "That is a government department's number."
    : format.kind !== "ok" ? ""
    : answer?.kind === "checking" ? "Checking it with HMRC…"
    : answer?.kind === "registered" ? `HMRC has this as ${answer.name}${answer.address ? `, ${answer.address}` : ""}.`
    : answer?.kind === "unknown" ? "HMRC has nobody registered with that number. Check it against the paperwork."
    : answer?.kind === "unavailable" ? "Couldn't check it with HMRC just now. The number itself adds up."
    : answer?.kind === "off" ? "That number adds up."
    : "";

  const bad = (format.kind === "wrong" && settled === value) || answer?.kind === "unknown";
  const differs = answer?.kind === "registered" && !!business?.trim() && bare(answer.name) !== bare(business);
  const saidId = `${id ?? "vat"}-said`;

  return (
    <>
      {label && (
        <label htmlFor={id} className="text-xs text-neutral-500">
          {label}
        </label>
      )}
      <input
        id={id}
        className={className}
        autoComplete="off"
        placeholder={placeholder ?? "GB 123 4567 89"}
        value={value}
        disabled={disabled}
        onChange={(e) => {
          setTouched(true);
          onChange(e.target.value);
        }}
        onBlur={() => {
          const pretty = formatVatNumber(value);
          if (pretty !== value.trim()) onChange(pretty);
        }}
        aria-describedby={said || hint ? saidId : undefined}
      />
      {(said || hint) && (
        <p id={saidId} role={bad ? "alert" : "status"} className={`mt-1 wrap-anywhere text-xs ${bad ? "text-red-600" : "text-neutral-500"}`}>
          {said || hint}
          {differs && " That is a different name from the one above, so check you have the right number."}
        </p>
      )}
      {/* Worth writing down, and nowhere in the app keeps it yet: HMRC's
          reference for THIS check on THIS day. Shown rather than hidden,
          because a reference nobody sees is the same as no reference. */}
      {answer?.kind === "registered" && answer.consultationNumber && (
        <p className="mt-1 wrap-anywhere text-xs text-neutral-500">
          HMRC&apos;s reference for this check is <span className="font-medium text-neutral-700">{answer.consultationNumber}</span>
          {answer.checkedOn ? `, made ${new Date(answer.checkedOn).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}` : ""}. Keep it
          with your records: it is what proves you checked.
        </p>
      )}
    </>
  );
}
