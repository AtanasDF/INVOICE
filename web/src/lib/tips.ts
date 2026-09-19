// First-time hints: each shows on its first few appearances, then stops,
// or stops at once when dismissed. Counts live on the device only.
const PREFIX = "tip:";
export const TIP_SHOWS = 3;

export function readTipCount(id: string): number {
  try {
    return Number(localStorage.getItem(PREFIX + id)) || 0;
  } catch {
    return TIP_SHOWS;
  }
}

export function writeTipCount(id: string, count: number) {
  try {
    localStorage.setItem(PREFIX + id, String(count));
  } catch {
    // storage blocked -- the tip just shows again next time
  }
}
