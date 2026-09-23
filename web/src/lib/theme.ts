// Which colours the app wears (Atanas, 2026-09-23). The choice lives on the
// device, not the account: it is how this phone looks, not a fact about the
// business, and it must survive a signed-out visit to the front door.
export const THEMES = [
  { id: "grey", name: "Grey", note: "Plain and quiet", swatch: "#404040" },
  { id: "slate", name: "Blue", note: "Cool and businesslike", swatch: "#334155" },
  { id: "sand", name: "Sand", note: "Warm, like paper", swatch: "#45403a" },
  { id: "forest", name: "Green", note: "For the outdoor trades", swatch: "#3a5342" },
  { id: "ink", name: "Navy", note: "Nearly black, but not", swatch: "#364361" },
  { id: "dark", name: "Dark", note: "For working at night", swatch: "#17181c" },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];
// What is stored: a colour, or "auto" meaning whatever the phone is set to.
export type ThemeChoice = ThemeId | "auto";

export const DEFAULT_THEME: ThemeId = "grey";
export const DEFAULT_CHOICE: ThemeChoice = "auto";
const KEY = "theme";

export const isTheme = (v: unknown): v is ThemeId => THEMES.some((t) => t.id === v);
export const isChoice = (v: unknown): v is ThemeChoice => v === "auto" || isTheme(v);

// Nobody sets their phone to dark mode and then expects to set it again in
// every app, so the default is to follow it. Choosing a colour on purpose
// overrides that, for good -- an explicit choice outranks a guess.
export function readChoice(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY);
    return isChoice(v) ? v : DEFAULT_CHOICE;
  } catch {
    return DEFAULT_CHOICE;
  }
}

export function readTheme(): ThemeId {
  const choice = readChoice();
  if (choice !== "auto") return choice;
  try {
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : DEFAULT_THEME;
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

export function saveTheme(choice: ThemeChoice) {
  try {
    localStorage.setItem(KEY, choice);
  } catch {
    // A locked-down browser still gets the colour for this visit.
  }
  applyTheme(readTheme());
  for (const fn of listeners) fn();
}

// Following the phone means noticing when the phone changes its mind --
// sunset, or a switch flicked in Settings -- without a reload.
export function watchSystemTheme(): () => void {
  try {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (readChoice() !== "auto") return;
      applyTheme(readTheme());
      for (const fn of listeners) fn();
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  } catch {
    return () => {};
  }
}

// Runs before the first paint, from a script tag in the document head, so the
// page never flashes the wrong colours on its way to the right ones -- which
// matters most for dark, where the flash is a white screen in a dark room.
export const THEME_BOOT = `try{
var K=${JSON.stringify(KEY)},A=${JSON.stringify(THEMES.map((t) => t.id))},v=localStorage.getItem(K),t;
if(v&&A.indexOf(v)>-1)t=v;
else if(!v||v==="auto")t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":${JSON.stringify(DEFAULT_THEME)};
if(t&&t!==${JSON.stringify(DEFAULT_THEME)})document.documentElement.setAttribute("data-theme",t);
}catch(e){}`.replace(/\s*\n\s*/g, "");
