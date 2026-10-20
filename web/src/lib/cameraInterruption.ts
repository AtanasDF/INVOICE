// What the camera does after iOS has interrupted it.
//
// iOS mutes the capture track whenever the page goes to the background,
// Control Centre opens or a call comes in, and unmutes it by itself on the
// way back, so the stream recovers without being touched. The scanner used to
// treat `mute` as the camera being lost: it stopped the stream and asked
// getUserMedia again, sometimes while the page was still hidden, which on the
// home-screen app is a fresh permission prompt or the blocked screen in the
// middle of a batch.
//
// No imports: the harness compiles this file on its own (tsconfig.logic.json).

// How long a track may stay muted once the page is back in view before it is
// taken as genuinely gone. iOS unmutes within a few frames of returning.
export const MUTE_GRACE_MS = 2000;

export type TrackState = {
  ended: boolean;
  muted: boolean;
  hidden: boolean;
  // How long the page has been visible again; 0 while hidden.
  visibleForMs: number;
};

// "wait": detection and the frame watchdog pause, nothing is restarted.
// "restart": the stream is genuinely gone and is opened again.
// "carry-on": the camera is sending pictures again.
export type InterruptionAction = "wait" | "restart" | "carry-on";

export function interruptionAction(s: TrackState): InterruptionAction {
  // Never ask for the camera while the page can't be seen: the prompt or the
  // refusal would land on a screen nobody is looking at.
  if (s.hidden) return "wait";
  if (s.ended) return "restart";
  if (s.muted) return s.visibleForMs >= MUTE_GRACE_MS ? "restart" : "wait";
  return "carry-on";
}

// Whether the frame watchdog may call the camera lost. Not while it is
// interrupted (the pictures stop on purpose), and not while a shot is being
// taken: iOS can freeze the preview while it reconfigures for the still, and
// the watchdog's 1.8 s is shorter than the 3 s the still is allowed, so it
// used to restart the stream and drop the very shot being taken.
export function watchdogMayFire(interrupted: boolean, capturing: boolean): boolean {
  return !interrupted && !capturing;
}
