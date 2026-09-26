// Frankfurter: free, no API key, no signup -- backed by European Central
// Bank reference rates. Called directly from the browser.
//
// api.frankfurter.app (the v1 host referenced in most docs/tutorials)
// 301-redirects to api.frankfurter.dev/v1, which is now frozen in favor
// of /v2 -- calling /v2 directly avoids relying on that redirect and on
// an interface that's no longer actively maintained.
export const CURRENCIES = [
  "GBP",
  "USD",
  "EUR",
  "AUD",
  "CAD",
  "CHF",
  "JPY",
  "CNY",
  "INR",
  "NZD",
  "SEK",
  "NOK",
  "DKK",
  "PLN",
  "ZAR",
  "SGD",
  "HKD",
  "AED",
  "MXN",
  "BRL",
] as const;

export type CurrencyCode = (typeof CURRENCIES)[number];

const FETCH_TIMEOUT_MS = 5000;

/** Rate such that `amount in "from" * rate = amount in "to"`. */
export async function getFxRate(from: string, to: string = "GBP"): Promise<number> {
  if (from === to) return 1;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(
      `https://api.frankfurter.dev/v2/rate/${encodeURIComponent(from)}/${encodeURIComponent(to)}`,
      { signal: controller.signal }
    );
    if (!res.ok) throw new Error(`No exchange rate available for ${from} -> ${to}.`);
    const data = await res.json();
    if (typeof data?.rate !== "number") throw new Error(`No exchange rate available for ${from} -> ${to}.`);
    return data.rate;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("Exchange rate lookup timed out -- enter it manually.");
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

// Whether a hand-typed exchange rate can be used, and what to say if not.
//
// The rate is typed by hand whenever the lookup fails or times out, so it has
// to be checked like anything else typed by hand -- and it was not. All three
// forms that take one (the scan page, the by-hand receipt, and editing a
// receipt) checked only that the box was not EMPTY, and then did
// `parseFloat(input) || 0`. So "0", "abc" and "  " all became a rate of ZERO,
// which saves a receipt worth nothing at all into the accounting record; and a
// negative rate saved a receipt with NEGATIVE VAT, which comes straight off
// box 4 of a VAT return. Three copies of the same weak check, which is how all
// three came to be wrong in the same way.
//
// The ceiling is deliberately loose. This rate is how many pounds one unit is
// worth, and across every currency above that is between about 0.004 (JPY) and
// about 1.4. A thousand is far past anything real while still being obviously
// a typo, and it catches a decimal point in the wrong place.
export const MAX_RATE = 1000;

export function rateProblem(currency: string, input: string): string | null {
  if (currency === "GBP") return null;
  if (!input.trim()) return "Enter an exchange rate before saving (or wait for it to load).";
  const rate = Number(input);
  if (!Number.isFinite(rate) || rate <= 0) return `That exchange rate doesn't look right. Enter how many pounds one ${currency} is worth.`;
  if (rate > MAX_RATE) return `That exchange rate looks far too high. Enter how many pounds one ${currency} is worth — usually less than 2.`;
  return null;
}
