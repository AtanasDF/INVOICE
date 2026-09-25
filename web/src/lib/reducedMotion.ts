import { useSyncExternalStore } from "react";

// Has this person asked their device for less movement?
//
// Read through useSyncExternalStore rather than an effect: matchMedia is
// exactly the "external store" that hook exists for, and setting state
// synchronously inside an effect to mirror it causes the cascading render
// that React now lints against.
//
// Answers false on the server and during hydration, which is the safe way
// round: the alternative is a first paint that assumes reduced motion for
// everybody and then moves.
const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(fire: () => void): () => void {
  const q = window.matchMedia?.(QUERY);
  if (!q) return () => {};
  q.addEventListener("change", fire);
  return () => q.removeEventListener("change", fire);
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => !!window.matchMedia?.(QUERY).matches,
    () => false
  );
}
