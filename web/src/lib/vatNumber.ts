// A UK VAT number carries its own check digits, so a typo can be caught on
// the spot without asking anybody anything. Dext is the only one of the
// twelve apps in notes/competitor-research.md that checks a VAT number at
// all, and it checks against HMRC -- which needs credentials. This part
// needs none and catches the common case: one digit typed wrong.
//
// A VRN is nine digits. The first seven are the number and the last two are
// check digits: weight the seven by 8,7,6,5,4,3,2, add the check digits,
// and the total divides by 97. Registrations from November 2009 use the
// same sum with 55 added first ("mod 97-55"), and both are in circulation,
// so a number is right if EITHER works.
//
// What this cannot tell you is whether the number belongs to the business
// in front of you, or is still live. Only HMRC knows that -- see
// checkVatNumber in src/lib/vatCheck.ts.

export type VatNumberCheck =
  | { kind: "empty" }
  | { kind: "ok"; normalised: string; branch: string | null; northernIreland: boolean }
  | { kind: "department"; normalised: string }
  | { kind: "wrong"; reason: string };

// Everything a person might type around the number itself.
export function normaliseVatNumber(input: string): string {
  return input.toUpperCase().replace(/[\s.‐-―-]/g, "");
}

const weights = [8, 7, 6, 5, 4, 3, 2];

function checksumHolds(nine: string): boolean {
  const sum = weights.reduce((t, w, i) => t + w * Number(nine[i]), 0);
  const check = Number(nine.slice(7));
  return (sum + check) % 97 === 0 || (sum + check + 55) % 97 === 0;
}

export function checkVatNumberFormat(input: string): VatNumberCheck {
  const v = normaliseVatNumber(input);
  if (!v) return { kind: "empty" };

  // Government departments (GD000-GD499) and health authorities
  // (HA500-HA999) have no check digits at all.
  const dept = /^(?:GB)?(GD[0-4]\d\d|HA[5-9]\d\d)$/.exec(v);
  if (dept) return { kind: "department", normalised: `GB${dept[1]}` };

  const m = /^(GB|XI)?(\d{9})(\d{3})?$/.exec(v);
  if (!m) {
    if (/^[A-Z]{2}/.test(v) && !/^(GB|XI)/.test(v)) {
      return { kind: "wrong", reason: "That looks like a VAT number from another country. This box takes a UK one." };
    }
    const digits = v.replace(/\D/g, "").length;
    if (digits && digits !== 9 && digits !== 12) {
      return { kind: "wrong", reason: `A UK VAT number has 9 numbers${digits > 9 ? "" : ", and this has " + digits}.` };
    }
    return { kind: "wrong", reason: "That isn't the shape of a UK VAT number. It is 9 numbers, sometimes written after GB." };
  }

  const [, prefix, nine, branch] = m;
  if (!checksumHolds(nine)) {
    return { kind: "wrong", reason: "Those 9 numbers don't add up, so one of them is probably typed wrong. Check it against the paperwork." };
  }
  return { kind: "ok", normalised: `${prefix === "XI" ? "XI" : "GB"}${nine}${branch ?? ""}`, branch: branch ?? null, northernIreland: prefix === "XI" };
}

// "GB 220 4302 31" is how HMRC prints it and how it appears on an invoice.
export function formatVatNumber(input: string): string {
  const c = checkVatNumberFormat(input);
  if (c.kind === "department") return c.normalised;
  if (c.kind !== "ok") return input.trim();
  const d = c.normalised.replace(/^(GB|XI)/, "");
  const nine = `${d.slice(0, 3)} ${d.slice(3, 7)} ${d.slice(7, 9)}`;
  return `${c.northernIreland ? "XI" : "GB"} ${nine}${d.length > 9 ? ` ${d.slice(9)}` : ""}`.trim();
}
