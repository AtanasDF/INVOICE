"use client";

import { ukDate } from "@/lib/today";
import { keptFor } from "@/lib/vatCheckRules";
import type { VatCheck } from "@/lib/storage";

// The references this account has kept for a VAT number.
//
// The point of recording them was never the row in the table: it is being
// able to produce, months later, the thing HMRC asks for -- that this
// number was checked, on this date, and HMRC said it belonged to this
// business. So the newest is shown in full and the rest are counted, since
// a list of eleven references is not what anybody is reading for.
export default function KeptVatChecks({ checks, number }: { checks: VatCheck[]; number: string }) {
  const mine = keptFor(checks, number);
  if (!mine.length) return null;
  const [latest, ...older] = mine;
  return (
    <p className="mt-1 wrap-anywhere text-xs text-neutral-500">
      Checked with HMRC on {new Date(latest.checkedAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
      {latest.name ? `, who had it as ${latest.name}` : ""}. Reference{" "}
      <span className="font-medium text-neutral-700">{latest.consultationNumber}</span>.
      {older.length > 0 && ` ${older.length} earlier ${older.length === 1 ? "check" : "checks"}, back to ${ukDate(older[older.length - 1].checkedAt)}.`}
    </p>
  );
}
