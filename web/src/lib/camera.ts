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

// Whether this browser can tell us the real permission state. Chrome and
// Edge can; Safari and Firefox can't for the camera.
function canAskBrowser(): boolean {
  return typeof navigator !== "undefined" && !!navigator.permissions?.query;
}

function remember(state: CameraPermission) {
  known = state;
  try {
    if (state === "granted") localStorage.setItem(ALLOWED_KEY, "1");
    // A refusal is only written down where the browser can later correct
    // us. On Safari it can't: it has no Permissions API for the camera and
    // asks again on every visit, so a stored "denied" would outlast the
    // refusal itself and there would be no way back -- "Try again" would
    // short-circuit before ever reaching the browser, and the app's own
    // "iPhone Settings -> Safari -> Camera -> Allow" tip would be advice
    // about a block the app was holding itself. One mis-tap would end the
    // in-app scanner on that phone for good. It stays in memory for this
    // page instead, which is all the browser's own refusal lasts.
    else if (state === "denied" && canAskBrowser()) localStorage.setItem(ALLOWED_KEY, "0");
  } catch {
    // storage blocked -- the state just won't survive a page load
  }
}

// Forget a refusal, so the next open really asks the browser again. What
// "Try again" needs to mean, and what makes the Settings tip true: once
// the phone's own setting is changed, the app must not still be saying no.
export function forgetCameraDenial(): void {
  if (known === "denied") known = "unknown";
  try {
    if (localStorage.getItem(ALLOWED_KEY) === "0") localStorage.removeItem(ALLOWED_KEY);
  } catch {
    // storage blocked -- nothing was stored to clear
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
  const opening = navigator.mediaDevices.getUserMedia({ video });
  // Promise.race doesn't cancel the loser. Someone who takes longer than
  // the timeout to read the prompt and tap Allow still ends up with a live
  // camera: this one belongs to nobody, nothing can stop its tracks, and a
  // MediaStream dropped by the garbage collector keeps them running -- so
  // the phone's camera light stays on, and the camera stays unavailable to
  // other apps, until the tab is closed.
  opening.then(
    (stream) => {
      if (timedOut) stream.getTracks().forEach((t) => t.stop());
    },
    () => {
      // Its own failure is handled by the await below.
    }
  );
  try {
    const stream = await Promise.race([opening, timeout]);
    remember("granted");
    // Where the browser answers (everywhere but iOS Safari), it says
    // outright whether there was a prompt. Only where it doesn't is a
    // slow open read as "they were asked" -- on a loaded machine an
    // already-granted camera can take seconds to hand over a stream, and
    // teaching someone to allow what they've allowed is noise.
    const asked = before === "prompt" || (before === "unknown" && Date.now() - askedAt > ASKED_AFTER_MS);
    return { ok: true, stream, asked };
  } catch (err) {
    // Only a refusal is remembered: a camera busy elsewhere
    // (NotReadableError) must not lock the next try out of asking.
    if (!timedOut && (err as Error)?.name === "NotAllowedError") remember("denied");
    return { ok: false, reason: timedOut ? "timeout" : "denied" };
  }
}
