"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import SignInCard from "@/components/SignInCard";
import { SITE_NAME } from "@/lib/siteName";

function LoginInner() {
  // A "new here" link opens on making an account, not on signing in.
  const start = useSearchParams().get("new") === "1" ? "signup" : "signin";
  return <SignInCard start={start} />;
}

export default function LoginPage() {
  return (
    <div className="mx-auto max-w-sm space-y-4">
      {/* The page's one h1, so the card's "Sign in" h2 sits under something. */}
      <h1 className="text-sm font-medium text-neutral-500">{SITE_NAME} — invoices, receipts, and expenses in one place.</h1>
      <Suspense fallback={<SignInCard />}>
        <LoginInner />
      </Suspense>
    </div>
  );
}
