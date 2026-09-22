"use client";

import { useEffect, useRef, useState } from "react";
import { CompanyMatch, tidyCompanyNumber } from "@/lib/companyLookup";
import { useCompanyLookup } from "@/lib/companyConfigured";
import { companyByNumber } from "@/lib/companyRegister";
import { sameCompanyName } from "@/lib/companyRegister";

// A company number box that looks the company up once the number is
// complete (Atanas, 2026-09-22: "if you write the company number, it should
// give you automatically the company name, as long as you have a full
// company number"). An empty name is filled straight away; a name already
// typed is only offered the register's, since the number is the fact and
// the name might be a typo of it, or of another company altogether.
export default function CompanyNumberInput({
  value,
  onChange,
  name,
  onFound,
  className,
  placeholder,
  id,
}: {
  value: string;
  onChange: (value: string) => void;
  name: string;
  onFound: (company: CompanyMatch) => void;
  className?: string;
  placeholder?: string;
  id?: string;
}) {
  const on = useCompanyLookup();
  // The number the box opened with is already the saved one: looking it up
  // would fill the name on a page nobody touched and mark it unsaved.
  const [looked, setLooked] = useState<{ number: string; company: CompanyMatch | null } | null>(() => {
    const mounted = tidyCompanyNumber(value);
    return mounted ? { number: mounted, company: null } : null;
  });
  const [busy, setBusy] = useState(false);
  const [offer, setOffer] = useState<CompanyMatch | null>(null);
  const full = on ? tidyCompanyNumber(value) : null;
  // Read when the answer lands, not when the lookup started.
  const nameRef = useRef(name);
  const onFoundRef = useRef(onFound);
  useEffect(() => {
    nameRef.current = name;
    onFoundRef.current = onFound;
  });
  const [mounted] = useState(() => tidyCompanyNumber(value));

  useEffect(() => {
    if (!full || looked?.number === full) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setBusy(true);
      try {
        const company = await companyByNumber(full, controller.signal);
        if (controller.signal.aborted) return;
        setLooked({ number: full, company });
        setOffer(null);
        if (!company) return;
        const typed = nameRef.current;
        if (!typed.trim()) onFoundRef.current(company);
        else if (!sameCompanyName(typed, company)) setOffer(company);
      } catch {
        if (!controller.signal.aborted) setLooked(null);
      } finally {
        if (!controller.signal.aborted) setBusy(false);
      }
    }, 400);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [full, looked?.number]);

  const notFound = full !== null && looked?.number === full && looked.company === null && full !== mounted;
  return (
    <div>
      <input
        id={id}
        className={className}
        placeholder={placeholder}
        value={value}
        autoComplete="off"
        onChange={(e) => {
          onChange(e.target.value);
          setOffer(null);
        }}
      />
      {on && busy && <p className="mt-1 text-xs text-neutral-500">Checking the register…</p>}
      {on && !busy && notFound && <p className="mt-1 text-xs text-neutral-500">No company has that number on the Companies House register.</p>}
      {on && !busy && offer && (
        <p className="mt-1 text-xs text-neutral-600">
          On the register, {offer.number} is {offer.name}.{" "}
          <button
            type="button"
            className="font-medium underline"
            onClick={() => {
              onFound(offer);
              setOffer(null);
            }}
          >
            Use that name
          </button>
        </p>
      )}
    </div>
  );
}
