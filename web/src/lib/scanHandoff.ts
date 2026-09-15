// Carries an iOS-native-camera capture across the dashboard -> /scan
// navigation -- the tap that opens the camera also has to navigate, so
// there's no way to hand the file directly through a component prop.
// sessionStorage survives that navigation and is scoped to the tab, so
// nothing lingers across sessions or leaks to other tabs.
const HANDOFF_KEY = "scan-handoff-capture";

export type ScanHandoff = { dataUrl: string; mediaType: string };

export function stashScanCapture(capture: ScanHandoff): void {
  try {
    sessionStorage.setItem(HANDOFF_KEY, JSON.stringify(capture));
  } catch {
    // sessionStorage unavailable (private-browsing quota, disabled
    // storage, etc.) -- the capture is just lost and /scan opens its
    // normal capture screen instead, a safe fallback, not a broken one.
  }
}

// Clears the key on every read, success or failure -- a stale key left
// behind would otherwise make the NEXT visit to /scan jump straight into
// extracting a photo the user didn't just take.
export function takeScanCapture(): ScanHandoff | null {
  try {
    const raw = sessionStorage.getItem(HANDOFF_KEY);
    sessionStorage.removeItem(HANDOFF_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ScanHandoff;
  } catch {
    return null;
  }
}
