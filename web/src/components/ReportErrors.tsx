"use client";

import { useEffect } from "react";
import { reportError } from "@/lib/reportError";

// Listens for the two ways a browser tells a page it has broken, and tells us.
//
// Mounted once in the root layout. It renders nothing and it is never in
// anybody's way: if reporting fails, it fails silently, because an error
// reporter that throws is worse than no error reporter.
export default function ReportErrors() {
  useEffect(() => {
    const onError = (e: ErrorEvent) =>
      reportError({ message: e.message, stack: e.error?.stack ?? `${e.filename}:${e.lineno}:${e.colno}`, kind: "window" });
    const onRejection = (e: PromiseRejectionEvent) => {
      const r = e.reason;
      reportError({ message: r instanceof Error ? r.message : String(r), stack: r instanceof Error ? (r.stack ?? "") : "", kind: "promise" });
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
