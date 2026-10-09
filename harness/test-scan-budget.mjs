// A read must end. Nothing made it.
//
// The Gemini client carried a 40s HTTP timeout with two attempts, so eighty
// seconds plus backoff. The Anthropic client carried the SDK's own default,
// which is TEN MINUTES, with two retries behind it. /api/scan allows 300. So a
// read that went wrong did not fail, it hung -- and a 71-second read was
// measured. Atanas, scanning on his iPhone: "Camera is a bit slow at first...
// each second picture fails."
//
// This pins three things: the budget a read gets, that the other engine is
// tried once when it runs out, and that the page SAYS a read was slow instead
// of leaving somebody to guess from a spinner.
import fs from "node:fs";
import { REPO } from "./repo.mjs";
import {
  PDF_UNITS,
  READ_BASE_MS,
  READ_CEILING_MS,
  READ_PER_UNIT_MS,
  SLOW_READ_MS,
  TOO_SLOW,
  fallbackFor,
  isTimeout,
  readBudgetMs,
  readNoteText,
  readUnits,
} from "./gen/lib/scanBudget.js";
import { worthWarming } from "./gen/lib/warmScanner.js";

const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

const photo = { mediaType: "image/jpeg" };
const pdf = { mediaType: "application/pdf" };
const photos = (n) => Array.from({ length: n }, () => photo);

// ---------------------------------------------------------------------------
// The budget
// ---------------------------------------------------------------------------
check("one photograph gets the base budget", readBudgetMs([photo]) === READ_BASE_MS, String(readBudgetMs([photo])));
check("...which is 25 seconds, not 10 minutes", READ_BASE_MS === 25_000, String(READ_BASE_MS));
check("more pages get longer", readBudgetMs(photos(3)) > readBudgetMs([photo]));
check("a PDF gets longer than a photograph", readBudgetMs([pdf]) > readBudgetMs([photo]), `${readBudgetMs([pdf])} vs ${readBudgetMs([photo])}`);
check("a PDF counts as several pages", readUnits([pdf]) === PDF_UNITS, String(readUnits([pdf])));
check("an empty list still gets a real budget", readBudgetMs([]) === READ_BASE_MS, String(readBudgetMs([])));

// The ceiling is the whole point: no document, however large, may outlast the
// route it is being read inside.
check("twenty pages are capped", readBudgetMs(photos(20)) === READ_CEILING_MS, String(readBudgetMs(photos(20))));
check("twenty PDFs are capped too", readBudgetMs(Array.from({ length: 20 }, () => pdf)) === READ_CEILING_MS);
let worst = 0;
for (let n = 0; n <= 25; n++) worst = Math.max(worst, readBudgetMs(photos(n)), readBudgetMs(Array.from({ length: n }, () => pdf)));
check("nothing anywhere exceeds the ceiling", worst === READ_CEILING_MS, String(worst));
// A read and the fallback behind it both have to finish inside maxDuration.
const route = fs.readFileSync(`${REPO}/web/src/app/api/scan/route.ts`, "utf8");
const maxDuration = Number(/maxDuration\s*=\s*(\d+)/.exec(route)?.[1]);
check("the route's own ceiling is known", Number.isFinite(maxDuration), String(maxDuration));
check("a read AND its fallback fit inside the route", READ_CEILING_MS * 2 <= maxDuration * 1000, `${READ_CEILING_MS * 2}ms vs ${maxDuration * 1000}ms`);
check("the budget grows by a sane step", READ_PER_UNIT_MS > 0 && READ_PER_UNIT_MS < READ_BASE_MS, String(READ_PER_UNIT_MS));

// ---------------------------------------------------------------------------
// The second engine
// ---------------------------------------------------------------------------
check("the slow engine falls back to the fast one", fallbackFor("claude") === "gemini");
check("and the fast one falls back to the other", fallbackFor("gemini") === "claude");
check("an engine never falls back to itself", fallbackFor("claude") !== "claude" && fallbackFor("gemini") !== "gemini");

// The two names must be the same two the app knows about, or a fallback would
// pick an engine that does not exist. The type in scanBudget.ts is deliberately
// not imported from extractors.ts (which carries both SDKs), so this is what
// keeps the copy honest.
const extractors = fs.readFileSync(`${REPO}/web/src/lib/extractors.ts`, "utf8");
const known = [...(/SCAN_ENGINES[^=]*=\s*\[([^\]]*)\]/.exec(extractors)?.[1] ?? "").matchAll(/"([a-z]+)"/g)].map((m) => m[1]).sort();
const budget = fs.readFileSync(`${REPO}/web/src/lib/scanBudget.ts`, "utf8");
const copied = [...(/type Engine\s*=\s*([^;]*);/.exec(budget)?.[1] ?? "").matchAll(/"([a-z]+)"/g)].map((m) => m[1]).sort();
check("the app knows two engines", known.length === 2, JSON.stringify(known));
check("scanBudget's copy of the list matches it", JSON.stringify(known) === JSON.stringify(copied), `${JSON.stringify(known)} vs ${JSON.stringify(copied)}`);

// ---------------------------------------------------------------------------
// Knowing a timeout when one arrives
// ---------------------------------------------------------------------------
check("an abort is a timeout", isTimeout(Object.assign(new Error("x"), { name: "AbortError" })));
check("the Anthropic SDK's own name is a timeout", isTimeout(Object.assign(new Error("x"), { name: "APIConnectionTimeoutError" })));
check("a user abort is a timeout", isTimeout(Object.assign(new Error("x"), { name: "APIUserAbortError" })));
check("a 408 is a timeout", isTimeout({ status: 408 }));
check("'request timed out' is a timeout", isTimeout(new Error("request timed out after 40000ms")));
// The important half: an ordinary failure must NOT be mistaken for one, or a
// document the model simply could not read would be paid for twice.
check("a 429 is not a timeout", !isTimeout({ status: 429, name: "RateLimitError", message: "rate limited" }));
check("an overloaded engine is not a timeout", !isTimeout(new Error('529 {"type":"error","error":{"type":"overloaded_error"}}')));
check("unreadable output is not a timeout", !isTimeout(new Error("The model didn't return structured data. Try again.")));
check("nothing is not a timeout", !isTimeout(null) && !isTimeout(undefined) && !isTimeout("timed out"));
check("our own sentence is not re-read as a timeout", !isTimeout(new Error(TOO_SLOW)), TOO_SLOW);

// ---------------------------------------------------------------------------
// What the person is told
// ---------------------------------------------------------------------------
check("a quick read says nothing at all", readNoteText({ ms: 4300, fellBack: false }) === null);
check("no note when there is nothing to report", readNoteText(null) === null && readNoteText(undefined) === null);
const slow = readNoteText({ ms: 31_000, fellBack: false });
check("a slow read says how long it took", /\b31 seconds\b/.test(slow ?? ""), String(slow));
const fell = readNoteText({ ms: 46_000, fellBack: true });
check("a fallback says the second reader finished it", /second reader/.test(fell ?? "") && /\b46 seconds\b/.test(fell ?? ""), String(fell));
check("the slow threshold is below the budget", SLOW_READ_MS < READ_BASE_MS, `${SLOW_READ_MS} vs ${READ_BASE_MS}`);
check("a read just under the threshold is quiet", readNoteText({ ms: SLOW_READ_MS - 1, fellBack: false }) === null);
check("a read at the threshold speaks", readNoteText({ ms: SLOW_READ_MS, fellBack: false }) !== null);
// A fallback is worth saying however quick it was: it means an engine failed.
check("a quick fallback still says so", readNoteText({ ms: 3000, fellBack: true }) !== null);
check("a sub-second read never says '0 seconds'", !/\b0 seconds\b/.test(readNoteText({ ms: 200, fellBack: true }) ?? ""), String(readNoteText({ ms: 200, fellBack: true })));

// This app has shipped three sentences that promised what it could not back
// up (test-promises.mjs). Nothing has established that a slow read is the
// photograph's fault or the connection's, so the note must not say it is.
const notes = [slow, fell].join(" ");
check("the note blames nothing it cannot prove", !/(photograph|photo|connection|signal|wifi|light)/i.test(notes), notes);
check("...and speaks in words, not codes", !/[{}]|\berror\b|\b50\d\b/i.test(notes), notes);

// A refusal must lead somewhere -- the house rule for every wall in the app.
check("the refusal offers the way on", /type it in by hand/i.test(TOO_SLOW), TOO_SLOW);
check("the refusal says nothing about engines or SDKs", !/(gemini|claude|anthropic|sdk|abort)/i.test(TOO_SLOW), TOO_SLOW);
check("the refusal is relayed to the person", extractors.includes("RELAYED_ERRORS") && /RELAYED_ERRORS[^=]*=\s*new Set\(\[[^\]]*TOO_SLOW/.test(extractors));

// ---------------------------------------------------------------------------
// The deadline is actually applied
// ---------------------------------------------------------------------------
// These are source checks because the two engine functions reach real SDKs.
// They pin the invariant that matters: no model call is made without a clock
// on it, and neither SDK is left on its own defaults.
check("every read goes through the deadline", /withDeadline\(/.test(extractors) && /return await withDeadline\(/.test(extractors));
check("both engines are handed a budget", /extractWithGemini<T>\(opts, budgetMs\)/.test(extractors) && /extractWithClaude<T>\(opts, budgetMs\)/.test(extractors));
check("the Anthropic client is not left on its ten-minute default", /new Anthropic\(\{[^}]*timeout: budgetMs/.test(extractors), "no timeout passed");
check("...and its retries are capped", /new Anthropic\(\{[^}]*maxRetries: 1/.test(extractors));
check("the Anthropic request carries an abort signal", /signal: AbortSignal\.timeout\(budgetMs\)/.test(extractors));
check("Gemini's two attempts share the budget rather than doubling it", /timeout: Math\.round\(budgetMs \/ 2\)/.test(extractors));
check("no engine timeout is hard-coded any more", !/timeout: 40_000/.test(extractors), "40s literal still there");
// Only the two faults a second engine can answer, or a document nobody can
// read would be paid for twice.
check("a retry is only for time and busyness", /worthRetrying[\s\S]{0,200}?TOO_SLOW \|\| message === ENGINE_BUSY/.test(extractors));
check("the route sends back which engine read it", /read: read\.note/.test(route));
check("...and logs the timing even when it failed", /\$\{n\.ms\}ms/.test(route));

// ---------------------------------------------------------------------------
// Warming the page-finder, wherever a Scan link is
// ---------------------------------------------------------------------------
const able = { signedIn: true, mode: "auto", usedCamera: true, link: undefined };
check("somebody who scans gets the page-finder warmed", worthWarming(able) === true);
check("a stranger does not", worthWarming({ ...able, signedIn: false }) === false);
// 13 MB off the wire, measured. A first visit must not pay for a screen it
// has not opened.
check("a first visit does not pay for 13 MB", worthWarming({ ...able, usedCamera: false }) === false);
check("the OS-camera path has nothing to warm", worthWarming({ ...able, mode: "native" }) === false);
check("data saver is respected", worthWarming({ ...able, link: { saveData: true } }) === false);
check("2g is left alone", worthWarming({ ...able, link: { effectiveType: "2g" } }) === false);
check("slow-2g is left alone", worthWarming({ ...able, link: { effectiveType: "slow-2g" } }) === false);
check("4g is fine", worthWarming({ ...able, link: { effectiveType: "4g" } }) === true);

// The dashboard was the ONLY screen that warmed anything, so the scanner was
// instant from there and slow from everywhere else. And AddAnything's comment
// claimed it warmed the scanner while prefetching only the route -- a sentence
// describing something the code did not do.
const dash = fs.readFileSync(`${REPO}/web/src/app/page.tsx`, "utf8");
const add = fs.readFileSync(`${REPO}/web/src/components/AddAnything.tsx`, "utf8");
check("the dashboard keeps no private copy of the guards", !/loadOpenCV/.test(dash), "dashboard still calls loadOpenCV itself");
check("the dashboard warms through the shared rule", /warmScannerWhenIdle\(/.test(dash));
check("'+ Add' warms the page-finder, not just the route", /warmScanner\(/.test(add), "AddAnything still only prefetches");
check("...and still prefetches the route as well", /router\.prefetch\("\/scan"\)/.test(add));

console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
