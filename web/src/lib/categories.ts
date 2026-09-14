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
