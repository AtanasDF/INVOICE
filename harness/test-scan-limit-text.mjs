// What someone is actually told when they hit the wall, and when they are not
// told anything at all. Recompiled from the app's own code every run, so the
// wording here can never drift from the wording people see.
//
// The arithmetic itself lives in migration-036 and is exercised in SQL
// (the commented block at the foot of that file); what is checked here is the
// half that is written in TypeScript: the decision to refuse, and the words.
import { allowScans, refusalText, spendScans } from "./gen/lib/scanLimit.js";

const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

// --- the words ---
const day = refusalText({ reason: "day", usedToday: 50, dayLimit: 50 });
check("hitting the daily limit says the number and when it comes back", /50 documents today/.test(day) && /starts again tomorrow morning/.test(day), day);
check("...and says what still works", /copy a document or write an invoice by hand/.test(day), day);
check("...and is not an error code", !/\b(429|error|limit exceeded)\b/i.test(day), day);

const month = refusalText({ reason: "month", usedThisMonth: 600, monthLimit: 600, topUpAvailable: true });
check("hitting the monthly limit offers the extra 600", /another 600 for this month/.test(month) && /once/.test(month), month);
check("...and does not pretend it is the end", !/starts again on the 1st/.test(month), month);

const spent = refusalText({ reason: "month", usedThisMonth: 1200, monthLimit: 1200, topUpAvailable: false });
check("once the extra is used, it says so and when it resets", /extra 600 used/.test(spent) && /starts again on the 1st/.test(spent), spent);
check("...and still says what works meanwhile", /copy a document or write an invoice by hand/.test(spent), spent);

// Nobody should meet a wall that blames them.
for (const [name, text] of [["day", day], ["month", month], ["spent", spent]]) {
  check(`the ${name} message blames nobody`, !/\b(you have exceeded|abuse|violat|too many)\b/i.test(text), text);
}

// --- switched off, which is how it ships ---
// SCAN_LIMITS is unset here, exactly as in production until he turns it on,
// so nothing may be refused and nothing may be spent.
const off = await allowScans("any-token", 999);
check("with the switch off nothing is ever refused", off === null, JSON.stringify(off));
let threw = false;
try {
  await spendScans("any-token", 3);
} catch {
  threw = true;
}
check("...and spending is a no-op rather than an error", !threw);
check("...even for an absurd count", (await allowScans("any-token", 10_000)) === null);

console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
