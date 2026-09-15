export const INBOX_DOMAIN = "invoiceover.com";

/**
 * 128 bits of randomness (16 bytes) from the Web Crypto API's CSPRNG,
 * hex-encoded to 32 lowercase characters. This token is the entire
 * security boundary for the email inbox-import feature -- anyone who
 * knows it can address mail (and therefore create receipts) at this
 * account -- so it has to be infeasible to guess or brute-force, not
 * just "random-looking". 128 bits is the same order of magnitude as an
 * AES-128 key or a UUIDv4's randomness.
 */
export function generateInboxToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function inboxAddress(token: string): string {
  return `u-${token}@${INBOX_DOMAIN}`;
}
