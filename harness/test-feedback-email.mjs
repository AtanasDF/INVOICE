// The feedback email's text, off the app's own module.
import { FEEDBACK_MAX, feedbackEmailSubject, feedbackEmailText, feedbackEmailHtml, londonTime } from "./gen/lib/feedbackEmail.js";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

const input = {
  message: "The <b>Save</b> button is hidden on my phone & I can't find it.\nSecond line \"quoted\".",
  category: "Confusing", page: "/settings",
  senderEmail: "tester@example.com", senderId: "11111111-2222-3333-4444-555555555555",
  at: "2026-07-01T09:05:00Z", userAgent: "Safari on iPhone", commit: "a1b2c3d",
};
check("the subject holds the category and the page", feedbackEmailSubject(input) === "Feedback: Confusing — /settings", feedbackEmailSubject(input));
check("an empty category reads Other, an empty page says so", feedbackEmailSubject({ category: "", page: "" }) === "Feedback: Other — unknown page");
const text = feedbackEmailText(input);
check("the text part carries the message whole, then who and where", text.startsWith(input.message + "\n\n---\nFrom: tester@example.com (11111111") && text.includes("Page: /settings") && text.includes("Browser: Safari on iPhone") && text.includes("Build: a1b2c3d"), text);
check("the time prints in London (BST in July)", londonTime("2026-07-01T09:05:00Z") === "01 Jul 2026, 10:05" && text.includes("When: 01 Jul 2026, 10:05 (London)"), londonTime("2026-07-01T09:05:00Z"));
check("...and GMT in January", londonTime("2026-01-15T09:05:00Z") === "15 Jan 2026, 09:05", londonTime("2026-01-15T09:05:00Z"));
const html = feedbackEmailHtml(input);
check("the HTML escapes tags, ampersands and quotes", html.includes("&lt;b&gt;Save&lt;/b&gt;") && html.includes("&amp; I") && html.includes("&quot;quoted&quot;") && !html.includes("<b>Save"), html);
check("...and keeps the line break", html.includes("find it.\nSecond line"));
const long = "x".repeat(FEEDBACK_MAX);
check("a message at the limit survives whole", feedbackEmailText({ ...input, message: long }).startsWith(long) && FEEDBACK_MAX === 5000);
const script = { ...input, message: "<script>alert(1)</script>", senderEmail: "<x@y>", userAgent: "<ua>" };
const h2 = feedbackEmailHtml(script);
check("a script in the message or the headers never reaches the HTML unescaped", !h2.includes("<script>") && !h2.includes("<x@y>") && !h2.includes("<ua>"), h2);

console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
