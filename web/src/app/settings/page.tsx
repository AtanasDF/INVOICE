"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AccountKind, businessProfileStore } from "@/lib/storage";

// One long page of about a dozen cards became four short ones (launch plan
// step H). This is only the way in; every field still lives on exactly one of
// them and saves from there.
const SECTIONS: { href: string; title: string; line: string; business?: boolean }[] = [
  { href: "/settings/business", title: "Business", line: "Your name, address, logo, company details and VAT." },
  { href: "/settings/invoices", title: "Invoices and payments", line: "Invoice numbers, bank details, Pay now link and payment reminders.", business: true },
  { href: "/settings/expenses", title: "Receipts and expenses", line: "Expense categories and the address to email receipts in to." },
  { href: "/settings/account", title: "Account", line: "Sign-in, colours and dark mode, the phone app, notifications and your data." },
];

export default function SettingsPage() {
  // Read only to leave out what personal use has no use for; a failed read
  // shows every section, which is the safe way round.
  const [kind, setKind] = useState<AccountKind | null>(null);
  useEffect(() => {
    businessProfileStore.get().then((p) => setKind(p.accountKind), (err) => console.error("settings kind", err));
  }, []);
  const personal = kind === "personal";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="mt-1 text-neutral-600">
          {personal ? "Your details, how you sort your spending, and your account." : "Your business details go on every invoice, quote and reminder."}
        </p>
      </div>

      <ul className="divide-y rounded-xl border bg-white text-neutral-900 shadow-sm">
        {SECTIONS.filter((s) => !(personal && s.business)).map((s) => (
          <li key={s.href}>
            <Link href={s.href} className="flex items-center gap-3 px-4 py-3.5">
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{personal && s.href === "/settings/business" ? "About you" : s.title}</span>
                <span className="block text-sm text-neutral-600">{personal && s.href === "/settings/business" ? "Your name and address." : s.line}</span>
              </span>
              <span aria-hidden="true" className="text-neutral-500">›</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
