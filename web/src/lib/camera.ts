// Every camera in the app opens through here, so the browser is asked at
// most once and one place knows whether it actually had to ask.

export type CameraPermission = "granted" | "denied" | "prompt" | "unknown";

// A website can't make Safari remember a camera "Allow"; only the phone's
// settings can. Shown when Safari had to ask, and when it's blocked.
export const SAFARI_CAMERA_TIP =
  "Asked for the camera every time? Set it once: iPhone Settings → Safari (under Apps) → Camera → Allow. Or in Safari: aA → Website Settings → Camera → Allow.";

// getUserMedia can hang indefinitely rather than reject in some real
// browser/OS blocking states (camera access blocked at the OS level for
// the whole browser, not just this site, is the most common one) -- with
// no timeout, that's exactly the "stuck on Starting camera... forever,
// no error, no prompt" dead end. This bounds it.
const CAMERA_TIMEOUT_MS = 8000;
// A grant the browser already remembers comes back at once; anything
// slower means someone had to tap Allow.
const ASKED_AFTER_MS = 700;
const ALLOWED_KEY = "camera-allowed";

let known: CameraPermission = "unknown";

function remember(state: CameraPermission) {
  known = state;
  try {
    if (state === "granted" || state === "denied") localStorage.setItem(ALLOWED_KEY, state === "granted" ? "1" : "0");
  } catch {
    // storage blocked -- the state just won't survive a page load
  }
}

// What the last camera did: all Safari leaves to go on, since it has no
// Permissions API for the camera.
function rememberedCamera(): CameraPermission {
  if (known !== "unknown") return known;
  try {
    const stored = localStorage.getItem(ALLOWED_KEY);
    return stored === "1" ? "granted" : stored === "0" ? "denied" : "unknown";
  } catch {
    return "unknown";
  }
}

// Chrome and Edge answer this; Safari and Firefox don't implement the
// Permissions API for the camera, so there the last open is all there is
// to go on.
export async function cameraPermission(): Promise<CameraPermission> {
  try {
    const perm = await navigator.permissions?.query({ name: "camera" as PermissionName });
    if (perm) {
      remember(perm.state);
      perm.onchange = () => remember(perm.state);
      return perm.state;
    }
  } catch {
    // Permissions API unsupported, or "camera" not a name this browser knows
  }
  return rememberedCamera();
}

export type CameraOpen =
  | { ok: true; stream: MediaStream; asked: boolean }
  | { ok: false; reason: "unsupported" | "denied" | "timeout" };

export async function openCamera(video: MediaTrackConstraints): Promise<CameraOpen> {
  if (!navigator.mediaDevices?.getUserMedia) return { ok: false, reason: "unsupported" };

  // Already blocked: getUserMedia wouldn't show a prompt at all, and in
  // that state it can hang rather than reject, so it isn't called.
  const before = await cameraPermission();
  if (before === "denied") return { ok: false, reason: "denied" };

  let timedOut = false;
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => {
      timedOut = true;
      reject(new Error("timeout"));
    }, CAMERA_TIMEOUT_MS);
  });

  const askedAt = Date.now();
  try {
    const stream = await Promise.race([navigator.mediaDevices.getUserMedia({ video }), timeout]);
    remember("granted");
    return { ok: true, stream, asked: before === "prompt" || Date.now() - askedAt > ASKED_AFTER_MS };
  } catch (err) {
    // Only a refusal is remembered: a camera busy elsewhere
    // (NotReadableError) must not lock the next try out of asking.
    if (!timedOut && (err as Error)?.name === "NotAllowedError") remember("denied");
    return { ok: false, reason: timedOut ? "timeout" : "denied" };
  }
}
