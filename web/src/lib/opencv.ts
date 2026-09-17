export type CVModule = typeof import("@techstark/opencv-js") & { onRuntimeInitialized?: () => void; Mat?: unknown };

const INIT_TIMEOUT_MS = 20_000;

let cvPromise: Promise<CVModule> | null = null;

function waitForRuntime(cv: CVModule): Promise<CVModule> {
  if (cv.Mat) return Promise.resolve(cv);
  return new Promise((resolve) => {
    cv.onRuntimeInitialized = () => resolve(cv);
  });
}

/**
 * Lazily loads OpenCV.js (a multi-MB WASM module) on first call and caches
 * the result -- nothing about this module is imported until a caller
 * actually needs computer vision, so pages that never open the camera
 * scanner never pay for it.
 */
export function loadOpenCV(): Promise<CVModule> {
  if (!cvPromise) {
    cvPromise = import("./opencv-module")
      .catch((err) => {
        throw new Error(`import failed: ${err instanceof Error ? err.message : String(err)}`);
      })
      .then((mod) => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const timeout = new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error(`OpenCV runtime did not initialise within ${INIT_TIMEOUT_MS / 1000}s`)),
            INIT_TIMEOUT_MS
          );
        });
        const runtime = Promise.resolve(mod.load()).then(waitForRuntime);
        return Promise.race([runtime, timeout]).finally(() => clearTimeout(timer));
      })
      .catch((err) => {
        // A failed load (network failure, unsupported WASM, etc.) would
        // otherwise cache the rejection forever -- every later call site
        // re-awaiting this same promise would keep re-throwing the exact
        // same failure with no chance to recover, even after "Try again".
        // Clearing it lets the next call attempt a fresh import instead.
        cvPromise = null;
        throw err;
      });
  }
  return cvPromise;
}
