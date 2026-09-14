// Order matters only for the dropdown UI -- existing receipts reference
// these strings directly, so entries are only ever appended or reworded
// in place, never removed or renamed (that would orphan saved data).
export const CATEGORIES = [
  "Fuel",
  "Transport & Taxis",
  "Travel",
  "Groceries",
  "Household",
  "Bills",
  "Gas & Electric",
  "Meals",
  "Supplies",
  "Equipment",
  "Other",
] as const;

export type Category = (typeof CATEGORIES)[number];

/** Most frequent category across a set of past receipts, for defaulting new entries. */
export function mostUsedCategory(categories: string[]): Category | null {
  if (categories.length === 0) return null;
  const counts = new Map<string, number>();
  for (const c of categories) counts.set(c, (counts.get(c) ?? 0) + 1);
  let best: string | null = null;
  let bestCount = 0;
  for (const [c, n] of counts) {
    if (n > bestCount) {
      best = c;
      bestCount = n;
    }
  }
  return best && (CATEGORIES as readonly string[]).includes(best) ? (best as Category) : null;
}
