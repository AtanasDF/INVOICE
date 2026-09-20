// How a long invoice is cut into PDF pages. The bug this exists for: the
// bottom of the content was taken to be the last place a page MAY be cut,
// and everything under the items table -- the VAT breakdown, the CIS line,
// the payments and the "Amount due" box -- is plain divs, none of which is
// a cut point. So a long invoice from an account with no bank details and
// no registered-company footer ended at the last line item, with no total
// anywhere on the customer's copy.
import { PAGE_HEIGHT, PAGE_MARGIN, pageSlices } from "./gen/lib/invoicePdf.js";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };
const covers = (slices, height) => slices.length > 0 && slices[slices.length - 1][1] >= height - 2;

// A short invoice: one page, whatever the breaks say.
let s = pageSlices([300, 500, 700], 760);
check("a short invoice is one page", s.length === 1, JSON.stringify(s));
check("and that page is a whole A4 sheet", s[0][1] === PAGE_HEIGHT, JSON.stringify(s[0]));

// The bug: the table ends at 1508, the real content at 1768.
const breaks = [295, 331, 367, 403, 1400, 1450, 1508];
s = pageSlices(breaks, 1768);
check("a long invoice runs to the bottom of its content, not the last cut point", covers(s, 1768), JSON.stringify(s));
// Pinning the difference: told nothing about the height, it falls back to
// the last cut point, which is exactly the old behaviour and exactly what
// lost the totals.
check("without a height it stops at the last cut point, as it used to", !covers(pageSlices(breaks), 1768), JSON.stringify(pageSlices(breaks)));
check("it takes more than one page", s.length >= 2, JSON.stringify(s));
check("the pages join up with no gap and no overlap", s.every((sl, i) => i === 0 || sl[0] === s[i - 1][1]), JSON.stringify(s));
check("no page is taller than a sheet", s.every(([a, b]) => b - a <= PAGE_HEIGHT + 2), JSON.stringify(s));
check("every page has something on it", s.every(([a, b]) => b > a), JSON.stringify(s));

// Content shorter than the last break point (rounding) still works.
s = pageSlices([300, 1200], 1190);
check("a content height under the last break still covers everything", covers(s, 1200), JSON.stringify(s));

// No break points at all: one page, not zero.
s = pageSlices([], 900);
check("a sheet with nothing to break on is still drawn", s.length >= 1 && s[0][1] > 0, JSON.stringify(s));

// Very long: five pages of line items.
s = pageSlices(Array.from({ length: 120 }, (_, i) => 295 + i * 36), 5000);
check("a very long invoice covers all five pages of it", covers(s, 5000), JSON.stringify(s.slice(0, 3)) + " ... " + JSON.stringify(s.slice(-1)));
check("later pages leave room for the margin", s.slice(1).every(([a, b]) => b - a <= PAGE_HEIGHT - 2 * PAGE_MARGIN + 2), JSON.stringify(s.slice(1, 3)));

console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
