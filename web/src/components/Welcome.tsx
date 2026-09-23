import SignInCard from "@/components/SignInCard";

// The front door for someone with no account (Atanas, 2026-09-22: "nothing
// should work before the user register... a plain page with some nice
// advertising of the app and the log in rectangulars", then 2026-09-23: "the
// login page, less explanation... some nice pictures, some invoices").
//
// So: a headline, one line, and the sign-in box — and on a phone the box comes
// before the reading, because a flyer sends people here to make an account,
// not to be sold to. The six lines of explaining became three, and the picture
// does the rest of the work.
const DOES = [
  ["Photograph a bill", "and it reads itself."],
  ["Make an invoice", "in a minute, and send it."],
  ["See what you're owed", "and what to put by for tax."],
];

// Drawn rather than photographed, and in the theme's own colours, so it
// follows whatever someone picks in Settings instead of fighting it.
function PaperPicture() {
  return (
    <svg
      viewBox="0 0 320 240"
      role="img"
      aria-label="An invoice, a receipt and a phone photographing them."
      className="h-auto w-full max-w-sm text-neutral-900"
    >
      {/* the till receipt, tucked behind */}
      <g transform="rotate(-8 70 150)">
        <rect x="26" y="96" width="62" height="118" rx="3" className="fill-white stroke-neutral-300" strokeWidth="2" />
        {[110, 122, 134, 146, 158, 170].map((y, i) => (
          <rect key={y} x="36" y={y} width={i % 2 ? 30 : 42} height="4" rx="2" className="fill-neutral-200" />
        ))}
        <rect x="36" y="188" width="28" height="6" rx="3" className="fill-neutral-400" />
      </g>

      {/* the invoice */}
      <g>
        <rect x="96" y="28" width="150" height="190" rx="6" className="fill-white stroke-neutral-300" strokeWidth="2" />
        <rect x="112" y="46" width="58" height="9" rx="4" className="fill-neutral-900" />
        <rect x="112" y="62" width="38" height="5" rx="2" className="fill-neutral-300" />
        <rect x="196" y="46" width="34" height="5" rx="2" className="fill-neutral-300" />
        <rect x="196" y="56" width="26" height="5" rx="2" className="fill-neutral-300" />
        <rect x="112" y="86" width="118" height="2" className="fill-neutral-200" />
        {[96, 112, 128, 144].map((y) => (
          <g key={y}>
            <rect x="112" y={y} width={y === 144 ? 52 : 68} height="5" rx="2" className="fill-neutral-200" />
            <rect x="202" y={y} width="28" height="5" rx="2" className="fill-neutral-300" />
          </g>
        ))}
        <rect x="112" y="170" width="118" height="2" className="fill-neutral-300" />
        <rect x="150" y="182" width="36" height="7" rx="3" className="fill-neutral-400" />
        <rect x="196" y="180" width="34" height="11" rx="4" className="fill-neutral-900" />
      </g>

      {/* the phone, holding the page in its viewfinder */}
      <g transform="rotate(7 250 140)">
        <rect x="206" y="72" width="92" height="150" rx="14" className="fill-neutral-900" />
        <rect x="214" y="86" width="76" height="122" rx="6" className="fill-neutral-100" />
        <rect x="226" y="104" width="52" height="86" rx="4" className="fill-white stroke-neutral-400" strokeWidth="2" />
        {/* the corners it has found */}
        {[
          [226, 104, 1, 1], [278, 104, -1, 1], [226, 190, 1, -1], [278, 190, -1, -1],
        ].map(([x, y, dx, dy]) => (
          <path key={`${x}-${y}`} d={`M ${x} ${Number(y) + 12 * Number(dy)} L ${x} ${y} L ${Number(x) + 12 * Number(dx)} ${y}`} className="stroke-neutral-900" strokeWidth="3" fill="none" strokeLinecap="round" />
        ))}
        <rect x="236" y="118" width="32" height="4" rx="2" className="fill-neutral-200" />
        <rect x="236" y="130" width="24" height="4" rx="2" className="fill-neutral-200" />
        <rect x="236" y="168" width="20" height="5" rx="2" className="fill-neutral-400" />
      </g>
    </svg>
  );
}

export default function Welcome() {
  return (
    <div className="mx-auto max-w-4xl py-4 sm:py-8">
      {/* Placed rather than stacked, so the order differs by screen: on a
          phone the sign-in box comes straight after the headline, because a
          flyer sends people here to make an account, not to read. On a wide
          screen it sits beside all of it. */}
      <div className="grid gap-8 md:grid-cols-2 md:items-start md:gap-12">
        <div className="md:col-start-1 md:row-start-1">
          <h1 className="text-[2rem] font-bold leading-tight sm:text-4xl">Invoices, receipts and what you&apos;re owed, in one place.</h1>
          <p className="mt-3 text-lg text-neutral-700">Make an account and it&apos;s all yours. Free, and it takes a minute.</p>
        </div>

        <div className="md:col-start-2 md:row-span-3 md:row-start-1">
          <SignInCard />
        </div>

        <div className="flex justify-center md:col-start-1 md:row-start-2 md:justify-start">
          <PaperPicture />
        </div>

        <ul className="space-y-2.5 md:col-start-1 md:row-start-3">
          {DOES.map(([strong, rest]) => (
            <li key={strong} className="text-lg text-neutral-800">
              <strong className="font-semibold">{strong}</strong> {rest}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
