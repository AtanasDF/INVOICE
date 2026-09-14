export const CATEGORIES = ["Fuel", "Supplies", "Equipment", "Travel", "Meals", "Other"] as const;

export type Category = (typeof CATEGORIES)[number];
