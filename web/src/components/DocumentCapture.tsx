"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { loadOpenCV } from "@/lib/opencv";

type Point = { x: number; y: number };
type Status = "starting" | "live" | "denied" | "timeout" | "unsupported" | "review";

export type CapturedFile = { dataUrl: string; mediaType: string };

type BarcodeDetectorResult = { rawValue: string };
type BarcodeDetectorInstance = { detect: (source: CanvasImageSource) => Promise<BarcodeDetectorResult[]> };
type BarcodeDetectorCtor = new (options?: { formats?: string[] }) => BarcodeDetectorInstance;

const DETECT_INTERVAL_MS = 200;
const WORK_WIDTH = 480;
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

export default function DocumentCapture({
  onCapture,
  onClose,
}: {
  onCapture: (file: CapturedFile) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const workCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastRunRef = useRef(0);
  const quadRef = useRef<[Point, Point, Point, Point] | null>(null);
  const barcodeDetectorRef = useRef<BarcodeDetectorInstance | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [status, setStatus] = useState<Status>("starting");
  const [reviewImage, setReviewImage] = useState<string | null>(null);
  const [barcodeValue, setBarcodeValue] = useState<string | null>(null);
  const [hasQuad, setHasQuad] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  const stopStream = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  function retry() {
    setStatus("starting");
    setRetryKey((k) => k + 1);
  }

  useEffect(() => {
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
          navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } } }),
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
        setStatus("live");
        rafRef.current = requestAnimationFrame(loop);
      } catch {
        if (cancelled) return;
        setStatus(timedOut ? "timeout" : "denied");
      }
    }

    async function loop(timestamp: number) {
      if (timestamp - lastRunRef.current >= DETECT_INTERVAL_MS) {
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

      // Barcode check runs on the live video frame directly -- cheap, native.
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

      const scale = WORK_WIDTH / video.videoWidth;
      const workW = WORK_WIDTH;
      const workH = Math.round(video.videoHeight * scale);
      if (!workCanvasRef.current) workCanvasRef.current = document.createElement("canvas");
      const work = workCanvasRef.current;
      work.width = workW;
      work.height = workH;
      const wctx = work.getContext("2d");
      if (!wctx) return;
      wctx.drawImage(video, 0, 0, workW, workH);

      try {
        const cv = await loadOpenCV();
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
          const toNatural = (p: Point): Point => ({
            x: (p.x / workW) * video.videoWidth,
            y: (p.y / workH) * video.videoHeight,
          });
          const ordered = orderPoints(best);
          quadRef.current = ordered.map(toNatural) as [Point, Point, Point, Point];
          setHasQuad(true);

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
          setHasQuad(false);
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
    // this whole effect (and therefore start()) to run again.
  }, [stopStream, retryKey]);

  function capture() {
    const video = videoRef.current;
    if (!video) return;
    const full = document.createElement("canvas");
    full.width = video.videoWidth;
    full.height = video.videoHeight;
    const fctx = full.getContext("2d");
    if (!fctx) return;
    fctx.drawImage(video, 0, 0);

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
    setStatus("live");
  }

  function confirmCapture() {
    if (!reviewImage) return;
    stopStream();
    onCapture({ dataUrl: reviewImage, mediaType: "image/jpeg" });
  }

  function onFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      stopStream();
      onCapture({ dataUrl: reader.result as string, mediaType: file.type });
    };
    reader.readAsDataURL(file);
  }

  function close() {
    stopStream();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      {status === "review" && reviewImage ? (
        <div className="flex flex-1 flex-col">
          <div className="flex flex-1 items-center justify-center overflow-hidden p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={reviewImage} alt="Captured document" className="max-h-full max-w-full rounded-lg object-contain" />
          </div>
          <div className="flex gap-3 p-4">
            <button onClick={retake} className="flex-1 rounded-lg border border-white/30 px-4 py-3 text-sm font-medium text-white">
              Retake
            </button>
            <button onClick={confirmCapture} className="flex-1 rounded-lg bg-white px-4 py-3 text-sm font-medium text-neutral-900">
              Use this photo
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="relative flex-1 overflow-hidden">
            <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
            <canvas ref={overlayRef} className="pointer-events-none absolute inset-0 h-full w-full" />

            {/* Always visible, regardless of status -- the old bottom-bar
                "Cancel" text was easy to miss entirely while stuck on a
                black screen with no other affordance. */}
            <button
              onClick={close}
              aria-label="Back"
              className="absolute left-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-6 w-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>

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
            {barcodeValue && (
              <div className="absolute inset-x-4 top-4 rounded-lg bg-white/95 p-3 text-sm text-neutral-900 shadow">
                <div className="font-medium">Barcode detected: {barcodeValue}</div>
                <button onClick={() => setBarcodeValue(null)} className="mt-1 text-xs text-blue-600">Dismiss</button>
              </div>
            )}
            {status === "live" && !barcodeValue && (
              <div className="absolute inset-x-4 top-4 rounded-lg bg-black/50 p-2 text-center text-xs text-white">
                {hasQuad ? "Document detected — tap to capture" : "Line up the document in view"}
              </div>
            )}
          </div>

          <div className="flex items-center justify-center gap-4 bg-black p-4">
            {status === "live" ? (
              <>
                <button
                  onClick={capture}
                  className="h-16 w-16 rounded-full border-4 border-white bg-white/20"
                  aria-label="Capture"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-lg border border-white/30 px-5 py-3 text-sm font-medium text-white"
                >
                  Upload instead
                </button>
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
        </>
      )}
    </div>
  );
}
