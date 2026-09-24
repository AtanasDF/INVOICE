import type { BusinessProfile } from "@/lib/storage";

// What a new account still needs before the app can do its job properly.
// Atanas is starting a company from scratch, and the app said nothing about
// any of this: you could send an invoice with no business name on it, no
// address, no bank details for the customer to pay into, and no answer to
// the VAT question -- each of which is wrong on a document that goes to
// somebody else, and none of which the app asked for.
//
// It is a list that ticks itself off, not a wizard: nothing is blocked, and
// anyone who wants to get on with it can.

export type Step = {
  id: string;
  label: string;
  why: string;
  href: string;
  done: boolean;
};

export type Started = { steps: Step[]; done: number; total: number; complete: boolean };

const has = (v: string | null | undefined) => !!v && v.trim().length > 0;

// NOT on the list: whether you are VAT registered. It belongs there -- it
// decides how every invoice is priced -- but business_profile stores it as
// a plain boolean read `?? false`, so the app cannot tell "nobody has
// answered" from "answered no". A step that cannot know whether it is done
// would either tick itself on a brand new account or nag a sole trader
// under the threshold for ever. Saying so here rather than guessing; if
// that column ever becomes nullable, this is the first thing to add back.
export function gettingStarted(
  profile: Pick<BusinessProfile, "businessName" | "address" | "bankDetails" | "invoiceNextNumber">,
  counts: { customers: number; documents: number }
): Started {
  const steps: Step[] = [
    {
      id: "name",
      label: "Your business name",
      why: "It is the heading on every invoice and quote you send.",
      href: "/settings",
      done: has(profile.businessName) && profile.businessName.trim().toUpperCase() !== "PLACEHOLDER",
    },
    {
      id: "address",
      label: "Your address",
      why: "It prints on your invoices, which is where a customer looks for who to pay.",
      href: "/settings",
      done: has(profile.address),
    },
    {
      id: "numbering",
      label: "Where your invoice numbers start",
      why: "If you have invoiced before, carry on from your last number rather than starting again at one.",
      href: "/settings",
      done: (profile.invoiceNextNumber ?? 0) > 0,
    },
    {
      id: "bank",
      label: "Your bank details",
      why: "Printed at the foot of an invoice so a customer can pay without asking you for them.",
      href: "/settings",
      done: has(profile.bankDetails),
    },
    {
      id: "customer",
      label: "Your first customer",
      why: "Then an invoice is a few taps: pick them, add a line, send it.",
      href: "/clients/new",
      done: counts.customers > 0,
    },
    {
      id: "document",
      label: "Your first receipt or invoice",
      why: "Scan a receipt or write an invoice, and the dashboard starts telling you where you stand.",
      href: "/scan",
      done: counts.documents > 0,
    },
  ];
  const done = steps.filter((s) => s.done).length;
  return { steps, done, total: steps.length, complete: done === steps.length };
}
