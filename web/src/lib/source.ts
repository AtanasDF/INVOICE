// Which flyer they came from (Atanas, 2026-09-23: "we can do the different
// code too"). A QR code per depot is the cheapest thing on the whole
// promotion plan and the easiest to forget — without it he prints five hundred
// flyers and never learns which depot worked.
//
// Kept on the device rather than sent anywhere: someone arrives from a flyer,
// looks around, and makes an account minutes or days later, long after the
// address has lost its query string. It is a short tag, never anything
// personal, and it goes no further than the account it eventually creates.
const KEY = "came-from";
const MAX = 40;

// A tag from a printed code, so it should look like one: letters, digits and
// dashes. Anything else is somebody playing with the address bar, and is
// dropped rather than stored.
export const tidySource = (raw: string | null): string | null => {
  if (!raw) return null;
  const clean = raw.trim().toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, MAX);
  return clean || null;
};

export function rememberSource(search: string) {
  const from = tidySource(new URLSearchParams(search).get("from"));
  if (!from) return;
  try {
    // The first flyer is the one that worked. Someone who later arrives
    // through a different code was already here.
    if (!localStorage.getItem(KEY)) localStorage.setItem(KEY, from);
  } catch {
    // A locked-down browser simply goes uncounted.
  }
}

export function readSource(): string | null {
  try {
    return tidySource(localStorage.getItem(KEY));
  } catch {
    return null;
  }
}
