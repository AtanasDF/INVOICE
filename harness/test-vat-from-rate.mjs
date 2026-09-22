// VAT worked out from a printed rate when the document shows no VAT figure
// (the GO OUTDOORS till receipt, 2026-09-22: "20%" printed, no figure, VAT
// box empty). Pure logic, off the app's own module.
import { vatFromRate, vatForReading, workedOutNote } from "./gen/lib/vatFromRate.js";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

check("£29.00 at 20% holds £4.83 of VAT", vatFromRate(29, 20) === 4.83, vatFromRate(29, 20));
check("£120.00 at 20% holds £20.00", vatFromRate(120, 20) === 20, vatFromRate(120, 20));
check("£105.00 at 5% holds £5.00", vatFromRate(105, 5) === 5, vatFromRate(105, 5));
check("£0.01 at 20% rounds to £0.00", vatFromRate(0.01, 20) === 0, vatFromRate(0.01, 20));
check("no total: nothing", vatFromRate(null, 20) === null && vatFromRate(0, 20) === null);
check("no rate, or a zero rate: nothing", vatFromRate(29, null) === null && vatFromRate(29, 0) === null);
check("a nonsense rate: nothing", vatFromRate(29, 100) === null && vatFromRate(29, -5) === null);
check("a rate written as a fraction is read as the percentage it meant", vatFromRate(29, 0.2) === 4.83 && vatForReading({ totalAmount: 29, vatAmount: null, vatAmountConfidence: "high", vatRate: 0.2 }).workedOutFromRate === 20, `${vatFromRate(29, 0.2)}`);

const printed = vatForReading({ totalAmount: 29, vatAmount: 4.83, vatAmountConfidence: "high", vatRate: 20 });
check("a printed figure is used as read, whatever the rate says", printed.vatAmount === 4.83 && printed.vatAmountConfidence === "high" && printed.workedOutFromRate === null, JSON.stringify(printed));
const worked = vatForReading({ totalAmount: 29, vatAmount: null, vatAmountConfidence: "high", vatRate: 20 });
check("no figure but a rate: worked out, marked low, the rate remembered", worked.vatAmount === 4.83 && worked.vatAmountConfidence === "low" && worked.workedOutFromRate === 20, JSON.stringify(worked));
const nothing = vatForReading({ totalAmount: 29, vatAmount: null, vatAmountConfidence: "low", vatRate: null });
check("no figure and no rate: still empty", nothing.vatAmount === null && nothing.workedOutFromRate === null, JSON.stringify(nothing));
const older = vatForReading({ totalAmount: 29, vatAmount: null, vatAmountConfidence: "low" });
check("a reading without the field at all (older stored results) is left alone", older.vatAmount === null && older.workedOutFromRate === null, JSON.stringify(older));
check("the note names the rate", workedOutNote(20) === "VAT worked out from the 20% rate printed; the document shows no VAT figure.");

console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
