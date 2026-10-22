import Link from "next/link";

// Two pages that are one job, side by side at the top of each: the menu
// holds one of them, the other is a tab away (notes/launch-simplify.md).
export default function PageTabs({ label, tabs, current }: { label: string; tabs: { href: string; text: string; count?: number }[]; current: string }) {
  const tab = (active: boolean) => `flex items-center justify-center gap-1.5 rounded-md px-2 py-2 text-center text-sm font-medium ${active ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-600"}`;
  return (
    <nav aria-label={label} className={`grid gap-1 rounded-lg bg-neutral-100 p-1 print:hidden`} style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
      {tabs.map((t) => (
        <Link key={t.href} href={t.href} aria-current={t.href === current ? "page" : undefined} className={tab(t.href === current)}>
          {t.text}
          {!!t.count && <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">{t.count}</span>}
        </Link>
      ))}
    </nav>
  );
}

export const MONEY_IN_TABS = [
  { href: "/invoices", text: "Invoices" },
  { href: "/quotes", text: "Quotes" },
];
