// "What I charge": the price list learned from invoices and quotes, his own
// changes laid over it, and the fixed / per-hour maths that turns an item
// into a line. Pure logic, off the app's own source (gen/).
import { learnPrices, learnedWords, buildPriceList, editFor, withEdit, readEdits, lineFor, lineTotal, priceWords, offerFromList, isOwnKey } from "./gen/lib/priceList.js";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };
const J = (x) => JSON.stringify(x);

const inv = (o) => ({ id: o.id, clientId: o.clientId ?? "c1", date: o.date, number: o.id, items: o.items, notes: "", dueDate: null, paymentTerms: "", status: o.status ?? "sent", tags: [], vatRegistered: true, cisRate: null });
const line = (description, unitPrice, quantity = 1, vatRate = "standard") => ({ description, unitPrice, quantity, vatRate });

const invoices = [
  inv({ id: "1", date: "2026-01-10", items: [line("Skim a ceiling", 180), line("Labour per hour", 40, 6)] }),
  inv({ id: "2", date: "2026-03-10", items: [line("Skim a ceiling", 240)] }),
  inv({ id: "3", date: "2026-05-10", items: [line("skim a ceiling", 220), line("Labour per hour", 45, 3), line("Hang a door", 90, 1, "reduced")] }),
  inv({ id: "4", date: "2026-06-10", items: [line("Hang a door", 90, 2, "reduced")] }),
  inv({ id: "D", date: "2026-07-10", status: "draft", items: [line("Skim a ceiling", 999), line("Never sent", 50)] }),
  inv({ id: "5", date: "2026-02-10", items: [line("Less deposit", 300, -1), line("", 50), line("Free advice", 0)] }),
];
const quotes = [{ id: "q1", clientId: "c9", number: "Q-1", date: "2026-08-01", validUntil: null, items: [line("Render a wall", 900)], notes: "", status: "sent", invoiceId: null, deposit: null, depositInvoiceId: null, depositClaimed: false, vatRegistered: true },
  { id: "q2", clientId: "c9", number: "Q-2", date: "2026-08-02", validUntil: null, items: [line("Quoted in draft", 10)], notes: "", status: "draft", invoiceId: null, deposit: null, depositInvoiceId: null, depositClaimed: false, vatRegistered: null }];

// ── Learning ──
const learned = learnPrices(invoices, quotes);
const L = (re) => learned.find((x) => re.test(x.description));
const skim = L(/skim/i);
check("every job charged is on the list, not just the first twelve", learnPrices(Array.from({ length: 20 }, (_, i) => inv({ id: `n${i}`, date: "2026-01-01", items: [line(`Job ${i}`, 10 + i)] }))).length === 20);
check("the same job written two ways is one item", learned.filter((x) => /skim/i.test(x.description)).length === 1, J(learned.map((x) => x.description)));
check("it counts every time it was charged", skim.timesUsed === 3, J(skim));
check("the usual price is the last one charged", skim.last === 220, J(skim));
check("and the range it has run over is kept", skim.low === 180 && skim.high === 240, J(skim));
check("a draft's price is not a price, not even in the range", skim.high !== 999 && !L(/Never sent/) && !L(/Quoted in draft/), J(skim));
check("deductions, blanks and freebies are not things you charge for", !L(/Less deposit/) && !L(/Free advice/) && !learned.some((x) => !x.description.trim()));
check("a price you quoted is a price you charge", !!L(/Render a wall/));
check("a line written as an hourly rate starts as per hour", L(/Labour/).kind === "hourly", J(L(/Labour/)));
check("anything else starts as a fixed price", skim.kind === "fixed" && L(/Hang a door/).kind === "fixed");
check("the VAT rate is the one last used", L(/Hang a door/).vatRate === "reduced");
check("most charged first", learned[0].description === "Skim a ceiling", J(learned.map((x) => x.description)));
check("the words say a varied price is a range, with the last", learnedWords(skim) === "Charged 3 times: £180.00 to £240.00, last £220.00", learnedWords(skim));
check("the words say a steady price is the same every time", learnedWords(L(/Hang a door/)) === "Charged 2 times, £90.00 every time", learnedWords(L(/Hang a door/)));
check("and a one-off says once", learnedWords(L(/Render/)) === "Charged once, at £900.00", learnedWords(L(/Render/)));
for (const d of ["Electrician (hourly)", "Callout - 2 hrs", "Day rate £/hr", "Labour 3 hours"])
  check(`"${d}" reads as per hour`, learnPrices([inv({ id: "h", date: "2026-01-01", items: [line(d, 50)] })])[0].kind === "hourly");
for (const d of ["Phone socket", "Thorough clean", "Shower tray"])
  check(`"${d}" is not mistaken for per hour`, learnPrices([inv({ id: "h", date: "2026-01-01", items: [line(d, 50)] })])[0].kind === "fixed");

// ── His changes on top ──
let list = buildPriceList(learned, []);
check("with no changes the list is exactly what was learned", list.length === learned.length && list.every((i) => !i.edited && i.learned));
const skimItem = list.find((i) => /skim/i.test(i.name));
let e = editFor(skimItem, { name: "Skim a ceiling (per room)", price: 250, kind: "fixed", vatRate: "standard", hidden: false });
check("only what differs from the learned figure is kept", J(Object.keys(e).sort()) === J(["key", "name", "price"]), J(e));
check("an edit that changes nothing keeps nothing", editFor(skimItem, { name: skimItem.name, price: skimItem.price, kind: skimItem.kind, vatRate: skimItem.vatRate, hidden: false }) === null);
let edits = withEdit([], skimItem.key, e);
list = buildPriceList(learned, edits);
let s2 = list.find((i) => i.key === skimItem.key);
check("his name and price win", s2.name === "Skim a ceiling (per room)" && s2.price === 250 && s2.edited);
check("and the learned figure is still there beside it", s2.learned.last === 220 && s2.learned.description === "Skim a ceiling");
// A learned price that changes later still shows through wherever he set nothing.
const later = learnPrices([...invoices, inv({ id: "9", date: "2026-09-01", items: [line("Hang a door", 110, 1, "reduced")] })], quotes);
const doorEdit = editFor(list.find((i) => /door/i.test(i.name)), { name: "Hang a door", price: 90, kind: "hourly", vatRate: "reduced", hidden: false });
const door = buildPriceList(later, [doorEdit]).find((i) => /door/i.test(i.name));
check("a later price shows through where he changed only the type", door.price === 110 && door.kind === "hourly", J(door));
// Hide, then show again.
const hid = withEdit(edits, s2.key, editFor(s2, { name: s2.name, price: s2.price, kind: s2.kind, vatRate: s2.vatRate, hidden: true }));
check("hiding keeps his other changes", (() => { const x = buildPriceList(learned, hid).find((i) => i.key === s2.key); return x.hidden && x.price === 250; })());
check("only one edit per item, ever", hid.filter((x) => x.key === s2.key).length === 1);
const back = withEdit(hid, s2.key, null);
check("back to the learned price drops his change and nothing else", buildPriceList(learned, back).find((i) => i.key === s2.key).price === 220 && back.length === hid.length - 1);
// An item added by hand.
const own = { key: "own:abc", name: "", price: 0, kind: "fixed", vatRate: "standard", hidden: false, learned: null, edited: true };
const ownEdit = editFor(own, { name: " Gutter clear ", price: 35, kind: "hourly", vatRate: "zero", hidden: false });
list = buildPriceList(learned, withEdit(edits, own.key, ownEdit));
const g = list.find((i) => i.key === "own:abc");
check("an item added by hand is on the list", !!g && g.name === "Gutter clear" && g.price === 35 && g.kind === "hourly" && g.vatRate === "zero" && g.learned === null, J(g));
check("and goes after the learned ones", list[list.length - 1].key === "own:abc");
check("its key says it is his own", isOwnKey(g.key) && !isOwnKey(s2.key));
check("a half-made own item (no price) is not shown", !buildPriceList(learned, [{ key: "own:x", name: "No price" }]).some((i) => i.key === "own:x"));
check("an edit for a job no longer charged does no harm", buildPriceList(learned, [{ key: "gone", price: 5 }]).length === learned.length);

// ── What comes back from the database ──
const raw = [{ key: "skim a ceiling", price: 250 }, { key: "", price: 1 }, null, "x", { key: "k", price: -4, kind: "weekly", vatRate: "nonsense", hidden: "yes", name: 7 }, { key: "own:1", name: "A", price: 5, kind: "hourly", vatRate: "zero", hidden: true }];
const r = readEdits(raw);
check("only well-formed edits are believed", r.length === 3 && r[0].price === 250, J(r));
check("a negative price, an unknown type or VAT rate is dropped", J(r[1]) === J({ key: "k" }), J(r[1]));
check("a good one keeps everything", J(r[2]) === J({ key: "own:1", name: "A", price: 5, kind: "hourly", vatRate: "zero", hidden: true }), J(r[2]));
check("null (never saved) is no changes", readEdits(null).length === 0 && readEdits({}).length === 0);

// ── Fixed and per hour on a line ──
const fixed = { key: "f", name: "Fit a door", price: 120, kind: "fixed", vatRate: "standard", hidden: false, learned: null, edited: true };
const hourly = { key: "h", name: "Labour", price: 45, kind: "hourly", vatRate: "standard", hidden: false, learned: null, edited: true };
check("a fixed price is one of it", J(lineFor(fixed, 7)) === J({ description: "Fit a door", quantity: 1, unitPrice: 120, vatRate: "standard" }), J(lineFor(fixed, 7)));
check("a per-hour item puts the hours in the quantity and the rate in the price", J(lineFor(hourly, 3.5)) === J({ description: "Labour", quantity: 3.5, unitPrice: 45, vatRate: "standard" }), J(lineFor(hourly, 3.5)));
check("3.5 hours at £45 is £157.50", lineTotal(hourly, 3.5) === 157.5);
check("a third of an hour comes to whole pennies", lineTotal({ ...hourly, price: 50 }, 1 / 3) === 16.67, lineTotal({ ...hourly, price: 50 }, 1 / 3));
check("a fixed price ignores hours", lineTotal(fixed, 9) === 120);
check("negative hours never make a credit", lineFor(hourly, -2).quantity === 0);
check("the price is said with its type", priceWords(hourly) === "£45.00 an hour" && priceWords(fixed) === "£120.00");

// ── What a form offers ──
list = buildPriceList(learned, [
  editFor(buildPriceList(learned, []).find((i) => /skim/i.test(i.name)), { name: "Skim a ceiling", price: 260, kind: "fixed", vatRate: "standard", hidden: false }),
  editFor(buildPriceList(learned, []).find((i) => /render/i.test(i.name)), { name: "Render a wall", price: 900, kind: "fixed", vatRate: "standard", hidden: true }),
  ownEdit && { ...ownEdit, key: "own:abc" },
]);
const offered = [
  { description: "skim a ceiling", unitPrice: 180, vatRate: "standard" },
  { description: "Hang a door", unitPrice: 85, vatRate: "reduced" },
  { description: "Render a wall", unitPrice: 900, vatRate: "standard" },
  { description: "Typed once", unitPrice: 12, vatRate: "standard" },
];
const o = offerFromList(offered, list, 8);
check("his own price wins over this customer's last one", o.find((i) => /skim/i.test(i.name)).price === 260, J(o));
check("where he set no price, this customer's last price is still offered", o.find((i) => /door/i.test(i.name)).price === 85, J(o));
check("a hidden item is not offered", !o.some((i) => /render/i.test(i.name)));
check("a line not on the list is offered as it was", o.some((i) => i.name === "Typed once" && i.kind === "fixed"));
check("items he added himself are offered after, even past the limit", offerFromList(offered, list, 1).some((i) => i.key === "own:abc"));
check("the customer's order is kept", o[0].name === "Skim a ceiling" && o[1].name === "Hang a door");

console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
