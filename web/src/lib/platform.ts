import { useSyncExternalStore } from "react";

// Standard (if inescapably UA-sniffing) iOS detection -- there's no
// reliable feature-detection alternative, since Apple's App Store policy
// forces every iOS browser onto WebKit, so they share the same
// getUserMedia/Permissions API limitations regardless of vendor.
// iPadOS 13+ Safari reports itself as a Mac by default (desktop-site
// spoofing), distinguished from a real Mac only by multi-touch support.
export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
}

function subscribeNever() {
  return () => {};
}
function getIOSSnapshot(): boolean {
  return isIOS();
}
function getIOSServerSnapshot(): boolean {
  return false;
}

// false on the server and through the client's first (hydrating) render,
// then corrected to the real value immediately after -- isIOS() can only
// be answered on the client (no navigator during SSR), and
// useSyncExternalStore's getServerSnapshot is the built-in way to read a
// value like that without a hydration mismatch, and without the extra
// render pass a useEffect + setState would cost (subscribe is a no-op
// since isIOS() can't change mid-session).
export function useIsIOS(): boolean {
  return useSyncExternalStore(subscribeNever, getIOSSnapshot, getIOSServerSnapshot);
}

export type ScannerMode = "inapp" | "native";
const SCANNER_MODE_KEY = "scanner-mode";

export function readScannerMode(): ScannerMode {
  try {
    return localStorage.getItem(SCANNER_MODE_KEY) === "inapp" ? "inapp" : "native";
  } catch {
    return "native";
  }
}

export function writeScannerMode(mode: ScannerMode) {
  try {
    localStorage.setItem(SCANNER_MODE_KEY, mode);
  } catch {
    // private mode / storage blocked -- the choice just won't persist
  }
}
