// Promise.allSettled, but only `n` at a time. Choosing twenty photos used to
// decode all twenty at once -- each a full data URL, an <img> and a canvas,
// about 48 MB for a 12 MP photo -- which is past what iOS Safari allows a tab,
// and it reloads the page with the selection gone.
//
// No imports: the harness compiles this file on its own (tsconfig.logic.json).
export async function settleFew<T, R>(items: T[], n: number, fn: (item: T) => Promise<R>): Promise<PromiseSettledResult<R>[]> {
  const out: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  async function lane() {
    while (next < items.length) {
      const i = next++;
      try {
        out[i] = { status: "fulfilled", value: await fn(items[i]) };
      } catch (reason) {
        out[i] = { status: "rejected", reason };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(n, items.length)) }, lane));
  return out;
}

// Photos decoded at once when several are chosen: two keeps a phone busy
// without holding twenty decoded images in memory.
export const DECODE_AT_ONCE = 2;

// A canvas over iOS's total canvas memory hands back "data:," from toDataURL
// instead of failing, and that used to be saved as the page.
export function isBlankDataUrl(dataUrl: string): boolean {
  return /^data:[^,]*,$/.test(dataUrl);
}
