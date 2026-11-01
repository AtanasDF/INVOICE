import type { AccountKind } from "@/lib/storage";

// The list every account started with until 2026-11-01: personal and
// business on one screen, so a B&Q receipt in a business app was guessed
// "Household" (launch review, item 13). Kept only to recognise it: a list
// saved back unchanged from this is the old default, not a choice, and is
// read as the default for the account's kind (`effectiveCategories`). The
// receipts filed under these keep their category as it is: every drop-down
// offers the stored one (`withCurrent`) and the filter offers every one in
// use (`withUsed`), so nothing is orphaned by leaving a list.
export const OLD_DEFAULT = [
  "Fuel",
  "Transport & Taxis",
  "Travel",
  "Groceries",
  "Household",
  "Bills",
  "Gas & Electric",
  "Meals",
  "Mileage",
  "Supplies",
  "Equipment",
  "Other",
] as const;

// One starting list per kind of account (Atanas, 2026-09-22: "they should
// change depending on that"). The sole-trader list follows the expense
// boxes on the self-assessment form, so the year's figures fall into the
// right places; the company list adds what only a company has. "Mileage"
// stays the exact word the mileage page files under.
const SOLE_TRADER = [
  "Materials & stock",
  "Subcontractors",
  "Staff wages",
  "Fuel",
  "Mileage",
  "Travel & hotels",
  "Meals when away",
  "Rent & rates",
  "Gas & Electric",
  "Repairs",
  "Phone & internet",
  "Office & stationery",
  "Software & subscriptions",
  "Advertising",
  "Bank charges & interest",
  "Accountant & legal",
  "Insurance",
  "Tools & equipment",
  "Training",
  "Other",
];

// The built-in default when the account has not said what it is, and what
// the scanner and the email import guess from when nobody sends a list:
// business headings only, since this is a business app. Personal spending
// is still there to pick, under its own Personal group (`personalExtras`),
// but never guessed.
export const CATEGORIES: readonly string[] = SOLE_TRADER;

export const CATEGORY_SETS: Record<AccountKind, readonly string[]> = {
  personal: [
    "Groceries",
    "Household",
    "Rent or mortgage",
    "Bills",
    "Gas & Electric",
    "Transport & Taxis",
    "Fuel",
    "Travel",
    "Meals & eating out",
    "Clothes",
    "Health",
    "Childcare",
    "Subscriptions",
    "Gifts",
    "Other",
  ],
  sole_trader: SOLE_TRADER,
  limited: [...SOLE_TRADER.slice(0, -1), "Salaries & PAYE", "Pension contributions", "Director's expenses", "Client entertaining", "Other"],
};
export const KIND_WORD: Record<AccountKind, string> = { personal: "personal", sole_trader: "sole-trader", limited: "limited-company" };

// A category is just a label a receipt/expense stores as plain text, so
// once someone can rename or add their own, it's no longer one of a fixed
// set of literals -- it's any string they've chosen.
export type Category = string;

export function defaultCategoriesFor(kind: AccountKind | null | undefined): string[] {
  return kind ? [...CATEGORY_SETS[kind]] : [...CATEGORIES];
}

/** The active category list: the account's customized list if they have one, otherwise the defaults for its kind. */
export function effectiveCategories(customCategories: string[] | null | undefined, kind: AccountKind | null = null): string[] {
  return customCategories && customCategories.length > 0 && !sameList(customCategories, OLD_DEFAULT) ? customCategories : defaultCategoriesFor(kind);
}

const sameList = (list: readonly string[], other: readonly string[]) => list.length === other.length && list.every((c, i) => c === other[i]);

export const PERSONAL_LABEL = "Personal (not a business cost)";

/** The personal categories a business list doesn't already have, for a
 *  drop-down's Personal group. None for a personal account, whose own list
 *  already is that, nor when the list holds Groceries or Household itself
 *  (someone who made a list of their own with them in has chosen where). */
export function personalExtras(list: string[]): string[] {
  const have = new Set(list.map((c) => c.trim().toLowerCase()));
  if (sameList(list, CATEGORY_SETS.personal) || have.has("groceries") || have.has("household")) return [];
  return CATEGORY_SETS.personal.filter((c) => c !== "Other" && !have.has(c.toLowerCase()));
}

/** A drop-down's two parts: the account's list (plus what this record already
 *  has), then the Personal group. A stored personal category sits in the
 *  Personal group, selected, rather than heading the business list. */
export function categoryChoices(list: string[], current: string | null | undefined): { main: string[]; personal: string[] } {
  const personal = personalExtras(list);
  const main = personal.includes(current ?? "") ? list : withCurrent(list, current);
  return { main, personal };
}

// True when the list is one of the starting lists, untouched: the old
// default (which every Save wrote back as a custom list) or a kind's own.
// Such a list follows the kind when the kind changes; a list someone has
// edited is theirs and is only ever added to.
export function isDefaultSet(list: string[]): boolean {
  const same = (a: readonly string[]) => a.length === list.length && a.every((c, i) => c === list[i]);
  return same(OLD_DEFAULT) || same(CATEGORIES) || Object.values(CATEGORY_SETS).some(same);
}

/** What the kind's list has that this one doesn't. */
export function missingFor(list: string[], kind: AccountKind | null | undefined): string[] {
  if (!kind) return [];
  const have = new Set(list.map((c) => c.trim().toLowerCase()));
  return CATEGORY_SETS[kind].filter((c) => !have.has(c.toLowerCase()));
}

/** The list with the kind's missing categories added, "Other" kept last, nothing removed. */
export function withKindCategories(list: string[], kind: AccountKind): string[] {
  const isOther = (c: string) => c.trim().toLowerCase() === "other";
  const missing = missingFor(list, kind);
  // The person's own spelling of Other, kept, and kept last.
  const other = list.find(isOther) ?? missing.find(isOther);
  return [...list.filter((c) => !isOther(c)), ...missing.filter((c) => !isOther(c)), ...(other ? [other] : [])];
}

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
  return best;
}

/** The list to offer in a drop-down: the account's own, plus whatever this record already has,
 *  so a category that left the list (or Mileage, which the mileage page files under) is never
 *  shown as a different one. */
export function withCurrent(list: string[], current: string | null | undefined): string[] {
  return current && !list.includes(current) ? [current, ...list] : list;
}

/** The filter's choices: the list, plus every category the records carry. */
export function withUsed(list: string[], used: (string | null | undefined)[]): string[] {
  const extra = [...new Set(used.filter((c): c is string => !!c && !list.includes(c)))].sort();
  return [...list, ...extra];
}
