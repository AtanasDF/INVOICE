// Throwaway addresses (Atanas, 2026-09-23: protection 3 of three). A hundred
// accounts are only worth making if each one costs nothing, and a temporary
// inbox is what makes that true. The list is the well-known services, not a
// guess at what looks odd: a real tradesman's own domain must never be caught.
const THROWAWAY = new Set([
  "10minutemail.com",
  "20minutemail.com",
  "33mail.com",
  "anonbox.net",
  "byom.de",
  "cock.li",
  "dispostable.com",
  "drop.tt",
  "e4ward.com",
  "emailondeck.com",
  "emailtemporario.com.br",
  "fakeinbox.com",
  "fakemail.net",
  "getairmail.com",
  "getnada.com",
  "grr.la",
  "guerrillamail.biz",
  "guerrillamail.com",
  "guerrillamail.de",
  "guerrillamail.net",
  "guerrillamail.org",
  "guerrillamailblock.com",
  "harakirimail.com",
  "inboxbear.com",
  "inboxkitten.com",
  "jetable.org",
  "linshiyouxiang.net",
  "mail-temporaire.fr",
  "mail7.io",
  "mailcatch.com",
  "maildrop.cc",
  "mailinator.com",
  "mailnesia.com",
  "mailsac.com",
  "mintemail.com",
  "mohmal.com",
  "moakt.com",
  "mytemp.email",
  "nowmymail.com",
  "pokemail.net",
  "sharklasers.com",
  "spam4.me",
  "spamgourmet.com",
  "temp-mail.io",
  "temp-mail.org",
  "tempail.com",
  "tempinbox.com",
  "tempmail.dev",
  "tempmail.plus",
  "tempmailo.com",
  "tempr.email",
  "throwawaymail.com",
  "tmail.ws",
  "tmpmail.org",
  "trashmail.com",
  "trashmail.de",
  "trashmail.me",
  "trashmail.net",
  "yopmail.com",
  "yopmail.fr",
  "yopmail.net",
]);

export function isThrowawayEmail(email: string): boolean {
  const at = email.lastIndexOf("@");
  if (at < 0) return false;
  const host = email.slice(at + 1).trim().toLowerCase().replace(/\.$/, "");
  if (!host) return false;
  if (THROWAWAY.has(host)) return true;
  // A subdomain of a throwaway service is the same service.
  return [...THROWAWAY].some((d) => host.endsWith(`.${d}`));
}

export const THROWAWAY_REFUSED =
  "That's a temporary email service, and your records would go with it. Use an address you'll still have next year.";
