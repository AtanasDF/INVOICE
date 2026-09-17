// Only a same-origin path is honoured as a post-login destination:
// "//host", "/\host" and backslashes are open-redirect vectors, and the
// pathname round-trip rejects anything the URL parser would rewrite.
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\") || next.includes("\\")) return "/";
  try {
    const url = new URL(next, "http://x");
    if (url.origin !== "http://x" || url.pathname !== next.split(/[?#]/)[0]) return "/";
    return url.pathname + url.search + url.hash;
  } catch {
    return "/";
  }
}
