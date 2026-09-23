"use client";

import { useRef, useState } from "react";
import { claimTopUp, topUpOffered } from "@/lib/scanAllowance";

// The wall, when someone meets it. Shown in place of the usual red error line,
// because a refusal is not a failure: nothing broke, nothing was lost, and
// there is something to do about it.
//
// Renders nothing for an ordinary error, so a page can hand it every error it
// has and let it decide.
export default function ScanLimitNotice({ error, onTopUp }: { error: unknown; onTopUp?: () => void }) {
  const [state, setState] = useState<"idle" | "asking" | "done" | "failed" | "already">("idle");
  // Two presses in one tick both reach this handler: `disabled` only lands on
  // the render after the first press, and both closures read the same `state`.
  // Unguarded, the second claim comes back "already", so the screen tells
  // somebody they have had their extra 600 one beat after granting it.
  const asking = useRef(false);
  if (!topUpOffered(error)) return null;

  const message = error instanceof Error ? error.message : String(error ?? "");

  async function ask() {
    if (asking.current) return;
    asking.current = true;
    setState("asking");
    const r = await claimTopUp();
    if (r.granted) {
      setState("done");
      onTopUp?.();
    } else {
      // Only a real failure is worth another press.
      asking.current = false;
      setState(r.reason === "already" ? "already" : "failed");
    }
  }

  return (
    <div role="status" className="space-y-3 rounded-xl border bg-neutral-50 p-4 text-neutral-900">
      <p className="text-base">{message}</p>

      {state === "done" ? (
        <p className="text-base font-medium">That&apos;s another 600 for this month. Carry on.</p>
      ) : state === "already" ? (
        <p className="text-base">You have already had the extra 600 this month. It starts again on the 1st.</p>
      ) : (
        <>
          <button
            type="button"
            disabled={state === "asking"}
            onClick={ask}
            className="w-full rounded-lg bg-neutral-900 px-4 py-3 text-base font-bold text-white disabled:opacity-50"
          >
            {state === "asking" ? "One moment…" : "Give me another 600 this month"}
          </button>
          {state === "failed" && (
            <p role="alert" className="text-sm text-red-600">That didn&apos;t go through. Try once more in a minute.</p>
          )}
          <p className="text-sm text-neutral-600">Once a month, and it costs you nothing.</p>
        </>
      )}
    </div>
  );
}
