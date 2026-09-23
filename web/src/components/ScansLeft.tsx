"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

// How much of the day's allowance is left (notes/scan-limits-design.md).
//
// Without this the wall arrives with no warning: someone photographs a stack
// of receipts and is stopped at the fortieth with no idea it was coming. A
// line of small type is enough — it only needs to be there before it matters.
//
// Shows nothing at all when the limits are not switched on, when the account
// is paid, or while there is plenty left: a counter on screen all day would
// make a generous allowance feel like a meter running.
// Exactly what scan_allowance() returns (migration-036).
type Allowance = {
  plan: string;
  welcome: boolean;
  usedToday: number;
  usedThisMonth: number;
  dayLimit: number | null;
  monthLimit: number | null;
  topUpUsed: boolean;
  topUpAvailable: boolean;
};

// A quarter left, or ten documents, whichever comes first: enough warning to
// finish the pile in your hand.
const worthSaying = (a: Allowance) => {
  if (a.plan === "paid" || a.dayLimit === null) return false;
  const left = a.dayLimit - a.usedToday;
  return left <= Math.max(10, Math.round(a.dayLimit / 4));
};

// The same reading, shown as a whole rather than as a warning: what the plan
// is, what it allows, and how much of today is left. Settings is where someone
// goes to find out how the app treats them, so it answers plainly instead of
// leaving them to discover the limit by meeting it.
export function PlanCard() {
  const [a, setA] = useState<Allowance | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const { data, error } = await supabase.rpc("scan_allowance");
        if (dead) return;
        if (error || !data) { setFailed(true); return; }
        setA(data as Allowance);
      } catch {
        if (!dead) setFailed(true);
      }
    })();
    return () => { dead = true; };
  }, []);

  // Before migration-036 is run there is nothing to say, and a card saying so
  // would only puzzle people.
  if (failed || !a) return null;

  const paid = a.plan === "paid";
  return (
    <div className="space-y-3 rounded-xl border bg-white p-5 text-neutral-900 shadow-sm">
      <h2 className="font-semibold">What your account allows</h2>
      {paid ? (
        <p className="text-neutral-700">
          You are on the paid plan. There is no limit on what you can photograph.
        </p>
      ) : (
        <>
          <p className="text-neutral-700">
            {a.welcome
              ? "You are new, so you have a bigger allowance for your first week — 300 documents a day, to catch up on a pile of old paper."
              : "Free: 50 documents a day, and 600 in a month. Copying a document, changing a file and writing invoices by hand never count."}
          </p>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-neutral-500">Today</dt>
              <dd className="text-lg font-medium">{a.usedToday}{a.dayLimit === null ? "" : ` of ${a.dayLimit}`}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">This month</dt>
              <dd className="text-lg font-medium">{a.usedThisMonth}{a.monthLimit === null ? "" : ` of ${a.monthLimit}`}</dd>
            </div>
          </dl>
          {a.monthLimit !== null && (
            <p className="text-sm text-neutral-600">
              {a.topUpUsed
                ? "You have already had your extra 600 this month. It starts again on the 1st."
                : "If you run out this month, you can ask for another 600 once, free."}
            </p>
          )}
        </>
      )}
    </div>
  );
}

export default function ScansLeft() {
  const [a, setA] = useState<Allowance | null>(null);

  useEffect(() => {
    let dead = false;
    // Before migration-036 is run this function does not exist, and that is a
    // perfectly ordinary state of the world: say nothing rather than complain.
    (async () => {
      try {
        const { data, error } = await supabase.rpc("scan_allowance");
        if (dead || error || !data) return;
        setA(data as Allowance);
      } catch {
        // Same again: a missing allowance is not worth a word on screen.
      }
    })();
    return () => {
      dead = true;
    };
  }, []);

  if (!a || !worthSaying(a)) return null;

  const left = Math.max(0, (a.dayLimit ?? 0) - a.usedToday);
  const monthLeft = a.monthLimit === null ? null : Math.max(0, a.monthLimit - a.usedThisMonth);

  return (
    <p className="text-sm text-neutral-600">
      {left === 0
        ? "That's today's documents used. It starts again tomorrow morning."
        : `${left} more ${left === 1 ? "document" : "documents"} today.`}
      {monthLeft !== null && monthLeft <= 50 && ` ${monthLeft} left this month.`}
    </p>
  );
}
