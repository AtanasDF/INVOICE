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
