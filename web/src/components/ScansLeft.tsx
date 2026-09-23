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
type Allowance = {
  plan: string;
  usedToday: number;
  usedThisMonth: number;
  dayLimit: number | null;
  monthLimit: number | null;
  topUpAvailable: boolean;
};

// A quarter left, or ten documents, whichever comes first: enough warning to
// finish the pile in your hand.
const worthSaying = (a: Allowance) => {
  if (a.plan === "paid" || a.dayLimit === null) return false;
  const left = a.dayLimit - a.usedToday;
  return left <= Math.max(10, Math.round(a.dayLimit / 4));
};

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
