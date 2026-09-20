// The reminder schedule against a fixed clock. These emails go to his
// customers on their own, so each one must go out once, on the right day,
// and the wrong one must never go at all.
import { REMINDER_SCHEDULE, addDays, lateCompensation, laterReminders, looksLikeCompany, reminderBody, reminderDueToday, renderReminderTemplate } from "./gen/lib/reminderTemplates.js";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

const DUE = "2026-06-15";
const fired = {};
for (let d = -12; d <= 45; d++) {
  const kind = reminderDueToday(DUE, addDays(DUE, d));
  if (kind) (fired[kind] ??= []).push(d);
}

// Three days before, on the day, a week after, a fortnight after, a month
// after -- each with a three-day catch-up if a daily run is missed, and
// never running into the next one.
check("the polite one goes 3 days before, and catches up for 3 days", JSON.stringify(fired.before) === "[-3,-2,-1]", JSON.stringify(fired.before));
check("the due-date one goes on the day and the 2 days after", JSON.stringify(fired.due) === "[0,1,2]", JSON.stringify(fired.due));
check("the 7-day one goes on days 7 to 9", JSON.stringify(fired.after) === "[7,8,9]", JSON.stringify(fired.after));
check("the 14-day one goes on days 14 to 16", JSON.stringify(fired.late) === "[14,15,16]", JSON.stringify(fired.late));
check("the final notice goes on days 30 to 32", JSON.stringify(fired.final) === "[30,31,32]", JSON.stringify(fired.final));

const quiet = [];
for (let d = -12; d <= 45; d++) if (!reminderDueToday(DUE, addDays(DUE, d))) quiet.push(d);
check("nothing goes out before day -3", quiet.slice(0, 9).join() === "-12,-11,-10,-9,-8,-7,-6,-5,-4", quiet.slice(0, 9).join());
check("nothing goes out in the gaps or after the final notice", [3, 4, 5, 6, 10, 13, 17, 29, 33, 40, 45].every((d) => quiet.includes(d)), JSON.stringify(quiet));
check("no day fires two reminders", Object.values(fired).flat().length === new Set(Object.values(fired).flat()).size);
check("every step in the schedule fires", Object.keys(fired).length === REMINDER_SCHEDULE.length, JSON.stringify(Object.keys(fired)));

// A reminder is claimed with everything after it, so a catch-up can never
// send an older one after a newer one has gone.
check("sending the 14-day one also rules out the final", JSON.stringify(laterReminders("late")) === '["late","final"]', JSON.stringify(laterReminders("late")));
check("the polite one rules out everything", laterReminders("before").length === 5);

// Statutory interest: final notice only, business only, switched on only.
const base = { template: null, clientName: "Acme Kitchens Ltd", invoiceNumber: "INV-60", amountDue: 1200, dueDate: DUE, today: addDays(DUE, 30), bank: "Sort 12-34-56", businessName: "Harness Plastering Ltd" };
const withInterest = reminderBody({ ...base, kind: "final", clientIsCompany: true, claimInterest: true });
check("the final notice to a company can mention statutory interest", /Late Payment of Commercial Debts/.test(withInterest));
check("it names the fixed compensation for the size of the debt", withInterest.includes("£70"), withInterest.slice(withInterest.indexOf("compensation") - 20, withInterest.indexOf("compensation") + 60));
check("an earlier reminder never mentions interest", !/Late Payment/.test(reminderBody({ ...base, kind: "late", clientIsCompany: true, claimInterest: true })));
check("a private person is never sent the interest line", !/Late Payment/.test(reminderBody({ ...base, kind: "final", clientIsCompany: false, claimInterest: true })));
check("switched off means switched off", !/Late Payment/.test(reminderBody({ ...base, kind: "final", clientIsCompany: true, claimInterest: false })));
check("the bank details and the business name are on every one", withInterest.includes("Sort 12-34-56") && withInterest.trim().endsWith("Harness Plastering Ltd"));

check("compensation is £40 under £1,000", lateCompensation(999.99) === 40);
check("compensation is £70 from £1,000", lateCompensation(1000) === 70 && lateCompensation(9999.99) === 70);
check("compensation is £100 from £10,000", lateCompensation(10000) === 100);

check("Ltd, Limited and LLP read as companies", ["Acme Ltd", "Acme Limited", "Acme Kitchens LLP", "Acme Ltd."].every(looksLikeCompany));
check("a person's name does not", ["John Smith", "Dave the plumber", "Unlimited Roofing", "Limitless Design"].every((n) => !looksLikeCompany(n)), ["John Smith", "Dave the plumber", "Unlimited Roofing", "Limitless Design"].filter(looksLikeCompany).join());

const filled = renderReminderTemplate("Hi {{client_name}}, {{invoice_number}} is £{{amount_due}}, due {{due_date}}, pay by {{pay_by}}.", { clientName: "Acme", invoiceNumber: "INV-1", amountDue: "1,200.00", dueDate: "15 June 2026", payBy: "22 June 2026" });
check("every placeholder is filled in", !/{{/.test(filled), filled);
check("a wording with no placeholders still sends", reminderBody({ ...base, kind: "due", clientIsCompany: true, claimInterest: false, template: "Pay up please." }).startsWith("Pay up please."));

console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
