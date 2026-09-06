/* ============================================================
   A small in-process rate limiter.

   The outreach form is the one endpoint anyone on the internet
   can reach, and Firestore's security rules used to be what stood
   in front of it. This is the replacement: enough to stop a bored
   script filling the inquiries table, not a substitute for a real
   WAF if this ever gets popular.

   Per-process, so behind several instances each gets its own
   allowance. That is fine for the limits in play here.
   ============================================================ */

const hits = new Map<string, number[]>();

export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  recent.push(now);
  hits.set(key, recent);

  // Opportunistic sweep so the map cannot grow without bound.
  if (hits.size > 5000) {
    for (const [k, v] of hits) {
      if (!v.some((t) => now - t < windowMs)) hits.delete(k);
    }
  }
  return recent.length <= max;
}

/** Best-effort client address from the usual proxy headers. */
export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}
