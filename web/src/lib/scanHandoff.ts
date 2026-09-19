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

// Files picked with "Upload from files" on another page, for the page that
// reads them. Held in memory: getting there is a client-side navigation,
// and several photos or PDFs can be more than sessionStorage holds.
let uploads: ScanHandoff[] | null = null;

export function stashUploads(files: ScanHandoff[]): void {
  uploads = files;
}

export function takeUploads(): ScanHandoff[] | null {
  const taken = uploads;
  uploads = null;
  return taken;
}

// A picked file as a scan page takes it: photos downscaled like every
// capture (see imageDownscale), PDFs as they are.
export function readUpload(file: File): Promise<ScanHandoff> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const { downscaleImageDataUrl } = await import("@/lib/imageDownscale");
        const dataUrl = await downscaleImageDataUrl(reader.result as string);
        resolve({ dataUrl, mediaType: file.type.startsWith("image/") ? "image/jpeg" : file.type || "application/pdf" });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error("Could not read this file."));
    reader.readAsDataURL(file);
  });
}
