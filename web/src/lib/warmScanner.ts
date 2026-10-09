import { hasUsedCamera } from "@/lib/camera";
import { loadOpenCV } from "@/lib/opencv";
import { readScannerMode, type ScannerMode } from "@/lib/platform";

// Whether it is worth fetching the page-finder before anybody asks for it, and
// the one place that decides.
//
// WHY THIS MOVED OUT OF THE DASHBOARD. The dashboard warmed OpenCV on idle and
// nothing else did, so the scanner was instant from the dashboard and paid the
// full wait from everywhere else -- which is most places, because "+ Add" sits
// on every list and its Scan row is one tap. AddAnything's own comment said it
// warmed the scanner "while the sheet is open"; it prefetched the ROUTE, which
// is a few kilobytes of page code, and not the 13 MB the camera actually waits
// for. A sentence describing something the code did not do.
//
// The guards are the dashboard's, kept exactly: 13 MB measured off the wire,
// and the only person it is worth spending on is one who has had the camera
// before -- not somebody on their first visit, who pays for a screen they may
// never open. The data-saver check is a Chrome API that SAFARI DOES NOT
// IMPLEMENT, so it protects nobody on the device this app is mostly used from;
// hasUsedCamera is what actually does the work.

export type NetworkHint = { saveData?: boolean; effectiveType?: string } | undefined;

export function worthWarming(opts: { signedIn: boolean; mode: ScannerMode; usedCamera: boolean; link: NetworkHint }): boolean {
  if (!opts.signedIn) return false;
  // On the OS-camera path there is no page-finder to warm.
  if (opts.mode === "native") return false;
  if (!opts.usedCamera) return false;
  if (opts.link?.saveData) return false;
  return !/2g$/.test(opts.link?.effectiveType ?? "");
}

function networkHint(): NetworkHint {
  return (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
}

// Idempotent and cheap to call again: loadOpenCV caches its promise
// module-wide, so the second caller joins the first one's download.
export function warmScanner(signedIn: boolean) {
  try {
    if (!worthWarming({ signedIn, mode: readScannerMode(), usedCamera: hasUsedCamera(), link: networkHint() })) return;
    loadOpenCV().catch(() => {});
  } catch {
    // A warm-up that throws has cost somebody a page for a download they did
    // not ask for.
  }
}

// Waits for a quiet moment first, for a warm-up nobody is waiting on. Returns
// its own cancel, so leaving the page before the idle callback runs does not
// start a 13 MB download into a screen that has gone.
export function warmScannerWhenIdle(signedIn: boolean): () => void {
  const warm = () => warmScanner(signedIn);
  if ("requestIdleCallback" in window) {
    const id = window.requestIdleCallback(warm);
    return () => window.cancelIdleCallback(id);
  }
  const timer = setTimeout(warm, 2000);
  return () => clearTimeout(timer);
}
