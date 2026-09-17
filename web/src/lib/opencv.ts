export type CVModule = typeof import("@techstark/opencv-js") & { onRuntimeInitialized?: () => void; Mat?: unknown };

// Copied from node_modules by scripts/copy-opencv.mjs (predev/prebuild)
// and served immutable, so after the first visit it comes from the HTTP
// cache instead of a fresh multi-MB download per deploy.
const SCRIPT_SRC = "/vendor/opencv-5.0.0.js";
const INIT_TIMEOUT_MS = 20_000;

// The vendor file is a UMD wrapper. In a plain <script> there is no
// module/define, so it takes the browser-globals branch and assigns
// window.cv = factory(), where the factory is the runtime's async entry
// point: the value is a Promise of the initialised runtime.
type CVEntry = CVModule | Promise<CVModule>;
type CVGlobal = { cv?: CVEntry };

let cvPromise: Promise<CVModule> | null = null;

// Resolves with the global boxed rather than bare: a bare Promise would
// be adopted here, and the runtime timeout below is meant to cover it.
function injectScript(): Promise<{ cv: CVEntry }> {
  return new Promise((resolve, reject) => {
    const global = window as unknown as CVGlobal;
    if (global.cv) return resolve({ cv: global.cv });
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => {
      if (global.cv) resolve({ cv: global.cv });
      else reject(new Error(`script did not define window.cv: ${SCRIPT_SRC}`));
    };
    script.onerror = () => {
      script.remove();
      reject(new Error(`script failed to load: ${SCRIPT_SRC}`));
    };
    document.head.appendChild(script);
  });
}

function waitForRuntime(cv: CVModule): Promise<CVModule> {
  if (cv.Mat) return Promise.resolve(cv);
  return new Promise((resolve) => {
    cv.onRuntimeInitialized = () => resolve(cv);
  });
}

/**
 * Lazily loads OpenCV.js on first call and caches the result -- pages that
 * never open the camera scanner never pay for it, and a warm-up call from
 * the dashboard makes the scanner's own call resolve instantly.
 */
export function loadOpenCV(): Promise<CVModule> {
  if (!cvPromise) {
    cvPromise = injectScript()
      .then(({ cv }) => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const timeout = new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error(`OpenCV runtime did not initialise within ${INIT_TIMEOUT_MS / 1000}s`)),
            INIT_TIMEOUT_MS
          );
        });
        const runtime = Promise.resolve(cv).then(waitForRuntime);
        return Promise.race([runtime, timeout]).finally(() => clearTimeout(timer));
      })
      .catch((err) => {
        // A failed load (network failure, unsupported WASM, etc.) would
        // otherwise cache the rejection forever -- every later call site
        // re-awaiting this same promise would keep re-throwing the exact
        // same failure with no chance to recover, even after "Try again".
        // Clearing it lets the next call inject the script afresh.
        cvPromise = null;
        throw err;
      });
  }
  return cvPromise;
}
