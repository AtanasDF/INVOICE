// In-memory, so the window is per serverless instance: a cold start
// forgets every count, and parallel instances each keep their own. Good
// enough to blunt a casual loop against a public route, nothing more.
const hits = new Map<string, number[]>();

export function allow(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 10_000) {
    for (const [k, times] of hits) if (times.every((t) => now - t >= windowMs)) hits.delete(k);
  }
  return true;
}

// Gives back the most recent hit, for an attempt that failed before it
// did anything worth counting.
export function release(key: string) {
  hits.get(key)?.pop();
}

// First x-forwarded-for entry, with IPv6 collapsed to its /64 so one
// subscriber can't rotate through a whole prefix; IPv4 stays as is.
export function addressKey(forwardedFor: string | null): string {
  const addr = forwardedFor?.split(",")[0].trim() || "unknown";
  if (!addr.includes(":")) return addr;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(addr);
  if (mapped) return mapped[1];
  const [head, tail = ""] = addr.split("::");
  const heads = head ? head.split(":") : [];
  const tails = tail ? tail.split(":") : [];
  const full = [...heads, ...Array(Math.max(0, 8 - heads.length - tails.length)).fill("0"), ...tails];
  return full.slice(0, 4).map((h) => h.toLowerCase().replace(/^0+(?=.)/, "")).join(":");
}
