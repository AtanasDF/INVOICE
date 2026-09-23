"use client";

import { useEffect, useRef, useState } from "react";
import { TIP_SHOWS, readTipCount, writeTipCount } from "@/lib/tips";

// A short hint for someone new; `dark` sits over the camera view.
export default function Tip({ id, children, dark, className = "" }: { id: string; children: React.ReactNode; dark?: boolean; className?: string }) {
  const [visible, setVisible] = useState(() => readTipCount(id) < TIP_SHOWS);
  // Counted once per appearance: the ref survives React re-running the
  // effect on the same mount.
  const countedRef = useRef(false);

  useEffect(() => {
    if (!visible || countedRef.current) return;
    countedRef.current = true;
    writeTipCount(id, readTipCount(id) + 1);
  }, [id, visible]);

  if (!visible) return null;
  return (
    <div
      role="note"
      className={`flex items-start gap-3 rounded-lg px-3 py-2 text-sm ${dark ? "bg-black/70 text-ink-on-dark" : "border border-neutral-200 bg-neutral-50 text-neutral-700"} ${className}`}
    >
      <span className="min-w-0 flex-1">{children}</span>
      <button
        type="button"
        onClick={() => {
          writeTipCount(id, TIP_SHOWS);
          setVisible(false);
        }}
        className={`shrink-0 text-xs font-medium underline ${dark ? "text-white/80" : "text-neutral-600"}`}
      >
        Got it
      </button>
    </div>
  );
}
