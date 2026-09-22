import Link from "next/link";

type Tool = { href: string; title: string; text: string; note?: string };

const PHOTO_START = "/free-invoice?start=photo";

// The free page: every free tool in one place, for anyone (Atanas,
// 2026-09-22: "I want them all organised on the first page"). Nothing made
// here is kept, so each tool ends in a download, a print or a send. Plain
// links, so they work before the page has finished loading; big type and
// big buttons, one of them the main one, for the readers the research had
// in mind (notes/first-page-research.md).
export default function Welcome({ signedIn = false }: { signedIn?: boolean }) {
  const tools: Tool[] = [
    { href: "/free-invoice", title: "Make an invoice or a quote", text: "Say what you did and what it costs. Print it, save it or send it." },
    {
      href: signedIn ? PHOTO_START : `/login?next=${encodeURIComponent(PHOTO_START)}`,
      title: "Start from an old invoice",
      text: "Take a photo of one you sent before. We fill in the next one for you to check.",
      note: signedIn ? undefined : "Needs a free sign-in.",
    },
    { href: "/check-company", title: "Check a company", text: "See if a company is real, still trading, and who runs it.", note: "The facts come from Companies House." },
    {
      href: "/copy",
      title: "Copy a document",
      text: "Photograph any paper, or pick files, into one file to save, share or email.",
      note: signedIn ? undefined : "Needs a free sign-in.",
    },
  ];
  return (
    <div className="mx-auto max-w-xl py-6 sm:py-10">
      <h1 className="text-[2rem] font-bold leading-tight sm:text-4xl">Free tools</h1>
      <p className="mt-3 text-lg text-neutral-700">Make invoices and quotes, check a company, copy any paper. All free, nothing to pay.</p>

      <ul className="mt-8 space-y-7">
        {tools.map((t, i) => (
          <li key={t.title}>
            <Link
              href={t.href}
              className={`flex min-h-16 w-full items-center justify-center rounded-xl px-5 py-4 text-center text-xl font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 ${
                i === 0 ? "bg-neutral-900 text-white" : "border-2 border-neutral-900 bg-white text-neutral-900"
              }`}
            >
              {t.title}
            </Link>
            <p className="mt-2 text-lg text-neutral-700">{t.text}</p>
            {t.note && <p className="mt-1 text-base text-neutral-600">{t.note}</p>}
          </li>
        ))}
      </ul>

      <p className="mt-10 text-base text-neutral-600">We keep nothing you make here. Save it or download it to keep it.</p>
    </div>
  );
}
