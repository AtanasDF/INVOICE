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
// Is a document already waiting to be read? Asked before the camera is
// opened, because opening one over a photograph somebody has just handed us is
// the wrong thing to do -- and once the camera can refuse, it is the wrong
// thing loudly.
export function scanCaptureWaiting(): boolean {
  try {
    return sessionStorage.getItem(HANDOFF_KEY) !== null;
  } catch {
    return false;
  }
}

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
// and several photos or PDFs can be more than sessionStorage holds. The
// address carries upload=1, so the page knows files are coming (and keeps
// the camera shut, or says they were lost if a full page load emptied
// this), and they're only handed to the page they were picked for.
let uploads: { files: ScanHandoff[]; path: string; failed: number } | null = null;

export function stashUploads(files: ScanHandoff[], href: string, failed: number): string {
  const [path, hash] = href.split("#");
  uploads = { files, path: path.split("?")[0], failed };
  return `${path}${path.includes("?") ? "&" : "?"}upload=1${hash ? `#${hash}` : ""}`;
}

export function uploadMarked(): boolean {
  return new URLSearchParams(window.location.search).get("upload") === "1";
}

// Once read, a refresh shouldn't expect them again.
export function dropUploadMarker(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete("upload");
  window.history.replaceState(null, "", url.pathname + url.search + url.hash);
}

export function takeUploads(path: string): { files: ScanHandoff[]; failed: number } | null {
  const taken = uploads?.path === path ? uploads : null;
  uploads = null;
  return taken;
}

export function leftOutNote(failed: number, total: number): string | null {
  return failed ? `${failed} of ${total} file${total === 1 ? "" : "s"} couldn't be read and ${failed === 1 ? "was" : "were"} left out.` : null;
}

// What a file is, from its first bytes, when the browser has no type for
// it. A photo saved out of a message, AirDropped, or renamed arrives with
// no extension and File.type "", and used to be tagged as a PDF: the
// page-counter then failed on it, the reader was sent a "PDF" of JPEG
// bytes, and the receipt was stored with an octet-stream data URL the
// list couldn't show. The base64 opening is enough to tell.
const SNIFF: [RegExp, string][] = [
  [/^\/9j\//, "image/jpeg"],
  [/^iVBORw0KGgo/, "image/png"],
  [/^UklGR/, "image/webp"],
  [/^R0lGOD/, "image/gif"],
  [/^JVBERi0/, "application/pdf"],
];
function typed(dataUrl: string, declared: string): { dataUrl: string; type: string } | null {
  if (declared) return { dataUrl, type: declared };
  const comma = dataUrl.indexOf(",");
  const hit = SNIFF.find(([re]) => re.test(dataUrl.slice(comma + 1, comma + 16)));
  return hit ? { dataUrl: `data:${hit[1]};base64,${dataUrl.slice(comma + 1)}`, type: hit[1] } : null;
}

// A picked file as a scan page takes it: photos downscaled like every
// capture (see imageDownscale), PDFs as they are. A file that is neither,
// and says nothing about itself, is refused here so it is counted as left
// out and said so, rather than sent on as a PDF it isn't.
export function readUpload(file: File): Promise<ScanHandoff> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const known = typed(reader.result as string, file.type);
        if (!known) throw new Error("Couldn't tell what kind of file this is.");
        const { downscaleImageDataUrl } = await import("@/lib/imageDownscale");
        const dataUrl = await downscaleImageDataUrl(known.dataUrl);
        resolve({ dataUrl, mediaType: known.type.startsWith("image/") ? "image/jpeg" : known.type });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error("Couldn't read that file."));
    reader.readAsDataURL(file);
  });
}
