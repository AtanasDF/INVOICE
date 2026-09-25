"use client";

import { useEffect, useSyncExternalStore } from "react";
import { DEFAULT_CHOICE, THEMES, readChoice, saveTheme, subscribeTheme, watchSystemTheme } from "@/lib/theme";

// Picking the colours. Nothing is saved to the account: it is how this phone
// looks, so it stays on this phone, and takes effect the moment it is tapped
// rather than behind a Save button.
export default function ThemePicker() {
  // The stored choice, which may be "auto" -- not the colour it resolves to.
  // The radio has to show what was picked, or "Follow my phone" would look
  // unselected the moment it took effect.
  const choice = useSyncExternalStore(subscribeTheme, readChoice, () => DEFAULT_CHOICE);
  useEffect(() => watchSystemTheme(), []);

  return (
    <div className="space-y-3 rounded-xl border bg-white p-5 text-neutral-900 shadow-sm">
      <h2 className="font-semibold">How it looks</h2>
      <p className="text-sm text-neutral-600">Pick a colour. It changes straight away, and only on this device.</p>
      <div role="radiogroup" aria-label="Colour" className="grid gap-2 sm:grid-cols-2">
        {[{ id: "auto" as const, name: "Follow my phone", note: "Light by day, dark at night", swatch: "linear-gradient(135deg,#fafafa 0 50%,#17181c 50% 100%)" }, ...THEMES].map((t) => {
          const on = t.id === choice;
          return (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => saveTheme(t.id)}
              // min-w-0: a grid item will not shrink below its own content
              // unless it is told to, so on a narrow phone with the text
              // turned up this card pushed the whole page sideways rather
              // than letting "Follow my phone" wrap.
              className={`flex min-w-0 items-center gap-3 rounded-lg border px-4 py-3 text-left ${on ? "border-neutral-900 bg-neutral-50" : "hover:bg-neutral-50"}`}
            >
              <span aria-hidden className="size-7 shrink-0 rounded-full border" style={{ background: t.swatch }} />
              <span className="min-w-0">
                <span className="block wrap-anywhere text-sm font-medium">{t.name}</span>
                <span className="block wrap-anywhere text-xs text-neutral-500">{t.note}</span>
              </span>
              {on && <span className="ml-auto text-xs font-medium text-neutral-500">On</span>}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-neutral-500">Invoices always print in plain ink, whichever colour you pick.</p>
    </div>
  );
}
