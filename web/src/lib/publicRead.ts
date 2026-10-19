// The customer's /i/, /q/ and /r/ pages read with the service role and used
// to discard every `error`. A failed credit-note or payment read then became
// "none", and the customer was shown the whole amount as still owed; a failed
// profile read blanked the bank details; a failed link read said "not found".
// A read that failed is not a read that found nothing, so it throws, and the
// page says it couldn't load rather than showing a wrong figure.
export class PublicReadFailed extends Error {}

export function must<T>(res: { data: T; error: unknown }, what: string): T {
  if (res.error) throw new PublicReadFailed(`public link: the ${what} read failed`);
  return res.data;
}
