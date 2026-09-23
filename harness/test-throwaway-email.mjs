// Refusing a throwaway inbox at sign-up (protection 3 of the three he chose).
// A hundred fake accounts are only worth making if each costs nothing, and a
// temporary inbox is what makes that true.
//
// The danger in a list like this is the false positive: a tradesman on his own
// domain turned away at the door would never know why, and would never come
// back. So most of what is checked here is who must NOT be caught.
import { THROWAWAY_REFUSED, isThrowawayEmail } from "./gen/lib/throwawayEmail.js";

const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

const caught = [
  "someone@mailinator.com",
  "test@guerrillamail.com",
  "x@yopmail.com",
  "a@temp-mail.org",
  "b@sharklasers.com",
  "c@10minutemail.com",
];
check("the well-known throwaway services are refused", caught.every(isThrowawayEmail), JSON.stringify(caught.filter((e) => !isThrowawayEmail(e))));

// The ones that must get through, because these are the customers.
const allowed = [
  "atanas@lurra.co.uk",
  "dave@davesvanrepairs.co.uk",
  "j.hetherington@groundworks.com",
  "driver@gmail.com",
  "someone@outlook.com",
  "a@hotmail.co.uk",
  "info@a-small-firm.net",
  "bob@mail.com",
  "sue@tempest-joinery.co.uk",
  "pat@mailbox.org",
  "ops@temperance-ltd.co.uk",
];
const wrongly = allowed.filter(isThrowawayEmail);
check("real addresses are not caught, including ones that merely look similar", wrongly.length === 0, JSON.stringify(wrongly));

// Case and stray whitespace are how a real person types.
check("capitals and spaces do not slip past it", isThrowawayEmail("  Someone@MAILINATOR.com  "));
check("a trailing dot on the host does not slip past it", isThrowawayEmail("a@mailinator.com."));
check("a subdomain of a throwaway service counts as the service", isThrowawayEmail("a@inbox.mailinator.com"));
check("...but a lookalike domain that merely ends the same way does not", !isThrowawayEmail("a@notmailinator.com"));

// Rubbish in must not throw: this runs on every sign-up.
for (const bad of ["", "no-at-sign", "@", "a@", "a@@b", "a@ ", "@b.com"]) {
  let threw = false;
  try {
    isThrowawayEmail(bad);
  } catch {
    threw = true;
  }
  check(`"${bad}" is handled rather than thrown at`, !threw);
}

check("the refusal explains itself rather than accusing", /temporary email/i.test(THROWAWAY_REFUSED) && /records/i.test(THROWAWAY_REFUSED) && !/\b(banned|blocked|not allowed)\b/i.test(THROWAWAY_REFUSED), THROWAWAY_REFUSED);
check("...and says what to do instead", /use an address/i.test(THROWAWAY_REFUSED), THROWAWAY_REFUSED);

console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
