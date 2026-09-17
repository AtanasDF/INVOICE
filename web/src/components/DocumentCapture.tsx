"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Mat, MatVector } from "@techstark/opencv-js";
import { CVModule, loadOpenCV } from "@/lib/opencv";
import { ScannerMode, consumeCameraHint, isIOS, readAutoCapture, readScannerMode, useIsIOS, writeAutoCapture, writeScannerMode } from "@/lib/platform";
import { downscaleImageDataUrl } from "@/lib/imageDownscale";
import { useWakeLock } from "@/lib/wakeLock";
import { PhotoIcon } from "@/components/icons";

type Point = { x: number; y: number };
type Quad = [Point, Point, Point, Point];
// Corners in work-frame pixels plus the work frame they were found in,
// so any consumer can rescale them to its own frame.
type WorkQuad = { pts: Quad; w: number; h: number };
// Everything OpenCV needs per tick, allocated once per work-frame size
// and reused: allocating and freeing seven Mats every tick was most of
// the per-frame cost on a phone.
type WorkMats = { w: number; h: number; src: Mat; gray: Mat; blurred: Mat; edges: Mat; kernel: Mat; contours: MatVector; hierarchy: Mat };
type Status = "starting" | "live" | "denied" | "timeout" | "unsupported";
type CvStatus = "loading" | "ready" | "failed";
type Coach = "line" | "closer" | "hold";
type ZoomRange = { min: number; max: number; step: number };
// zoom / focusMode / pointsOfInterest are in the Media Capture spec and
// implemented by Chromium, but not yet in lib.dom.d.ts.
type AdvancedConstraints = MediaTrackConstraintSet & { zoom?: number; focusMode?: string; pointsOfInterest?: Point[] };

export type CapturedFile = { dataUrl: string; mediaType: string };

type BarcodeDetectorResult = { rawValue: string };
type BarcodeDetectorInstance = { detect: (source: CanvasImageSource) => Promise<BarcodeDetectorResult[]> };
type BarcodeDetectorCtor = new (options?: { formats?: string[] }) => BarcodeDetectorInstance;

const DETECT_INTERVAL_MS = 150;
const WORK_WIDTH = 480;
// A four-corner contour has to cover this share of the work frame to be
// a candidate at all -- low enough that a page fitted inside the
// brackets from arm's length still counts.
const MIN_CONTOUR_AREA = 0.06;
// Auto-capture gates (empirical). A quad must hold still for STABLE_MS
// with each corner drifting under MOVE_TOLERANCE of the work-frame width
// per tick, cover at least MIN_COVERAGE of the work frame, and the frame
// must be at least SHARPNESS_RATIO of the sharpest seen in this stable
// run and above SHARPNESS_FLOOR (variance of the Laplacian) -- mostly a
// "focus has settled" check rather than an absolute bar. A run that
// stays stable for STABLE_TIMEOUT_MS captures regardless of sharpness so
// a dim room never dead-locks the scanner.
const STABLE_MS = 600;
const MOVE_TOLERANCE = 0.02;
const MIN_COVERAGE = 0.09;
const SHARPNESS_RATIO = 0.7;
const SHARPNESS_FLOOR = 12;
const STABLE_TIMEOUT_MS = 2500;
// Per-frame easing of the drawn outline toward the latest detected quad,
// so it glides between detection ticks instead of jumping at tick rate.
const OUTLINE_EASE = 0.35;
const FLASH_MS = 150;
const FAILURE_MS = 2500;
const FOCUS_RING_MS = 800;
// getUserMedia can hang indefinitely rather than reject in some real
// browser/OS blocking states (camera access blocked at the OS level for
// the whole browser, not just this site, is the most common one) -- with
// no timeout, that's exactly the "stuck on Starting camera... forever,
// no error, no prompt" dead end. This bounds it.
const CAMERA_TIMEOUT_MS = 8000;
const CV_ERROR_MAX = 140;
const GREEN = "#4ADE80";
const GUIDE_IDLE = "rgba(255,255,255,0.7)";
const GUIDE_WIDTH = 0.8;
const GUIDE_MAX_HEIGHT = 0.9;
const A4_RATIO = Math.SQRT2;
const SAFARI_CAMERA_TIP =
  "Safari asks each time until you allow it permanently: tap the aA button in the address bar, Website Settings, then set Camera to Allow.";

// A4 portrait frame, centred, as four corner brackets -- the thing to
// line the page up with whether or not edge detection is running.
function drawGuide(ctx: CanvasRenderingContext2D, w: number, h: number, color: string) {
  const gh = Math.min(GUIDE_WIDTH * Math.min(w, h) * A4_RATIO, GUIDE_MAX_HEIGHT * h);
  const gw = gh / A4_RATIO;
  const x0 = (w - gw) / 2;
  const y0 = (h - gh) / 2;
  const x1 = x0 + gw;
  const y1 = y0 + gh;
  const arm = gw * 0.12;
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.beginPath();
  for (const [cx, cy, dx, dy] of [
    [x0, y0, 1, 1],
    [x1, y0, -1, 1],
    [x1, y1, -1, -1],
    [x0, y1, 1, -1],
  ]) {
    ctx.moveTo(cx + dx * arm, cy);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx, cy + dy * arm);
  }
  ctx.stroke();
}

function orderPoints(pts: Point[]): Quad {
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

function scaleQuad(quad: WorkQuad, w: number, h: number): Quad {
  return quad.pts.map((p) => ({ x: (p.x / quad.w) * w, y: (p.y / quad.h) * h })) as Quad;
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

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label="Back"
      className="pointer-events-auto flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-black/50 text-white"
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
  const matsRef = useRef<WorkMats | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastRunRef = useRef(0);
  // Latest detected quad, and the eased outline (display pixels) the
  // overlay is currently showing on its way there.
  const quadRef = useRef<WorkQuad | null>(null);
  const outlineRef = useRef<Quad | null>(null);
  // Work-frame corners from the previous tick, for the movement check.
  const lastQuadRef = useRef<Quad | null>(null);
  const stableSinceRef = useRef<number | null>(null);
  const peakSharpRef = useRef(0);
  // Set the moment auto-capture fires; the parent unmounts this
  // component on onCapture, so it never fires twice per mount.
  const capturedRef = useRef(false);
  const autoRef = useRef(true);
  const onCaptureRef = useRef(onCapture);
  // processFrame lives in the long-lived effect below; this hands it the
  // current render's capture without restarting the stream.
  const captureRef = useRef<() => void>(() => {});
  const barcodeDetectorRef = useRef<BarcodeDetectorInstance | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nativeInputRef = useRef<HTMLInputElement>(null);
  const failureTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const iOSMode = useIsIOS();
  const [scannerMode, setScannerMode] = useState<ScannerMode>(readScannerMode);
  const useNative = iOSMode && scannerMode === "native";

  const [status, setStatus] = useState<Status>("starting");
  const [barcodeValue, setBarcodeValue] = useState<string | null>(null);
  const [coach, setCoach] = useState<Coach>("line");
  // On-screen readout toggled by tapping the hint: the only way to see
  // what the detection loop is doing on a phone in the field.
  const [debug, setDebug] = useState(false);
  const [debugText, setDebugText] = useState("");
  const diagRef = useRef({ ticks: 0, quads: 0, coverage: 0, sharpness: 0, lastTickMs: 0, videoW: 0, videoH: 0 });
  const [autoOn, setAutoOn] = useState(readAutoCapture);
  const [flash, setFlash] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [focusPoint, setFocusPoint] = useState<Point | null>(null);
  const [zoomRange, setZoomRange] = useState<ZoomRange | null>(null);
  const [zoom, setZoom] = useState(1);
  const [cssZoom, setCssZoom] = useState(1);
  const [retryKey, setRetryKey] = useState(0);
  // OpenCV is loaded the moment the live-camera path mounts. "failed"
  // carries the real error text: it is the diagnostic the user will
  // screenshot, so it is never rewritten into something friendlier.
  const [cvStatus, setCvStatus] = useState<CvStatus>("loading");
  const [cvError, setCvError] = useState<string | null>(null);
  const [cameraHint, setCameraHint] = useState(false);
  // processFrame lives inside a long-lived effect that only re-runs on
  // [stopStream, retryKey, useNative] -- it closes over state as it was
  // AT EFFECT-SETUP TIME, so a plain state read there would never observe
  // later updates. These refs are what processFrame actually checks; the
  // state exists only to re-render.
  const cvRef = useRef<CVModule | null>(null);
  const cssZoomRef = useRef(1);
  const statusRef = useRef<Status>("starting");

  useWakeLock(status === "live");

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    cssZoomRef.current = cssZoom;
  }, [cssZoom]);

  useEffect(() => {
    autoRef.current = autoOn;
  }, [autoOn]);

  useEffect(() => {
    onCaptureRef.current = onCapture;
  }, [onCapture]);

  function resetStable() {
    stableSinceRef.current = null;
    lastQuadRef.current = null;
    peakSharpRef.current = 0;
  }

  function toggleAuto() {
    const next = !autoOn;
    writeAutoCapture(next);
    resetStable();
    setAutoOn(next);
  }

  const freeMats = useCallback(() => {
    const m = matsRef.current;
    if (!m) return;
    matsRef.current = null;
    m.src.delete();
    m.gray.delete();
    m.blurred.delete();
    m.edges.delete();
    m.kernel.delete();
    m.contours.delete();
    m.hierarchy.delete();
  }, []);

  const stopStream = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    freeMats();
  }, [freeMats]);

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
    setRetryKey((k) => k + 1);
  }

  function switchScannerMode(mode: ScannerMode) {
    writeScannerMode(mode);
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
    let detecting = false;

    async function start() {
      cvRef.current = null;
      setCvStatus("loading");
      setCvError(null);
      loadOpenCV().then(
        (cv) => {
          if (cancelled) return;
          cvRef.current = cv;
          setCvStatus("ready");
        },
        (err) => {
          if (cancelled) return;
          console.error("OpenCV failed to load", err);
          setCvStatus("failed");
          setCvError((err instanceof Error ? err.message : String(err)).slice(0, CV_ERROR_MAX));
        }
      );

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
        try {
          const advanced: AdvancedConstraints = { focusMode: "continuous" };
          await track?.applyConstraints({ advanced: [advanced] });
        } catch {
          // focusMode unsupported here -- the stream's own default stands
        }
        if (cancelled) return;
        const caps = track?.getCapabilities?.() as (MediaTrackCapabilities & { zoom?: ZoomRange }) | undefined;
        if (caps?.zoom && caps.zoom.max > caps.zoom.min) {
          setZoomRange(caps.zoom);
          setZoom((track.getSettings() as { zoom?: number }).zoom ?? caps.zoom.min);
        } else {
          setZoomRange(null);
        }
        setStatus("live");
        if (isIOS() && consumeCameraHint()) setCameraHint(true);
        rafRef.current = requestAnimationFrame(loop);
      } catch {
        if (cancelled) return;
        setStatus(timedOut ? "timeout" : "denied");
      }
    }

    // The overlay redraws every frame from the last known quad; only the
    // OpenCV work is throttled, and never overlaps itself.
    function loop(timestamp: number) {
      if (cancelled) return;
      if (statusRef.current === "live") {
        drawOverlay();
        if (!detecting && timestamp - lastRunRef.current >= DETECT_INTERVAL_MS) {
          lastRunRef.current = timestamp;
          detecting = true;
          processFrame().finally(() => {
            detecting = false;
          });
        }
      }
      rafRef.current = requestAnimationFrame(loop);
    }

    function drawOverlay() {
      const video = videoRef.current;
      const overlay = overlayRef.current;
      if (!video || !overlay || video.videoWidth === 0) return;
      const displayW = video.clientWidth;
      const displayH = video.clientHeight;
      if (overlay.width !== displayW) overlay.width = displayW;
      if (overlay.height !== displayH) overlay.height = displayH;
      const octx = overlay.getContext("2d");
      if (!octx) return;
      octx.clearRect(0, 0, displayW, displayH);

      const quad = quadRef.current;
      if (!quad) {
        outlineRef.current = null;
        drawGuide(octx, displayW, displayH, GUIDE_IDLE);
        return;
      }
      const target = scaleQuad(quad, displayW, displayH);
      const shown = outlineRef.current;
      const outline = shown
        ? (shown.map((p, i) => ({ x: p.x + (target[i].x - p.x) * OUTLINE_EASE, y: p.y + (target[i].y - p.y) * OUTLINE_EASE })) as Quad)
        : target;
      outlineRef.current = outline;
      octx.strokeStyle = GREEN;
      octx.lineWidth = 3;
      octx.beginPath();
      octx.moveTo(outline[0].x, outline[0].y);
      for (let i = 1; i < outline.length; i++) octx.lineTo(outline[i].x, outline[i].y);
      octx.closePath();
      octx.stroke();
      drawGuide(octx, displayW, displayH, GREEN);
    }

    function ensureMats(cv: CVModule, w: number, h: number): WorkMats {
      const m = matsRef.current;
      if (m && m.w === w && m.h === h) return m;
      freeMats();
      const mats: WorkMats = {
        w,
        h,
        src: new cv.Mat(h, w, cv.CV_8UC4),
        gray: new cv.Mat(),
        blurred: new cv.Mat(),
        edges: new cv.Mat(),
        kernel: cv.Mat.ones(3, 3, cv.CV_8U),
        contours: new cv.MatVector(),
        hierarchy: new cv.Mat(),
      };
      matsRef.current = mats;
      return mats;
    }

    async function processFrame() {
      const video = videoRef.current;
      if (!video || video.readyState < 2 || video.videoWidth === 0) return;
      const tickStart = performance.now();
      diagRef.current.ticks++;
      diagRef.current.videoW = video.videoWidth;
      diagRef.current.videoH = video.videoHeight;

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
      if (cancelled || !streamRef.current) return;

      const cv = cvRef.current;
      if (!cv) return;

      const { sx, sy, sw, sh } = visibleRegion(video, cssZoomRef.current);
      const workW = WORK_WIDTH;
      const workH = Math.round((sh / sw) * WORK_WIDTH);
      if (!workCanvasRef.current) workCanvasRef.current = document.createElement("canvas");
      const work = workCanvasRef.current;
      if (work.width !== workW) work.width = workW;
      if (work.height !== workH) work.height = workH;
      const wctx = work.getContext("2d", { willReadFrequently: true });
      if (!wctx) return;
      wctx.drawImage(video, sx, sy, sw, sh, 0, 0, workW, workH);

      try {
        const { src, gray, blurred, edges, kernel, contours, hierarchy } = ensureMats(cv, workW, workH);
        src.data.set(wctx.getImageData(0, 0, workW, workH).data);
        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
        cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
        cv.Canny(blurred, edges, 50, 150);
        cv.dilate(edges, edges, kernel);
        cv.findContours(edges, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

        let best: Point[] | null = null;
        let bestArea = workW * workH * MIN_CONTOUR_AREA;
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

        // Variance of the Laplacian over the unblurred grey inside the
        // quad's bounding box -- the sharpness the auto-capture gate uses.
        let sharpness = 0;
        if (best) {
          const xs = best.map((p) => p.x);
          const ys = best.map((p) => p.y);
          const x0 = Math.max(0, Math.min(...xs));
          const y0 = Math.max(0, Math.min(...ys));
          const rect = new cv.Rect(x0, y0, Math.min(workW, Math.max(...xs)) - x0, Math.min(workH, Math.max(...ys)) - y0);
          const roi = gray.roi(rect);
          const lap = new cv.Mat();
          const mean = new cv.Mat();
          const stddev = new cv.Mat();
          cv.Laplacian(roi, lap, cv.CV_64F);
          cv.meanStdDev(lap, mean, stddev);
          sharpness = stddev.data64F[0] ** 2;
          roi.delete();
          lap.delete();
          mean.delete();
          stddev.delete();
        }

        diagRef.current.lastTickMs = Math.round(performance.now() - tickStart);
        diagRef.current.sharpness = Math.round(sharpness);
        diagRef.current.coverage = best ? Math.round((bestArea / (workW * workH)) * 100) : 0;
        if (best) diagRef.current.quads++;

        if (best) {
          const ordered = orderPoints(best);
          quadRef.current = { pts: ordered, w: workW, h: workH };

          const now = performance.now();
          const last = lastQuadRef.current;
          const moved = last !== null && ordered.some((p, i) => dist(p, last[i]) > MOVE_TOLERANCE * workW);
          lastQuadRef.current = ordered;
          const coverage = bestArea / (workW * workH);
          if (moved || coverage < MIN_COVERAGE) {
            stableSinceRef.current = null;
            peakSharpRef.current = 0;
          }
          if (coverage < MIN_COVERAGE) {
            setCoach("closer");
          } else {
            if (stableSinceRef.current === null) stableSinceRef.current = now;
            peakSharpRef.current = Math.max(peakSharpRef.current, sharpness);
            setCoach("hold");
            const stableFor = now - stableSinceRef.current;
            const sharpEnough = sharpness >= SHARPNESS_FLOOR && sharpness >= SHARPNESS_RATIO * peakSharpRef.current;
            const ready = (stableFor >= STABLE_MS && sharpEnough) || stableFor >= STABLE_TIMEOUT_MS;
            if (ready && autoRef.current && !capturedRef.current && statusRef.current === "live") {
              capturedRef.current = true;
              captureRef.current();
            }
          }
        } else {
          quadRef.current = null;
          resetStable();
          setCoach("line");
        }
      } catch (err) {
        // A bad frame must not stop the loop, but a repeating error is the
        // whole story when a phone shows "nothing to scan", so surface it.
        console.error("detection tick failed:", err);
        setCvError(String((err as Error)?.message ?? err).slice(0, 140));
        setCvStatus("failed");
      }
    }

    start();
    return () => {
      cancelled = true;
      stopStream();
    };
    // retryKey is intentionally a dependency purely to let retry() force
    // this whole effect (and therefore start()) to run again. cvStatus
    // (the state) is deliberately not listed -- processFrame reads cvRef
    // instead precisely so OpenCV arriving mid-effect doesn't need to
    // restart the camera stream just to start detection.
  }, [stopStream, freeMats, retryKey, useNative]);

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

  // The visible region of the current frame, perspective-warped to the
  // detected quad when there is one. Reads refs only: the auto-capture
  // path calls it from inside the long-lived detection effect.
  async function renderCapture(): Promise<string | null> {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return null;
    const { sx, sy, sw, sh } = visibleRegion(video, cssZoomRef.current);
    const full = document.createElement("canvas");
    full.width = Math.round(sw);
    full.height = Math.round(sh);
    const fctx = full.getContext("2d");
    if (!fctx) return null;
    fctx.drawImage(video, sx, sy, sw, sh, 0, 0, full.width, full.height);

    const quad = quadRef.current;
    const cv = cvRef.current;
    if (!quad || !cv) return full.toDataURL("image/jpeg", 0.92);

    try {
      const src = cv.imread(full);
      // The quad rescaled from the 480px work frame to the full-resolution
      // frame before the output size is measured, so a page captured from
      // further away still uses every native pixel available.
      const [tl, tr, br, bl] = scaleQuad(quad, full.width, full.height);
      const outW = Math.round(Math.max(dist(br, bl), dist(tr, tl)));
      const outH = Math.round(Math.max(dist(tr, br), dist(tl, bl)));

      const srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [tl.x, tl.y, tr.x, tr.y, br.x, br.y, bl.x, bl.y]);
      const dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, outW, 0, outW, outH, 0, outH]);
      const M = cv.getPerspectiveTransform(srcTri, dstTri);
      const dst = new cv.Mat();
      cv.warpPerspective(src, dst, M, new cv.Size(outW, outH));

      const out = document.createElement("canvas");
      out.width = outW;
      out.height = outH;
      cv.imshow(out, dst);

      src.delete();
      srcTri.delete();
      dstTri.delete();
      M.delete();
      dst.delete();

      return out.toDataURL("image/jpeg", 0.92);
    } catch {
      return full.toDataURL("image/jpeg", 0.92);
    }
  }

  // Straight to the parent with no review step; the pages strip there
  // offers a retake.
  async function capture() {
    setFlash(true);
    let dataUrl: string;
    try {
      const [image] = await Promise.all([renderCapture(), new Promise((r) => setTimeout(r, FLASH_MS))]);
      if (!image) throw new Error("Could not read this image.");
      dataUrl = await downscaleImageDataUrl(image);
    } catch (err) {
      setFlash(false);
      capturedRef.current = false;
      resetStable();
      showFailure(err instanceof Error ? err.message : "Could not read this image.");
      return;
    }
    stopStream();
    onCaptureRef.current({ dataUrl, mediaType: "image/jpeg" });
  }

  useEffect(() => {
    captureRef.current = capture;
  });

  function shutter() {
    if (capturedRef.current) return;
    capturedRef.current = true;
    capture();
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
  const hasQuad = coach !== "line";
  useEffect(() => {
    if (!debug) return;
    const id = setInterval(() => {
      const d = diagRef.current;
      setDebugText(
        `cv:${cvStatus} video:${d.videoW}x${d.videoH} ticks:${d.ticks} quads:${d.quads} cov:${d.coverage}% sharp:${d.sharpness} tick:${d.lastTickMs}ms coach:${coach} auto:${autoRef.current ? "on" : "off"}`
      );
    }, 500);
    return () => clearInterval(id);
  }, [debug, cvStatus, coach]);

  const hint =
    cvStatus === "failed"
      ? "Fit the page inside the corners and tap to capture"
      : !hasQuad
        ? "Fit the page inside the corners"
        : !autoOn
          ? "Ready — tap to capture"
          : coach === "closer"
            ? "Move closer"
            : "Hold still…";
  const cvLine =
    cvStatus === "loading" ? "Edge detection: loading…" : cvStatus === "failed" ? `Edge detection unavailable: ${cvError}` : null;

  // iOS: the in-page live-detection camera fundamentally can't win here.
  // getUserMedia on iOS Safari returns a low-resolution, fixed-focus
  // stream with no way to request otherwise -- soft images no OCR does
  // well with. And the contour detector needs the whole document inside
  // the frame with margin to find a closed quadrilateral, which is
  // incompatible with holding the phone close enough to keep text
  // legible. The native camera app has neither problem: full sensor
  // resolution, real autofocus, and no quad requirement since there's no
  // live crop to compute. It's also faster to open, since it skips the
  // multi-MB OpenCV WASM download entirely. The in-app scanner is the
  // default since auto-capture landed; this stays one tap away.
  if (useNative) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-black">
        <div className={`relative flex flex-1 flex-col items-center justify-center gap-3 ${shownFailure ? "border-4 border-red-500" : ""}`}>
          <div className="absolute left-4 z-10" style={{ top: "calc(1rem + env(safe-area-inset-top))" }}>
            <BackButton onClick={close} />
          </div>
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
        {(shownFailure || (hasQuad && status === "live")) && (
          <div className={`pointer-events-none absolute inset-0 border-4 ${shownFailure ? "border-red-500" : "border-[#4ADE80]"}`} />
        )}
        {flash && <div className="pointer-events-none absolute inset-0 z-10 bg-white" />}
        {focusPoint && (
          <div
            className="pointer-events-none absolute h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white"
            style={{ left: focusPoint.x, top: focusPoint.y }}
          />
        )}

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
            {iOSMode && <p className="text-neutral-400">{SAFARI_CAMERA_TIP}</p>}
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

        {/* One strip inside the safe area: back button and hint share a
            row so neither can sit on top of the other, the edge-detection
            status and any barcode banner stack below. The back button is
            always there -- the old bottom-bar "Cancel" text was easy to
            miss entirely while stuck on a black screen. */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col gap-1 px-4"
          style={{ paddingTop: "calc(1rem + env(safe-area-inset-top))" }}
        >
          <div className="flex items-center gap-2">
            <BackButton onClick={close} />
            {shownFailure ? (
              <div className="min-w-0 flex-1 rounded-lg bg-red-600/90 p-2 text-center text-xs font-medium text-white line-clamp-2">{shownFailure}</div>
            ) : (
              status === "live" && (
                <div
                  onClick={() => setDebug((d) => !d)}
                  className="pointer-events-auto min-w-0 flex-1 rounded-lg bg-black/50 p-2 text-center text-xs text-white line-clamp-2"
                >
                  {pageLabel ? `${pageLabel} · ${hint}` : hint}
                </div>
              )
            )}
          </div>
          {status === "live" && !shownFailure && cvLine && (
            <div className="rounded-lg bg-black/50 px-2 py-1 text-center text-[11px] text-neutral-300">{cvLine}</div>
          )}
          {status === "live" && debug && (
            <div className="rounded-lg bg-black/70 px-2 py-1 text-center font-mono text-[11px] text-neutral-200">
              {debugText}
            </div>
          )}
          {barcodeValue && !shownFailure && (
            <div className="pointer-events-auto rounded-lg bg-white/95 p-3 text-sm text-neutral-900 shadow">
              <div className="font-medium">Barcode detected: {barcodeValue}</div>
              <button onClick={() => setBarcodeValue(null)} className="mt-1 text-xs text-blue-600">Dismiss</button>
            </div>
          )}
        </div>

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
            <button onClick={toggleAuto} className="text-xs text-white/70 underline">
              Auto-capture: {autoOn ? "on" : "off"}
            </button>
            {iOSMode && (
              <button onClick={() => switchScannerMode("native")} className="text-xs text-white/70 underline">
                Use the native camera instead
              </button>
            )}
            {cameraHint && <p className="text-center text-xs text-neutral-400">{SAFARI_CAMERA_TIP}</p>}
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
              onClick={shutter}
              className={`h-16 w-16 rounded-full border-4 bg-white/20 ${hasQuad ? "border-[#4ADE80]" : "border-white"}`}
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
    </div>
  );
}
