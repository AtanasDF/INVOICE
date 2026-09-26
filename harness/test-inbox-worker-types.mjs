// The email import crosses a boundary no import can cross.
//
// worker/ is a Cloudflare Worker and cannot import from web/src, so the list
// of file types the reader takes exists twice: ALLOWED_TYPES in
// web/src/lib/scanExtraction.ts and READABLE_TYPES in worker/src/index.ts. The
// octet-stream rescue table (BY_EXTENSION) exists twice for the same reason.
// Two copies of a list is exactly what produced the two money bugs found on
// 2026-09-26, so the copies are checked against each other here.
//
// It also pins the three things that made a lost email lose the document
// rather than delay it, all of which are one line each and all of which would
// be easy to undo without noticing:
//   - the route declares a maxDuration long enough for the reads it does;
//   - the Worker rejects a message it could not hand over, instead of
//     returning quietly after Cloudflare has already accepted it;
//   - the Worker decides a type BEFORE spending its body budget on it.
import fs from "node:fs";
import { REPO } from "./repo.mjs";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

const worker = fs.readFileSync(`${REPO}/worker/src/index.ts`, "utf8");
const extraction = fs.readFileSync(`${REPO}/web/src/lib/scanExtraction.ts`, "utf8");
const route = fs.readFileSync(`${REPO}/web/src/app/api/inbox/ingest/route.ts`, "utf8");
const scanRoute = fs.readFileSync(`${REPO}/web/src/app/api/scan/route.ts`, "utf8");

const list = (src, name) => {
  const m = new RegExp(name + "\\s*=\\s*\\[([^\\]]*)\\]").exec(src);
  return m ? [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]) : null;
};
const table = (src) => {
  const m = /BY_EXTENSION[^=]*=\s*\{([^}]*)\}/.exec(src);
  return m ? Object.fromEntries([...m[1].matchAll(/(\w+):\s*"([^"]+)"/g)].map((x) => [x[1], x[2]])) : null;
};

// ---- The two type lists -----------------------------------------------------
const images = list(extraction, "ALLOWED_IMAGE_TYPES");
const readable = list(worker, "READABLE_TYPES");
const appTypes = images ? [...images, "application/pdf"] : null;
check("the app's allowed types are readable from source", Array.isArray(appTypes) && appTypes.length >= 2, JSON.stringify(appTypes));
check("the Worker's list is readable from source", Array.isArray(readable) && readable.length >= 2, JSON.stringify(readable));
check("the Worker takes exactly the types the reader takes", JSON.stringify([...(readable ?? [])].sort()) === JSON.stringify([...(appTypes ?? [])].sort()), `worker ${JSON.stringify(readable)} vs app ${JSON.stringify(appTypes)}`);

// ---- The two octet-stream rescue tables -------------------------------------
const workerExt = table(worker);
const routeExt = table(route);
check("both sides rescue application/octet-stream by extension", !!workerExt && !!routeExt, JSON.stringify({ workerExt, routeExt }));
check("...and by the same table", JSON.stringify(workerExt) === JSON.stringify(routeExt), JSON.stringify({ workerExt, routeExt }));
// A rescue that maps to a type the reader refuses is worse than no rescue: the
// attachment is relabelled, posted, and then thrown away at the far end.
check("...every extension it rescues maps to a type the reader takes", Object.values(workerExt ?? {}).every((t) => (appTypes ?? []).includes(t)), JSON.stringify(workerExt));

// ---- The route's own time ---------------------------------------------------
const maxDuration = (src) => Number(/export const maxDuration = (\d+)/.exec(src)?.[1] ?? 0);
check("the ingest route declares a maxDuration", maxDuration(route) > 0, String(maxDuration(route)));
// It runs the same reader /api/scan does, once per attachment, so it needs at
// least as long as one scan does.
check("...at least as long as a single scan is given", maxDuration(route) >= maxDuration(scanRoute) && maxDuration(scanRoute) > 0, `${maxDuration(route)} vs scan ${maxDuration(scanRoute)}`);

// ---- A message it could not hand over is not thrown away --------------------
const failBranch = worker.slice(worker.indexOf("if (!res.ok)"), worker.indexOf("} catch (err)"));
check("the Worker rejects an email it could not hand over", /message\.setReject\(/.test(failBranch), failBranch.slice(0, 200));
check("...with something a person could read, not a status code", /setReject\("[A-Z][^"]{20,}"\)/.test(failBranch), (/setReject\([^)]*\)/.exec(failBranch) ?? ["none"])[0]);

// ---- Type before budget -----------------------------------------------------
const loop = worker.slice(worker.indexOf("for (const a of chosen)"), worker.indexOf("const text = parsed.text"));
const typeAt = loop.indexOf("READABLE_TYPES.includes");
const budgetAt = loop.indexOf("> budget");
check("the Worker decides the type before spending the body budget", typeAt !== -1 && budgetAt !== -1 && typeAt < budgetAt, `type at ${typeAt}, budget at ${budgetAt}`);
// The reason given to the owner has to match the reason it was left out.
check("...and an unreadable attachment is not reported as too large", /not a kind that can be read/.test(worker) && /too large to send on/.test(worker), "the note's two reasons are not both there");

// ---- Nothing is dropped in silence -----------------------------------------
check("the route records every attachment it decides not to read", /const dropped = \[/.test(route), "no dropped list");
check("...and files them where somebody will see them", /tags: \["via-email", "not-imported"\]/.test(route) && /needs_review: true/.test(route), "not filed for review");
check("...on both paths out of the route", (route.match(/await fileDropped\(\)/g) ?? []).length >= 2, String((route.match(/await fileDropped\(\)/g) ?? []).length));

console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
