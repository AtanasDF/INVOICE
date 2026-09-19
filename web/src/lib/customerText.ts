// Ready-made texts to a customer, sent from the phone's own Messages or
// WhatsApp: nothing goes through the app.

// A UK number as dialled (+44…) and as WhatsApp wants it (44…, digits only).
export function phoneLinks(raw: string): { tel: string; wa: string } | null {
  const digits = raw.replace(/[^\d+]/g, "");
  const intl = digits.startsWith("+") ? digits.slice(1) : digits.startsWith("00") ? digits.slice(2) : digits.startsWith("0") ? `44${digits.slice(1)}` : digits;
  if (!/^\d{10,15}$/.test(intl)) return null;
  return { tel: `+${intl}`, wa: intl };
}

// iOS and Android read the body from different separators; "?&" suits both.
export const smsHref = (tel: string, text: string) => `sms:${tel}?&body=${encodeURIComponent(text)}`;
export const whatsAppHref = (wa: string, text: string) => `https://wa.me/${wa}?text=${encodeURIComponent(text)}`;

// "Hi Jane," for a person; a company's contact if there is one, else "Hi,".
export function greeting(name: string, isCompany: boolean, contactPerson: string): string {
  const who = (isCompany ? contactPerson : name).trim().split(/\s+/)[0];
  return who ? `Hi ${who},` : "Hi,";
}

export type TextPreset = "onMyWay" | "late" | "arrived" | "done" | "thanks";

export const PRESET_LABELS: Record<TextPreset, string> = {
  onMyWay: "On my way",
  late: "Running late",
  arrived: "I've arrived",
  done: "Job done",
  thanks: "Thanks for paying",
};

export const MINUTES = [10, 20, 30, 45, 60];

export function presetText(preset: TextPreset, { hi, from, minutes, link }: { hi: string; from: string; minutes: number; link?: string }): string {
  const me = from ? ` it's ${from}.` : "";
  switch (preset) {
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
