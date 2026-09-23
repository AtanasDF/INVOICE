// Getting the app onto a phone (Atanas, 2026-09-23: "how is the app going to
// be downloaded"). It already installs — the manifest, both icons, a service
// worker and standalone display are all there — and nothing in the app has
// ever said so, which means most people use it in a browser tab and forget it
// exists. On a plan built on flyers and word of mouth, that is the whole
// battle.
import { useSyncExternalStore } from "react";
import { isIOS } from "@/lib/platform";

export type InstallWay = "installed" | "prompt" | "ios" | "manual";

// Chrome and Edge fire this once, early, and will not fire it again — so it
// is caught at module load and kept, rather than waited for inside a
// component that may not have mounted yet.
type PromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
let deferred: PromptEvent | null = null;
const listeners = new Set<() => void>();
const tell = () => { for (const fn of listeners) fn(); };

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as PromptEvent;
    tell();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    tell();
  });
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  // iOS Safari has never supported display-mode, and answers its own way.
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  return iosStandalone || window.matchMedia?.("(display-mode: standalone)").matches === true;
}

// Pure, so every case can be checked without a browser that has opinions of
// its own. iOS is asked before the prompt because Safari has never fired
// beforeinstallprompt and never will: leaving the prompt first only made the
// answer depend on which browser happened to be running the test.
export function chooseInstallWay(w: { standalone: boolean; ios: boolean; hasPrompt: boolean }): InstallWay {
  if (w.standalone) return "installed";
  if (w.ios) return "ios";
  if (w.hasPrompt) return "prompt";
  return "manual";
}

export function installWay(): InstallWay {
  return chooseInstallWay({ standalone: isStandalone(), ios: isIOS(), hasPrompt: !!deferred });
}

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

// Server-rendered as "manual", then corrected on the client: nothing here can
// be known without a window, and guessing would flash the wrong instructions.
export function useInstallWay(): InstallWay {
  return useSyncExternalStore(subscribe, installWay, () => "manual" as InstallWay);
}

// Returns false when the browser had nothing to offer, so the caller can fall
// back to telling someone what to do by hand.
export async function askToInstall(): Promise<boolean> {
  if (!deferred) return false;
  const e = deferred;
  deferred = null;
  tell();
  try {
    await e.prompt();
    await e.userChoice;
    return true;
  } catch {
    return false;
  }
}
