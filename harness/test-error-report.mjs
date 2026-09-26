// What gets sent when the app breaks, and what must never be.
//
// Until 2026-09-26 nothing was sent at all: global-error.tsx showed
// "Reference <digest>" and the digest went nowhere. Atanas uses the app on an
// iPhone, so the only way anybody learned of a fault was him noticing it and
// describing it afterwards. Three thousand passing checks cannot tell you that
// something threw on a real device.
//
// The rules are imported, not copied, so this cannot drift from the app.
import { ERROR_LIMITS, errorKey, isNoise, redactPath, tidyReport } from "./gen/lib/errorReport.js";
import fs from "node:fs";
import { REPO } from "./repo.mjs";

const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

// ---------------------------------------------------------------------------
// A page address can BE a secret
// ---------------------------------------------------------------------------
// /i/<43-char token> is a private invoice link. Sending one to ourselves would
// put a customer's link in an inbox and a server log, which is the one thing
// those links exist to avoid.
const TOKEN = "Zx9KpQ2mN7vB4cD8eF1gH3jK5lM6nP0qR2sT4uV6wX8";
check("an invoice link keeps its shape and loses its token",
  redactPath(`/i/${TOKEN}`) === "/i/[link]", redactPath(`/i/${TOKEN}`));
check("a quote link too", redactPath(`/q/${TOKEN}`) === "/q/[link]", redactPath(`/q/${TOKEN}`));
check("a supplier request link too", redactPath(`/r/${TOKEN}`) === "/r/[link]", redactPath(`/r/${TOKEN}`));
check("an ordinary page is left alone", redactPath("/invoices/new") === "/invoices/new", redactPath("/invoices/new"));
// A whole URL, as a stack trace carries it.
check("a full URL is reduced to its path", redactPath(`https://invoiceover.com/i/${TOKEN}`) === "/i/[link]", redactPath(`https://invoiceover.com/i/${TOKEN}`));
// Query strings go whole: ?next=, ?token=, an email in a reset link.
check("a query string is dropped entirely", !redactPath("/login?next=/scan&email=a@b.com").includes("a@b.com"), redactPath("/login?next=/scan&email=a@b.com"));

// And in the MESSAGE, which is where it was missed. "Failed to fetch
// https://…/i/<token>" is an ordinary browser message, and it would have put a
// customer's private link in an inbox. Found by reading what a live probe
// logged, after the path and the stack were already being cleaned.
const msgLink = tidyReport({ message: `Failed to fetch https://invoiceover.com/i/${TOKEN}`, path: "/" });
check("a link in the MESSAGE is redacted", !msgLink.message.includes(TOKEN), msgLink.message);
check("...and the message still says what happened", /Failed to fetch/.test(msgLink.message), msgLink.message);

// And the same inside a stack, which is where URLs really live.
const withLink = tidyReport({ message: "boom", stack: `at f (https://invoiceover.com/i/${TOKEN}:1:1)`, path: "/x" });
check("a link inside a stack trace is redacted too", !withLink.stack.includes(TOKEN), withLink.stack);

// ---------------------------------------------------------------------------
// Noise that would drown the real thing
// ---------------------------------------------------------------------------
check("Chrome's own ResizeObserver warning is not a fault", isNoise("ResizeObserver loop completed with undelivered notifications."));
check("a cross-origin extension error is not a fault", isNoise("Script error."));
check("going offline mid-fetch is not a fault", isNoise("NetworkError when attempting to fetch resource."));
check("a real error is not noise", !isNoise("Cannot read properties of undefined (reading 'total')"));
check("noise is refused outright", tidyReport({ message: "ResizeObserver loop limit exceeded", path: "/" }) === null);
check("an empty message is refused", tidyReport({ message: "   ", path: "/" }) === null);

// ---------------------------------------------------------------------------
// What a report may carry, and what it may not
// ---------------------------------------------------------------------------
const r = tidyReport({ message: "x".repeat(5000), stack: "y".repeat(50000), path: "/vat", kind: "promise", digest: "abc" });
check("the message is capped", r.message.length === ERROR_LIMITS.maxMessage, String(r.message.length));
check("the stack is capped", r.stack.length <= ERROR_LIMITS.maxStack, String(r.stack.length));
check("the kind is kept", r.kind === "promise", r.kind);
check("an unknown kind falls back to render", tidyReport({ message: "e", kind: "nonsense", path: "/" }).kind === "render");

// The route is the thing that must never learn who they are.
const route = fs.readFileSync(`${REPO}/web/src/app/api/error/route.ts`, "utf8");
check("the route never reads a user", !/auth\.getUser|getSession/.test(route), "it identifies the person");
check("the route holds no service key", !/SERVICE_ROLE/.test(route), "it can reach the service role");
check("the route touches no table", !/\.from\(/.test(route), "it queries the database");
// Signed-in only would silence the failures that matter most: a sign-in that
// throws, or an app that breaks before there is a session at all.
check("it does NOT require a sign-in, on purpose", !/Sign in to/.test(route), "it turns signed-out failures away");
check("it is rate limited per browser and overall", /err:ip:/.test(route) && /err:global/.test(route));

const client = fs.readFileSync(`${REPO}/web/src/lib/reportError.ts`, "utf8");
check("the client sends only the path, never the query or the page's contents",
  /window\.location\.pathname/.test(client) && !/location\.(href|search)/.test(client), "it sends more than the path");
check("it prefers sendBeacon, which survives the page closing", /sendBeacon/.test(client));
check("a reporter that throws is worse than none, so it swallows", /catch \{/.test(client));

// ---------------------------------------------------------------------------
// A loop must not mail itself hundreds of times
// ---------------------------------------------------------------------------
const a = tidyReport({ message: "same fault", stack: "at render (/app/page.js:1:1)\nat x (/b.js:2:2)", path: "/" });
const b = tidyReport({ message: "same fault", stack: "at render (/app/page.js:1:1)\nat y (/c.js:9:9)", path: "/vat" });
const c = tidyReport({ message: "a different fault", stack: "at render (/app/page.js:1:1)", path: "/" });
check("the same fault from two pages is one key", errorKey(a) === errorKey(b), `${errorKey(a)} vs ${errorKey(b)}`);
check("a different fault is a different key", errorKey(a) !== errorKey(c));
check("emails are capped far harder than reports", ERROR_LIMITS.emailsPerHour < ERROR_LIMITS.perIp, `${ERROR_LIMITS.emailsPerHour} vs ${ERROR_LIMITS.perIp}`);

// ---------------------------------------------------------------------------
// It is actually wired in, or none of the above matters
// ---------------------------------------------------------------------------
const layout = fs.readFileSync(`${REPO}/web/src/app/layout.tsx`, "utf8");
check("the listener is mounted in the layout", /<ReportErrors \/>/.test(layout));
const globalError = fs.readFileSync(`${REPO}/web/src/app/global-error.tsx`, "utf8");
check("and global-error reports for itself, since the layout never ran",
  /reportError\(/.test(globalError), "the digest still goes nowhere");
const listener = fs.readFileSync(`${REPO}/web/src/components/ReportErrors.tsx`, "utf8");
check("both ways a browser reports a break are listened for",
  /"error"/.test(listener) && /"unhandledrejection"/.test(listener));

const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} passed`);
console.log(JSON.stringify({ passed, total: results.length }));
process.exit(passed === results.length ? 0 : 1);
