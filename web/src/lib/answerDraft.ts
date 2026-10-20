// A supplier's half-typed prices on /r/<token>, kept in this tab as they are
// typed. A supplier switching apps to look a price up is exactly when an
// iPhone reloads the page it left, and the whole list was gone
// (notes/ios-safari.md #6).
//
// sessionStorage, not localStorage: it survives that reload but not the tab,
// and the page is a stranger's, often on a shared office machine. The prefix
// is in PERSONAL_SESSION_PREFIXES in accountSwitch.ts.
//
// No imports: the harness compiles this file on its own (tsconfig.logic.json).

export const ANSWER_PREFIX = "quote-request-answer:";

type Line = { text: string; unavailable: boolean; note: string };
export type AnswerDraft = {
  lines: Record<string, Line>;
  delivery: string;
  vatIncluded: boolean;
  validUntil: string;
  note: string;
};
export type KeptAnswer = { draft: AnswerDraft; name: string };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, fallback: string) => (typeof v === "string" ? v : fallback);

// Only the lines the request still has are taken back, each over the blank
// one, so a request edited since can never gain or lose a line this way.
export function mergeAnswer(raw: string | null, fresh: AnswerDraft, freshName: string): KeptAnswer | null {
  if (!raw) return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObject(v) || !isObject(v.draft)) return null;
  const d = v.draft;
  const kept = isObject(d.lines) ? d.lines : {};
  const lines: Record<string, Line> = {};
  for (const [id, blank] of Object.entries(fresh.lines)) {
    const l = kept[id];
    lines[id] = isObject(l) ? { text: str(l.text, blank.text), unavailable: l.unavailable === true, note: str(l.note, blank.note) } : blank;
  }
  return {
    draft: {
      lines,
      delivery: str(d.delivery, fresh.delivery),
      vatIncluded: typeof d.vatIncluded === "boolean" ? d.vatIncluded : fresh.vatIncluded,
      validUntil: /^\d{4}-\d{2}-\d{2}$/.test(str(d.validUntil, "")) ? str(d.validUntil, "") : fresh.validUntil,
      note: str(d.note, fresh.note),
    },
    name: str(v.name, freshName),
  };
}

export function readAnswer(token: string, fresh: AnswerDraft): KeptAnswer | null {
  try {
    return mergeAnswer(sessionStorage.getItem(ANSWER_PREFIX + token), fresh, "");
  } catch {
    return null;
  }
}

export function writeAnswer(token: string, kept: KeptAnswer) {
  try {
    sessionStorage.setItem(ANSWER_PREFIX + token, JSON.stringify(kept));
  } catch {
    // storage blocked or full: the page still works, it just isn't kept
  }
}

export function clearAnswer(token: string) {
  try {
    sessionStorage.removeItem(ANSWER_PREFIX + token);
  } catch {
    // nothing stored to clear
  }
}
