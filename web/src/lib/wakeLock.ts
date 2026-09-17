import { useEffect } from "react";

// The OS releases a screen wake lock whenever the tab is hidden, so it
// has to be re-requested on every return to visibility, not just once.
export function useWakeLock(active = true) {
  useEffect(() => {
    if (!active || typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;

    async function request() {
      if (document.visibilityState !== "visible" || (sentinel && !sentinel.released)) return;
      try {
        const s = await navigator.wakeLock.request("screen");
        if (cancelled) s.release();
        else sentinel = s;
      } catch {
        // refused (low battery, hidden document race) -- nothing to hold
      }
    }

    request();
    document.addEventListener("visibilitychange", request);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", request);
      sentinel?.release();
    };
  }, [active]);
}
