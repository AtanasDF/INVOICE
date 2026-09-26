// What gets sent when the app breaks on somebody's phone, and what does not.
//
// Until now, nothing was. `global-error.tsx` showed "Reference <digest>" and
// the digest went nowhere: if the app threw on Atanas's iPhone, the only way
// anybody found out was him noticing and describing it. 3,386 passing checks
// cannot tell you that something threw on a real device.
//
// The rules live here rather than in the route so harness/test-error-report.mjs
// holds the real ones, the same way every rule about what a photograph may lose
// lives in photoAgeing.ts.

// A page address can BE a secret. /i/<43-char token> is a private invoice link,
// and /q/ and /r/ are the same for quotes and supplier requests: sending one to
// ourselves in an error report would put a customer's link in an inbox and a
// log. The shape is what is useful for debugging anyway, not the token.
const SECRET_PATHS = /^\/(i|q|r)\/[^/]+/;

export function redactPath(href: string): string {
  let path = href;
  try {
    path = new URL(href, "http://x").pathname;
  } catch {
    path = href.split("?")[0];
  }
  // Query strings are dropped whole: `?next=`, `?token=` and anything else a
  // link carries are not worth guessing about one at a time.
  return path.replace(SECRET_PATHS, (_m, kind) => `/${kind}/[link]`);
}

// Noise that is not the app breaking, and would drown the real thing.
//
// ResizeObserver's loop warning is thrown by Chrome itself and means nothing.
// A failed fetch while offline is the offline page doing its job. Script errors
// from another origin arrive as the literal string "Script error." with no
// stack, which is a browser extension, not us.
const NOISE = [
  /ResizeObserver loop/i,
  /^Script error\.?$/i,
  /Load failed$/i,
  /NetworkError when attempting to fetch/i,
  /Failed to fetch dynamically imported module/i,
  /The operation was aborted/i,
];

export const isNoise = (message: string) => NOISE.some((r) => r.test(message.trim()));

export const ERROR_LIMITS = {
  // Per browser, per hour. One broken render can fire in a loop.
  perIp: 20,
  // Everybody, per hour: a guard on the bill and the inbox, not a budget.
  global: 200,
  // Emails are capped far harder than reports. Every report reaches the server
  // log; only the first few reach an inbox, because a loop that mails itself is
  // worse than the bug.
  emailsPerHour: 5,
  maxMessage: 300,
  maxStack: 2000,
};

export type ErrorReport = {
  message: string;
  stack: string;
  path: string;
  kind: "render" | "window" | "promise";
  digest: string;
};

// What a report may contain, after tidying. Deliberately NOT here: who they
// are, what was on screen, what they had typed, or any row of their data. An
// error report says what broke and where, not what somebody was doing.
// A URL anywhere in the text, reduced to its path with any link token taken
// out. Stacks are the obvious place; MESSAGES are the one that was missed --
// "Failed to fetch https://invoiceover.com/i/<token>" is a perfectly ordinary
// browser message, and it would have carried a customer's private link into an
// inbox. Found by reading what a live probe actually logged, not by the checks.
const withoutLinks = (text: string) => text.replace(/https?:\/\/[^\s)'"]+/g, (u) => redactPath(u));

export function tidyReport(input: Partial<ErrorReport>): ErrorReport | null {
  const message = withoutLinks(String(input.message ?? "").trim()).slice(0, ERROR_LIMITS.maxMessage);
  if (!message || isNoise(message)) return null;
  return {
    message,
    // Absolute URLs inside a stack carry the same link secrets as the path.
    stack: withoutLinks(String(input.stack ?? "")).slice(0, ERROR_LIMITS.maxStack),
    path: redactPath(String(input.path ?? "")),
    kind: input.kind === "window" || input.kind === "promise" ? input.kind : "render",
    digest: String(input.digest ?? "").slice(0, 64),
  };
}

// Two reports of the same fault, so a loop is counted once for the inbox. The
// message and the first frame are what identify a fault; the rest of the stack
// varies with the route somebody happened to be on.
export function errorKey(r: ErrorReport): string {
  const frame = (r.stack.split("\n").find((l) => /\s+at\s/.test(l)) ?? "").trim().slice(0, 120);
  return `${r.message}|${frame}`;
}
