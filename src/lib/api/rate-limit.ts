import { errors } from "./errors";

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();
let lastSweep = 0;

/**
 * Limite de débit en mémoire (fenêtre fixe), suffisante pour une instance unique.
 * Lance ApiError 429 avec Retry-After quand la limite est dépassée.
 */
export function rateLimit(key: string, limit: number, windowMs = 60_000, now = Date.now()): void {
  if (now - lastSweep > windowMs) {
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
    lastSweep = now;
  }
  let b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    b = { count: 0, resetAt: now + windowMs };
    buckets.set(key, b);
  }
  b.count++;
  if (b.count > limit) throw errors.rateLimited(Math.max(1, Math.ceil((b.resetAt - now) / 1000)));
}

/** Pour les tests. */
export function resetRateLimits(): void {
  buckets.clear();
}
