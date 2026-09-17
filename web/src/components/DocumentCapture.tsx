"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { loadOpenCV } from "@/lib/opencv";
import { useIsIOS } from "@/lib/platform";
import { downscaleImageDataUrl } from "@/lib/imageDownscale";
import { useWakeLock } from "@/lib/wakeLock";
import { PhotoIcon } from "@/components/icons";

type Point = { x: number; y: number };
type Status = "starting" | "live" | "denied" | "timeout" | "unsupported" | "review";
type ScannerMode = "inapp" | "native";
type ZoomRange = { min: number; max: number; step: number };
// zoom / focusMode / pointsOfInterest are in the Media Capture spec and
// implemented by Chromium, but not yet in lib.dom.d.ts.
type AdvancedConstraints = MediaTrackConstraintSet & { zoom?: number; focusMode?: string; pointsOfInterest?: Point[] };

export type CapturedFile = { dataUrl: string; mediaType: string };

type BarcodeDetectorResult = { rawValue: string };
type BarcodeDetectorInstance = { detect: (source: CanvasImageSource) => Promise<BarcodeDetectorResult[]> };
type BarcodeDetectorCtor = new (options?: { formats?: string[] }) => BarcodeDetectorInstance;

const DETECT_INTERVAL_MS = 200;
const WORK_WIDTH = 480;
const STABLE_MS = 600;
const FAILURE_MS = 2500;
const FOCUS_RING_MS = 800;
const SCANNER_MODE_KEY = "scanner-mode";
// getUserMedia can hang indefinitely rather than reject in some real
// browser/OS blocking states (camera access blocked at the OS level for
// the whole browser, not just this site, is the most common one) -- with
// no timeout, that's exactly the "stuck on Starting camera... forever,
// no error, no prompt" dead end. This bounds it.
const CAMERA_TIMEOUT_MS = 8000;

function orderPoints(pts: Point[]): [Point, Point, Point, Point] {
  const sums = pts.map((p) => p.x + p.y);
  const diffs = pts.map((p) => p.x - p.y);
  const tl = pts[sums.indexOf(Math.min(...sums))];
  const br = pts[sums.indexOf(Math.max(...sums))];
  const tr = pts[diffs.indexOf(Math.max(...diffs))];
  const bl = pts[diffs.indexOf(Math.min(...diffs))];
  return [tl, tr, br, bl];
}

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// The part of the camera frame the user can actually see: object-cover
// trims whichever axis overflows the viewfinder, and the CSS zoom
// fallback trims further around the centre. Detection, the overlay and
// the capture all work in this region so the green outline lands on the
// document and the captured image is exactly what was on screen.
function visibleRegion(video: HTMLVideoElement, zoom: number) {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const cover = Math.max(video.clientWidth / vw, video.clientHeight / vh);
  const sw = video.clientWidth / cover / zoom;
  const sh = video.clientHeight / cover / zoom;
  return { sx: (vw - sw) / 2, sy: (vh - sh) / 2, sw, sh };
}

function readScannerMode(): ScannerMode {
  try {
    return localStorage.getItem(SCANNER_MODE_KEY) === "inapp" ? "inapp" : "native";
  } catch {
    return "native";
  }
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label="Back"
      className="absolute left-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white"
      style={{ top: "calc(1rem + env(safe-area-inset-top))" }}
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-6 w-6">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
      </svg>
    </button>
  );
}

export default function DocumentCapture({
  onCapture,
  onClose,
  pageNumber,
  failureMessage,
}: {
  onCapture: (file: CapturedFile) => void;
  onClose: () => void;
  pageNumber?: number;
  failureMessage?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const liveAreaRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const workCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastRunRef = useRef(0);
  const quadRef = useRef<[Point, Point, Point, Point] | null>(null);
  const quadSinceRef = useRef<number | null>(null);
  const barcodeDetectorRef = useRef<BarcodeDetectorInstance | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nativeInputRef = useRef<HTMLInputElement>(null);
  const failureTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const iOSMode = useIsIOS();
  const [scannerMode, setScannerMode] = useState<ScannerMode>(readScannerMode);
  const useNative = iOSMode && scannerMode === "native";

  const [status, setStatus] = useState<Status>("starting");
  const [reviewImage, setReviewImage] = useState<string | null>(null);
  const [barcodeValue, setBarcodeValue] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [focusPoint, setFocusPoint] = useState<Point | null>(null);
  const [zoomRange, setZoomRange] = useState<ZoomRange | null>(null);
  const [zoom, setZoom] = useState(1);
  const [cssZoom, setCssZoom] = useState(1);
  const [retryKey, setRetryKey] = useState(0);
  // Distinguishes "OpenCV itself never loaded" (WASM/network failure --
  // detection can never work this session) from the ordinary per-frame
  // "no document currently in view" -- previously both looked identical:
  // the overlay just never appeared, silently, forever. Only meaningful
  // on the non-iOS path below, which is the only one that loads OpenCV.
  const [cvUnavailable, setCvUnavailable] = useState(false);
  // processFrame lives inside a long-lived effect that only re-runs on
  // [stopStream, retryKey, useNative] -- it closes over state as it was
  // AT EFFECT-SETUP TIME, so a plain state read there would never observe
  // later updates. These refs are what processFrame actually checks; the
  // state exists only to re-render.
  const cvUnavailableRef = useRef(false);
  const cssZoomRef = useRef(1);
  const statusRef = useRef<Status>("starting");

  useWakeLock(status === "live");

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    cssZoomRef.current = cssZoom;
  }, [cssZoom]);

  const stopStream = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  function showFailure(message: string) {
    setFailure(message);
    if (failureTimerRef.current) clearTimeout(failureTimerRef.current);
    failureTimerRef.current = setTimeout(() => setFailure(null), FAILURE_MS);
  }

  // The parent's failure is shown straight from the prop; this only
  // records when its 2.5s are up so the view returns to live scanning.
  const [expiredFailureMessage, setExpiredFailureMessage] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (!failureMessage) return;
    const t = setTimeout(() => setExpiredFailureMessage(failureMessage), FAILURE_MS);
    return () => clearTimeout(t);
  }, [failureMessage]);
  const shownFailure = failure ?? (failureMessage && failureMessage !== expiredFailureMessage ? failureMessage : null);

  useEffect(
    () => () => {
      if (failureTimerRef.current) clearTimeout(failureTimerRef.current);
      if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
    },
    []
  );

  function retry() {
    setStatus("starting");
    cvUnavailableRef.current = false;
    setCvUnavailable(false);
    setRetryKey((k) => k + 1);
  }

  function switchScannerMode(mode: ScannerMode) {
    try {
      localStorage.setItem(SCANNER_MODE_KEY, mode);
    } catch {
      // private mode / storage blocked -- the choice just won't persist
    }
    setStatus("starting");
    setScannerMode(mode);
  }

  useEffect(() => {
    // Skip entirely on the native-camera path -- see the early return in
    // the render below. Re-runs if iOSMode's post-hydration correction
    // flips it or the user switches scanner mode (useNative is a
    // dependency).
    if (useNative) return;

    let cancelled = false;

    async function start() {
      const BarcodeDetectorGlobal = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
      if (BarcodeDetectorGlobal) {
        try {
          barcodeDetectorRef.current = new BarcodeDetectorGlobal();
        } catch {
          barcodeDetectorRef.current = null;
        }
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        if (!cancelled) setStatus("unsupported");
        return;
      }

      // Where supported (Chrome/Edge; Safari and Firefox don't implement
      // the Permissions API for camera), check the existing grant first.
      // If it's already denied, calling getUserMedia again wouldn't show
      // a prompt at all -- going straight to the "denied" explanation
      // avoids relying on getUserMedia to reject promptly (or at all) in
      // that state.
      try {
        const perm = await navigator.permissions?.query({ name: "camera" as PermissionName });
        if (perm?.state === "denied") {
          if (!cancelled) setStatus("denied");
          return;
        }
      } catch {
        // Permissions API unsupported or "camera" not a recognized name
        // on this browser -- fall through and just try getUserMedia.
      }

      let timedOut = false;
      const timeout = new Promise<never>((_, reject) => {
        setTimeout(() => {
          timedOut = true;
          reject(new Error("timeout"));
        }, CAMERA_TIMEOUT_MS);
      });

      try {
        const stream = await Promise.race([
          navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          }),
          timeout,
        ]);
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        if (cancelled) return;
        const track = stream.getVideoTracks()[0];
        const caps = track?.getCapabilities?.() as (MediaTrackCapabilities & { zoom?: ZoomRange }) | undefined;
        if (caps?.zoom && caps.zoom.max > caps.zoom.min) {
          setZoomRange(caps.zoom);
          setZoom((track.getSettings() as { zoom?: number }).zoom ?? caps.zoom.min);
        } else {
          setZoomRange(null);
        }
        setStatus("live");
        rafRef.current = requestAnimationFrame(loop);
      } catch {
        if (cancelled) return;
        setStatus(timedOut ? "timeout" : "denied");
      }
    }

    async function loop(timestamp: number) {
      if (cancelled) return;
      if (statusRef.current === "live" && timestamp - lastRunRef.current >= DETECT_INTERVAL_MS) {
        lastRunRef.current = timestamp;
        await processFrame();
      }
      rafRef.current = requestAnimationFrame(loop);
    }

    async function processFrame() {
      const video = videoRef.current;
      const overlay = overlayRef.current;
      if (!video || !overlay || video.readyState < 2 || video.videoWidth === 0) return;

      const displayW = video.clientWidth;
      const displayH = video.clientHeight;
      if (overlay.width !== displayW) overlay.width = displayW;
      if (overlay.height !== displayH) overlay.height = displayH;
      const octx = overlay.getContext("2d");
      if (!octx) return;
      octx.clearRect(0, 0, overlay.width, overlay.height);

      // Barcode check runs on the live video frame directly -- cheap,
      // native, and independent of OpenCV, so it still runs even if
      // OpenCV itself failed to load.
      if (barcodeDetectorRef.current) {
        try {
          const codes = await barcodeDetectorRef.current.detect(video);
          if (codes.length > 0) {
            setBarcodeValue(codes[0].rawValue);
          }
        } catch {
          // detector can throw on a transient bad frame; ignore and keep going
        }
      }

      if (cvUnavailableRef.current) return;

      const { sx, sy, sw, sh } = visibleRegion(video, cssZoomRef.current);
      const workW = WORK_WIDTH;
      const workH = Math.round((sh / sw) * WORK_WIDTH);
      if (!workCanvasRef.current) workCanvasRef.current = document.createElement("canvas");
      const work = workCanvasRef.current;
      work.width = workW;
      work.height = workH;
      const wctx = work.getContext("2d");
      if (!wctx) return;
      wctx.drawImage(video, sx, sy, sw, sh, 0, 0, workW, workH);

      let cv;
      try {
        cv = await loadOpenCV();
      } catch {
        // OpenCV itself never loaded (WASM/network failure) -- distinct
        // from a single bad frame below, and not going to fix itself on
        // the next tick, so stop retrying it every 200ms and let the
        // camera keep working as manual-capture-only.
        cvUnavailableRef.current = true;
        if (!cancelled) setCvUnavailable(true);
        return;
      }

      try {
        const src = cv.imread(work);
        const gray = new cv.Mat();
        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
        cv.GaussianBlur(gray, gray, new cv.Size(5, 5), 0);
        const edges = new cv.Mat();
        cv.Canny(gray, edges, 50, 150);
        const kernel = cv.Mat.ones(3, 3, cv.CV_8U);
        cv.dilate(edges, edges, kernel);
        const contours = new cv.MatVector();
        const hierarchy = new cv.Mat();
        cv.findContours(edges, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

        let best: Point[] | null = null;
        let bestArea = workW * workH * 0.15;
        for (let i = 0; i < contours.size(); i++) {
          const c = contours.get(i);
          const peri = cv.arcLength(c, true);
          const approx = new cv.Mat();
          cv.approxPolyDP(c, approx, 0.02 * peri, true);
          if (approx.rows === 4 && cv.isContourConvex(approx)) {
            const area = Math.abs(cv.contourArea(approx));
            if (area > bestArea) {
              bestArea = area;
              const pts: Point[] = [];
              for (let j = 0; j < 4; j++) {
                pts.push({ x: approx.data32S[j * 2], y: approx.data32S[j * 2 + 1] });
              }
              best = pts;
            }
          }
          approx.delete();
          c.delete();
        }

        src.delete();
        gray.delete();
        edges.delete();
        kernel.delete();
        contours.delete();
        hierarchy.delete();

        if (best) {
          const toDisplay = (p: Point): Point => ({
            x: (p.x / workW) * displayW,
            y: (p.y / workH) * displayH,
          });
          // Region-relative, matching the crop capture() draws.
          const toRegion = (p: Point): Point => ({
            x: (p.x / workW) * sw,
            y: (p.y / workH) * sh,
          });
          const ordered = orderPoints(best);
          quadRef.current = ordered.map(toRegion) as [Point, Point, Point, Point];
          const now = performance.now();
          if (quadSinceRef.current === null) quadSinceRef.current = now;
          setReady(now - quadSinceRef.current >= STABLE_MS);

          const displayPts = ordered.map(toDisplay);
          octx.strokeStyle = "#4ADE80";
          octx.lineWidth = 3;
          octx.beginPath();
          octx.moveTo(displayPts[0].x, displayPts[0].y);
          for (let i = 1; i < displayPts.length; i++) octx.lineTo(displayPts[i].x, displayPts[i].y);
          octx.closePath();
          octx.stroke();
        } else {
          quadRef.current = null;
          quadSinceRef.current = null;
          setReady(false);
        }
      } catch {
        // a single bad frame shouldn't take down the scanner
      }
    }

    start();
    return () => {
      cancelled = true;
      stopStream();
    };
    // retryKey is intentionally a dependency purely to let retry() force
    // this whole effect (and therefore start()) to run again. cvUnavailable
    // (the state) is deliberately not listed -- processFrame reads
    // cvUnavailableRef instead precisely so setting it mid-effect doesn't
    // need to restart the camera stream just to skip detection.
  }, [stopStream, retryKey, useNative]);

  function applyZoom(value: number) {
    setZoom(value);
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const advanced: AdvancedConstraints = { zoom: value };
    track.applyConstraints({ advanced: [advanced] }).catch(() => {});
  }

  function focusAt(e: React.MouseEvent<HTMLVideoElement>) {
    const video = videoRef.current;
    const area = liveAreaRef.current;
    if (!video || !area) return;
    const rect = area.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setFocusPoint({ x, y });
    if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
    focusTimerRef.current = setTimeout(() => setFocusPoint(null), FOCUS_RING_MS);

    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || video.videoWidth === 0) return;
    const r = visibleRegion(video, cssZoom);
    const advanced: AdvancedConstraints = {
      focusMode: "single-shot",
      pointsOfInterest: [
        { x: (r.sx + (x / rect.width) * r.sw) / video.videoWidth, y: (r.sy + (y / rect.height) * r.sh) / video.videoHeight },
      ],
    };
    (async () => {
      try {
        await track.applyConstraints({ advanced: [advanced] });
      } catch {
        // focus constraints unsupported here -- the ring alone is the feedback
      }
    })();
  }

  function capture() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;
    const { sx, sy, sw, sh } = visibleRegion(video, cssZoom);
    const full = document.createElement("canvas");
    full.width = Math.round(sw);
    full.height = Math.round(sh);
    const fctx = full.getContext("2d");
    if (!fctx) return;
    fctx.drawImage(video, sx, sy, sw, sh, 0, 0, full.width, full.height);

    const quad = quadRef.current;
    if (!quad) {
      setReviewImage(full.toDataURL("image/jpeg", 0.92));
      setStatus("review");
      return;
    }

    (async () => {
      try {
        const cv = await loadOpenCV();
        const src = cv.imread(full);
        const [tl, tr, br, bl] = quad;
        const widthA = dist(br, bl);
        const widthB = dist(tr, tl);
        const maxWidth = Math.max(widthA, widthB);
        const heightA = dist(tr, br);
        const heightB = dist(tl, bl);
        const maxHeight = Math.max(heightA, heightB);

        const srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [tl.x, tl.y, tr.x, tr.y, br.x, br.y, bl.x, bl.y]);
        const dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, maxWidth, 0, maxWidth, maxHeight, 0, maxHeight]);
        const M = cv.getPerspectiveTransform(srcTri, dstTri);
        const dst = new cv.Mat();
        cv.warpPerspective(src, dst, M, new cv.Size(maxWidth, maxHeight));

        const out = document.createElement("canvas");
        out.width = maxWidth;
        out.height = maxHeight;
        cv.imshow(out, dst);

        src.delete();
        srcTri.delete();
        dstTri.delete();
        M.delete();
        dst.delete();

        setReviewImage(out.toDataURL("image/jpeg", 0.92));
        setStatus("review");
      } catch {
        setReviewImage(full.toDataURL("image/jpeg", 0.92));
        setStatus("review");
      }
    })();
  }

  function retake() {
    setReviewImage(null);
    setBarcodeValue(null);
    quadSinceRef.current = null;
    setReady(false);
    setStatus("live");
  }

  async function confirmCapture() {
    if (!reviewImage) return;
    let dataUrl: string;
    try {
      dataUrl = await downscaleImageDataUrl(reviewImage);
    } catch (err) {
      retake();
      showFailure(err instanceof Error ? err.message : "Could not read this image.");
      return;
    }
    stopStream();
    onCapture({ dataUrl, mediaType: "image/jpeg" });
  }

  function readAndCapture(file: File) {
    const reader = new FileReader();
    reader.onload = async () => {
      let dataUrl: string;
      try {
        dataUrl = await downscaleImageDataUrl(reader.result as string);
      } catch (err) {
        showFailure(err instanceof Error ? err.message : "Could not read this file.");
        return;
      }
      stopStream();
      onCapture({ dataUrl, mediaType: file.type.startsWith("image/") ? "image/jpeg" : file.type });
    };
    reader.onerror = () => showFailure("Could not read this file.");
    reader.readAsDataURL(file);
  }

  function onFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Cleared so picking the same file again after a failure re-fires change.
    e.target.value = "";
    if (file) readAndCapture(file);
  }

  function close() {
    stopStream();
    onClose();
  }

  const pageLabel = pageNumber && pageNumber > 1 ? `Page ${pageNumber}` : null;
  const hint = cvUnavailable ? "Line it up and tap to capture" : ready ? "Ready — tap to capture" : "Line up the document in view";

  // iOS: the in-page live-detection camera fundamentally can't win here.
  // getUserMedia on iOS Safari returns a low-resolution, fixed-focus
  // stream with no way to request otherwise -- soft images no OCR does
  // well with. And the contour detector needs the whole document inside
  // the frame with margin to find a closed quadrilateral, which is
  // incompatible with holding the phone close enough to keep text
  // legible. The native camera app has neither problem: full sensor
  // resolution, real autofocus, and no quad requirement since there's no
  // live crop to compute. It's also faster to open, since it skips the
  // multi-MB OpenCV WASM download entirely. Still the default; the
  // in-app scanner is one tap away for anyone who prefers it.
  if (useNative) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-black">
        <div className={`relative flex flex-1 flex-col items-center justify-center gap-3 ${shownFailure ? "border-4 border-red-500" : ""}`}>
          <BackButton onClick={close} />
          {pageLabel && <p className="text-sm font-medium text-white">{pageLabel}</p>}
          <p className="px-8 text-center text-sm text-white/70">
            Take a clear, well-lit photo of the whole document.
          </p>
          {shownFailure && <p className="px-8 text-center text-sm text-red-400">{shownFailure}</p>}
        </div>
        <div className="space-y-2 p-4" style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}>
          <button
            onClick={() => nativeInputRef.current?.click()}
            className="w-full rounded-lg bg-white px-5 py-3 text-center text-sm font-medium text-neutral-900"
          >
            Take a photo
          </button>
          {/* capture="environment" forces straight to the camera on iOS
              Safari, which is exactly what the button above wants -- but
              it also makes the photo library and PDFs unreachable. This
              is the same accept as the non-iOS upload input below, just
              without capture, so both are actually usable here: an
              existing photo, or a PDF invoice from email. */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full rounded-lg border border-white/30 px-5 py-3 text-center text-sm font-medium text-white"
          >
            Upload instead
          </button>
          <button onClick={() => switchScannerMode("inapp")} className="w-full py-1 text-center text-xs text-white/70 underline">
            Use the in-app scanner instead
          </button>
          <input
            ref={nativeInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={onFileChosen}
            className="hidden"
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,application/pdf"
            onChange={onFileChosen}
            className="hidden"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <div ref={liveAreaRef} className="relative flex-1 overflow-hidden">
        <video
          ref={videoRef}
          playsInline
          muted
          onClick={focusAt}
          className="h-full w-full object-cover"
          style={cssZoom !== 1 ? { transform: `scale(${cssZoom})` } : undefined}
        />
        <canvas ref={overlayRef} className="pointer-events-none absolute inset-0 h-full w-full" />
        {(shownFailure || (ready && status === "live")) && (
          <div className={`pointer-events-none absolute inset-0 border-4 ${shownFailure ? "border-red-500" : "border-[#4ADE80]"}`} />
        )}
        {focusPoint && (
          <div
            className="pointer-events-none absolute h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white"
            style={{ left: focusPoint.x, top: focusPoint.y }}
          />
        )}

        {/* Always visible, regardless of status -- the old bottom-bar
            "Cancel" text was easy to miss entirely while stuck on a
            black screen with no other affordance. */}
        <BackButton onClick={close} />

        {status === "starting" && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-white">Starting camera…</div>
        )}
        {status === "timeout" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black p-6 text-center text-sm text-white">
            <p>The camera didn&apos;t respond. This usually means access is blocked somewhere your browser won&apos;t report directly (an OS-level camera privacy setting is the most common one) — check there, or upload a photo or PDF instead.</p>
            <button onClick={retry} className="rounded-lg border border-white/30 px-4 py-2 text-sm font-medium text-white">
              Try again
            </button>
          </div>
        )}
        {status === "denied" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black p-6 text-center text-sm text-white">
            <p>Camera access was denied. You can allow it from your browser&apos;s site settings, or upload a photo or PDF instead.</p>
            <button onClick={retry} className="rounded-lg border border-white/30 px-4 py-2 text-sm font-medium text-white">
              Try again
            </button>
          </div>
        )}
        {status === "unsupported" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black p-6 text-center text-sm text-white">
            <p>This browser doesn&apos;t support camera capture here. Upload a photo or PDF instead.</p>
          </div>
        )}
        {barcodeValue && !shownFailure && (
          <div
            className="absolute inset-x-4 rounded-lg bg-white/95 p-3 text-sm text-neutral-900 shadow"
            style={{ top: "calc(1rem + env(safe-area-inset-top))" }}
          >
            <div className="font-medium">Barcode detected: {barcodeValue}</div>
            <button onClick={() => setBarcodeValue(null)} className="mt-1 text-xs text-blue-600">Dismiss</button>
          </div>
        )}
        {shownFailure ? (
          <div
            className="absolute inset-x-4 rounded-lg bg-red-600/90 p-2 text-center text-xs font-medium text-white"
            style={{ top: "calc(1rem + env(safe-area-inset-top))" }}
          >
            {shownFailure}
          </div>
        ) : (
          status === "live" &&
          !barcodeValue && (
            <div
              className="absolute inset-x-4 rounded-lg bg-black/50 p-2 text-center text-xs text-white"
              style={{ top: "calc(1rem + env(safe-area-inset-top))" }}
            >
              {pageLabel ? `${pageLabel} · ${hint}` : hint}
            </div>
          )
        )}
        {status === "live" && (
          <div className="absolute inset-x-8 bottom-3 flex flex-col items-center gap-2">
            {zoomRange ? (
              <input
                type="range"
                aria-label="Zoom"
                min={zoomRange.min}
                max={zoomRange.max}
                step={zoomRange.step}
                value={zoom}
                onChange={(e) => applyZoom(Number(e.target.value))}
                className="w-full max-w-xs accent-white"
              />
            ) : (
              <div className="flex overflow-hidden rounded-full bg-black/50 text-xs font-medium text-white">
                {[1, 2].map((z) => (
                  <button
                    key={z}
                    onClick={() => setCssZoom(z)}
                    aria-pressed={cssZoom === z}
                    className={`px-3 py-1 ${cssZoom === z ? "bg-white text-neutral-900" : ""}`}
                  >
                    {z}×
                  </button>
                ))}
              </div>
            )}
            {iOSMode && (
              <button onClick={() => switchScannerMode("native")} className="text-xs text-white/70 underline">
                Use the native camera instead
              </button>
            )}
          </div>
        )}
      </div>

      <div className="relative flex items-center justify-center bg-black p-4" style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}>
        {status === "live" ? (
          <>
            <button
              onClick={() => fileInputRef.current?.click()}
              aria-label="Add a photo or PDF from your library"
              className="absolute left-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white"
            >
              <PhotoIcon className="h-5 w-5" />
            </button>
            <button
              onClick={capture}
              className={`h-16 w-16 rounded-full border-4 bg-white/20 ${ready ? "border-[#4ADE80]" : "border-white"}`}
              aria-label="Capture"
            />
          </>
        ) : (
          // Camera isn't usable right now (still starting, denied,
          // timed out, unsupported) -- Upload is the only thing that
          // actually works, so it gets the primary button, not the
          // smallest text on the page.
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full max-w-xs rounded-lg bg-white px-5 py-3 text-center text-sm font-medium text-neutral-900"
          >
            Upload a photo or PDF
          </button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,application/pdf"
          onChange={onFileChosen}
          className="hidden"
        />
      </div>

      {/* Rendered over the live view rather than instead of it so the
          video element (and its srcObject) survives a Retake. */}
      {status === "review" && reviewImage && (
        <div className="absolute inset-0 z-20 flex flex-col bg-black">
          {pageLabel && (
            <p className="px-4 text-center text-sm font-medium text-white" style={{ paddingTop: "calc(1rem + env(safe-area-inset-top))" }}>
              {pageLabel}
            </p>
          )}
          <div className="flex flex-1 items-center justify-center overflow-hidden p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={reviewImage} alt="Captured document" className="max-h-full max-w-full rounded-lg object-contain" />
          </div>
          <div className="flex gap-3 p-4" style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}>
            <button onClick={retake} className="flex-1 rounded-lg border border-white/30 px-4 py-3 text-sm font-medium text-white">
              Retake
            </button>
            <button onClick={confirmCapture} className="flex-1 rounded-lg bg-white px-4 py-3 text-sm font-medium text-neutral-900">
              Use this photo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
