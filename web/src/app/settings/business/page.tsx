"use client";

import { useEffect, useState } from "react";
import Tip from "@/components/Tip";
import { AccountKind } from "@/lib/storage";
import { defaultCategoriesFor, effectiveCategories, isDefaultSet } from "@/lib/categories";
import CompanyNameInput from "@/components/CompanyNameInput";
import CompanyNumberInput from "@/components/CompanyNumberInput";
import AddressFields from "@/components/AddressFields";
import VatNumberInput from "@/components/VatNumberInput";
import { useAuth } from "@/lib/authContext";
import { saveFailed } from "@/lib/errorText";
import { logoSrc, prepareLogo, uploadLogo } from "@/lib/logo";
import { FILE_RING } from "@/lib/fileRing";
import { CARD, SMALL_BUTTON, FormState, SaveBar, SettingsHeader, useProfileForm, type FormKey } from "@/components/settings/ProfileForm";

// A limited company must show its registered name and number on its
// invoices (Companies Act 2006 s.82); a sole trader has neither, and
// personal use has no business at all. The kind also picks the starting
// list of expense categories (src/lib/categories.ts).
const ACCOUNT_KINDS: { value: AccountKind; label: string; hint: string }[] = [
  { value: "limited", label: "A limited company", hint: "Registered at Companies House" },
  { value: "sole_trader", label: "A sole trader", hint: "Self-employed, working under your own name or a trading name" },
  { value: "personal", label: "Personal use", hint: "Keeping track of your own spending" },
];
const VAT_CHOICES: { label: string; on: boolean }[] = [
  { label: "Without VAT", on: false },
  { label: "With VAT", on: true },
];
const KEYS: FormKey[] = ["accountKind", "businessName", "registeredName", "companyNumber", "address", "logoUrl", "vatRegistered", "vatNumber"];

export default function BusinessSettingsPage() {
  const { user } = useAuth();
  const form = useProfileForm(KEYS, {
    // A starting list that was never edited follows the kind; an edited one
    // is only ever offered additions (on the Receipts and expenses page),
    // never trimmed. A list never saved at all follows it by itself.
    adjust: (out, stored) =>
      out.accountKind !== stored.accountKind && stored.customCategories?.length && isDefaultSet(effectiveCategories(stored.customCategories, stored.accountKind))
        ? { ...out, customCategories: defaultCategoriesFor(out.accountKind) }
        : out,
  });
  const { values, set } = form;
  // The stored logo ("storage:<path>") and what it looks like; uploaded as
  // soon as it's picked, kept on the profile when Save is pressed.
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);

  // The saved logo, once the profile has loaded, and never over one just
  // picked.
  const { loaded } = form;
  useEffect(() => {
    if (loaded) void logoSrc(loaded.logoUrl ?? null).then((src) => setLogoPreview((now) => now ?? src));
  }, [loaded]);

  async function pickLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !user?.id) return;
    setLogoError(null);
    setLogoBusy(true);
    try {
      const prepared = await prepareLogo(file);
      const ref = await uploadLogo(user.id, prepared.blob, prepared.ext);
      set("logoUrl", ref);
      setLogoPreview(prepared.dataUrl);
    } catch (err) {
      setLogoError(err instanceof Error && /picture/.test(err.message) ? err.message : saveFailed(err, "Couldn't add the logo just now."));
    } finally {
      setLogoBusy(false);
    }
  }

  function removeLogo() {
    if (!window.confirm("Take the logo off your invoices and quotes? It goes when you press Save.")) return;
    set("logoUrl", null);
    setLogoPreview(null);
  }

  if (!values || form.loadError) {
    return (
      <div className="space-y-6">
        <SettingsHeader title="Business" />
        <FormState form={form} />
      </div>
    );
  }

  const { accountKind, businessName, registeredName, companyNumber, address, logoUrl, vatRegistered, vatNumber } = values;
  // Registered details stay on screen once they're filled in, whatever the
  // kind says, so changing your mind can't hide what's printed.
  const limited = accountKind === "limited" || !!registeredName || !!companyNumber;
  const personal = accountKind === "personal";

  return (
    <div className="space-y-6">
      <SettingsHeader title={personal ? "About you" : "Business"}>
        <Tip id="settings-how">How it works: what you put here goes on every invoice you send — your business name and your address. The VAT switch changes how new invoices are priced, and it never changes one you have already sent.</Tip>
        <p className="mt-1 text-neutral-600">
          {personal ? "Your name and address. Fill this in once." : "Who you are on every invoice, quote and reminder. Fill this in once."}
        </p>
      </SettingsHeader>

      <form onSubmit={form.save} className="space-y-6">
        <div className={CARD}>
          <fieldset>
            <legend className="text-xs text-neutral-500">What are you using this for?</legend>
            <div className="mt-1 space-y-1">
              {ACCOUNT_KINDS.map((k) => (
                <label key={k.value} className="flex items-start gap-2 text-sm">
                  <input
                    className="mt-1 accent-neutral-900"
                    type="radio"
                    name="account-kind"
                    checked={accountKind === k.value}
                    onChange={() => set("accountKind", k.value)}
                  />
                  <span>
                    {k.label}
                    <span className="block text-xs text-neutral-500">{k.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div>
            <label className="text-xs text-neutral-500" htmlFor="business-name">{personal ? "Your name" : "Business name"}</label>
            <CompanyNameInput
              mine
              id="business-name"
              className="w-full rounded-lg border px-3 py-2"
              lookupPlaceholder="Limited company? Type to find it on Companies House"
              value={businessName}
              onChange={(v) => set("businessName", v)}
              address={address}
              onAddress={(v) => set("address", v)}
              onPick={(c, fillAddress) => {
                set("businessName", c.name);
                if (fillAddress) set("address", fillAddress);
              }}
            />
            <p className="mt-1 text-xs text-neutral-500">
              {limited
                ? "The name customers know you by, the headline on every document. If it isn't the name on the register, fill that in below too."
                : "The name customers know you by, the headline on every document."}
            </p>
          </div>

          {limited && (
            <div className="space-y-3 rounded-lg bg-neutral-100 p-3">
              <p className="text-sm text-neutral-600">
                A limited company must print its registered name and number on its invoices. They go small at the foot;
                your trading name stays the headline.
              </p>
              <div>
                <label className="text-xs text-neutral-500" htmlFor="registered-name">Registered company name</label>
                <CompanyNameInput
                  id="registered-name"
                  className="w-full rounded-lg border px-3 py-2"
                  placeholder="As registered at Companies House"
                  lookupPlaceholder="Type to find it on Companies House"
                  value={registeredName}
                  onChange={(v) => set("registeredName", v)}
                  onPick={(c) => {
                    set("registeredName", c.name);
                    set("companyNumber", c.number);
                  }}
                />
              </div>
              <div>
                <label className="text-xs text-neutral-500" htmlFor="company-number">Company number</label>
                <CompanyNumberInput
                  id="company-number"
                  className="w-full rounded-lg border px-3 py-2"
                  placeholder="e.g. 12345678"
                  value={companyNumber}
                  onChange={(v) => set("companyNumber", v)}
                  name={registeredName}
                  onFound={(c) => {
                    set("registeredName", c.name);
                    if (!address.trim() && c.address) set("address", c.address);
                  }}
                />
              </div>
            </div>
          )}

          <AddressFields mine address={address} onAddress={(v) => set("address", v)} label={personal ? "Your address (optional)" : "Business address"} />

          {!personal && (
            <div className="border-t pt-3">
              <p className="text-xs text-neutral-500">Logo</p>
              {logoPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoPreview} alt="Your logo" className="mt-1 max-h-16 max-w-[12rem] object-contain object-left" />
              ) : logoUrl ? (
                // Saved but not shown: "No logo yet" here, after a dropped
                // read, read as the logo having gone.
                <p className="mt-1 text-sm text-neutral-600">Your logo is saved, but it couldn&apos;t be shown just now. Check your connection and reload.</p>
              ) : (
                <p className="mt-1 text-sm text-neutral-600">No logo yet. It goes at the top of your invoices and quotes.</p>
              )}
              <div className="mt-2 flex flex-wrap gap-2">
                <label aria-disabled={logoBusy} className={`cursor-pointer aria-disabled:cursor-default aria-disabled:opacity-50 ${FILE_RING} ${SMALL_BUTTON}`}>
                  {logoBusy ? "Adding…" : logoPreview || logoUrl ? "Change logo" : "Add a logo"}
                  <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" aria-invalid={!!logoError || undefined} aria-describedby={logoError ? "logo-error" : undefined} onChange={pickLogo} disabled={logoBusy} />
                </label>
                {(logoPreview || logoUrl) && (
                  <button type="button" onClick={removeLogo} className={SMALL_BUTTON}>
                    Remove logo
                  </button>
                )}
              </div>
              {logoError && <p id="logo-error" role="alert" className="mt-1 text-sm text-red-600">{logoError}</p>}
            </div>
          )}
        </div>

        {!personal && (
        <div className={CARD}>
          <h2 className="font-semibold">VAT</h2>
          <fieldset>
            <legend className="sr-only">VAT</legend>
            {/* Wraps: a segmented control is a row until the words in it are
                wider than the phone, and at 320px with the text turned up
                "Not registered" alone is most of the screen. */}
            <div className="inline-flex max-w-full flex-wrap gap-1 rounded-lg bg-neutral-100 p-1">
              {VAT_CHOICES.map((c) => (
                <label key={c.label} className="cursor-pointer">
                  <input type="radio" name="vat" className="peer sr-only accent-neutral-900" checked={vatRegistered === c.on} onChange={() => set("vatRegistered", c.on)} />
                  <span className={`block rounded-md px-3 py-1.5 text-sm font-medium peer-focus-visible:ring-2 peer-focus-visible:ring-neutral-500 ${vatRegistered === c.on ? "bg-neutral-900 text-white" : "text-neutral-600"}`}>
                    {c.label}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <div>
            <VatNumberInput
              id="vat-number"
              label="VAT number"
              className="w-full rounded-lg border px-3 py-2 disabled:bg-neutral-50 disabled:text-neutral-400"
              value={vatNumber}
              onChange={(v) => set("vatNumber", v)}
              disabled={!vatRegistered}
              business={businessName}
              hint="As it appears on your VAT certificate."
            />
          </div>
        </div>
        )}

        <SaveBar form={form} pending={["what you're using the app for and the registered company details", "those need"]} />
      </form>
    </div>
  );
}
