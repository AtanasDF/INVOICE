// Ready-made texts to a customer, sent from the phone's own Messages or
// WhatsApp: nothing goes through the app.

// A number as dialled (+44…) and as WhatsApp wants it (44…, digits only).
// UK numbers however they're written: "07700 900123", "+44 (0)7700 900123",
// "0044 7700…", "7700 900123", with any extension left off; a UK number
// must come out at 12 digits. Other countries' numbers need their +code.
export function phoneLinks(raw: string): { tel: string; wa: string } | null {
  const bare = raw
    .replace(/\s*(ext\.?|extension|x|#)\s*\d+\s*$/i, "")
    .replace(/\(0\)/g, "")
    .replace(/[^\d+]/g, "");
  let intl = bare.startsWith("+") ? bare.slice(1) : bare.startsWith("00") ? bare.slice(2) : bare.startsWith("0") ? `44${bare.slice(1)}` : /^[1237]\d{9}$/.test(bare) ? `44${bare}` : bare;
  if (intl.startsWith("440")) intl = `44${intl.slice(3)}`;
  if (intl.startsWith("44") ? intl.length !== 12 : !/^[1-9]\d{7,14}$/.test(intl)) return null;
  return { tel: `+${intl}`, wa: intl };
}

// iOS and Android read the body from different separators; "?&" suits both.
export const smsHref = (tel: string, text: string) => `sms:${tel}?&body=${encodeURIComponent(text)}`;
export const whatsAppHref = (wa: string, text: string) => `https://wa.me/${wa}?text=${encodeURIComponent(text)}`;

const TITLE = /^(mr|mrs|ms|miss|mx|dr|prof|rev|sir)\.?$/i;

// Who the text greets: the first name of a person (a company's contact),
// "Mrs Jones" as written when it starts with a title, and "John" from
// "Smith, John".
export function greetingName(name: string, isCompany: boolean, contactPerson: string): string {
  const full = (isCompany ? contactPerson : name).trim();
  const [before, after] = full.split(",").map((p) => p.trim());
  const words = (after || before || "").split(/\s+/).filter(Boolean);
  if (!words.length) return "";
  return TITLE.test(words[0]) && words.length > 1 ? `${words[0]} ${words[words.length - 1]}` : words[0];
}

export function greeting(name: string, isCompany: boolean, contactPerson: string): string {
  const who = greetingName(name, isCompany, contactPerson);
  return who ? `Hi ${who},` : "Hi,";
}

export type TextPreset = "quote" | "quoteChase" | "onMyWay" | "late" | "arrived" | "done" | "thanks";

export const PRESET_LABELS: Record<TextPreset, string> = {
  quote: "Here's your quote",
  quoteChase: "Any thoughts on the quote?",
  onMyWay: "On my way",
  late: "Running late",
  arrived: "I've arrived",
  done: "Job done",
  thanks: "Thanks for paying",
};

export const MINUTES = [10, 20, 30, 45, 60];

export type QuoteSummary = { total: string; validUntil: string };

export function presetText(preset: TextPreset, { hi, from, minutes, link, quote }: { hi: string; from: string; minutes: number; link?: string; quote?: QuoteSummary }): string {
  const me = from ? ` it's ${from}.` : "";
  switch (preset) {
    case "quote":
      return `${hi} here's your quote${quote?.total ? ` for ${quote.total}` : ""}${quote?.validUntil ? `, valid until ${quote.validUntil}` : ""}.${link ? ` You can see it and accept it here: ${link}` : ""}${from ? `\n${from}` : ""}`;
    case "quoteChase":
      return `${hi} just checking you got the quote${quote?.total ? ` for ${quote.total}` : ""}${quote?.validUntil ? ` (it holds until ${quote.validUntil})` : ""} — any thoughts, or anything you'd like changed?${link ? ` It's here: ${link}` : ""}${from ? `\n${from}` : ""}`;
    case "onMyWay":
      return `${hi}${me} I'm on my way and should be with you in about ${minutes} minutes.`;
    case "late":
      return `${hi}${me} Sorry, I'm running about ${minutes} minutes late. I'll be with you as soon as I can.`;
    case "arrived":
      return `${hi}${me} I've arrived and I'm outside.`;
    case "done":
      return `${hi} the job's all done, thanks for having me.${link ? ` Here's your invoice: ${link}` : ""}${from ? `\n${from}` : ""}`;
    case "thanks":
      return `${hi} payment received, thank you!${from ? `\n${from}` : ""}`;
  }
}
