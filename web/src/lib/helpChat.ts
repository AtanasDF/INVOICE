import { HELP_JOURNEYS } from "@/lib/helpJourneys";

// A chat people can ask, when the walkthroughs did not anticipate their
// question.
//
// Atanas asked for "a chat bot text so they can chat with the bot and then
// anything can be emailed to us", and then talked himself into the better
// order: "maybe instead of help... people can help themselves choosing what
// they wanna do and looking through how to do it." He was right, so the
// walkthroughs were built first. This is the rung below them, for the long
// tail -- and what people end up asking here is the honest list of what the
// walkthroughs failed to explain.
//
// OFF BY DEFAULT. Without NEXT_PUBLIC_HELP_CHAT no screen mentions a chat,
// nothing is asked of any model and the route refuses, so it ships changing
// nothing -- the same shape as invites and the scan limits.
export const helpChatOn = () => (process.env.NEXT_PUBLIC_HELP_CHAT ?? "") === "on";

// This is the first thing in the app that costs money every time somebody
// uses it with no natural limit. Scanning has one: people only have so many
// receipts. Chatting does not -- one bored person can send a thousand
// messages, and an open model endpoint is a free model for anybody who
// finds it. Hence every number below, from the first day rather than later.
export const HELP_CHAT_LIMITS = {
  // Per account, per hour.
  perUser: 40,
  // Everybody, per hour. A burst guard on the bill, not a budget.
  global: 400,
  // The cost of a conversation grows with everything sent BACK, not with
  // the question -- so the window is short on purpose. Six messages is
  // three exchanges, which is enough for "no, I meant on my phone".
  window: 6,
  // A question, not a pasted document. Anything longer is either a mistake
  // or somebody using the account as a free model.
  maxQuestion: 600,
};

export type HelpMessage = { role: "you" | "app"; text: string };

// Keep the last few messages and no more. Trimming from the end rather than
// summarising, because a summary is another model call to pay for.
export function trimHistory(messages: HelpMessage[], window = HELP_CHAT_LIMITS.window): HelpMessage[] {
  return messages.slice(-Math.max(1, window));
}

// What the bot is allowed to know: the walkthroughs, which are already the
// written description of what the app does.
//
// Grounding it in HELP_JOURNEYS rather than in a hand-written summary is the
// same argument as recording the frames from the harness instead of by hand:
// a hand-written summary drifts the moment a screen changes, and a help
// answer describing a button that is not there any more is worse than no
// answer. This one cannot drift -- it is built from the words the
// walkthroughs themselves show, which the suites check.
export function grounding(): string {
  return HELP_JOURNEYS.map(
    (j) => `## ${j.title} (at ${j.start})\n${j.summary}\n${j.steps.map((s, i) => `${i + 1}. ${s.caption}`).join("\n")}`
  ).join("\n\n");
}

// Naming him is friendlier and more honest than "our team", which is one
// person. His idea, and he is right.
const HIM = "Atanas, who made the app";

export function systemPrompt(): string {
  return `You answer questions about an invoicing app for people working for themselves in Britain. You are talking to somebody signed in to it.

Here is everything the app does, as the app's own walkthroughs describe it:

${grounding()}

How to answer:

- Short and plain. Two or three sentences. No lists unless they asked for steps.
- Name the page, and say what it is called in the app, so they can find it.
- British spelling. Say "VAT", "invoice", "receipt" -- the words the app uses.

Three rules you do not break:

1. If you do not know, say so plainly and say that ${HIM} can be emailed from this screen. Never guess at how a feature works. An invented answer about somebody's accounting is worse than no answer, and they will act on it.
2. You cannot see their records. You have no access to their invoices, receipts, figures, VAT, what they are owed or who owes it. If they ask what they owe, what their VAT is this quarter, or anything else about their own numbers, say you cannot see their account and point them at the page that shows it.
3. You are not their accountant. Questions about what they should pay, claim, or declare go to an accountant or HMRC. You can say where the app records something; you cannot say whether it is allowable.`;
}

// A refusal is not a failure: it says what still works and it leads
// somewhere. Here it leads to the email, which is the rung below and the
// thing Atanas actually asked for.
export const HELP_CHAT_BUSY =
  "The chat has had a lot of questions this hour. The walkthroughs above still work, and you can email your question to Atanas from here.";
export const HELP_CHAT_BROKEN =
  "The chat isn't answering just now. The walkthroughs above still work, and you can email your question to Atanas from here.";
export const HELP_CHAT_TOO_LONG = `That is longer than the chat can take. Ask it in a sentence or two, or email ${HIM} from here with the whole thing.`;

// The conversation as the email he receives. The question is the point, so
// it leads; the bot's attempts follow, because what it got wrong is why
// they are writing.
export function chatTranscript(messages: HelpMessage[]): string {
  return messages.map((m) => `${m.role === "you" ? "They asked" : "The chat said"}: ${m.text}`).join("\n\n");
}
