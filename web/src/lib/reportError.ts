import { isNoise } from "@/lib/errorReport";

// Send one report, and never let sending it become a second fault.
//
// Uses sendBeacon when it can: a page that has just thrown is often about to be
// closed or reloaded, and a beacon survives that where a fetch does not. The
// browser gives no answer either way, which is right — nothing here should wait
// on it or act on it.
export function reportError(input: { message: string; stack?: string; kind: "render" | "window" | "promise"; digest?: string }) {
  try {
    if (!input.message || isNoise(input.message)) return;
    const body = JSON.stringify({
      message: input.message,
      stack: input.stack ?? "",
      kind: input.kind,
      digest: input.digest ?? "",
      path: window.location.pathname,
    });
    if (navigator.sendBeacon && navigator.sendBeacon("/api/error", new Blob([body], { type: "application/json" }))) return;
    void fetch("/api/error", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
  } catch {
    // Nothing. A reporter that throws is worse than one that misses.
  }
}
