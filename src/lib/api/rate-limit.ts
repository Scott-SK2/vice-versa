import { sql } from "drizzle-orm";
import { errors } from "./errors";

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();
let lastSweep = 0;

/**
 * Limite de débit en mémoire (fenêtre fixe) : compteurs à fort volume (jeton participant,
 * sessions par IP, écran de projection). Sur un hébergement multi-instances, chaque instance
 * compte séparément : la limite effective est alors plus large, jamais plus stricte.
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

/** Vrai si la clé a déjà dépassé sa limite (sans consommer d'essai). */
export function isRateLimited(key: string, limit: number, now = Date.now()): boolean {
  const b = buckets.get(key);
  return Boolean(b && b.resetAt > now && b.count >= limit);
}

/** Compteurs sensibles : en base quand RATE_LIMIT_STORE=db ou sur Vercel, sinon en mémoire. */
export function sharedStoreEnabled(): boolean {
  const v = process.env.RATE_LIMIT_STORE;
  if (v === "db") return true;
  if (v === "memory") return false;
  return Boolean(process.env.VERCEL);
}

/**
 * Limite partagée entre instances pour les compteurs sensibles et peu fréquents
 * (connexions, clés de projection, codes devinés, jetons inconnus).
 * Même sémantique que rateLimit, mais asynchrone.
 */
export async function sharedRateLimit(key: string, limit: number, windowMs = 60_000): Promise<void> {
  if (!sharedStoreEnabled()) return rateLimit(key, limit, windowMs);
  const { getDb, schema } = await import("@/db/client");
  const db = getDb();
  const [row] = await db
    .insert(schema.rateLimits)
    .values({ key, count: 1, resetAt: sql`now() + make_interval(secs => ${windowMs / 1000})` })
    .onConflictDoUpdate({
      target: schema.rateLimits.key,
      set: {
        count: sql`case when ${schema.rateLimits.resetAt} <= now() then 1 else ${schema.rateLimits.count} + 1 end`,
        resetAt: sql`case when ${schema.rateLimits.resetAt} <= now() then now() + make_interval(secs => ${windowMs / 1000}) else ${schema.rateLimits.resetAt} end`,
      },
    })
    .returning({ count: schema.rateLimits.count, resetAt: schema.rateLimits.resetAt });
  if (row.count > limit) throw errors.rateLimited(Math.max(1, Math.ceil((row.resetAt.getTime() - Date.now()) / 1000)));
}

/** Vrai si la clé partagée a déjà dépassé sa limite (sans consommer d'essai). */
export async function sharedIsRateLimited(key: string, limit: number): Promise<boolean> {
  if (!sharedStoreEnabled()) return isRateLimited(key, limit);
  const { getDb, schema } = await import("@/db/client");
  const { eq } = await import("drizzle-orm");
  const [row] = await getDb().select().from(schema.rateLimits).where(eq(schema.rateLimits.key, key)).limit(1);
  return Boolean(row && row.resetAt.getTime() > Date.now() && row.count >= limit);
}

/** Purge des compteurs partagés expirés (tâche de maintenance). */
export async function sweepSharedRateLimits(): Promise<number> {
  const { getDb, schema } = await import("@/db/client");
  const { lt } = await import("drizzle-orm");
  const rows = await getDb().delete(schema.rateLimits).where(lt(schema.rateLimits.resetAt, new Date())).returning({ key: schema.rateLimits.key });
  return rows.length;
}

/** Pour les tests. */
export function resetRateLimits(): void {
  buckets.clear();
}
