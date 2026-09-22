import SignInCard from "@/components/SignInCard";

// The front door for someone with no account (Atanas, 2026-09-22: "nothing
// should work before the user register... a plain page with some nice
// advertising of the app and the log in rectangulars"). What the app does,
// in five short lines, and the sign-in box beside them.
const DOES = [
  ["Make an invoice or a quote", "in a minute, then print it, save it or email it."],
  ["Photograph a receipt or a bill", "and it reads it for you, so your costs add themselves up."],
  ["Check a company", "before you work for them: real, still trading, and who runs it."],
  ["Copy any paper", "with your phone into one file to keep or send."],
  ["Change a file", "a photo into a PDF, a PDF into pictures or words, a spreadsheet into data."],
  ["See what you're owed", "and what is late, and what to put by for tax."],
];

export default function Welcome() {
  return (
    <div className="mx-auto max-w-4xl py-4 sm:py-8">
      <div className="grid gap-10 md:grid-cols-2 md:items-start md:gap-12">
        <div>
          <h1 className="text-[2rem] font-bold leading-tight sm:text-4xl">Invoices, receipts and what you&apos;re owed, in one place.</h1>
          <p className="mt-4 text-lg text-neutral-700">Make an account and it&apos;s all yours. Free, and it takes a minute.</p>
          <ul className="mt-7 space-y-4">
            {DOES.map(([strong, rest]) => (
              <li key={strong} className="text-lg text-neutral-800">
                <strong className="font-semibold">{strong}</strong> {rest}
              </li>
            ))}
          </ul>
          <p className="mt-7 text-base text-neutral-600">Whatever you make here you can save to your own device: as a PDF, a picture, a Word file or a spreadsheet.</p>
        </div>
        <SignInCard />
      </div>
    </div>
  );
}
