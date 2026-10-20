// What the AI read off a batch, kept across a reload of /scan.
//
// The walk through a batch lived in memory only. iOS reloads a memory-heavy
// page it has put in the background, so scanning fifteen receipts and
// answering a text came back to an empty scan screen: the readings gone, and
// each one already counted against the day's scan allowance. The readings
// are kept here; the photos are not -- they are far too big for
// sessionStorage, and a restored document says that its photo wasn't kept.
//
// The key is personal (lib/accountSwitch.ts): a reading is somebody's
// receipt, supplier and amounts.
//
// No imports: the harness compiles this file on its own (tsconfig.logic.json).
export const KEPT_READINGS_KEY = "scan-readings";

// Long enough to cover answering a call or putting the phone down for the
// evening; past that a reading is easier to scan again than to remember.
export const KEPT_FOR_MS = 12 * 60 * 60 * 1000;

type Kept<T> = { at: number; readings: T[] };

// Read and not yet saved or skipped. A document still being read has nothing
// to keep, and one that failed has nothing worth keeping.
export function readingsToKeep<T>(docs: { result: T | null; error?: string | null; done: string | null }[]): T[] {
  return docs.flatMap((d) => (d.result && !d.error && !d.done ? [d.result] : []));
}

export function keptFromText<T>(raw: string | null, now: number): T[] {
  if (!raw) return [];
  try {
    const kept = JSON.parse(raw) as Kept<T>;
    if (typeof kept?.at !== "number" || !Array.isArray(kept.readings)) return [];
    if (now - kept.at > KEPT_FOR_MS || kept.at > now) return [];
    return kept.readings.filter((r) => r && typeof r === "object");
  } catch {
    return [];
  }
}

export function keptToText<T>(readings: T[], now: number): string | null {
  return readings.length ? JSON.stringify({ at: now, readings } satisfies Kept<T>) : null;
}

// Every access guarded: storage throws outright in private mode and with
// "Block All Cookies", and a scan must never fail for want of a backup.
export function keepReadings<T>(readings: T[]): void {
  const text = keptToText(readings, Date.now());
  try {
    if (text) sessionStorage.setItem(KEPT_READINGS_KEY, text);
    else sessionStorage.removeItem(KEPT_READINGS_KEY);
  } catch {}
}

export function keptReadings<T>(): T[] {
  try {
    return keptFromText<T>(sessionStorage.getItem(KEPT_READINGS_KEY), Date.now());
  } catch {
    return [];
  }
}

export function dropKeptReadings(): void {
  try {
    sessionStorage.removeItem(KEPT_READINGS_KEY);
  } catch {}
}
