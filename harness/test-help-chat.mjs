// The chat, which is the rung below the walkthroughs.
//
// Atanas asked for "a chat bot text so they can chat with the bot and then
// anything can be emailed to us", then talked himself into the better order:
// "maybe instead of help... people can help themselves choosing what they
// wanna do and looking through how to do it." So the walkthroughs came
// first and this is for the long tail.
//
// It is also the first thing in the app that costs money every time
// somebody uses it with no natural limit -- scanning has one, people only
// have so many receipts. So most of what is checked here is the fences.
import { HELP_CHAT_BROKEN, HELP_CHAT_BUSY, HELP_CHAT_LIMITS, HELP_CHAT_TOO_LONG, chatTranscript, grounding, helpChatOn, systemPrompt, trimHistory } from "./gen/lib/helpChat.js";
import { HELP_JOURNEYS } from "./gen/lib/helpJourneys.js";

const BASE = process.env.BASE || "http://localhost:3000";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

// ---------------------------------------------------------------------------
// Off by default, and off means off
// ---------------------------------------------------------------------------
check("the chat is off unless NEXT_PUBLIC_HELP_CHAT is on", !helpChatOn(), "it must ship changing nothing");

// The switch is checked on the server too. A route that answers while the
// feature is meant to be off is an open model endpoint that nothing in the
// UI admits to -- and a free model for anybody who finds the address.
try {
  const res = await fetch(`${BASE}/api/help-chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "you", text: "how do I send an invoice?" }] }),
  });
  const body = await res.json().catch(() => ({}));
  // Both halves together, because a route that does not exist yet also
  // answers 404 -- and a 404 alone would let this check pass on a build
  // that never had the route in it, which is exactly how it first passed.
  check("the route refuses while the switch is off, in its own words",
    res.status === 404 && typeof body.error === "string" && body.error.length > 0,
    `${res.status} ${JSON.stringify(body)}`);
  // Even the refusal must not leak a model's or a framework's words.
  check("its refusal is in plain English",
    typeof body.error === "string" && !/gemini|api|token|500|undefined/i.test(body.error), JSON.stringify(body));
} catch (err) {
  check("the route refuses while the switch is off, in its own words", false, `no server on ${BASE}: ${err.message}`);
  check("its refusal is in plain English", false, "not reached");
}

// ---------------------------------------------------------------------------
// The window, which is the spending limit
// ---------------------------------------------------------------------------
// Cost grows with everything sent BACK, not with the question, so a long
// conversation is the expensive part.
const many = Array.from({ length: 30 }, (_, i) => ({ role: i % 2 ? "app" : "you", text: `message ${i}` }));
const kept = trimHistory(many);
check("a long conversation is trimmed to the window", kept.length === HELP_CHAT_LIMITS.window, `${kept.length} of ${many.length}`);
check("it keeps the LAST messages, not the first", kept[kept.length - 1].text === "message 29", kept[kept.length - 1].text);
check("a short conversation is left alone", trimHistory(many.slice(0, 3)).length === 3);
check("one message survives", trimHistory([{ role: "you", text: "hi" }]).length === 1);
// A nonsense window must not return everything -- that is the bill.
check("a zero window still keeps one, not all of them", trimHistory(many, 0).length === 1, String(trimHistory(many, 0).length));
check("a negative window does not return the lot", trimHistory(many, -5).length === 1, String(trimHistory(many, -5).length));
check("the window is short enough to be a limit", HELP_CHAT_LIMITS.window <= 10, String(HELP_CHAT_LIMITS.window));
check("a question is capped well short of a pasted document", HELP_CHAT_LIMITS.maxQuestion <= 2000, String(HELP_CHAT_LIMITS.maxQuestion));
check("there is a per-account cap and an overall one", HELP_CHAT_LIMITS.perUser > 0 && HELP_CHAT_LIMITS.global > HELP_CHAT_LIMITS.perUser);

// ---------------------------------------------------------------------------
// What it is allowed to know
// ---------------------------------------------------------------------------
// Grounded in the walkthroughs rather than a hand-written summary: a summary
// drifts the moment a screen changes, and an answer describing a button that
// is not there any more is worse than no answer.
const ground = grounding();
for (const j of HELP_JOURNEYS) {
  check(`the grounding includes "${j.title}"`, ground.includes(j.title) && ground.includes(j.start), j.id);
}
check("the grounding carries the actual step wording", ground.includes(HELP_JOURNEYS[0].steps[0].caption));
check("the grounding is not empty", ground.length > 200, String(ground.length));

const prompt = systemPrompt();
// The three rules the design note calls non-negotiable.
check("it is told to say when it does not know", /do not know/i.test(prompt));
check("it is told it cannot see their records", /cannot see their records/i.test(prompt));
check("it is told to point at the page instead of guessing their figures", /point them at the page/i.test(prompt));
check("it is told it is not their accountant", /not their accountant/i.test(prompt));
check("it is told to hand on what it cannot answer", /emailed from this screen/i.test(prompt));
check("it answers in British spelling and the app's own words", /British/i.test(prompt) && /VAT/.test(prompt));
check("the prompt names Atanas rather than 'our team'", /Atanas/.test(prompt) && !/our team/i.test(prompt));
check("the prompt carries the grounding", prompt.includes(HELP_JOURNEYS[0].title));

// ---------------------------------------------------------------------------
// Every state leads to the email
// ---------------------------------------------------------------------------
// A refusal is not a failure: it says what still works and it leads
// somewhere. That was got wrong once already and is pinned here.
for (const [name, text] of [["busy", HELP_CHAT_BUSY], ["broken", HELP_CHAT_BROKEN], ["too long", HELP_CHAT_TOO_LONG]]) {
  check(`the "${name}" refusal leads to the email`, /email/i.test(text), text);
  check(`the "${name}" refusal speaks plain English`, !/gemini|429|503|rate limit|token|null/i.test(text), text);
}
check("the busy refusal says what still works", /walkthrough/i.test(HELP_CHAT_BUSY), HELP_CHAT_BUSY);
check("the broken refusal says what still works", /walkthrough/i.test(HELP_CHAT_BROKEN), HELP_CHAT_BROKEN);

// The whole conversation goes to him, not just the last question: what the
// chat got wrong is the reason they are writing.
const transcript = chatTranscript([
  { role: "you", text: "how do I add a deposit?" },
  { role: "app", text: "I am not sure." },
  { role: "you", text: "on a quote" },
]);
check("the transcript carries every message", ["how do I add a deposit?", "I am not sure.", "on a quote"].every((t) => transcript.includes(t)));
check("the transcript says who said what", /They asked/.test(transcript) && /The chat said/.test(transcript), transcript);
check("an empty conversation makes an empty transcript", chatTranscript([]) === "");

const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
