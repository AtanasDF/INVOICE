import Link from "next/link";

// Quotes you give customers and prices you ask suppliers for, side by side
// but never mixed.
export default function QuotesTabs({ current }: { current: "mine" | "suppliers" }) {
  const tab = (active: boolean) => `rounded-md px-2 py-2 text-center text-sm font-medium ${active ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-600"}`;
  return (
    <nav aria-label="Quotes" className="grid grid-cols-2 gap-1 rounded-lg bg-neutral-100 p-1">
      <Link href="/quotes" aria-current={current === "mine" ? "page" : undefined} className={tab(current === "mine")}>
        My quotes
      </Link>
      <Link href="/quotes/requests" aria-current={current === "suppliers" ? "page" : undefined} className={tab(current === "suppliers")}>
        From suppliers
      </Link>
    </nav>
  );
}
