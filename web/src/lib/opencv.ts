type CVModule = typeof import("@techstark/opencv-js") & { onRuntimeInitialized?: () => void; Mat?: unknown };

let cvPromise: Promise<CVModule> | null = null;

/**
 * Lazily loads OpenCV.js (a multi-MB WASM module) on first call and caches
 * the result -- nothing about this module is imported until a caller
 * actually needs computer vision, so pages that never open the camera
 * scanner never pay for it.
 */
export function loadOpenCV(): Promise<CVModule> {
  if (!cvPromise) {
    cvPromise = import("@techstark/opencv-js").then((mod) => {
      const cv = (mod as unknown as { default?: CVModule }).default ?? (mod as unknown as CVModule);
      if (cv.Mat) return cv;
      return new Promise<CVModule>((resolve) => {
        cv.onRuntimeInitialized = () => resolve(cv);
      });
    });
  }
  return cvPromise;
}
