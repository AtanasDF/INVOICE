// Which colours the app wears (Atanas, 2026-09-23). The choice lives on the
// device, not the account: it is how this phone looks, not a fact about the
// business, and it must survive a signed-out visit to the front door.
export const THEMES = [
  { id: "grey", name: "Grey", note: "Plain and quiet", swatch: "#404040" },
  { id: "slate", name: "Blue", note: "Cool and businesslike", swatch: "#334155" },
  { id: "sand", name: "Sand", note: "Warm, like paper", swatch: "#45403a" },
  { id: "forest", name: "Green", note: "For the outdoor trades", swatch: "#3a5342" },
  { id: "ink", name: "Navy", note: "Nearly black, but not", swatch: "#364361" },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

export const DEFAULT_THEME: ThemeId = "grey";
const KEY = "theme";

export const isTheme = (v: unknown): v is ThemeId => THEMES.some((t) => t.id === v);

export function readTheme(): ThemeId {
  try {
    const v = localStorage.getItem(KEY);
    return isTheme(v) ? v : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

// Grey is the absence of a theme, so it carries no attribute: one less thing
// for the print rules and the tests to reason about.
export function applyTheme(id: ThemeId) {
  const root = document.documentElement;
  if (id === DEFAULT_THEME) root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", id);
}

// The choice lives in localStorage, which React cannot see, so the picker
// subscribes to it the way it would any other outside system rather than
// copying it into state inside an effect.
const listeners = new Set<() => void>();
export function subscribeTheme(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function saveTheme(id: ThemeId) {
  applyTheme(id);
  try {
    localStorage.setItem(KEY, id);
  } catch {
    // A locked-down browser still gets the colour for this visit.
  }
  for (const fn of listeners) fn();
}

// Runs before the first paint, from a script tag in the document head, so the
// page never flashes grey on its way to the colour someone chose.
export const THEME_BOOT = `try{var t=localStorage.getItem(${JSON.stringify(KEY)});if(t&&${JSON.stringify(
  THEMES.filter((t) => t.id !== DEFAULT_THEME).map((t) => t.id),
)}.indexOf(t)>-1)document.documentElement.setAttribute("data-theme",t)}catch(e){}`;
