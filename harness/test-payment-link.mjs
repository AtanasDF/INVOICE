// The Pay now button: a link the owner pastes, shown in front of their
// customers on every invoice. The rules come from the app
// (src/lib/paymentLink.ts), not a copy. What matters: only https ever becomes
// a link, nothing hostile or mistyped gets through, and the button says whose
// page it opens.
import { payLabel, safePaymentLink } from "./gen/lib/paymentLink.js";

const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

check("a SumUp link is kept", safePaymentLink("https://pay.sumup.com/b2c/QWERTY") === "https://pay.sumup.com/b2c/QWERTY");
check("pasted without https://, it is given it", safePaymentLink("paypal.me/jkovac") === "https://paypal.me/jkovac", safePaymentLink("paypal.me/jkovac"));
check("spaces round it are trimmed", safePaymentLink("  https://buy.stripe.com/abc  ") === "https://buy.stripe.com/abc");
check("http is refused, never shown", safePaymentLink("http://pay.sumup.com/x") === null);
check("javascript: is refused", safePaymentLink("javascript:alert(1)") === null);
check("data: is refused", safePaymentLink("data:text/html,hi") === null);
check("a link with a password in it is refused", safePaymentLink("https://user:pass@pay.example.com") === null);
check("a word that is not an address is refused", safePaymentLink("mysumup") === null && safePaymentLink("hello there") === null);
check("empty is nothing, not an error", safePaymentLink("") === null && safePaymentLink(null) === null);
check("an absurdly long one is refused", safePaymentLink("https://pay.example.com/" + "a".repeat(400)) === null);

check("the button names SumUp", payLabel("https://pay.sumup.com/b2c/X") === "Pay with SumUp");
check("...Stripe", payLabel("https://buy.stripe.com/abc") === "Pay with Stripe");
check("...PayPal", payLabel("https://paypal.me/jkovac") === "Pay with PayPal");
check("...Monzo", payLabel("https://monzo.me/jkovac") === "Pay with Monzo");
check("a page it does not know just says Pay now", payLabel("https://pay.mybusiness.co.uk/x") === "Pay now");
check("a look-alike host is not dressed up as the real one", payLabel("https://sumup.com.evil.example/x") === "Pay now");

console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
