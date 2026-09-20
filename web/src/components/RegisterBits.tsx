"use client";

import { useEffect, useRef, useState } from "react";
import { CompanyMatch, NOT_ON_REGISTER, registerNote } from "@/lib/companyLookup";
import { bestRegisterMatch, companyByNumber, searchRegister } from "@/lib/companyRegister";
import { looksLikeCompany } from "@/lib/reminderTemplates";

export const oneLine = (a: string) => a.replace(/\n/g, ", ");
export const sinceDate = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });

export function CompanyRow({ c }: { c: CompanyMatch }) {
  const note = registerNote(c.status);
  return (
    <>
      <p className="text-sm font-medium">{c.name}</p>
      <p className="text-xs text-neutral-500">
        Company {c.number}
        {c.incorporated ? ` · since ${sinceDate(c.incorporated)}` : ""}
      </p>
      {c.address && <p className="truncate text-xs text-neutral-500">{oneLine(c.address)}</p>}
      {note && <p className="text-xs font-medium text-neutral-700">{note}</p>}
    </>
  );
}

export type RegisterCheck = { company: CompanyMatch | null; note: string | null; checking: boolean };

const NOTHING: RegisterCheck = { company: null, note: null, checking: false };

// What the register says about a name that is already in the form. A
// remembered company number asks for that company's profile, which is the
// only place the register publishes a status; without one it searches by
// name (dissolved companies included) and only trusts an exact match --
// a printed "Northside Joinery" does find NORTHSIDE JOINERY LTD. Nothing
// found is only worth saying about a name that ends in Ltd: most of his
// suppliers are sole traders, and "not on the register" about a plumber
// is noise. `onResult` fires when an answer lands, so a form can fill its
// gaps from it without watching the returned state.
export function useRegisterCheck(name: string, numberHint: string | null, on: boolean, onResult?: (check: RegisterCheck) => void, recheck = 0): RegisterCheck {
  const [state, setState] = useState<RegisterCheck>(NOTHING);
  const report = useRef(onResult);
  useEffect(() => {
    report.current = onResult;
  });
  useEffect(() => {
    const wanted = name.trim();
    const skip = !on || (!numberHint && wanted.length < 3);
    const controller = new AbortController();
    const settle = (next: RegisterCheck) => {
      setState(next);
      report.current?.(next);
    };
    const timer = setTimeout(async () => {
      if (skip) {
        settle(NOTHING);
        return;
      }
      setState((s) => ({ ...s, checking: true }));
      try {
        const company = numberHint
          ? await companyByNumber(numberHint, controller.signal)
          : bestRegisterMatch(wanted, await searchRegister(wanted, { all: true, signal: controller.signal }));
        if (controller.signal.aborted) return;
        settle({ company, note: company ? registerNote(company.status) : looksLikeCompany(wanted) ? NOT_ON_REGISTER : null, checking: false });
      } catch {
        if (!controller.signal.aborted) settle(NOTHING);
      }
    }, skip ? 0 : 400);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [name, numberHint, on, recheck]);
  return state;
}

export function RegisterNote({ check }: { check: RegisterCheck }) {
  if (!check.note) return null;
  return <p className="mt-1 text-xs text-neutral-600">{check.note}</p>;
}
