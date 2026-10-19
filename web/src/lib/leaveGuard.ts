import { useEffect } from "react";

// A link tapped with no signal is not a client navigation any more: Next falls
// back to a full page load, the worker answers it with /offline, and a half
// typed receipt or invoice was gone under a page saying nothing had been lost
// (notes/audit-offline.md 4c). The browser's own "Leave this page?" stops that
// on a computer and on Android. iPhone Safari ignores beforeunload; this is
// not a fix there.
export function useLeaveGuard(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const ask = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", ask);
    return () => window.removeEventListener("beforeunload", ask);
  }, [dirty]);
}
