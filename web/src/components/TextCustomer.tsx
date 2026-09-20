"use client";

import { useState } from "react";
import { MINUTES, PRESET_LABELS, QuoteSummary, TextPreset, greeting, greetingName, phoneLinks, presetText, smsHref, whatsAppHref } from "@/lib/customerText";
import type { Client } from "@/lib/storage";
import { saveFailed } from "@/lib/errorText";

const CHIP = "rounded-full border px-3 py-1 text-sm";
const CHIP_ON = "border-neutral-900 bg-neutral-900 text-white";

// "On my way", "Running late" and the like, written for the customer and
// opened in the phone's Messages or WhatsApp to send. An invoice's or a
// quote's private link goes into "Job done" / "Here's your quote" only when
// asked for, so opening the page never makes one; makeLink resolving to ""
// means the owner backed out. `via` narrows it to one app.
export default function TextCustomer({
  client,
  from,
  presets,
  link: existingLink = "",
  makeLink,
  quote,
  via,
}: {
  client: Pick<Client, "name" | "isCompany" | "contactPerson" | "phone">;
  from: string;
  presets: TextPreset[];
  link?: string;
  makeLink?: () => Promise<string>;
  quote?: QuoteSummary;
  via?: "sms" | "whatsapp";
}) {
  const [preset, setPreset] = useState<TextPreset>(presets[0]);
  const [minutes, setMinutes] = useState(20);
  const [made, setMade] = useState("");
  const link = existingLink || made;
  const [edited, setEdited] = useState<string | null>(null);
  const [phone, setPhone] = useState(client.phone);
  const [error, setError] = useState<string | null>(null);
  const [making, setMaking] = useState(false);

  const hi = greeting(client.name, client.isCompany, client.contactPerson);
  const text = edited ?? presetText(preset, { hi, from, minutes, link, quote });
  const linkable = (preset === "done" || preset === "quote") && makeLink && !link;
  const number = phoneLinks(phone);
  const first = greetingName(client.name, client.isCompany, client.contactPerson) || client.name;
  const storedWorks = phoneLinks(client.phone) !== null;

  function choose(p: TextPreset) {
    setPreset(p);
    setEdited(null);
    setError(null);
  }

  async function addLink() {
    if (!makeLink) return;
    setMaking(true);
    setError(null);
    try {
      const url = await makeLink();
      if (!url) return;
      setMade(url);
      setEdited((e) => (e === null ? null : `${e.trimEnd()}\n${url}`));
    } catch (err) {
      setError(saveFailed(err, "Couldn't make the link."));
    } finally {
      setMaking(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {presets.map((p) => (
          <button key={p} type="button" onClick={() => choose(p)} aria-pressed={preset === p} className={`${CHIP} ${preset === p ? CHIP_ON : "text-neutral-700"}`}>
            {PRESET_LABELS[p]}
          </button>
        ))}
      </div>
      {(preset === "onMyWay" || preset === "late") && edited === null && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-neutral-500">{preset === "late" ? "Late by about" : "With them in about"}</span>
          {MINUTES.map((m) => (
            <button key={m} type="button" onClick={() => setMinutes(m)} aria-pressed={minutes === m} className={`${CHIP} ${minutes === m ? CHIP_ON : "text-neutral-700"}`}>
              {m} min
            </button>
          ))}
        </div>
      )}
      <div>
        <label className="text-xs text-neutral-500" htmlFor="text-customer-message">Message</label>
        <textarea
          id="text-customer-message"
          rows={3}
          className="w-full rounded-lg border px-3 py-2 text-base sm:text-sm"
          value={making ? "Making the link…" : text}
          disabled={making}
          onChange={(e) => setEdited(e.target.value)}
        />
        {linkable &&
          (preset === "quote" ? (
            <button type="button" onClick={addLink} disabled={making} className="mt-2 rounded-lg border px-3 py-1.5 text-sm font-medium text-neutral-700 disabled:opacity-50">
              Add the link to view and accept it
            </button>
          ) : (
            <button type="button" onClick={addLink} disabled={making} className="mt-1 text-xs font-medium text-neutral-700 underline disabled:opacity-50">
              Add a link to the invoice
            </button>
          ))}
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </div>
      {!storedWorks && (
        <div>
          <label className="text-xs text-neutral-500" htmlFor="text-customer-phone">{first}&apos;s mobile</label>
          <input id="text-customer-phone" type="tel" className="w-full rounded-lg border px-3 py-2 text-base sm:text-sm" placeholder="07700 900123" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <p className="mt-1 text-xs text-neutral-500">
            {client.phone ? "The number saved for them doesn't look right; check it here, and in Clients." : "Add it to the customer in Clients to skip this next time."}
          </p>
        </div>
      )}
      {number && !making ? (
        via === "sms" ? (
          <a href={smsHref(number.tel, text)} className="block rounded-lg bg-neutral-900 px-4 py-2.5 text-center text-sm font-medium text-white sm:inline-block">
            Open in Messages
          </a>
        ) : via === "whatsapp" ? (
          <a href={whatsAppHref(number.wa, text)} target="_blank" rel="noopener" className="block rounded-lg bg-neutral-900 px-4 py-2.5 text-center text-sm font-medium text-white sm:inline-block">
            Open in WhatsApp
          </a>
        ) : (
          <div className="flex flex-wrap gap-2">
            <a href={smsHref(number.tel, text)} className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white">
              Text message
            </a>
            <a href={whatsAppHref(number.wa, text)} target="_blank" rel="noopener" className="rounded-lg border px-4 py-2 text-sm font-medium text-neutral-700">
              WhatsApp
            </a>
          </div>
        )
      ) : (
        phone.trim() && !making && <p className="text-xs text-neutral-500">That doesn&apos;t look like a phone number yet.</p>
      )}
    </div>
  );
}
