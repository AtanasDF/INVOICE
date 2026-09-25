// The walkthroughs: what the app can do, one journey at a time.
//
// Atanas, on how to explain the app: "record yourself doing it and that can
// be the animations." This is that, with one change that matters — the
// recording is not done by hand.
//
// The harness already drives every one of these journeys through a real
// browser to test it. So the frames are captured by that same run
// (harness/record-help.mjs), which means a hand-recorded clip showing a
// button that has since moved cannot happen here: if the button moves the
// suite fails, and the frames are written again in the same run.
//
// The words live HERE rather than beside the images, for three reasons: they
// are the alternative text for anyone who cannot see the pictures, they are
// the whole walkthrough on a connection too slow for images, and they are
// reviewable in a diff.

export type HelpStep = {
  // What is happening, in one line. Never "click the button" — what the
  // step is FOR, because somebody lost on a screen needs to know why.
  caption: string;
};

export type HelpJourney = {
  id: string;
  title: string;
  // Shown in the list. One line, plain.
  summary: string;
  // The address the journey starts at, so "do it now" can open it.
  start: string;
  steps: HelpStep[];
};

export const HELP_JOURNEYS: HelpJourney[] = [
  {
    id: "invoice",
    title: "Send an invoice",
    summary: "Make one, send it, and see what is owed.",
    start: "/invoices/new",
    steps: [
      { caption: "Start from Make an invoice. The number is filled in for you and goes up by one each time." },
      { caption: "Pick who it is for. Typing a name that is not there yet offers to add them." },
      { caption: "Put in what you did and what it costs. Add a line for each thing." },
      { caption: "Check the total. If you are VAT registered the VAT is worked out and shown on its own." },
      { caption: "Save it as a draft while you check it. Sending is what gives it its number." },
    ],
  },
  {
    id: "receipt",
    title: "Put in a receipt",
    summary: "By hand, or by photographing it.",
    start: "/receipts/new",
    steps: [
      { caption: "Add a receipt by hand when you have the numbers already." },
      { caption: "Who you bought from, and when. The date is today unless you change it." },
      { caption: "How much of the total was VAT. The net is worked out from it." },
      { caption: "Pick a category so it lands in the right place at tax time." },
      { caption: "Save it. It is in your expenses from that moment." },
    ],
  },
  {
    id: "vat",
    title: "Work out a VAT quarter",
    summary: "The five boxes, from what is already in the app.",
    start: "/vat",
    steps: [
      { caption: "Open VAT. It picks the quarter that has just ended." },
      { caption: "Box 1 is the VAT you charged. Box 4 is the VAT you paid out." },
      { caption: "Box 5 is what you owe, or get back if it is a minus." },
      { caption: "\"What's in it\" lists every invoice and receipt behind the figures, so you can check any of them." },
      { caption: "Copy the figures into HMRC's own form. Nothing is sent anywhere from here." },
    ],
  },
  {
    id: "mileage",
    title: "Claim a trip",
    summary: "Miles, at HMRC's rates, into your expenses.",
    start: "/mileage",
    steps: [
      { caption: "Open Mileage and say where you went." },
      { caption: "Put in the miles, or let it work them out from the two postcodes." },
      { caption: "The rate is HMRC's own, and drops after 10,000 miles in a tax year." },
      { caption: "Save the trip. It goes in with your expenses like any other." },
    ],
  },
  {
    id: "quote",
    title: "Price a job before you start",
    summary: "Send a quote, let them accept it, turn it into an invoice.",
    start: "/quotes/new",
    steps: [
      { caption: "Start from Write a quote. The number is filled in for you, and it stays a draft until you send it." },
      { caption: "Pick who it is for. Anybody you have dealt with is already in the list, and + New customer adds one on the spot." },
      { caption: "Put in what the work is and what it comes to. Add a line for each part of the job." },
      { caption: "Ask for a deposit if you want one, as a percentage or an amount. It goes out as its own invoice first and comes off the final one." },
      { caption: "Save it. Sending gives the customer a link they can accept or decline, and once accepted it turns into an invoice." },
    ],
  },
  {
    id: "review",
    // The camera is deliberately not recorded: the harness has no camera, and
    // a staged picture of a viewfinder would be the stale hand-made clip this
    // whole arrangement exists to avoid.
    //
    // It is about EMAILED receipts, not scanned ones, and the first draft of
    // it said "anything you photograph, upload or email in". Only the inbox
    // import writes a needs-review row (`needs_review: true` appears in
    // api/inbox/ingest and nowhere else); a scan is saved as you walk it. The
    // page's own subtitle had it right and the caption had it wrong, which was
    // caught by looking at the recorded frame rather than at the recorder's
    // "no problems" line.
    title: "Check a receipt you emailed in",
    summary: "Forwarded receipts wait here until you have checked what was read off them.",
    start: "/receipts/review",
    steps: [
      { caption: "Receipts you forward to your own inbox address land here first. Nothing counts towards your totals until you have looked at it." },
      { caption: "Check the supplier against the receipt itself." },
      { caption: "Check the date. A date read wrong puts the cost in the wrong month — and on the first of a quarter, in the wrong VAT return." },
      { caption: "Say what it was for, so your expenses add up by category." },
      { caption: "Check the total, and the VAT under it. This is the figure that goes into your books, so it is worth a second look." },
      { caption: "Looks good files it. From then on it is in your receipts, your expenses and your VAT." },
    ],
  },
];

export function journey(id: string): HelpJourney | null {
  return HELP_JOURNEYS.find((j) => j.id === id) ?? null;
}

// Where a recorded frame lives. The recorder writes to web/public on this
// same path, so a missing file is a missing file in one place only.
export function frameSrc(journeyId: string, step: number): string {
  return `/help/${journeyId}/${String(step + 1).padStart(2, "0")}.webp`;
}
