// A document that is nobody's supplier, kept as a file and nothing else.
//
// Atanas, 2026-09-26: "The system should allow you to scan documents from a
// company that isn't theirs and the system should be also able to process
// (send or download the file) without saving a new company to the account."
//
// Half of that already worked: the supplier box on the scan walk can be left
// on "No supplier / general expense" and no contact is made. This is the other
// half. Before it, the only ways out of the walk were Save, which writes a
// receipt, and Skip, which throws the photograph away -- so a delivery note or
// somebody else's invoice could be photographed and then not kept at all.
//
// The promise this file makes to a person is "nothing is added to your records
// and no supplier is created". That promise is a property of the source, so it
// is checked here in the source.
import fs from "node:fs";
import { REPO } from "./repo.mjs";

const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

const C = `${REPO}/web/src/components/scan/JustTheFile.tsx`;
const src = fs.readFileSync(C, "utf8");

// ---------------------------------------------------------------------------
// It cannot touch the account, because it cannot reach it
// ---------------------------------------------------------------------------
check("it imports no store at all", !/from "@\/lib\/storage"/.test(src), "it can write to the database");
check("it never reaches supabase", !/supabase/i.test(src), "it holds a database client");
for (const store of ["receiptsStore", "clientsStore", "invoicesStore"]) {
  check(`it never calls ${store}`, !src.includes(store), store);
}
// The only network call it may make is the one the person asked for: an email
// through the existing, fenced route.
const fetches = [...src.matchAll(/fetch\(\s*["'`]([^"'`]+)/g)].map((m) => m[1]);
check("it makes no fetch of its own", fetches.length === 0, JSON.stringify(fetches));
check("sending is delegated to EmailFileForm, which is already fenced", /EmailFileForm/.test(src));

// ---------------------------------------------------------------------------
// The file is made here, on the device
// ---------------------------------------------------------------------------
check("the PDF is built in the browser", /pagesToPdf/.test(src));
check("and handed to the device, not uploaded", /saveBlob|navigator\.share/.test(src));
check("the import is lazy, so the walk does not carry pdf-lib", /await import\("@\/lib\/documentPdf"\)/.test(src));

// ---------------------------------------------------------------------------
// It says what it does, and it is honest
// ---------------------------------------------------------------------------
check("it promises nothing is added to the records", /Nothing is added to your records/i.test(src));
check("...and that no supplier is created", /no supplier is\s*\n?\s*created/i.test(src.replace(/\s+/g, " ")) || /no supplier is created/i.test(src.replace(/\s+/g, " ")));
check("the offer names the case it is for", /Not yours\? Just keep the file/.test(src));
// A once-only job: making a PDF and handing it over twice is two downloads.
check("it guards the press with a ref, not disabled alone", /useRef\(false\)/.test(src) && /working\.current/.test(src));
// A browser that cannot share must say so rather than seem to do nothing.
check("a browser that cannot share is told", /can't share files/i.test(src));

// ---------------------------------------------------------------------------
// And it is actually in the walk
// ---------------------------------------------------------------------------
const scan = fs.readFileSync(`${REPO}/web/src/app/scan/page.tsx`, "utf8");
check("the scan walk offers it", /<JustTheFile/.test(scan), "it is built but unreachable");
check("it is given the pages of the document being looked at", /<JustTheFile pages=\{doc\.pages\}/.test(scan), "it gets the wrong pages");

// The other half of his ask, which already worked -- pinned so it keeps working.
check("a document can still be saved with no supplier at all", /No supplier \/ general expense/.test(scan));
check("and that choice is recorded as deliberate", /noSupplier = true/.test(scan));

const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} passed`);
console.log(JSON.stringify({ passed, total: results.length }));
process.exit(passed === results.length ? 0 : 1);
