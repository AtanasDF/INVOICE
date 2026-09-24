// A UK VAT number's own check digits, used to catch a typo on the spot.
//
// Dext is the only one of the twelve apps in notes/competitor-research.md
// that checks a VAT number at all. This half needs nothing from anybody:
// nine digits where the first seven, weighted 8..2, plus the last two,
// divide by 97 -- or do once 55 is added, which is how numbers issued
// since November 2009 work. Both are in circulation.
//
// The real numbers below are printed publicly by the companies themselves
// and are here because an algorithm that only agrees with numbers I made
// up with the same algorithm has proved nothing at all.
import { checkVatNumberFormat, formatVatNumber, normaliseVatNumber } from "./gen/lib/vatNumber.js";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

const REAL = [
  ["220430231", "Tesco Stores"],
  ["660454836", "Sainsbury's"],
];
for (const [vrn, who] of REAL) {
  check(`${who}'s real VAT number passes`, checkVatNumberFormat(vrn).kind === "ok", JSON.stringify(checkVatNumberFormat(vrn)));
}

// The point of the whole thing: one digit typed wrong is caught. Every
// single-digit change to a real number, in every position.
let caught = 0, tried = 0;
for (const [vrn] of REAL) {
  for (let i = 0; i < 9; i++) {
    for (let d = 0; d <= 9; d++) {
      if (String(d) === vrn[i]) continue;
      const typo = vrn.slice(0, i) + d + vrn.slice(i + 1);
      tried++;
      if (checkVatNumberFormat(typo).kind === "wrong") caught++;
    }
  }
}
// 97 of every 100 wrong numbers fail the sum; the rest happen to land on a
// multiple of 97, and nothing but HMRC can tell those apart.
check(`nearly every one-digit typo is caught (${caught}/${tried})`, caught / tried > 0.95, `${caught}/${tried}`);

// Two digits swapped by mistake -- the other common slip.
let swaps = 0, swapsCaught = 0;
for (const [vrn] of REAL) {
  for (let i = 0; i < 8; i++) {
    if (vrn[i] === vrn[i + 1]) continue;
    const t = vrn.slice(0, i) + vrn[i + 1] + vrn[i] + vrn.slice(i + 2);
    swaps++;
    if (checkVatNumberFormat(t).kind === "wrong") swapsCaught++;
  }
}
check(`two digits swapped is caught (${swapsCaught}/${swaps})`, swapsCaught === swaps, `${swapsCaught}/${swaps}`);

// How people actually type it.
for (const typed of ["GB 220 4302 31", "gb220430231", "220 430 231", "GB-220-4302-31", "  220430231  "]) {
  check(`"${typed}" is read as the same number`, checkVatNumberFormat(typed).kind === "ok" && checkVatNumberFormat(typed).normalised === "GB220430231", JSON.stringify(checkVatNumberFormat(typed)));
}

// A branch: nine digits and a three-digit suffix.
const branch = checkVatNumberFormat("220430231002");
check("a branch number is kept, not thrown away", branch.kind === "ok" && branch.branch === "002" && branch.normalised === "GB220430231002", JSON.stringify(branch));

// Northern Ireland kept its place in the EU system for goods, so XI is a
// real prefix and is not the same as GB.
const xi = checkVatNumberFormat("XI220430231");
check("XI is understood and kept as XI", xi.kind === "ok" && xi.northernIreland === true && xi.normalised === "XI220430231", JSON.stringify(xi));
check("GB is not marked as Northern Ireland", checkVatNumberFormat("GB220430231").northernIreland === false);

// Government departments and health authorities have no check digits.
check("a government department number is allowed", checkVatNumberFormat("GD001").kind === "department");
check("a health authority number is allowed", checkVatNumberFormat("HA501").kind === "department");
check("GD500 is not a department number", checkVatNumberFormat("GD500").kind === "wrong");
check("HA499 is not a health authority number", checkVatNumberFormat("HA499").kind === "wrong");

// Empty is not wrong: a VAT number is optional everywhere it is asked for.
check("an empty box is not an error", checkVatNumberFormat("").kind === "empty");
check("spaces alone are not an error", checkVatNumberFormat("   ").kind === "empty");

const shorter = checkVatNumberFormat("12345678");
check("eight digits says how many there should be", shorter.kind === "wrong" && /9 numbers/.test(shorter.reason), JSON.stringify(shorter));
const foreign = checkVatNumberFormat("IE6388047V");
check("an Irish number is named as not being a UK one", foreign.kind === "wrong" && /another country/.test(foreign.reason), JSON.stringify(foreign));
const bad = checkVatNumberFormat("220430232");
check("a wrong check digit says the numbers don't add up", bad.kind === "wrong" && /don't add up/.test(bad.reason), JSON.stringify(bad));

// Nothing in any refusal is machinery: these are read by somebody holding
// a supplier's invoice, not by a developer.
for (const t of ["12345678", "IE6388047V", "220430232", "!!!"]) {
  const r = checkVatNumberFormat(t);
  const words = r.kind === "wrong" ? r.reason : "";
  check(`"${t}" is refused in plain words`, /^[A-Z]/.test(words) && /[.]$/.test(words) && !/\b(regex|checksum|modulus|invalid|error|parse)\b/i.test(words), words);
}

check("printed the way HMRC prints it", formatVatNumber("gb220430231") === "GB 220 4302 31", formatVatNumber("gb220430231"));
check("a branch is printed after the number", formatVatNumber("220430231002") === "GB 220 4302 31 002", formatVatNumber("220430231002"));
check("something that isn't a VAT number is left exactly as typed", formatVatNumber(" not a number ") === "not a number");
check("normalising strips what people put in", normaliseVatNumber("gb 220-4302.31") === "GB220430231", normaliseVatNumber("gb 220-4302.31"));

console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
