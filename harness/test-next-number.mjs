// The next invoice number, worked out from one he already has. The Free
// page scans an invoice he sent before and offers the next one; getting it
// wrong hands a number he has already used to a second customer, which
// breaks the one rule invoice numbering has.
import { nextInvoiceNumber, stripNumberLabel } from "./gen/lib/freeInvoiceDraft.js";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };
const year = new Date().getFullYear();
const yy = String(year % 100);
const next = nextInvoiceNumber;

// Plain sequences.
check("INV-1 -> INV-2", next("INV-1") === "INV-2", next("INV-1"));
check("INV-0042 keeps its padding", next("INV-0042") === "INV-0043", next("INV-0042"));
check("357358 -> 357359", next("357358") === "357359", next("357358"));
check("a label is ignored", next("Invoice No. 12") === "13" || next("Invoice No. 12").endsWith("13"), next("Invoice No. 12"));
check("no digits gives nothing to go on", next("INVOICE") === "", JSON.stringify(next("INVOICE")));

// Year-last numbers: the SEQUENCE moves, never the year.
check(`4/${yy} -> 5/${yy}`, next(`4/${yy}`) === `5/${yy}`, next(`4/${yy}`));
check(`3/${Number(yy) - 1} keeps last year`, next(`3/${Number(yy) - 1}`) === `4/${Number(yy) - 1}`, next(`3/${Number(yy) - 1}`));
check(`0042/${year} -> 0043/${year}`, next(`0042/${year}`) === `0043/${year}`, next(`0042/${year}`));
check("an older full year is still a year", next("0042/2023") === "0043/2023", next("0042/2023"));
check(`001-${yy} -> 002-${yy}`, next(`001-${yy}`) === `002-${yy}`, next(`001-${yy}`));
check(`INV-${year}-007 bumps the sequence, not the year`, next(`INV-${year}-007`) === `INV-${year}-008`, next(`INV-${year}-007`));

// The one that mattered: never hand back a number already used.
const used = `3/${Number(yy) - 1}`;
check("scanning last year's invoice never reissues this year's number", next(used) !== `3/${yy}`, `${used} -> ${next(used)}`);

// A year on its own, with no sequence in front, is all there is to bump.
check("a bare year has nothing else to move", next(`${year}`) === String(year + 1), next(`${year}`));

check("stripNumberLabel drops the label", stripNumberLabel("Invoice No. 12").includes("12"), stripNumberLabel("Invoice No. 12"));
console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
