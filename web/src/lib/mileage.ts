import type { Receipt } from "@/lib/storage";

// Mileage claimed at HMRC's approved rates. A trip is stored as an ordinary
// expense (vendor "Mileage", category "Mileage", no VAT) with the trip in
// `details`, so it lands in the expense totals and the tax estimate with
// everything else and needs no table of its own.

export type Vehicle = "car" | "motorcycle" | "bicycle";

export const VEHICLES: { id: Vehicle; label: string }[] = [
  { id: "car", label: "Car or van" },
  { id: "motorcycle", label: "Motorcycle" },
  { id: "bicycle", label: "Bicycle" },
];

// 2011-12 onwards: 45p a mile for the first 10,000 business miles in the tax
// year, 25p after that; motorcycles 24p and bicycles 20p throughout.
export const RATES: Record<Vehicle, { first: number; after: number; threshold: number }> = {
  car: { first: 0.45, after: 0.25, threshold: 10000 },
  motorcycle: { first: 0.24, after: 0.24, threshold: Infinity },
  bicycle: { first: 0.2, after: 0.2, threshold: Infinity },
};

export const MILEAGE_CATEGORY = "Mileage";
export const MILEAGE_VENDOR = "Mileage";

export type Trip = { miles: number; from: string; to: string; vehicle: Vehicle; rate: number; purpose: string };

// The tax year a date falls in, as its 6 April start.
export function taxYearStart(dateIso: string): string {
  const [y, m, d] = dateIso.split("-").map(Number);
  return m > 4 || (m === 4 && d >= 6) ? `${y}-04-06` : `${y - 1}-04-06`;
}

export function taxYearLabel(startIso: string): string {
  const y = Number(startIso.slice(0, 4));
  return `${y}/${String((y + 1) % 100).padStart(2, "0")}`;
}

export function isMileage(r: Receipt): boolean {
  return !!r.details?.mileage;
}

export function tripOf(r: Receipt): Trip | null {
  const t = r.details?.mileage;
  return t ? (t as unknown as Trip) : null;
}

// Miles already claimed in the same tax year, so a long year crosses onto
// the lower rate at the right point.
export function milesSoFar(receipts: Receipt[], dateIso: string, vehicle: Vehicle): number {
  const start = taxYearStart(dateIso);
  return receipts.reduce((sum, r) => {
    const t = tripOf(r);
    if (!t || t.vehicle !== vehicle || taxYearStart(r.date) !== start) return sum;
    return sum + (Number(t.miles) || 0);
  }, 0);
}

export type Claim = { amount: number; atFirst: number; atAfter: number; first: number; after: number; crosses: boolean };

// What a trip is worth, split across the threshold when it straddles it.
export function claimFor(miles: number, vehicle: Vehicle, already: number): Claim {
  const { first, after, threshold } = RATES[vehicle];
  const room = Math.max(0, threshold - already);
  const atFirst = Math.min(miles, room);
  const atAfter = Math.max(0, miles - atFirst);
  return {
    amount: Math.round((atFirst * first + atAfter * after) * 100) / 100,
    atFirst,
    atAfter,
    first,
    after,
    crosses: atAfter > 0 && atFirst > 0,
  };
}

// Two postcodes give a straight line; roads wander, so the suggestion adds
// the usual detour before anyone claims it.
export const ROAD_FACTOR = 1.25;

export function straightLineMiles(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 3958.8;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function roadEstimate(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  return Math.round(straightLineMiles(a, b) * ROAD_FACTOR * 10) / 10;
}
