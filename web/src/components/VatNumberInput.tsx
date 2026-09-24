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
  | { for: string; kind: "registered"; name: string; address: string }
  | { for: string; kind: "unknown" }
  | { for: string; kind: "unavailable" };

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
}) {
  const format = checkVatNumberFormat(value);
  const number = format.kind === "ok" ? format.normalised : "";
  const [lookup, setLookup] = useState<Lookup | null>(null);
  // Telling somebody their number is wrong after three digits is noise, so
  // a refusal waits until they have stopped typing.
  const [settled, setSettled] = useState("");

  const businessRef = useRef(business);
  useEffect(() => {
    businessRef.current = business;
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
        const res = await fetch(`/api/vat-check?number=${encodeURIComponent(number)}`, { signal: controller.signal });
        const body = (await res.json()) as { configured?: boolean; registered?: boolean; name?: string; address?: string };
        if (controller.signal.aborted) return;
        if (!body.configured) setLookup({ for: number, kind: "off" });
        else if (res.status === 429 || res.status === 503) setLookup({ for: number, kind: "unavailable" });
        else if (body.registered === false) setLookup({ for: number, kind: "unknown" });
        else if (body.registered && body.name) setLookup({ for: number, kind: "registered", name: body.name, address: body.address ?? "" });
        else setLookup({ for: number, kind: "off" });
      } catch {
        if (!controller.signal.aborted) setLookup({ for: number, kind: "unavailable" });
      }
    }, 600);
    return () => {
      controller.abort();
      clearTimeout(t);
    };
  }, [number]);

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
        onChange={(e) => onChange(e.target.value)}
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
    </>
  );
}
