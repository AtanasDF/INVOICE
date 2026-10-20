import { timingSafeEqual } from "node:crypto";

// The cron and webhook secrets are compared in constant time, so the time a
// refusal takes says nothing about how much of a guess was right.
export function bearerMatches(authorization: string | null, secret: string | undefined): boolean {
  if (!secret || !authorization) return false;
  const given = Buffer.from(authorization);
  const wanted = Buffer.from(`Bearer ${secret}`);
  return given.length === wanted.length && timingSafeEqual(given, wanted);
}
